from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from citekit_server import __version__
from citekit_server.calls.client import caller_of
from citekit_server.calls.mcp_log import record_mcp_call, should_log_mcp_method
from citekit_server.db import McpEndpointRow, ToolRow, get_db
from citekit_server.tools.logic import format_hits, mcp_tool_list_item, search_tool

router = APIRouter()

PROTOCOL = "2025-03-26"
SUPPORTED = {"2024-11-05", "2025-03-26", "2025-06-18"}


def _bearer(authorization: str | None) -> str:
    raw = (authorization or "").strip()
    if raw.lower().startswith("bearer "):
        return raw[7:].strip()
    return raw


def _endpoint(
    db: Session,
    endpoint_id: str,
    authorization: str | None,
    caller: tuple[str, str] = ("", ""),
) -> McpEndpointRow:
    client_ip, client_region = caller
    row = db.get(McpEndpointRow, endpoint_id)
    if not row:
        record_mcp_call(
            endpoint_id=endpoint_id,
            method="auth",
            ok=False,
            http_status=404,
            error="端点不存在",
            client_ip=client_ip,
            client_region=client_region,
        )
        raise HTTPException(404, "端点不存在")
    token = _bearer(authorization)
    if not token or token != row.api_key:
        record_mcp_call(
            endpoint=row,
            method="auth",
            ok=False,
            http_status=401,
            error="无效的 MCP 密钥",
            client_ip=client_ip,
            client_region=client_region,
        )
        raise HTTPException(401, "无效的 MCP 密钥")
    return row


def _listed_tools(db: Session, row: McpEndpointRow) -> list[ToolRow]:
    ids = list(row.tool_ids or [])
    if not ids:
        return []
    tools = db.query(ToolRow).filter(ToolRow.id.in_(ids)).all()
    by_id = {item.id: item for item in tools}
    return [by_id[tid] for tid in ids if tid in by_id]


def _rpc_error(rpc_id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": code, "message": message}}


def _rpc_result(rpc_id: Any, result: Any) -> dict:
    return {"jsonrpc": "2.0", "id": rpc_id, "result": result}


def _rpc_ok(reply: dict | None) -> bool:
    if not reply:
        return True
    if reply.get("error"):
        return False
    result = reply.get("result")
    if isinstance(result, dict) and result.get("isError"):
        return False
    return True


def _safe_rpc(message: dict) -> dict:
    params = message.get("params")
    return {
        "method": message.get("method"),
        "params": params if isinstance(params, dict) else {},
    }


def _log_rpc(
    row: McpEndpointRow,
    message: dict,
    reply: dict | None,
    latency_ms: int,
    extra: dict[str, Any],
    caller: tuple[str, str],
) -> None:
    method = str(message.get("method") or "")
    if message.get("id") is None or not should_log_mcp_method(method):
        return
    err = extra.get("error")
    if not err and reply and isinstance(reply.get("error"), dict):
        err = str(reply["error"].get("message") or "") or None
    record_mcp_call(
        endpoint=row,
        method=method,
        tool_id=extra.get("tool_id"),
        tool_name=str(extra.get("tool_name") or ""),
        query=str(extra.get("query") or ""),
        warehouse=extra.get("warehouse"),
        http_status=200,
        ok=_rpc_ok(reply),
        latency_ms=latency_ms,
        error=err,
        hit_count=extra.get("hit_count"),
        request_body=_safe_rpc(message),
        response_body=reply,
        client_ip=caller[0],
        client_region=caller[1],
    )


def _handle(db: Session, row: McpEndpointRow, message: dict, extra: dict[str, Any]) -> dict | None:
    if message.get("jsonrpc") != "2.0":
        extra["error"] = "Invalid Request"
        return _rpc_error(message.get("id"), -32600, "Invalid Request")
    method = message.get("method")
    rpc_id = message.get("id")
    params = message.get("params") or {}
    if not isinstance(params, dict):
        params = {}
    if rpc_id is None:
        return None
    if method == "initialize":
        requested = str(params.get("protocolVersion") or PROTOCOL)
        version = requested if requested in SUPPORTED else PROTOCOL
        return _rpc_result(
            rpc_id,
            {
                "protocolVersion": version,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "citekit", "version": __version__},
                "instructions": "只调用白名单里的检索工具。传入独立完整问句；复杂问题请并行调用多把工具。",
            },
        )
    if method in {"notifications/initialized", "notifications/cancelled"}:
        return None
    if method == "ping":
        return _rpc_result(rpc_id, {})
    if method == "tools/list":
        tools = _listed_tools(db, row)
        extra["hit_count"] = len(tools)
        return _rpc_result(rpc_id, {"tools": [mcp_tool_list_item(item) for item in tools]})
    if method == "tools/call":
        name = str(params.get("name") or "")
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            arguments = {}
        extra["tool_name"] = name
        extra["query"] = str(arguments.get("query") or "").strip()
        extra["warehouse"] = str(arguments.get("warehouse") or "").strip() or None
        tool = next((item for item in _listed_tools(db, row) if item.name == name), None)
        if not tool:
            extra["error"] = f"工具不在白名单：{name}"
            return _rpc_error(rpc_id, -32602, extra["error"])
        extra["tool_id"] = tool.id
        out = search_tool(db, tool, extra["query"], extra["warehouse"])
        extra["hit_count"] = len(out.hits)
        text = format_hits(out)
        is_error = bool(out.message and not out.hits)
        if is_error:
            extra["error"] = out.message
        return _rpc_result(
            rpc_id,
            {
                "content": [{"type": "text", "text": text}],
                "isError": is_error,
            },
        )
    extra["error"] = f"Method not found: {method}"
    return _rpc_error(rpc_id, -32601, extra["error"])


def _dispatch(db: Session, row: McpEndpointRow, message: dict, caller: tuple[str, str]) -> dict | None:
    started = time.perf_counter()
    extra: dict[str, Any] = {}
    reply = _handle(db, row, message, extra)
    _log_rpc(row, message, reply, int((time.perf_counter() - started) * 1000), extra, caller)
    return reply


def _encode(payload: dict | list, *, sse: bool) -> Response:
    headers = {"mcp-protocol-version": PROTOCOL}
    if sse:
        body = f"event: message\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        return Response(content=body, media_type="text/event-stream", headers=headers)
    return JSONResponse(payload, headers=headers)


@router.post("/mcp/{endpoint_id}")
async def mcp_post(
    endpoint_id: str,
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> Response:
    caller = caller_of(request)
    row = _endpoint(db, endpoint_id, authorization, caller)
    try:
        payload = await request.json()
    except Exception as exc:
        record_mcp_call(
            endpoint=row,
            method="",
            ok=False,
            http_status=400,
            error="请求不是合法 JSON",
            client_ip=caller[0],
            client_region=caller[1],
        )
        raise HTTPException(400, "请求不是合法 JSON") from exc
    accept = (request.headers.get("accept") or "").lower()
    sse = "text/event-stream" in accept and "application/json" not in accept
    if isinstance(payload, list):
        replies = [item for item in (_dispatch(db, row, msg, caller) for msg in payload if isinstance(msg, dict)) if item]
        if not replies:
            return Response(status_code=202)
        return _encode(replies, sse=sse)
    if not isinstance(payload, dict):
        record_mcp_call(
            endpoint=row,
            method="",
            ok=False,
            http_status=400,
            error="请求不是 JSON-RPC 对象",
            client_ip=caller[0],
            client_region=caller[1],
        )
        raise HTTPException(400, "请求不是 JSON-RPC 对象")
    reply = _dispatch(db, row, payload, caller)
    if reply is None:
        return Response(status_code=202)
    return _encode(reply, sse=sse)


@router.get("/mcp/{endpoint_id}")
async def mcp_get(
    endpoint_id: str,
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> StreamingResponse:
    _endpoint(db, endpoint_id, authorization, caller_of(request))
    accept = (request.headers.get("accept") or "").lower()
    if "text/event-stream" not in accept:
        raise HTTPException(405, "MCP 端点请使用 POST JSON-RPC")

    async def events():
        yield ": connected\n\n"
        try:
            while True:
                await asyncio.sleep(25)
                yield ": ping\n\n"
        except asyncio.CancelledError:
            return

    return StreamingResponse(events(), media_type="text/event-stream")


@router.delete("/mcp/{endpoint_id}")
def mcp_delete(
    endpoint_id: str,
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> Response:
    _endpoint(db, endpoint_id, authorization, caller_of(request))
    return Response(status_code=204)
