from __future__ import annotations

import json
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Iterator

from citekit_server.db import AiModelRow, ModelCallRow, SessionLocal
from citekit_server.ids import new_id

_ctx: ContextVar[dict[str, Any] | None] = ContextVar("model_call_ctx", default=None)

MAX_STR = 4000
MAX_LIST = 40
MAX_JSON_CHARS = 48_000
VECTOR_PREVIEW = 8


@contextmanager
def call_scope(**kwargs: Any) -> Iterator[None]:
    prev = _ctx.get()
    token = _ctx.set({**(prev or {}), **{k: v for k, v in kwargs.items() if v is not None}})
    try:
        yield
    finally:
        _ctx.reset(token)


def record_http_call(
    *,
    method: str,
    url: str,
    kind: str,
    request_body: Any = None,
    status: int = 0,
    response_text: str = "",
    error: str | None = None,
    latency_ms: int = 0,
    model: AiModelRow | None = None,
) -> None:
    ctx = dict(_ctx.get() or {})
    parsed, usage = _parse_response(response_text)
    request = _cap_json(_sanitize(request_body))
    response = _cap_json(_sanitize(parsed))
    prompt, completion, total = _tokens(usage)
    http_ok = bool(status) and status < 400 and not error
    purpose = str(ctx.get("purpose") or _default_purpose(kind))
    summary = _summary(kind, request, response, error, status, http_ok)
    row = ModelCallRow(
        id=new_id("call"),
        created_at=_now(),
        model_id=(model.id if model else "") or str(ctx.get("model_id") or ""),
        model_name=(model.name if model else "") or str(ctx.get("model_name") or ""),
        mapped_model=(model.mapped_model if model else None) or None,
        model_type=(model.type if model else "") or str(ctx.get("model_type") or ""),
        provider=(model.provider if model else "") or str(ctx.get("provider") or ""),
        purpose=purpose,
        kind=kind,
        method=method.upper(),
        url=url,
        http_status=status or None,
        ok=http_ok,
        latency_ms=latency_ms,
        error=(error or "")[:2000] or None,
        kb_id=str(ctx.get("kb_id") or "") or None,
        source_id=str(ctx.get("source_id") or "") or None,
        prompt_tokens=prompt,
        completion_tokens=completion,
        total_tokens=total,
        summary=summary[:255],
        request_body=request,
        response_body=response,
    )
    db = SessionLocal()
    try:
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _cap_json(value: Any) -> Any:
    try:
        text = json.dumps(value, ensure_ascii=False)
    except TypeError:
        return {"_unserializable": True}
    if len(text) <= MAX_JSON_CHARS:
        return value
    return {"_truncated": True, "chars": len(text), "preview": text[:MAX_JSON_CHARS]}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _default_purpose(kind: str) -> str:
    if kind == "models":
        return "discover"
    if kind == "rerank":
        return "rerank"
    if kind.startswith("embedding"):
        return "embed"
    if kind == "chat":
        return "chat"
    return "call"


def _parse_response(text: str) -> tuple[Any, dict[str, Any]]:
    if not text:
        return None, {}
    try:
        body = json.loads(text)
    except Exception:
        return {"_text": text[:MAX_STR]}, {}
    usage: dict[str, Any] = {}
    if isinstance(body, dict) and isinstance(body.get("usage"), dict):
        usage = body["usage"]
    elif isinstance(body, dict):
        meta = body.get("meta")
        if isinstance(meta, dict) and isinstance(meta.get("tokens"), dict):
            usage = meta["tokens"]
    return body, usage


def _tokens(usage: dict[str, Any]) -> tuple[int | None, int | None, int | None]:
    def num(*keys: str) -> int | None:
        for key in keys:
            raw = usage.get(key)
            if isinstance(raw, (int, float)):
                return int(raw)
        return None

    prompt = num("prompt_tokens", "input_tokens")
    completion = num("completion_tokens", "output_tokens")
    total = num("total_tokens")
    if total is None and prompt is not None:
        total = prompt + (completion or 0)
    return prompt, completion, total


def _sanitize(value: Any, *, depth: int = 0) -> Any:
    if depth > 8:
        return "…"
    if isinstance(value, str):
        if len(value) > MAX_STR:
            return f"{value[:MAX_STR]}…(+{len(value) - MAX_STR})"
        return value
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    if isinstance(value, list):
        if value and _looks_vector(value):
            return _vector_meta(value)
        kept = [_sanitize(item, depth=depth + 1) for item in value[:MAX_LIST]]
        if len(value) > MAX_LIST:
            kept.append({"_omitted": len(value) - MAX_LIST})
        return kept
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= 80:
                out["_omitted_keys"] = len(value) - 80
                break
            name = str(key)
            if name.lower() in {"embedding", "vector"} and isinstance(item, list) and _looks_vector(item):
                out[name] = _vector_meta(item)
            else:
                out[name] = _sanitize(item, depth=depth + 1)
        return out
    text = str(value)
    return text[:500]


def _looks_vector(items: list[Any]) -> bool:
    sample = items[: min(len(items), 24)]
    return bool(sample) and all(isinstance(x, (int, float)) for x in sample)


def _vector_meta(items: list[Any]) -> dict[str, Any]:
    preview = [round(float(x), 6) for x in items[:VECTOR_PREVIEW]]
    return {"_vector": True, "dim": len(items), "preview": preview}


def _summary(kind: str, request: Any, response: Any, error: str | None, status: int, ok: bool) -> str:
    if error:
        return error[:160]
    if not ok and status:
        return f"HTTP {status}"
    if kind == "chat":
        msg = _chat_preview(request) or _chat_reply(response)
        return msg or "对话"
    if kind.startswith("embedding"):
        n, dim = _embed_meta(request, response)
        if n and dim:
            return f"{n} 条 · {dim} 维"
        if n:
            return f"{n} 条文本"
        return "向量化"
    if kind == "rerank":
        n = _rerank_n(request)
        return f"重排 {n} 篇" if n else "重排"
    if kind == "models":
        ids = response.get("data") if isinstance(response, dict) else response
        if isinstance(ids, list):
            return f"拉取到 {len(ids)} 个模型"
        return "拉取模型列表"
    return kind


def _chat_preview(request: Any) -> str:
    if not isinstance(request, dict):
        return ""
    messages = request.get("messages")
    if not isinstance(messages, list):
        return ""
    for item in reversed(messages):
        if isinstance(item, dict) and item.get("role") == "user":
            content = item.get("content")
            if isinstance(content, str):
                return content.replace("\n", " ")[:120]
    return ""


def _chat_reply(response: Any) -> str:
    if not isinstance(response, dict):
        return ""
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if isinstance(message, dict) and isinstance(message.get("content"), str):
        return message["content"].replace("\n", " ")[:120]
    if isinstance(first.get("text"), str):
        return first["text"].replace("\n", " ")[:120]
    return ""


def _embed_meta(request: Any, response: Any) -> tuple[int, int]:
    n = 0
    if isinstance(request, dict):
        raw = request.get("input")
        if isinstance(raw, list):
            n = len(raw)
        elif isinstance(raw, str):
            n = 1
    dim = 0
    rows: list[Any] = []
    if isinstance(response, dict):
        data = response.get("data")
        if isinstance(data, list):
            rows = data
    if rows:
        first = rows[0]
        if isinstance(first, dict) and isinstance(first.get("embedding"), dict):
            dim = int(first["embedding"].get("dim") or 0)
        elif isinstance(first, dict) and isinstance(first.get("embedding"), list):
            dim = len(first["embedding"])
    return n, dim


def _rerank_n(request: Any) -> int:
    if not isinstance(request, dict):
        return 0
    docs = request.get("documents")
    if isinstance(docs, list):
        return len(docs)
    nested = request.get("input")
    if isinstance(nested, dict) and isinstance(nested.get("documents"), list):
        return len(nested["documents"])
    return 0
