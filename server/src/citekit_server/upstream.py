from __future__ import annotations

import json
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
    if status >= 400:
        return f"HTTP {status} {_trim(text)}"
    try:
        body = json.loads(text) if text else None
    except json.JSONDecodeError:
        return None
    if not isinstance(body, dict):
        return None
    code = body.get("code")
    if code in (None, "", "Success"):
        return None
    msg = body.get("message") or str(code)
    return _trim(str(msg))


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

