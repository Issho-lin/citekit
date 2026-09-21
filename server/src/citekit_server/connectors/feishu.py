from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from citekit_server.db import FeishuFolderRow, KnowledgeBaseRow, SourceRow, get_db
from citekit_server.ids import new_id
from citekit_server.kb.ingest import ingest_source, now_stamp
from citekit_server.schemas import ProcessConfigIn

router = APIRouter(prefix="/api/kbs/{kb_id}/feishu", tags=["feishu"])
_API = "https://open.feishu.cn/open-apis"
_SUPPORTED = {"docx"}


class FeishuFileOut(BaseModel):
    token: str
    name: str
    type: str
    url: str = ""
    parentToken: str = ""


class FeishuSpaceOut(BaseModel):
    id: str
    name: str
    description: str = ""


class FeishuWikiNodeOut(BaseModel):
    token: str
    title: str
    type: str
    objToken: str
    hasChild: bool = False
    parentToken: str = ""


class FeishuImportIn(BaseModel):
    folderToken: str = Field(min_length=1, max_length=200)
    tokens: list[str] = Field(min_length=1, max_length=100)
    process: ProcessConfigIn | None = None
    parentId: str | None = None


class FeishuImportOut(BaseModel):
    imported: int


class FeishuWikiImportIn(BaseModel):
    spaceId: str = Field(min_length=1, max_length=100)
    tokens: list[str] = Field(min_length=1, max_length=100)
    process: ProcessConfigIn | None = None
    parentId: str | None = None


class FeishuFolderOut(BaseModel):
    id: str
    token: str
    name: str
    lastSyncedAt: str | None = None


class FeishuFolderIn(BaseModel):
    token: str = Field(min_length=1, max_length=255)
    name: str = ""


def _kb(db: Session, kb_id: str) -> KnowledgeBaseRow:
    row = db.get(KnowledgeBaseRow, kb_id)
    if not row or row.kind != "feishu":
        raise HTTPException(404, "飞书知识库不存在")
    return row


def _config(kb: KnowledgeBaseRow) -> tuple[str, str]:
    raw = kb.api_dataset_server if isinstance(kb.api_dataset_server, dict) else {}
    cfg = raw.get("feishuServer") if isinstance(raw.get("feishuServer"), dict) else {}
    app_id = str(cfg.get("appId") or "").strip()
    app_secret = str(cfg.get("appSecret") or "").strip()
    if not app_id or not app_secret:
        raise HTTPException(400, "请先在知识库中配置飞书 App ID 和 App Secret")
    return app_id, app_secret


def _tenant_token(kb: KnowledgeBaseRow) -> str:
    app_id, app_secret = _config(kb)
    try:
        response = httpx.post(f"{_API}/auth/v3/tenant_access_token/internal", json={"app_id": app_id, "app_secret": app_secret}, timeout=15)
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "无法获取飞书 tenant_access_token") from exc
    if body.get("code", 0) != 0 or not body.get("tenant_access_token"):
        raise HTTPException(400, str(body.get("msg") or "飞书拒绝了应用凭据"))
    return str(body["tenant_access_token"])


def _get(path: str, token: str, **params: str) -> dict[str, Any]:
    try:
        response = httpx.get(f"{_API}{path}", headers={"Authorization": f"Bearer {token}"}, params=params, timeout=20)
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "请求飞书接口失败") from exc
    if body.get("code", 0) != 0:
        raise HTTPException(400, str(body.get("msg") or "飞书接口返回错误"))
    return body.get("data") if isinstance(body.get("data"), dict) else {}


def _files(folder_token: str, token: str) -> Iterator[dict[str, Any]]:
    page_token = ""
    while True:
        data = _get("/drive/v1/files", token, folder_token=folder_token, page_size="50", page_token=page_token)
        files = data.get("files") if isinstance(data.get("files"), list) else []
        yield from (item for item in files if isinstance(item, dict))
        if not data.get("has_more"):
            return
        page_token = str(data.get("next_page_token") or "")
        if not page_token:
            return


def _locator(file: dict[str, Any]) -> str:
    if file.get("url"):
        return str(file["url"])
    if file.get("type") == "docx":
        return f"https://feishu.cn/docx/{file.get('token', '')}"
    return ""


def _markdown_content(document_token: str, access_token: str) -> str:
    data = _get(
        "/docs/v1/content",
        access_token,
        doc_token=document_token,
        doc_type="docx",
        content_type="markdown",
        lang="zh",
    )
    return str(data.get("content") or "")


@router.get("/folders", response_model=list[FeishuFolderOut])
def list_folders(kb_id: str, db: Session = Depends(get_db)) -> list[FeishuFolderOut]:
    _kb(db, kb_id)
    rows = db.query(FeishuFolderRow).filter(FeishuFolderRow.kb_id == kb_id).order_by(FeishuFolderRow.created_at.desc()).all()
    return [FeishuFolderOut(id=row.id, token=row.folder_token, name=row.folder_name or "未命名目录", lastSyncedAt=row.last_synced_at) for row in rows]


@router.post("/folders", response_model=FeishuFolderOut)
def save_folder(kb_id: str, body: FeishuFolderIn, db: Session = Depends(get_db)) -> FeishuFolderOut:
    _kb(db, kb_id)
    token = body.token.strip()
    existing = db.query(FeishuFolderRow).filter(FeishuFolderRow.kb_id == kb_id, FeishuFolderRow.folder_token == token).one_or_none()
    if existing:
        if body.name.strip(): existing.folder_name = body.name.strip()
        db.commit()
        row = existing
    else:
        row = FeishuFolderRow(id=new_id("fld"), kb_id=kb_id, folder_token=token, folder_name=body.name.strip() or "未命名目录", created_at=now_stamp())
        db.add(row)
        db.commit()
    return FeishuFolderOut(id=row.id, token=row.folder_token, name=row.folder_name, lastSyncedAt=row.last_synced_at)


def _wiki_nodes(space_id: str, parent_token: str, access_token: str) -> list[dict[str, Any]]:
    page_token = ""
    result: list[dict[str, Any]] = []
    while True:
        params = {"space_id": space_id, "page_size": "50", "page_token": page_token}
        if parent_token:
            params["parent_node_token"] = parent_token
        data = _get(f"/wiki/v2/spaces/{space_id}/nodes", access_token, **params)
        result.extend(item for item in data.get("items", []) if isinstance(item, dict))
        if not data.get("has_more"):
            return result
        page_token = str(data.get("page_token") or "")
        if not page_token:
            return result


@router.get("/spaces", response_model=list[FeishuSpaceOut])
def list_spaces(kb_id: str, db: Session = Depends(get_db)) -> list[FeishuSpaceOut]:
    kb = _kb(db, kb_id)
    token = _tenant_token(kb)
    page_token = ""
    result: list[FeishuSpaceOut] = []
    while True:
        data = _get("/wiki/v2/spaces", token, page_size="50", page_token=page_token)
        for item in data.get("items", []):
            if isinstance(item, dict) and item.get("space_id"):
                result.append(FeishuSpaceOut(id=str(item["space_id"]), name=str(item.get("name") or "未命名知识空间"), description=str(item.get("description") or "")))
        if not data.get("has_more"):
            return result
        page_token = str(data.get("page_token") or "")
        if not page_token:
            return result


@router.get("/wiki/nodes", response_model=list[FeishuWikiNodeOut])
def list_wiki_nodes(kb_id: str, spaceId: str = Query(min_length=1, max_length=100), parentToken: str = "", db: Session = Depends(get_db)) -> list[FeishuWikiNodeOut]:
    kb = _kb(db, kb_id)
    access_token = _tenant_token(kb)
    return [FeishuWikiNodeOut(token=str(item.get("node_token") or ""), title=str(item.get("title") or "未命名节点"), type=str(item.get("obj_type") or ""), objToken=str(item.get("obj_token") or ""), hasChild=bool(item.get("has_child")), parentToken=str(item.get("parent_node_token") or "")) for item in _wiki_nodes(spaceId.strip(), parentToken.strip(), access_token) if item.get("node_token")]


@router.get("/files", response_model=list[FeishuFileOut])
def list_files(kb_id: str, folderToken: str = Query(min_length=1, max_length=200), db: Session = Depends(get_db)) -> list[FeishuFileOut]:
    kb = _kb(db, kb_id)
    folder_token = folderToken.strip()
    if not folder_token:
        raise HTTPException(400, "请填写 Folder Token")
    token = _tenant_token(kb)
    return [
        FeishuFileOut(token=str(item.get("token") or ""), name=str(item.get("name") or "未命名文档"), type=str(item.get("type") or ""), url=_locator(item), parentToken=str(item.get("parent_token") or ""))
        for item in _files(folder_token, token)
        if str(item.get("type") or "") in _SUPPORTED and str(item.get("token") or "")
    ]


@router.get("/preview")
def preview_file(kb_id: str, folderToken: str = Query(min_length=1, max_length=200), token: str = Query(min_length=1, max_length=200), db: Session = Depends(get_db)) -> dict[str, str]:
    kb = _kb(db, kb_id)
    access_token = _tenant_token(kb)
    item = next((item for item in _files(folderToken.strip(), access_token) if str(item.get("token")) == token and str(item.get("type")) in _SUPPORTED), None)
    if not item:
        raise HTTPException(404, "飞书文档不存在或不在该目录中")
    return {"name": str(item.get("name") or "飞书文档"), "text": _markdown_content(token, access_token)}


@router.get("/wiki/preview")
def preview_wiki_node(kb_id: str, token: str = Query(min_length=1, max_length=200), db: Session = Depends(get_db)) -> dict[str, str]:
    kb = _kb(db, kb_id)
    access_token = _tenant_token(kb)
    return {"name": "飞书 Wiki 文档", "text": _markdown_content(token, access_token)}


@router.post("/wiki/import", response_model=FeishuImportOut)
def import_wiki_files(kb_id: str, body: FeishuWikiImportIn, background: BackgroundTasks, db: Session = Depends(get_db)) -> FeishuImportOut:
    kb = _kb(db, kb_id)
    access_token = _tenant_token(kb)
    nodes: dict[str, dict[str, Any]] = {}
    pending = [""]
    visited: set[str] = set()
    while pending and len(nodes) < 500:
        parent = pending.pop()
        if parent in visited:
            continue
        visited.add(parent)
        for item in _wiki_nodes(body.spaceId.strip(), parent, access_token):
            node_token = str(item.get("node_token") or "")
            if not node_token:
                continue
            nodes[node_token] = item
            if item.get("has_child"):
                pending.append(node_token)
    process = (body.process or ProcessConfigIn()).model_dump()
    source_ids: list[str] = []
    imported = 0
    for document_id in dict.fromkeys(body.tokens):
        node = nodes.get(document_id)
        if not node or str(node.get("obj_type") or "") != "docx" or not node.get("obj_token"):
            continue
        obj_token = str(node["obj_token"])
        text = _markdown_content(obj_token, access_token).strip()
        if not text:
            continue
        locator = f"https://feishu.cn/wiki/{document_id}"
        existing = db.query(SourceRow).filter(SourceRow.kb_id == kb_id, SourceRow.type == "feishu", SourceRow.locator == locator).one_or_none()
        if existing:
            existing.title, existing.raw_text, existing.process, existing.status, existing.error_message, existing.updated_at = str(node.get("title") or "飞书 Wiki 文档"), text, process, "syncing", None, now_stamp()
            source_id = existing.id
        else:
            row = SourceRow(id=new_id("src"), kb_id=kb_id, parent_id=body.parentId, type="feishu", title=str(node.get("title") or "飞书 Wiki 文档"), locator=locator, acl="internal", status="syncing", process=process, raw_text=text, updated_at=now_stamp(), chunk_count=0)
            db.add(row)
            source_id = row.id
        source_ids.append(source_id)
        imported += 1
    db.commit()
    for source_id in source_ids:
        background.add_task(ingest_source, source_id)
    return FeishuImportOut(imported=imported)


@router.post("/import", response_model=FeishuImportOut)
def import_files(kb_id: str, body: FeishuImportIn, background: BackgroundTasks, db: Session = Depends(get_db)) -> FeishuImportOut:
    kb = _kb(db, kb_id)
    token = _tenant_token(kb)
    folder_token = body.folderToken.strip()
    if not folder_token:
        raise HTTPException(400, "请填写 Folder Token")
    available = {str(item.get("token")): item for item in _files(folder_token, token) if str(item.get("type") or "") in _SUPPORTED}
    process = (body.process or ProcessConfigIn()).model_dump()
    imported = 0
    source_ids: list[str] = []
    for document_id in dict.fromkeys(body.tokens):
        item = available.get(document_id)
        if not item:
            continue
        text = _markdown_content(document_id, token).strip()
        if not text:
            continue
        existing = db.query(SourceRow).filter(SourceRow.kb_id == kb_id, SourceRow.type == "feishu", SourceRow.locator == _locator(item)).one_or_none()
        if existing:
            existing.title, existing.raw_text, existing.process, existing.status, existing.error_message, existing.updated_at = str(item.get("name") or existing.title), text, process, "syncing", None, now_stamp()
            source_id = existing.id
        else:
            row = SourceRow(id=new_id("src"), kb_id=kb_id, parent_id=body.parentId, type="feishu", title=str(item.get("name") or "飞书文档"), locator=_locator(item), acl="internal", status="syncing", process=process, raw_text=text, updated_at=now_stamp(), chunk_count=0)
            db.add(row)
            source_id = row.id
        source_ids.append(source_id)
        imported += 1
    db.commit()
    # Parsing, embedding and indexing can make a request last minutes. Persist all
    # Sources first and let the existing ingest worker finish them asynchronously.
    for source_id in source_ids:
        background.add_task(ingest_source, source_id)
    return FeishuImportOut(imported=imported)
