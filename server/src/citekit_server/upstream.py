from __future__ import annotations

import json
import re
import time
from typing import Any

import httpx

from citekit_server.call_log import record_http_call
from citekit_server.db import AiModelRow
from citekit_server.provider_protocol import BASE_SUFFIXES, ProviderProtocol, protocol_of
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


def _already_complete(url: str, proto: ProviderProtocol) -> bool:
    lowered = url.rstrip("/").lower()
    paths = [
        proto.chat_path,
        proto.embedding_path,
        proto.rerank_path,
        proto.embedding_multimodal_path,
        "chat/completions",
        "embeddings/multimodal",
        "embeddings",
        "reranks",
        "rerank",
    ]
    return any(p and lowered.endswith(p.rstrip("/").lower()) for p in paths)


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
    if _already_complete(trimmed, proto):
        return trimmed
    if kind == "rerank" and proto.rerank_join == "origin":
        return _join(_origin(trimmed), path)
    return _join(trimmed, path)


def _payload(model: AiModelRow, proto: ProviderProtocol, kind: Kind) -> dict[str, Any]:
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
    return {
        "model": model_id,
        "messages": [{"role": "user", "content": PING}],
        "max_tokens": 8,
    }


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

    proto = protocol_of(model.provider)
    if model.type == "rerank":
        refused = _refuse_rerank(base, proto)
        if refused:
            return TestOut(ok=False, ms=0, message=refused)

    multimodal = model.type == "embedding" and _is_multimodal_embedding(model)
    kind = _kind(model, multimodal=multimodal)
    url = _endpoint(base, proto, kind)
    body = _payload(model, proto, kind)
    try:
        response = await _request_async("POST", url, headers=_headers(token), json_body=body, kind=kind, model=model)
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
                json_body=_payload(model, proto, kind),
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
                json_body=_payload(model, proto, kind),
                kind=kind,
                model=model,
            )
        ms = int((time.perf_counter() - started) * 1000)
        err = _upstream_error(response.status_code, response.text)
        if err:
            return TestOut(ok=False, ms=ms, message=err)
        return TestOut(ok=True, ms=ms, message="连接正常")
    except httpx.RequestError as exc:
        ms = int((time.perf_counter() - started) * 1000)
        return TestOut(ok=False, ms=ms, message=str(exc) or "无法连接上游")


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
    return base, protocol_of(model.provider)


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
    url = _endpoint(base, proto, "chat")
    content: Any
    if images:
        import base64

        parts: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        for raw in images:
            b64 = base64.b64encode(raw).decode("ascii")
            parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})
        content = parts
    else:
        content = prompt
    payload: dict[str, Any] = {
        "model": _model_id(model),
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.1,
        "max_tokens": max_tokens,
    }
    if not thinking:
        payload["enable_thinking"] = False
        payload["chat_template_kwargs"] = {"enable_thinking": False}
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
                content = message.get("content")
                if isinstance(content, str):
                    return content
                if isinstance(content, list):
                    bits: list[str] = []
                    for part in content:
                        if isinstance(part, str):
                            bits.append(part)
                        elif isinstance(part, dict):
                            bits.append(str(part.get("text") or part.get("content") or ""))
                    return "".join(bits)
            if isinstance(first.get("text"), str):
                return first["text"]
    output = body.get("output")
    if isinstance(output, dict) and isinstance(output.get("text"), str):
        return output["text"]
    if isinstance(body.get("text"), str):
        return body["text"]
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
    url = _endpoint(base, proto, "chat")
    payload: dict[str, Any] = {
        "model": _model_id(model),
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = tool_choice if tool_choice is not None else "auto"
    if thinking:
        payload["enable_thinking"] = True
        payload["chat_template_kwargs"] = {"enable_thinking": True}
    else:
        payload["enable_thinking"] = False
        payload["chat_template_kwargs"] = {"enable_thinking": False}
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

