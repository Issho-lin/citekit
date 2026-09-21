from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from citekit_server.connectors.common import ConnectorDocument, PreviewedDocumentIn, connector_config, connector_kb, persist_documents
from citekit_server.db import KnowledgeBaseRow, get_db
from citekit_server.schemas import ProcessConfigIn

router = APIRouter(prefix="/api/kbs/{kb_id}/yuque", tags=["yuque"])
_API = "https://www.yuque.com/api/v2"


class YuqueRepoOut(BaseModel):
    id: str
    name: str
    namespace: str
    description: str = ""


class YuqueDocOut(BaseModel):
    id: str
    title: str
    slug: str
    url: str = ""


class YuqueImportIn(BaseModel):
    repoId: str = Field(min_length=1, max_length=100)
    docIds: list[str] = Field(min_length=1, max_length=100)
    documents: list[PreviewedDocumentIn] = Field(min_length=1, max_length=100)
    process: ProcessConfigIn | None = None
    parentId: str | None = None


def _kb(db: Session, kb_id: str) -> KnowledgeBaseRow:
    return connector_kb(db, kb_id, "yuque", "语雀")


def _config(kb: KnowledgeBaseRow) -> tuple[str, str]:
    cfg = connector_config(kb, "yuqueServer")
    user_id, token = str(cfg.get("userId") or "").strip(), str(cfg.get("token") or "").strip()
    if not user_id or not token:
        raise HTTPException(400, "请先在知识库中配置语雀 User ID 和 Token")
    return user_id, token


def _get(path: str, token: str) -> Any:
    try:
        response = httpx.get(f"{_API}{path}", headers={"X-Auth-Token": token}, timeout=20, follow_redirects=True)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"请求语雀接口失败：{type(exc).__name__}: {exc}") from exc
    try:
        body = response.json()
    except ValueError as exc:
        raise HTTPException(502, f"语雀接口返回了无效响应（HTTP {response.status_code}）") from exc
    if response.is_error:
        message = body.get("message") if isinstance(body, dict) else ""
        raise HTTPException(response.status_code, str(message or f"语雀接口请求失败（HTTP {response.status_code}）"))
    if isinstance(body, dict) and body.get("message"):
        raise HTTPException(400, str(body["message"]))
    return body.get("data") if isinstance(body, dict) else body


@router.get("/repos", response_model=list[YuqueRepoOut])
def list_repos(kb_id: str, db: Session = Depends(get_db)) -> list[YuqueRepoOut]:
    user_id, token = _config(_kb(db, kb_id))
    data = _get(f"/users/{user_id}/repos", token)
    if not isinstance(data, list):
        return []
    return [
        YuqueRepoOut(
            id=str(item.get("id") or ""),
            name=str(item.get("name") or "未命名知识库"),
            namespace=str(item.get("namespace") or ""),
            description=str(item.get("description") or ""),
        )
        for item in data
        if isinstance(item, dict) and item.get("id")
    ]


@router.get("/docs", response_model=list[YuqueDocOut])
def list_docs(kb_id: str, repoId: str = Query(min_length=1, max_length=100), db: Session = Depends(get_db)) -> list[YuqueDocOut]:
    _, token = _config(_kb(db, kb_id))
    data = _get(f"/repos/{repoId}/docs", token)
    return [YuqueDocOut(id=str(item.get("id") or ""), title=str(item.get("title") or "未命名文档"), slug=str(item.get("slug") or item.get("id") or ""), url=str(item.get("url") or "")) for item in data if isinstance(item, dict) and item.get("id")]


@router.get("/preview")
def preview_doc(kb_id: str, repoId: str = Query(min_length=1), docId: str = Query(min_length=1), db: Session = Depends(get_db)) -> dict[str, str]:
    _, token = _config(_kb(db, kb_id))
    doc = _get(f"/repos/{repoId}/docs/{docId}", token)
    if not isinstance(doc, dict):
        raise HTTPException(502, "语雀文档内容格式无效")
    return {"name": str(doc.get("title") or "语雀文档"), "text": str(doc.get("body") or "")}


@router.post("/import")
def import_docs(kb_id: str, body: YuqueImportIn, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict[str, int]:
    _, token = _config(_kb(db, kb_id))
    process = (body.process or ProcessConfigIn()).model_dump()
    documents = [document.to_document() for document in body.documents]

    return {"imported": persist_documents(db, background, kb_id=kb_id, source_type="yuque", documents=documents, process=process, parent_id=body.parentId)}
