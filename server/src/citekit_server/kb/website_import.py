from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from citekit_server.db import KnowledgeBaseRow, SourceRow, get_db
from citekit_server.ids import new_id
from citekit_server.kb.ingest import ingest_source, now_stamp
from citekit_server.kb.web import MAX_DEPTH, MAX_PAGES, content_hash, iter_site_pages, normalize_url
from citekit_server.schemas import ProcessConfigIn

router = APIRouter(prefix="/api/kbs/{kb_id}/website", tags=["website"])


class WebsiteDiscoverIn(BaseModel):
    url: str
    selector: str = ""
    linkSelector: str = ""


class WebsitePageOut(BaseModel):
    url: str
    title: str
    chars: int


class WebsiteImportIn(WebsiteDiscoverIn):
    urls: list[str] = Field(min_length=1, max_length=MAX_PAGES)
    process: ProcessConfigIn | None = None


@router.post("/discover", response_model=list[WebsitePageOut])
def discover(kb_id: str, body: WebsiteDiscoverIn, db: Session = Depends(get_db)) -> list[WebsitePageOut]:
    kb = db.get(KnowledgeBaseRow, kb_id)
    if not kb or kb.kind != "website":
        raise HTTPException(404, "网站知识库不存在")
    root = normalize_url(body.url)
    if not root:
        raise HTTPException(400, "请填写有效的网站地址")
    return [WebsitePageOut(url=page.url, title=page.title, chars=len(page.text)) for page in iter_site_pages(root, body.selector.strip(), body.linkSelector.strip(), MAX_PAGES, MAX_DEPTH)]


@router.post("/import")
def import_pages(kb_id: str, body: WebsiteImportIn, background: BackgroundTasks, db: Session = Depends(get_db)) -> dict[str, int]:
    kb = db.get(KnowledgeBaseRow, kb_id)
    if not kb or kb.kind != "website":
        raise HTTPException(404, "网站知识库不存在")
    root = normalize_url(body.url)
    if not root:
        raise HTTPException(400, "请填写有效的网站地址")
    wanted = {normalize_url(url) for url in body.urls}
    wanted.discard(None)
    pages = {page.url: page for page in iter_site_pages(root, body.selector.strip(), body.linkSelector.strip(), MAX_PAGES, MAX_DEPTH) if page.url in wanted}
    if not pages:
        raise HTTPException(400, "未找到选中的网页，请重新发现页面")
    kb.website_url, kb.website_selector, kb.website_link_selector = root, body.selector.strip(), body.linkSelector.strip()
    process = (body.process or ProcessConfigIn(webSelector=body.selector.strip())).model_dump()
    ids: list[str] = []
    for url, page in pages.items():
        row = db.query(SourceRow).filter(SourceRow.kb_id == kb_id, SourceRow.type == "web", SourceRow.locator == url).one_or_none()
        if not row:
            row = SourceRow(id=new_id("src"), kb_id=kb_id, type="web", title=page.title or url, locator=url, acl="internal", status="syncing", process=process, raw_text=page.text, content_hash=content_hash(page.text), updated_at=now_stamp(), chunk_count=0)
            db.add(row)
        else:
            row.title, row.raw_text, row.process, row.content_hash, row.status, row.error_message, row.updated_at = page.title or row.title, page.text, process, content_hash(page.text), "syncing", None, now_stamp()
        ids.append(row.id)
    db.commit()
    for source_id in ids:
        background.add_task(ingest_source, source_id)
    return {"imported": len(ids)}
