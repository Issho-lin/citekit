from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from citekit_server.connectors.common import ConnectorDocument, PreviewedDocumentIn, connector_config, connector_kb, persist_documents
from citekit_server.db import KnowledgeBaseRow, get_db
from citekit_server.schemas import ProcessConfigIn

router = APIRouter(prefix="/api/kbs/{kb_id}/dingtalk", tags=["dingtalk"])
_API = "https://api.dingtalk.com"
_OAPI = "https://oapi.dingtalk.com"


class DingtalkWorkspaceOut(BaseModel):
    id: str
    name: str
    description: str = ""


class DingtalkNodeOut(BaseModel):
    id: str
    name: str
    url: str = ""


class DingtalkImportIn(BaseModel):
    workspaceId: str = Field(min_length=1, max_length=200)
    nodeIds: list[str] = Field(min_length=1, max_length=100)
    documents: list[PreviewedDocumentIn] = Field(min_length=1, max_length=100)
    process: ProcessConfigIn | None = None
    parentId: str | None = None


def _kb(db: Session, kb_id: str) -> KnowledgeBaseRow:
    return connector_kb(db, kb_id, "dingtalk", "钉钉")


def _config(kb: KnowledgeBaseRow) -> tuple[str, str, str]:
    cfg = connector_config(kb, "dingtalkServer")
    app_key = str(cfg.get("appKey") or "").strip()
    app_secret = str(cfg.get("appSecret") or "").strip()
    operator_id = str(cfg.get("userId") or "").strip()
    if not app_key or not app_secret or not operator_id:
        raise HTTPException(400, "请先配置钉钉 App Key、App Secret 和 User Union ID")
    return app_key, app_secret, operator_id


def _access_token(app_key: str, app_secret: str) -> str:
    try:
        response = httpx.post(f"{_API}/v1.0/oauth2/accessToken", json={"appKey": app_key, "appSecret": app_secret}, timeout=20)
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "无法获取钉钉 accessToken") from exc
    token = body.get("accessToken") if isinstance(body, dict) else ""
    if not token:
        raise HTTPException(400, str(body.get("message") or "钉钉拒绝应用凭据") if isinstance(body, dict) else "钉钉拒绝应用凭据")
    return str(token)


def _operator_union_id(user_id: str, token: str) -> str:
    try:
        response = httpx.post(
            f"{_OAPI}/topapi/v2/user/get",
            params={"access_token": token},
            json={"userid": user_id, "language": "zh_CN"},
            timeout=20,
        )
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "无法查询钉钉成员详情") from exc
    result = body.get("result") if isinstance(body, dict) and isinstance(body.get("result"), dict) else {}
    union_id = str(result.get("unionid") or "").strip()
    if not union_id:
        message = body.get("errmsg") if isinstance(body, dict) else ""
        raise HTTPException(400, str(message or "未能通过 User ID 获取钉钉 Union ID，请检查成员信息读取权限和 User ID"))
    return union_id


def _get(path: str, token: str, **params: str) -> dict[str, Any]:
    try:
        response = httpx.get(f"{_API}{path}", headers={"x-acs-dingtalk-access-token": token}, params=params, timeout=20)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"请求钉钉接口失败：{type(exc).__name__}: {exc}") from exc
    try:
        body = response.json()
    except ValueError as exc:
        raise HTTPException(502, f"钉钉接口返回无效响应（HTTP {response.status_code}）") from exc
    if not isinstance(body, dict):
        raise HTTPException(502, "钉钉接口返回格式无效")
    if response.is_error or body.get("code") or body.get("success") is False:
        message = str(body.get("message") or body.get("msg") or f"钉钉接口请求失败（HTTP {response.status_code}）")
        raise HTTPException(response.status_code if response.is_error else 400, message)
    return body


def _pages(path: str, token: str, item_key: str, max_results: int = 50, **params: str) -> Iterator[dict[str, Any]]:
    next_token: str | None = None
    while True:
        page_params = {**params, "maxResults": str(max_results)}
        if next_token:
            page_params["nextToken"] = next_token
        data = _get(path, token, **page_params)
        yield from (item for item in data.get(item_key, []) if isinstance(item, dict))
        next_token = str(data.get("nextToken") or "") or None
        if not next_token:
            return


def _nodes(root_node_id: str, operator_id: str, token: str) -> Iterator[dict[str, Any]]:
    pending = [root_node_id]
    visited: set[str] = set()
    while pending and len(visited) < 1000:
        parent = pending.pop()
        if parent in visited:
            continue
        visited.add(parent)
        for node in _pages("/v2.0/wiki/nodes", token, "nodes", parentNodeId=parent, operatorId=operator_id):
            yield node
            if node.get("hasChildren") and node.get("nodeId"):
                pending.append(str(node["nodeId"]))


def _node(node_id: str, operator_id: str, token: str) -> dict[str, Any]:
    data = _get(
        f"/v2.0/wiki/nodes/{node_id}",
        token,
        operatorId=operator_id,
        withStatisticalInfo="false",
        withPermissionRole="false",
    )
    node = data.get("node")
    if not isinstance(node, dict):
        raise HTTPException(502, "钉钉节点信息格式无效")
    return node


def _document_content(node_id: str, operator_id: str, token: str) -> tuple[str, str, str]:
    node = _node(node_id, operator_id, token)
    title = str(node.get("name") or "钉钉文档").strip()
    url = str(node.get("url") or "")
    text = _document_text(node_id, operator_id, token).strip()
    return title, text, url


def _document_text(node_id: str, operator_id: str, token: str) -> str:
    blocks: list[str] = []
    start = 0
    while True:
        data = _get(f"/v1.0/doc/suites/documents/{node_id}/blocks", token, operatorId=operator_id, startIndex=str(start), endIndex=str(start + 100))
        result = data.get("result") if isinstance(data.get("result"), dict) else {}
        items = result.get("data") if isinstance(result.get("data"), list) else []
        for block in items:
            if not isinstance(block, dict):
                continue
            block_type = str(block.get("blockType") or "").lower()
            content = block.get(block_type) if isinstance(block.get(block_type), dict) else {}
            if not content:
                content = block.get("paragraph") if isinstance(block.get("paragraph"), dict) else {}
            text = str(content.get("text") or "").strip()
            if not text:
                continue
            heading_level = next((level for level in range(1, 7) if block_type in {f"heading{level}", f"heading_{level}", f"title{level}", f"title_{level}"}), 0)
            blocks.append(f"{'#' * heading_level} {text}" if heading_level else text)
        if len(items) < 100:
            return "\n\n".join(blocks)
        start += len(items)


@router.get("/workspaces", response_model=list[DingtalkWorkspaceOut])
def list_workspaces(kb_id: str, db: Session = Depends(get_db)) -> list[DingtalkWorkspaceOut]:
    app_key, app_secret, user_id = _config(_kb(db, kb_id))
    token = _access_token(app_key, app_secret)
    operator_id = _operator_union_id(user_id, token)
    return [DingtalkWorkspaceOut(id=str(item.get("workspaceId") or ""), name=str(item.get("name") or "未命名知识库"), description=str(item.get("description") or "")) for item in _pages("/v2.0/wiki/workspaces", token, "workspaces", max_results=30, operatorId=operator_id) if item.get("workspaceId")]


@router.get("/nodes", response_model=list[DingtalkNodeOut])
def list_nodes(kb_id: str, workspaceId: str = Query(min_length=1, max_length=200), db: Session = Depends(get_db)) -> list[DingtalkNodeOut]:
    app_key, app_secret, user_id = _config(_kb(db, kb_id))
    token = _access_token(app_key, app_secret)
    operator_id = _operator_union_id(user_id, token)
    workspace = next((item for item in _pages("/v2.0/wiki/workspaces", token, "workspaces", max_results=30, operatorId=operator_id) if str(item.get("workspaceId")) == workspaceId), None)
    if not workspace or not workspace.get("rootNodeId"):
        raise HTTPException(404, "钉钉知识库不存在或无访问权限")
    return [DingtalkNodeOut(id=str(node["nodeId"]), name=str(node.get("name") or "未命名文档"), url=str(node.get("url") or "")) for node in _nodes(str(workspace["rootNodeId"]), operator_id, token) if node.get("nodeId") and node.get("category") == "ALIDOC"]


@router.get("/preview")
def preview_node(kb_id: str, nodeId: str = Query(min_length=1, max_length=200), db: Session = Depends(get_db)) -> dict[str, str]:
    app_key, app_secret, user_id = _config(_kb(db, kb_id))
    token = _access_token(app_key, app_secret)
    title, text, _ = _document_content(nodeId, _operator_union_id(user_id, token), token)
    return {"name": title, "text": f"# {title}\n\n{text}" if text else f"# {title}"}


@router.post("/import")
def import_nodes(kb_id: str, body: DingtalkImportIn, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict[str, int]:
    _kb(db, kb_id)
    process = (body.process or ProcessConfigIn()).model_dump()
    documents = [document.to_document() for document in body.documents]
    return {"imported": persist_documents(db, background, kb_id=kb_id, source_type="dingtalk", documents=documents, process=process, parent_id=body.parentId)}
