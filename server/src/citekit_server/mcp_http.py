from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from citekit_server import __version__
from citekit_server.db import McpEndpointRow, ToolRow, get_db
from citekit_server.tools_logic import format_hits, mcp_tool_list_item, search_tool

router = APIRouter()

PROTOCOL = "2025-03-26"
SUPPORTED = {"2024-11-05", "2025-03-26", "2025-06-18"}


def _bearer(authorization: str | None) -> str:
    raw = (authorization or "").strip()
    if raw.lower().startswith("bearer "):
        return raw[7:].strip()
    return raw


def _endpoint(db: Session, endpoint_id: str, authorization: str | None) -> McpEndpointRow:
    row = db.get(McpEndpointRow, endpoint_id)
    if not row:
        raise HTTPException(404, "端点不存在")
    token = _bearer(authorization)
    if not token or token != row.api_key:
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


def _handle(db: Session, row: McpEndpointRow, message: dict) -> dict | None:
    if message.get("jsonrpc") != "2.0":
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
        return _rpc_result(rpc_id, {"tools": [mcp_tool_list_item(item) for item in tools]})
    if method == "tools/call":
        name = str(params.get("name") or "")
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            arguments = {}
        tool = next((item for item in _listed_tools(db, row) if item.name == name), None)
        if not tool:
            return _rpc_error(rpc_id, -32602, f"工具不在白名单：{name}")
        query = str(arguments.get("query") or "").strip()
        warehouse = str(arguments.get("warehouse") or "").strip() or None
        out = search_tool(db, tool, query, warehouse)
        text = format_hits(out)
        is_error = bool(out.message and not out.hits)
        return _rpc_result(
            rpc_id,
            {
                "content": [{"type": "text", "text": text}],
                "isError": is_error,
            },
        )
    return _rpc_error(rpc_id, -32601, f"Method not found: {method}")


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
    row = _endpoint(db, endpoint_id, authorization)
    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(400, "请求不是合法 JSON") from exc
    accept = (request.headers.get("accept") or "").lower()
    sse = "text/event-stream" in accept and "application/json" not in accept
    if isinstance(payload, list):
        replies = [item for item in (_handle(db, row, msg) for msg in payload if isinstance(msg, dict)) if item]
        if not replies:
            return Response(status_code=202)
        return _encode(replies, sse=sse)
    if not isinstance(payload, dict):
        raise HTTPException(400, "请求不是 JSON-RPC 对象")
    reply = _handle(db, row, payload)
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
    _endpoint(db, endpoint_id, authorization)
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
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> Response:
    _endpoint(db, endpoint_id, authorization)
    return Response(status_code=204)
