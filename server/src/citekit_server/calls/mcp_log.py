from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from citekit_server.calls.log import KEEP_DAYS, MAX_ROWS, MAX_STR, _cap_json, _now, _sanitize
from citekit_server.calls.tables import McpCallRow
from citekit_server.db.base import SessionLocal
from citekit_server.ids import new_id
from citekit_server.tools.tables import McpEndpointRow

SKIP_METHODS = frozenset({"ping", "notifications/initialized", "notifications/cancelled"})


def should_log_mcp_method(method: str | None) -> bool:
    name = (method or "").strip()
    if not name:
        return True
    if name in SKIP_METHODS or name.startswith("notifications/"):
        return False
    return True


def record_mcp_call(
    *,
    endpoint: McpEndpointRow | None = None,
    endpoint_id: str = "",
    endpoint_name: str = "",
    env: str = "",
    method: str = "",
    tool_id: str | None = None,
    tool_name: str = "",
    query: str = "",
    warehouse: str | None = None,
    http_status: int | None = None,
    ok: bool = False,
    latency_ms: int = 0,
    error: str | None = None,
    hit_count: int | None = None,
    request_body: Any = None,
    response_body: Any = None,
    summary: str = "",
    client_ip: str = "",
    client_region: str = "",
) -> None:
    if endpoint is not None:
        endpoint_id = endpoint.id
        endpoint_name = endpoint.name
        env = endpoint.env
    query_text = (query or "")[:2000]
    row = McpCallRow(
        id=new_id("mcall"),
        created_at=_now(),
        endpoint_id=endpoint_id or "",
        endpoint_name=endpoint_name or "",
        env=env or "",
        method=method or "",
        tool_id=tool_id,
        tool_name=tool_name or "",
        query=query_text,
        warehouse=warehouse,
        http_status=http_status,
        ok=ok,
        latency_ms=max(0, int(latency_ms)),
        error=(error or "")[:2000] or None,
        hit_count=hit_count,
        summary=(summary or _mcp_summary(method, query_text, tool_name, hit_count, error, ok))[:255],
        request_body=_cap_json(_sanitize(request_body)),
        response_body=_cap_json(_sanitize(_clip_mcp_response(response_body))),
        client_ip=(client_ip or "")[:64],
        client_region=(client_region or "")[:120],
    )
    db = SessionLocal()
    try:
        db.add(row)
        prune_mcp_calls(db)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def prune_mcp_calls(db: Session) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    db.query(McpCallRow).filter(McpCallRow.created_at < cutoff).delete(synchronize_session=False)
    total = int(db.query(func.count(McpCallRow.id)).scalar() or 0)
    extra = total - MAX_ROWS
    while extra > 0:
        oldest = (
            db.query(McpCallRow.id)
            .order_by(McpCallRow.created_at.asc(), McpCallRow.id.asc())
            .limit(min(extra, 500))
            .all()
        )
        ids = [item[0] for item in oldest]
        if not ids:
            break
        db.query(McpCallRow).filter(McpCallRow.id.in_(ids)).delete(synchronize_session=False)
        extra -= len(ids)


def _mcp_summary(
    method: str,
    query: str,
    tool_name: str,
    hit_count: int | None,
    error: str | None,
    ok: bool,
) -> str:
    if error:
        return error[:160]
    if method == "initialize":
        return "握手"
    if method == "tools/list":
        return "列出工具"
    if method == "tools/call":
        bits = [tool_name or "工具"]
        if query:
            bits.append(query.replace("\n", " ")[:80])
        if hit_count is not None:
            bits.append(f"{hit_count} 条")
        return " · ".join(bits)
    if method == "auth":
        return "鉴权失败" if not ok else "鉴权"
    return method or "MCP"


def _clip_mcp_response(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    result = value.get("result")
    if not isinstance(result, dict):
        return value
    content = result.get("content")
    if not isinstance(content, list):
        return value
    clipped: list[Any] = []
    for item in content[:8]:
        if isinstance(item, dict) and isinstance(item.get("text"), str) and len(item["text"]) > MAX_STR:
            clipped.append({**item, "text": f"{item['text'][:MAX_STR]}…(+{len(item['text']) - MAX_STR})"})
        else:
            clipped.append(item)
    if len(content) > 8:
        clipped.append({"_omitted": len(content) - 8})
    return {**value, "result": {**result, "content": clipped}}
