from __future__ import annotations

from citekit_server.db import KnowledgeBaseRow, SessionLocal, SourceRow
from citekit_server.ids import new_id
from citekit_server.kb.ingest import ingest_source, now_stamp
from citekit_server.kb.web import MAX_DEPTH, MAX_PAGES, iter_site_pages, normalize_url
from citekit_server.schemas import ProcessConfigIn


def run_website_sync(kb_id: str) -> None:
    found = 0
    try:
        db = SessionLocal()
        try:
            kb = db.get(KnowledgeBaseRow, kb_id)
            if not kb or not (kb.website_url or "").strip():
                _fail_open_sync(kb_id, "知识库未配置网站地址")
                return
            root = normalize_url(kb.website_url or "")
            if not root:
                _fail_open_sync(kb_id, "网页链接无效")
                return
            selector = (kb.website_selector or "").strip()
            process = ProcessConfigIn(webSelector=selector).model_dump()
        finally:
            db.close()

        for page in iter_site_pages(root, selector=selector, max_pages=MAX_PAGES, max_depth=MAX_DEPTH):
            source_id = _upsert_page(kb_id, page.url, page.title, page.text, process)
            ingest_source(source_id)
            found += 1
        if found == 0:
            _fail_open_sync(kb_id, "没有抓到可入库的静态页面")
    except Exception as exc:
        _fail_open_sync(kb_id, str(exc) or "站点同步中断")


def _upsert_page(kb_id: str, url: str, title: str, text: str, process: dict) -> str:
    db = SessionLocal()
    try:
        row = (
            db.query(SourceRow)
            .filter(SourceRow.kb_id == kb_id, SourceRow.type == "web", SourceRow.locator == url)
            .one_or_none()
        )
        if row is None:
            row = SourceRow(
                id=new_id("src"),
                kb_id=kb_id,
                type="web",
                title=title or url,
                locator=url,
                acl="internal",
                status="syncing",
                process=process,
                raw_text=text,
                updated_at=now_stamp(),
                chunk_count=0,
            )
            db.add(row)
        else:
            row.title = title or row.title
            row.raw_text = text
            row.process = process
            row.status = "syncing"
            row.error_message = None
            row.updated_at = now_stamp()
        db.commit()
        return row.id
    finally:
        db.close()


def _fail_open_sync(kb_id: str, message: str) -> None:
    db = SessionLocal()
    try:
        rows = (
            db.query(SourceRow)
            .filter(
                SourceRow.kb_id == kb_id,
                SourceRow.type == "web",
                SourceRow.status == "syncing",
                SourceRow.chunk_count == 0,
            )
            .all()
        )
        for row in rows:
            row.status = "error"
            row.error_message = message
            row.updated_at = now_stamp()
        db.commit()
    finally:
        db.close()
