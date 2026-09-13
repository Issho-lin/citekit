from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx

from citekit_server.calls.log import record_http_call
from citekit_server.db import AiModelRow
from citekit_server.infra.protocol import BASE_SUFFIXES, DOUBAO, ProviderProtocol, protocol_of
from citekit_server.schemas import TestOut

PING = "citekit ping"
Kind = str


def _join(base: str, path: str) -> str:
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


def _headers(api_key: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    token = api_key.strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _model_id(model: AiModelRow) -> str:
    return (model.mapped_model or "").strip() or model.id


def _name_looks_multimodal(model: AiModelRow) -> bool:
    name = f"{model.mapped_model or ''} {model.id}".lower()
    return "vl-embedding" in name or "multimodal-embed" in name


def _is_multimodal_embedding(model: AiModelRow) -> bool:
    if model.multimodal is True:
        return True
    if model.multimodal is False:
        return False
    return _name_looks_multimodal(model)


def _origin(base: str) -> str:
    trimmed = base.rstrip("/")
    lowered = trimmed.lower()
    for suffix in BASE_SUFFIXES:
        if lowered.endswith(suffix):
            return trimmed[: -len(suffix)]
    return trimmed


def _path_for(proto: ProviderProtocol, kind: Kind) -> str:
    if kind == "rerank":
        return proto.rerank_path
    if kind == "embedding_mm":
        return proto.embedding_multimodal_path or proto.embedding_path
    if kind == "embedding":
        return proto.embedding_path
    return proto.chat_path


def _kind(model: AiModelRow, *, multimodal: bool) -> Kind:
    if model.type == "rerank":
        return "rerank"
    if model.type == "embedding":
        return "embedding_mm" if multimodal else "embedding"
    return "chat"


def _already_complete(url: str, proto: ProviderProtocol, kind: Kind) -> bool:
    lowered = url.rstrip("/").lower()
    path = _path_for(proto, kind).rstrip("/").lower()
    if path and lowered.endswith(path):
        return True
    aliases = {
        "chat": ("chat/completions", "responses"),
        "embedding": ("embeddings",),
        "embedding_mm": ("embeddings/multimodal", "embeddings"),
        "rerank": ("rerank", "reranks"),
    }
    return any(lowered.endswith(alias) for alias in aliases.get(kind, ()))


def _endpoint(base: str, proto: ProviderProtocol, kind: Kind) -> str:
    trimmed = base.rstrip("/")
    lowered = trimmed.lower()
    path = _path_for(proto, kind)
    if kind == "embedding_mm" and proto.embedding_multimodal_path:
        mm = proto.embedding_multimodal_path.rstrip("/")
        if lowered.endswith(mm.lower()):
            return trimmed
        if lowered.endswith("/embeddings"):
            return f"{trimmed[: -len('embeddings')]}{mm}"
    if _already_complete(trimmed, proto, kind):
        return trimmed
    if kind == "rerank" and proto.rerank_join == "origin":
        return _join(_origin(trimmed), path)
    return _join(trimmed, path)


def protocol_for_model(model: AiModelRow) -> ProviderProtocol:
    proto = protocol_of(model.provider)
    if _is_volces(model.request_url or ""):
        return DOUBAO
    return proto


def _is_volces(url: str) -> bool:
    host = url.lower()
    return "volces.com" in host or "volcengine.com" in host


def _payload(model: AiModelRow, proto: ProviderProtocol, kind: Kind, *, url: str = "") -> dict[str, Any]:
    model_id = _model_id(model)
    if kind == "rerank":
        if proto.rerank_body == "nested":
            return {
                "model": model_id,
                "input": {"query": PING, "documents": [PING, "unrelated document"]},
                "parameters": {"top_n": 5, "return_documents": True},
            }
        return {"model": model_id, "query": PING, "documents": [PING]}
    if kind in {"embedding", "embedding_mm"}:
        if kind == "embedding_mm" and proto.embedding_mm_body == "tokenhub":
            return {"model": model_id, "input": [{"type": "text", "text": PING}]}
        return {"model": model_id, "input": PING}
    return _as_chat_payload(
        style=_chat_style_from_url(url, proto),
        model_id=model_id,
        messages=[{"role": "user", "content": [{"type": "text", "text": PING}]}],
        max_tokens=None,
        thinking=False,
        temperature=0.1,
        url=url,
    )


def _chat_style_from_url(url: str, proto: ProviderProtocol) -> str:
    lowered = url.rstrip("/").lower()
    if lowered.endswith("/responses"):
        return "responses"
    if lowered.endswith("/chat/completions"):
        return "completions"
    if proto.chat_path.rstrip("/").lower() == "responses":
        return "responses"
    return "completions"


def _alternate_chat_url(url: str) -> str:
    trimmed = url.rstrip("/")
    lowered = trimmed.lower()
    if lowered.endswith("/responses"):
        return f"{trimmed[: -len('/responses')]}/chat/completions"
    if lowered.endswith("/chat/completions"):
        return f"{trimmed[: -len('/chat/completions')]}/responses"
    return _join(trimmed, "responses")


def _should_retry_chat_fallback(status: int, body: str) -> bool:
    if status in {401, 403}:
        return False
    if status in {404, 405, 415}:
        return True
    if status < 400:
        return False
    text = (body or "").lower()
    compact = text.replace("_", "").replace(" ", "")
    needles = (
        "invalidendpoint",
        "notsupport",
        "unsupported",
        "doesnotexist",
        "nosuchapi",
        "unknownfield",
        "unexpectedfield",
        "unrecognizedrequest",
    )
    if any(n in compact for n in needles):
        return True
    return "chat/completions" in text or "/responses" in text


def _to_input_parts(content: Any) -> list[dict[str, Any]]:
    if isinstance(content, str):
        return [{"type": "input_text", "text": content}]
    if isinstance(content, list):
        parts: list[dict[str, Any]] = []
        for item in content:
            if isinstance(item, str):
                parts.append({"type": "input_text", "text": item})
                continue
            if not isinstance(item, dict):
                continue
            kind = str(item.get("type") or "")
            if kind in {"text", "input_text"} or ("text" in item and "image_url" not in item):
                parts.append({"type": "input_text", "text": str(item.get("text") or item.get("content") or "")})
                continue
            image = item.get("image_url")
            url = image.get("url") if isinstance(image, dict) else image
            if url:
                parts.append({"type": "input_image", "image_url": str(url)})
        return parts or [{"type": "input_text", "text": ""}]
    return [{"type": "input_text", "text": str(content or "")}]


def _messages_to_responses_input(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for msg in messages:
        role = str(msg.get("role") or "user")
        content = msg.get("content")
        if role == "tool":
            raw = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
            item: dict[str, Any] = {"type": "function_call_output", "output": raw}
            call_id = str(msg.get("tool_call_id") or msg.get("id") or "")
            if call_id:
                item["call_id"] = call_id
            out.append(item)
            continue
        calls = msg.get("tool_calls")
        if role == "assistant" and isinstance(calls, list):
            for call in calls:
                parsed = _as_tool_call(call, len(out))
                if not parsed:
                    continue
                fn = parsed["function"]
                out.append(
                    {
                        "type": "function_call",
                        "call_id": parsed["id"],
                        "name": fn["name"],
                        "arguments": fn["arguments"],
                    }
                )
            if content:
                out.append({"role": "assistant", "content": _to_input_parts(content)})
            continue
        out.append({"role": role, "content": _to_input_parts(content)})
    return out


def _tools_for_responses(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for tool in tools:
        fn = tool.get("function") if isinstance(tool.get("function"), dict) else None
        if tool.get("type") == "function" and fn:
            item: dict[str, Any] = {
                "type": "function",
                "name": fn.get("name"),
                "description": fn.get("description") or "",
            }
            if fn.get("parameters") is not None:
                item["parameters"] = fn["parameters"]
            out.append(item)
        else:
            out.append(tool)
    return out


def _as_chat_payload(
    *,
    style: str,
    model_id: str,
    messages: list[dict[str, Any]],
    thinking: bool,
    temperature: float,
    url: str = "",
    max_tokens: int | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
    stream: bool = False,
) -> dict[str, Any]:
    volces = _is_volces(url)
    if style == "responses":
        payload: dict[str, Any] = {
            "model": model_id,
            "input": _messages_to_responses_input(messages),
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_output_tokens"] = max_tokens
        payload["thinking"] = {"type": "enabled" if thinking else "disabled"}
        if tools:
            payload["tools"] = _tools_for_responses(tools)
            payload["tool_choice"] = tool_choice if tool_choice is not None else "auto"
        if stream:
            payload["stream"] = True
        return payload
    chat_messages = _messages_for_chat(messages, volces=volces)
    payload = {
        "model": model_id,
        "messages": chat_messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if volces:
        payload["thinking"] = {"type": "enabled" if thinking else "disabled"}
    else:
        payload["enable_thinking"] = thinking
        payload["chat_template_kwargs"] = {"enable_thinking": thinking}
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = tool_choice if tool_choice is not None else "auto"
    if stream:
        payload["stream"] = True
    return payload


def _messages_for_chat(messages: list[dict[str, Any]], *, volces: bool) -> list[dict[str, Any]]:
    if not volces:
        return messages
    out: list[dict[str, Any]] = []
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, str):
            out.append({**msg, "content": [{"type": "text", "text": content}]})
        else:
            out.append(msg)
    return out


def _refuse_rerank(base: str, proto: ProviderProtocol) -> str | None:
    host = base.lower()
    if any(needle in host for needle in proto.refuse_rerank_if_host):
        return proto.rerank_url_tip or "当前供应商的重排不能走这个接口地址"
    return None


def _should_retry_multimodal(status: int, body: str) -> bool:
    if status != 400:
        return False
    text = body.lower()
    return "protocol" in text or "capability" in text or "embeddings/multimodal" in text


async def list_remote_models(base_url: str, api_key: str) -> list[str]:
    url = _join(base_url, "models")
    response = await _request_async("GET", url, headers={"Authorization": f"Bearer {api_key}"}, kind="models")
    if response.status_code >= 400:
        raise RuntimeError(f"HTTP {response.status_code} {_trim(response.text)}")
    body = response.json()
    rows: list[Any]
    if isinstance(body, dict):
        data = body.get("data")
        if isinstance(data, list):
            rows = data
        elif isinstance(body.get("models"), list):
            rows = body["models"]
        else:
            rows = []
    elif isinstance(body, list):
        rows = body
    else:
        rows = []
    ids: list[str] = []
    seen: set[str] = set()
    for item in rows:
        mid = ""
        if isinstance(item, str):
            mid = item
        elif isinstance(item, dict):
            mid = str(item.get("id") or item.get("model") or "")
        mid = mid.strip()
        if mid and mid not in seen:
            seen.add(mid)
            ids.append(mid)
    return ids


async def test_model(model: AiModelRow, api_key: str = "") -> TestOut:
    started = time.perf_counter()
    base = (model.request_url or "").strip()
    if not base:
        return TestOut(ok=False, ms=0, message="请填写接口地址")
    token = (api_key or model.request_auth or "").strip()
    if not token:
        return TestOut(ok=False, ms=0, message="请填写 API 密钥，或先在供应商配置里保存密钥")

    proto = protocol_for_model(model)
    if model.type == "rerank":
        refused = _refuse_rerank(base, proto)
        if refused:
            return TestOut(ok=False, ms=0, message=refused)

    multimodal = model.type == "embedding" and _is_multimodal_embedding(model)
    kind = _kind(model, multimodal=multimodal)
    url = _endpoint(base, proto, kind)
    body = _payload(model, proto, kind, url=url)
    timeout = 45.0 if kind == "chat" else 20.0
    try:
        response = await _request_async(
            "POST", url, headers=_headers(token), json_body=body, kind=kind, model=model, timeout=timeout
        )
        if (
            kind == "embedding"
            and proto.embedding_multimodal_path
            and model.multimodal is not False
            and _should_retry_multimodal(response.status_code, response.text)
        ):
            kind = "embedding_mm"
            url = _endpoint(base, proto, kind)
            response = await _request_async(
                "POST",
                url,
                headers=_headers(token),
                json_body=_payload(model, proto, kind, url=url),
                kind=kind,
                model=model,
            )
        elif kind == "embedding_mm" and proto.embedding_multimodal_path and response.status_code == 404:
            kind = "embedding"
            url = _endpoint(base, proto, kind)
            response = await _request_async(
                "POST",
                url,
                headers=_headers(token),
                json_body=_payload(model, proto, kind, url=url),
                kind=kind,
                model=model,
            )
        elif kind == "chat" and proto.chat_fallback_path and _should_retry_chat_fallback(response.status_code, response.text):
            url = _alternate_chat_url(url)
            response = await _request_async(
                "POST",
                url,
                headers=_headers(token),
                json_body=_payload(model, proto, kind, url=url),
                kind=kind,
                model=model,
                timeout=timeout,
            )
        ms = int((time.perf_counter() - started) * 1000)
        err = _upstream_error(response.status_code, response.text)
        if err:
            return TestOut(ok=False, ms=ms, message=err)
        return TestOut(ok=True, ms=ms, message="连接正常")
    except httpx.TimeoutException:
        ms = int((time.perf_counter() - started) * 1000)
        return TestOut(ok=False, ms=ms, message=f"上游响应超时（{int(timeout)}s）")
    except httpx.RequestError as exc:
        ms = int((time.perf_counter() - started) * 1000)
        return TestOut(ok=False, ms=ms, message=f"无法连接上游：{exc}" if str(exc) else "无法连接上游")


def _upstream_error(status: int, text: str) -> str | None:
    code, msg = _error_fields(text)
    combined = f"{code} {msg}".lower()
    missing = (
        "notfound" in combined.replace("_", "").replace(".", "")
        or "does not exist" in combined
        or "invalidendpoint" in combined.replace(".", "")
    )
    if missing:
        who = _quoted_model(msg) or ""
        hint = (
            f"上游找不到模型{f'「{who}」' if who else ''}。"
            "方舟请改用控制台仍可用的模型 ID，或在「模型映射」填写接入点（ep- 开头）。"
        )
        detail = _trim(msg or text)
        return f"{hint} {detail}".strip()
    if msg:
        if status >= 400:
            return f"HTTP {status} {_trim(msg)}"
        if code not in (None, "", "Success"):
            return _trim(msg)
        return None
    if status >= 400:
        return f"HTTP {status} {_trim(text)}"
    return None


def _error_fields(text: str) -> tuple[str, str]:
    try:
        body = json.loads(text) if text else None
    except json.JSONDecodeError:
        return "", (text or "").strip()
    if not isinstance(body, dict):
        return "", (text or "").strip()
    err = body.get("error")
    if isinstance(err, dict):
        return str(err.get("code") or body.get("code") or ""), str(err.get("message") or err.get("msg") or "")
    code = str(body.get("code") or "")
    msg = str(body.get("message") or body.get("msg") or "")
    if code in (None, "", "Success") and not msg:
        return "", ""
    return code, msg


def _quoted_model(message: str) -> str:
    match = re.search(r"(doubao[\w.\-]+|ep-[\w]+|qwen[\w.\-]+)", message or "", re.I)
    return match.group(1) if match else ""


def _trim(text: str, limit: int = 180) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"


def _request_sync(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    json_body: Any = None,
    kind: str,
    model: AiModelRow | None = None,
    timeout: float = 60.0,
) -> httpx.Response:
    started = time.perf_counter()
    status = 0
    text = ""
    error: str | None = None
    try:
        with httpx.Client(timeout=timeout) as client:
            kwargs: dict[str, Any] = {"headers": headers}
            if json_body is not None:
                kwargs["json"] = json_body
            response = client.request(method, url, **kwargs)
        status = response.status_code
        text = response.text
        return response
    except Exception as exc:
        error = str(exc) or type(exc).__name__
        raise
    finally:
        record_http_call(
            method=method,
            url=url,
            kind=kind,
            request_body=json_body,
            status=status,
            response_text=text,
            error=error,
            latency_ms=int((time.perf_counter() - started) * 1000),
            model=model,
        )


async def _request_async(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    json_body: Any = None,
    kind: str,
    model: AiModelRow | None = None,
    timeout: float = 20.0,
) -> httpx.Response:
    started = time.perf_counter()
    status = 0
    text = ""
    error: str | None = None
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            kwargs: dict[str, Any] = {"headers": headers}
            if json_body is not None:
                kwargs["json"] = json_body
            response = await client.request(method, url, **kwargs)
        status = response.status_code
        text = response.text
        return response
    except Exception as exc:
        error = str(exc) or type(exc).__name__
        raise
    finally:
        record_http_call(
            method=method,
            url=url,
            kind=kind,
            request_body=json_body,
            status=status,
            response_text=text,
            error=error,
            latency_ms=int((time.perf_counter() - started) * 1000),
            model=model,
        )


def _require_base(model: AiModelRow) -> tuple[str, ProviderProtocol]:
    base = (model.request_url or "").strip()
    if not base:
        raise RuntimeError("请填写接口地址")
    return base, protocol_for_model(model)


def _post_chat_sync(
    model: AiModelRow,
    proto: ProviderProtocol,
    base: str,
    token: str,
    *,
    messages: list[dict[str, Any]],
    max_tokens: int | None,
    thinking: bool,
    temperature: float,
    timeout: float,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
) -> httpx.Response:
    url = _endpoint(base, proto, "chat")
    payload = _as_chat_payload(
        style=_chat_style_from_url(url, proto),
        model_id=_model_id(model),
        messages=messages,
        thinking=thinking,
        temperature=temperature,
        url=url,
        max_tokens=max_tokens,
        tools=tools,
        tool_choice=tool_choice,
    )
    response = _request_sync(
        "POST",
        url,
        headers=_headers(token),
        json_body=payload,
        kind="chat",
        model=model,
        timeout=timeout,
    )
    if proto.chat_fallback_path and _should_retry_chat_fallback(response.status_code, response.text):
        url = _alternate_chat_url(url)
        payload = _as_chat_payload(
            style=_chat_style_from_url(url, proto),
            model_id=_model_id(model),
            messages=messages,
            thinking=thinking,
            temperature=temperature,
            url=url,
            max_tokens=max_tokens,
            tools=tools,
            tool_choice=tool_choice,
        )
        response = _request_sync(
            "POST",
            url,
            headers=_headers(token),
            json_body=payload,
            kind="chat",
            model=model,
            timeout=timeout,
        )
    return response


class _StreamRetry(Exception):
    def __init__(self, status: int, body: str, message: str):
        super().__init__(message)
        self.status = status
        self.body = body


def parse_chat_sse_line(line: str, *, style: str, event: str = "") -> tuple[str, list[dict[str, Any]]]:
    raw = line.strip()
    if not raw:
        return event, []
    if raw.startswith("event:"):
        return raw[6:].strip(), []
    data = ""
    if raw.startswith("data:"):
        data = raw[5:].strip()
    elif raw.startswith("{") and raw.endswith("}"):
        data = raw
    else:
        return event, []
    if not data or data == "[DONE]":
        return event, []
    try:
        body = json.loads(data)
    except json.JSONDecodeError:
        return event, []
    return event, _stream_events_from_chunk(body, style=style, event=event)


def _merge_tool_delta(acc: list[dict[str, Any]], deltas: Any) -> None:
    if not isinstance(deltas, list):
        return
    for item in deltas:
        if not isinstance(item, dict):
            continue
        idx = int(item.get("index") or 0)
        while len(acc) <= idx:
            acc.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
        slot = acc[idx]
        if item.get("id"):
            slot["id"] = str(item["id"])
        fn = item.get("function") if isinstance(item.get("function"), dict) else {}
        name = fn.get("name")
        if name:
            slot["function"]["name"] = str(name) if not slot["function"]["name"] else slot["function"]["name"] + str(name)
        if fn.get("arguments") is not None:
            slot["function"]["arguments"] += str(fn.get("arguments") or "")


def _stream_events_from_chunk(body: Any, *, style: str, event: str = "") -> list[dict[str, Any]]:
    if not isinstance(body, dict):
        return []
    out: list[dict[str, Any]] = []
    typ = str(body.get("type") or event or "")
    if style == "responses" or typ.startswith("response."):
        if "output_text.delta" in typ or typ.endswith("text.delta"):
            delta = body.get("delta")
            text = delta if isinstance(delta, str) else _content_text(delta)
            if text:
                out.append({"type": "token", "text": text})
        if "reasoning" in typ and "delta" in typ:
            delta = body.get("delta")
            text = delta if isinstance(delta, str) else _content_text(delta)
            if text:
                out.append({"type": "thinking", "text": text})
        if typ in {"response.output_item.added", "response.function_call_arguments.delta"} or "function_call" in typ:
            item = body.get("item") if isinstance(body.get("item"), dict) else body
            if str(item.get("type") or "") in {"function_call", "tool_call"} or item.get("name"):
                out.append(
                    {
                        "type": "tool_delta",
                        "tool_calls": [
                            {
                                "index": int(body.get("output_index") or 0),
                                "id": item.get("call_id") or item.get("id") or "",
                                "function": {
                                    "name": item.get("name") or "",
                                    "arguments": item.get("arguments") or body.get("delta") or "",
                                },
                            }
                        ],
                    }
                )
        return out
    choices = body.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        first = choices[0]
        delta = first.get("delta") if isinstance(first.get("delta"), dict) else {}
        text = _content_text(delta.get("content")) if delta else ""
        if text:
            out.append({"type": "token", "text": text})
        for key in ("reasoning_content", "reasoning", "thinking"):
            value = delta.get(key) if delta else None
            if isinstance(value, str) and value:
                out.append({"type": "thinking", "text": value})
                break
        calls = delta.get("tool_calls") if delta else None
        if isinstance(calls, list) and calls:
            out.append({"type": "tool_delta", "tool_calls": calls})
        function_call = delta.get("function_call") if delta else None
        if isinstance(function_call, dict) and function_call.get("name"):
            out.append({"type": "tool_delta", "tool_calls": [{"index": 0, "function": function_call}]})
        message = first.get("message") if isinstance(first.get("message"), dict) else None
        if message:
            if not text:
                full = _content_text(message.get("content"))
                if full:
                    out.append({"type": "token", "text": full})
            msg_calls = message.get("tool_calls")
            if isinstance(msg_calls, list) and msg_calls:
                out.append({"type": "tool_delta", "tool_calls": msg_calls})
    return out


def iter_chat_messages(
    model: AiModelRow,
    api_key: str,
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
    max_tokens: int = 2048,
    timeout: float = 90.0,
    thinking: bool = False,
    temperature: float = 0.2,
):
    token = (api_key or model.request_auth or "").strip()
    if not token:
        raise RuntimeError("请填写 API 密钥，或先在供应商配置里保存密钥")
    base, proto = _require_base(model)
    url = _endpoint(base, proto, "chat")
    attempts = [(url, True)]
    if proto.chat_fallback_path:
        alt = _alternate_chat_url(url)
        if alt != url:
            attempts.append((alt, False))
    last_err: str | None = None
    for index, (target, primary) in enumerate(attempts):
        payload = _as_chat_payload(
            style=_chat_style_from_url(target, proto),
            model_id=_model_id(model),
            messages=messages,
            thinking=thinking,
            temperature=temperature,
            url=target,
            max_tokens=max_tokens,
            tools=tools,
            tool_choice=tool_choice,
            stream=True,
        )
        try:
            yield from _iter_sse_chat(model, token, target, payload, timeout=timeout)
            return
        except _StreamRetry as exc:
            last_err = str(exc)
            nxt = index + 1 < len(attempts)
            if primary and nxt and _should_retry_chat_fallback(exc.status, exc.body):
                continue
            if primary and nxt:
                continue
            break
        except RuntimeError as exc:
            last_err = str(exc)
            break
    fallback = _as_chat_payload(
        style=_chat_style_from_url(attempts[0][0], proto),
        model_id=_model_id(model),
        messages=messages,
        thinking=thinking,
        temperature=temperature,
        url=attempts[0][0],
        max_tokens=max_tokens,
        tools=tools,
        tool_choice=tool_choice,
        stream=False,
    )
    try:
        yield from _complete_as_stream(
            model,
            token,
            attempts[0][0],
            fallback,
            timeout=timeout,
        )
        return
    except Exception as exc:
        raise RuntimeError(last_err or str(exc) or "模型没有返回内容") from exc


def _iter_sse_chat(
    model: AiModelRow,
    token: str,
    url: str,
    payload: dict[str, Any],
    *,
    timeout: float,
):
    started = time.perf_counter()
    status = 0
    error: str | None = None
    content_bits: list[str] = []
    reasoning_bits: list[str] = []
    tool_acc: list[dict[str, Any]] = []
    raw_tail = ""
    style = _chat_style_from_url(url, protocol_for_model(model))
    try:
        with httpx.Client(timeout=httpx.Timeout(timeout, connect=15.0)) as client:
            with client.stream("POST", url, headers=_headers(token), json=payload) as response:
                status = response.status_code
                if status >= 400:
                    raw_tail = response.read().decode("utf-8", errors="replace")
                    err = _upstream_error(status, raw_tail) or f"HTTP {status}"
                    raise _StreamRetry(status, raw_tail, err)
                event_name = ""
                raw_lines: list[str] = []
                for line in response.iter_lines():
                    raw_lines.append(line)
                    event_name, events = parse_chat_sse_line(line, style=style, event=event_name)
                    for item in events:
                        kind = item.get("type")
                        text = str(item.get("text") or "")
                        if kind == "token" and text:
                            content_bits.append(text)
                            yield {"type": "token", "text": text}
                        elif kind == "thinking" and text:
                            reasoning_bits.append(text)
                            yield {"type": "thinking", "text": text}
                        elif kind == "tool_delta":
                            _merge_tool_delta(tool_acc, item.get("tool_calls"))
                if not content_bits and not reasoning_bits and not tool_acc:
                    blob = "\n".join(raw_lines).strip()
                    raw_tail = blob
                    absorbed = _message_from_complete_body(blob)
                    if absorbed:
                        yield from _emit_complete_message(absorbed)
                        return
                    raise RuntimeError("模型没有返回内容")
        tool_calls = [item for item in tool_acc if (item.get("function") or {}).get("name")]
        message = {
            "content": "".join(content_bits),
            "tool_calls": tool_calls,
            "reasoning": "".join(reasoning_bits),
        }
        if not (message["content"] or "").strip() and not (message["reasoning"] or "").strip() and not tool_calls:
            raise RuntimeError("模型没有返回内容")
        yield {"type": "message", **message}
    except _StreamRetry:
        raise
    except RuntimeError:
        raise
    except Exception as exc:
        error = str(exc) or type(exc).__name__
        raise
    finally:
        record_http_call(
            method="POST",
            url=url,
            kind="chat",
            request_body=payload,
            status=status,
            response_text="".join(content_bits) or raw_tail,
            error=error,
            latency_ms=int((time.perf_counter() - started) * 1000),
            model=model,
        )


def _message_from_complete_body(text: str) -> dict[str, Any] | None:
    blob = (text or "").strip()
    if not blob:
        return None
    if blob.startswith("data:"):
        parts = [line[5:].strip() for line in blob.splitlines() if line.startswith("data:")]
        blob = parts[-1] if parts else blob
    try:
        body = json.loads(blob)
    except json.JSONDecodeError:
        return None
    out = _choice_message(body)
    if (out.get("content") or "").strip() or out.get("tool_calls") or (out.get("reasoning") or "").strip():
        return out
    return None


def _emit_complete_message(message: dict[str, Any]):
    reasoning = str(message.get("reasoning") or "")
    content = str(message.get("content") or "")
    if reasoning:
        yield {"type": "thinking", "text": reasoning}
    if content:
        yield {"type": "token", "text": content}
    yield {
        "type": "message",
        "content": content,
        "tool_calls": list(message.get("tool_calls") or []),
        "reasoning": reasoning,
    }


def _complete_as_stream(
    model: AiModelRow,
    token: str,
    url: str,
    payload: dict[str, Any],
    *,
    timeout: float,
):
    response = _request_sync(
        "POST",
        url,
        headers=_headers(token),
        json_body=payload,
        kind="chat",
        model=model,
        timeout=timeout,
    )
    err = _upstream_error(response.status_code, response.text)
    if err:
        raise RuntimeError(err)
    try:
        body = response.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError("模型没有返回 JSON") from exc
    message = _choice_message(body)
    if not (message["content"] or "").strip() and not message["tool_calls"] and not (message.get("reasoning") or "").strip():
        raise RuntimeError("模型没有返回内容")
    yield from _emit_complete_message(message)


def embed_texts(model: AiModelRow, api_key: str, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    token = (api_key or model.request_auth or "").strip()
    if not token:
        raise RuntimeError("请填写 API 密钥，或先在供应商配置里保存密钥")
    base, proto = _require_base(model)
    multimodal = _is_multimodal_embedding(model)
    kind = _kind(model, multimodal=multimodal)
    url = _endpoint(base, proto, kind)
    batch = max(int(model.batch_size or 8), 1)
    out: list[list[float]] = []
    for i in range(0, len(texts), batch):
        chunk = texts[i : i + batch]
        if kind == "embedding_mm" and proto.embedding_mm_body == "tokenhub":
            payload: dict[str, Any] = {
                "model": _model_id(model),
                "input": [{"type": "text", "text": item} for item in chunk],
            }
        else:
            payload = {"model": _model_id(model), "input": chunk if len(chunk) > 1 else chunk[0]}
        response = _request_sync("POST", url, headers=_headers(token), json_body=payload, kind=kind, model=model)
        err = _upstream_error(response.status_code, response.text)
        if err:
            raise RuntimeError(err)
        out.extend(_parse_embeddings(response.json()))
    if model.normalization:
        out = [_l2(vec) for vec in out]
    if len(out) != len(texts):
        raise RuntimeError(f"向量数量不匹配：期望 {len(texts)}，得到 {len(out)}")
    return out


def _image_payload(raw: bytes) -> tuple[str, bytes]:
    blob = _shrink_image(raw)
    if blob[:2] == b"\xff\xd8":
        return "image/jpeg", blob
    if blob[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png", blob
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return "image/webp", blob
    if blob[:6] in {b"GIF87a", b"GIF89a"}:
        return "image/gif", blob
    return "image/jpeg", blob


def _shrink_image(raw: bytes, max_side: int = 1600) -> bytes:
    try:
        import pymupdf

        kind = "jpeg"
        if raw[:8] == b"\x89PNG\r\n\x1a\n":
            kind = "png"
        elif raw[:4] == b"RIFF":
            kind = "webp"
        elif raw[:6] in {b"GIF87a", b"GIF89a"}:
            kind = "gif"
        doc = pymupdf.open(stream=raw, filetype=kind)
        page = doc[0]
        scale = min(1.0, max_side / max(page.rect.width, page.rect.height, 1))
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        out = pix.tobytes("jpeg")
        doc.close()
        return out or raw
    except Exception:
        return raw


def chat_completion(
    model: AiModelRow,
    api_key: str,
    prompt: str,
    *,
    images: list[bytes] | None = None,
    max_tokens: int = 2048,
    timeout: float = 90.0,
    thinking: bool = True,
) -> str:
    token = (api_key or model.request_auth or "").strip()
    if not token:
        raise RuntimeError("请填写 API 密钥，或先在供应商配置里保存密钥")
    base, proto = _require_base(model)
    content: Any
    if images:
        import base64

        parts: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        for raw in images:
            mime, blob = _image_payload(raw)
            b64 = base64.b64encode(blob).decode("ascii")
            parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
        content = parts
    else:
        content = prompt
    response = _post_chat_sync(
        model,
        proto,
        base,
        token,
        messages=[{"role": "user", "content": content}],
        max_tokens=max_tokens,
        thinking=thinking,
        temperature=0.1,
        timeout=timeout,
    )
    err = _upstream_error(response.status_code, response.text)
    if err:
        raise RuntimeError(err)
    try:
        body = response.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError("模型没有返回 JSON") from exc
    text = _choice_text(body)
    if not text.strip():
        raise RuntimeError("模型没有返回内容")
    return text


def _choice_text(body: Any) -> str:
    if not isinstance(body, dict):
        return str(body or "")
    choices = body.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message") or first.get("delta") or {}
            if isinstance(message, dict):
                extracted = _content_text(message.get("content"))
                if extracted:
                    return extracted
            if isinstance(first.get("text"), str):
                return first["text"]
    if isinstance(body.get("output_text"), str) and body["output_text"].strip():
        return body["output_text"]
    output = body.get("output")
    if isinstance(output, dict) and isinstance(output.get("text"), str):
        return output["text"]
    if isinstance(output, list):
        bits: list[str] = []
        for item in output:
            if isinstance(item, str):
                bits.append(item)
            elif isinstance(item, dict):
                bits.append(_content_text(item.get("content") or item.get("text")))
        joined = "".join(bits)
        if joined.strip():
            return joined
    if isinstance(body.get("text"), str):
        return body["text"]
    return ""


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        bits: list[str] = []
        for part in content:
            if isinstance(part, str):
                bits.append(part)
            elif isinstance(part, dict):
                bits.append(str(part.get("text") or part.get("output_text") or part.get("content") or ""))
        return "".join(bits)
    return ""


def chat_messages(
    model: AiModelRow,
    api_key: str,
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
    max_tokens: int = 2048,
    timeout: float = 90.0,
    thinking: bool = False,
) -> dict[str, Any]:
    token = (api_key or model.request_auth or "").strip()
    if not token:
        raise RuntimeError("请填写 API 密钥，或先在供应商配置里保存密钥")
    base, proto = _require_base(model)
    response = _post_chat_sync(
        model,
        proto,
        base,
        token,
        messages=messages,
        max_tokens=max_tokens,
        thinking=thinking,
        temperature=0.2,
        timeout=timeout,
        tools=tools,
        tool_choice=tool_choice,
    )
    err = _upstream_error(response.status_code, response.text)
    if err:
        raise RuntimeError(err)
    try:
        body = response.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError("模型没有返回 JSON") from exc
    out = _choice_message(body)
    if not (out["content"] or "").strip() and not out["tool_calls"] and not (out.get("reasoning") or "").strip():
        raise RuntimeError("模型没有返回内容")
    return out


def _choice_message(body: Any) -> dict[str, Any]:
    content = _choice_text(body)
    tool_calls: list[dict[str, Any]] = []
    reasoning = ""
    message: dict[str, Any] = {}
    if isinstance(body, dict):
        choices = body.get("choices")
        if isinstance(choices, list) and choices and isinstance(choices[0], dict):
            raw = choices[0].get("message") or choices[0].get("delta") or {}
            if isinstance(raw, dict):
                message = raw
    if isinstance(message.get("content"), str) and not content:
        content = message["content"]
    for key in ("reasoning_content", "reasoning", "thinking"):
        value = message.get(key)
        if isinstance(value, str) and value.strip():
            reasoning = value.strip()
            break
    calls = message.get("tool_calls")
    if isinstance(calls, list):
        for index, item in enumerate(calls):
            parsed = _as_tool_call(item, index)
            if parsed:
                tool_calls.append(parsed)
    function_call = message.get("function_call")
    if not tool_calls and isinstance(function_call, dict) and function_call.get("name"):
        parsed = _as_tool_call({"id": "call_0", "function": function_call}, 0)
        if parsed:
            tool_calls.append(parsed)
    if isinstance(body, dict) and isinstance(body.get("output"), list):
        for item in body["output"]:
            if not isinstance(item, dict):
                continue
            typ = str(item.get("type") or "")
            if typ in {"function_call", "tool_call"}:
                parsed = _as_tool_call(
                    {
                        "id": item.get("call_id") or item.get("id") or f"call_{len(tool_calls)}",
                        "function": {"name": item.get("name"), "arguments": item.get("arguments")},
                    },
                    len(tool_calls),
                )
                if parsed:
                    tool_calls.append(parsed)
            elif not reasoning and typ in {"reasoning", "thinking"}:
                reasoning = _content_text(item.get("content") or item.get("summary") or item.get("text")).strip()
    return {"content": content, "tool_calls": tool_calls, "reasoning": reasoning}


def _as_tool_call(item: Any, index: int) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    fn = item.get("function") if isinstance(item.get("function"), dict) else item
    name = str((fn or {}).get("name") or "").strip()
    if not name:
        return None
    args = (fn or {}).get("arguments")
    if isinstance(args, dict):
        raw = json.dumps(args, ensure_ascii=False)
    else:
        raw = str(args or "{}")
    return {
        "id": str(item.get("id") or f"call_{index}"),
        "type": "function",
        "function": {"name": name, "arguments": raw},
    }


def rerank_texts(model: AiModelRow, api_key: str, query: str, documents: list[str]) -> list[float]:
    if not documents:
        return []
    token = (api_key or model.request_auth or "").strip()
    if not token:
        raise RuntimeError("请填写 API 密钥，或先在供应商配置里保存密钥")
    base, proto = _require_base(model)
    refused = _refuse_rerank(base, proto)
    if refused:
        raise RuntimeError(refused)
    url = _endpoint(base, proto, "rerank")
    model_id = _model_id(model)
    if proto.rerank_body == "nested":
        payload: dict[str, Any] = {
            "model": model_id,
            "input": {"query": query, "documents": documents},
            "parameters": {"top_n": len(documents), "return_documents": False},
        }
    else:
        payload = {"model": model_id, "query": query, "documents": documents}
    response = _request_sync("POST", url, headers=_headers(token), json_body=payload, kind="rerank", model=model)
    err = _upstream_error(response.status_code, response.text)
    if err:
        raise RuntimeError(err)
    return _parse_rerank_scores(response.json(), len(documents))


def _l2(vec: list[float]) -> list[float]:
    norm = sum(x * x for x in vec) ** 0.5
    if norm <= 0:
        return vec
    return [x / norm for x in vec]


def _parse_embeddings(body: Any) -> list[list[float]]:
    rows: list[Any] = []
    if isinstance(body, dict):
        data = body.get("data")
        if isinstance(data, list):
            rows = data
        else:
            output = body.get("output")
            if isinstance(output, dict):
                for key in ("embeddings", "data", "embedding"):
                    if isinstance(output.get(key), list):
                        rows = output[key]
                        break
            if not rows and isinstance(body.get("embeddings"), list):
                rows = body["embeddings"]
    elif isinstance(body, list):
        rows = body
    out: list[tuple[int, list[float]]] = []
    for index, item in enumerate(rows):
        vec: list[float] | None = None
        pos = index
        if isinstance(item, dict):
            pos = int(item.get("index", index))
            raw = item.get("embedding") or item.get("vector")
            if isinstance(raw, list):
                vec = [float(x) for x in raw]
        elif isinstance(item, list):
            vec = [float(x) for x in item]
        if vec:
            out.append((pos, vec))
    out.sort(key=lambda pair: pair[0])
    if not out:
        raise RuntimeError("上游没有返回向量")
    return [item[1] for item in out]


def _parse_rerank_scores(body: Any, n: int) -> list[float]:
    rows: list[Any] = []
    if isinstance(body, dict):
        if isinstance(body.get("results"), list):
            rows = body["results"]
        else:
            output = body.get("output")
            if isinstance(output, dict) and isinstance(output.get("results"), list):
                rows = output["results"]
    scores = [0.0] * n
    for item in rows:
        if not isinstance(item, dict):
            continue
        idx = int(item.get("index", 0))
        score = item.get("relevance_score", item.get("score", 0))
        if 0 <= idx < n:
            scores[idx] = float(score or 0)
    return scores

