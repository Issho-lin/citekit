from __future__ import annotations

import time
from typing import Any

import httpx

from citekit_server.db import AiModelRow
from citekit_server.schemas import TestOut

PING = "citekit ping"


def _join(base: str, path: str) -> str:
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


def _headers(api_key: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    token = api_key.strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _endpoint(base: str, model: AiModelRow) -> str:
    trimmed = base.rstrip("/")
    lowered = trimmed.lower()
    if lowered.endswith(("chat/completions", "embeddings", "rerank")):
        return trimmed
    if model.type == "embedding":
        return _join(trimmed, "embeddings")
    if model.type == "rerank":
        return _join(trimmed, "rerank")
    return _join(trimmed, "chat/completions")


def _payload(model: AiModelRow) -> dict[str, Any]:
    model_id = (model.mapped_model or "").strip() or model.id
    if model.type == "embedding":
        return {"model": model_id, "input": PING}
    if model.type == "rerank":
        return {"model": model_id, "query": PING, "documents": [PING]}
    return {
        "model": model_id,
        "messages": [{"role": "user", "content": PING}],
        "max_tokens": 8,
    }


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

    url = _endpoint(base, model)
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(url, headers=_headers(token), json=_payload(model))
        ms = int((time.perf_counter() - started) * 1000)
        if response.status_code >= 400:
            return TestOut(ok=False, ms=ms, message=f"HTTP {response.status_code} {_trim(response.text)}")
        return TestOut(ok=True, ms=ms, message="连接正常")
    except httpx.RequestError as exc:
        ms = int((time.perf_counter() - started) * 1000)
        return TestOut(ok=False, ms=ms, message=str(exc) or "无法连接上游")


def _trim(text: str, limit: int = 180) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"
