from __future__ import annotations

import json
import time
from typing import Any

import httpx

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
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(url, headers=headers)
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
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(url, headers=_headers(token), json=body)
            if (
                kind == "embedding"
                and proto.embedding_multimodal_path
                and model.multimodal is not False
                and _should_retry_multimodal(response.status_code, response.text)
            ):
                kind = "embedding_mm"
                url = _endpoint(base, proto, kind)
                response = await client.post(url, headers=_headers(token), json=_payload(model, proto, kind))
            elif kind == "embedding_mm" and proto.embedding_multimodal_path and response.status_code == 404:
                kind = "embedding"
                url = _endpoint(base, proto, kind)
                response = await client.post(url, headers=_headers(token), json=_payload(model, proto, kind))
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
