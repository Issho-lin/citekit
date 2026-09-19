from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta
import secrets
import threading
from typing import Iterator

from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError

from citekit_server.config import settings
from citekit_server.db import ChunkRow, KnowledgeBaseRow, SessionLocal, SourceRow, WebsiteSyncLockRow
from citekit_server.ids import new_id
from citekit_server.infra.search_index import delete_source as delete_source_index
from citekit_server.infra.vectors import delete_source_points
from citekit_server.kb.ingest import ingest_source, now_stamp
from citekit_server.kb.web import MAX_DEPTH, MAX_PAGES, content_hash, http_status, iter_site_pages, normalize_url
from citekit_server.schemas import ProcessConfigIn


class WebsiteSyncBusy(RuntimeError):
    pass


class WebsiteSyncLease:
    def __init__(self, kb_id: str, token: str) -> None:
        self.kb_id, self.token = kb_id, token

    @classmethod
    def acquire(cls, kb_id: str) -> "WebsiteSyncLease | None":
        token = secrets.token_urlsafe(32)
        now = datetime.now()
        until = now + timedelta(seconds=settings.website_sync_lease_seconds)
        db = SessionLocal()
        try:
            db.add(WebsiteSyncLockRow(kb_id=kb_id, owner_token=token, locked_until=until))
            db.commit()
            return cls(kb_id, token)
        except IntegrityError:
            db.rollback()
            claimed = db.execute(
                update(WebsiteSyncLockRow)
                .where(WebsiteSyncLockRow.kb_id == kb_id, WebsiteSyncLockRow.locked_until <= now)
                .values(owner_token=token, locked_until=until)
            ).rowcount
            db.commit()
            return cls(kb_id, token) if claimed else None
        finally:
            db.close()

    def renew(self) -> bool:
        db = SessionLocal()
        try:
            updated = db.execute(
                update(WebsiteSyncLockRow)
                .where(WebsiteSyncLockRow.kb_id == self.kb_id, WebsiteSyncLockRow.owner_token == self.token, WebsiteSyncLockRow.locked_until > datetime.now())
                .values(locked_until=datetime.now() + timedelta(seconds=settings.website_sync_lease_seconds))
            ).rowcount
            db.commit()
            return bool(updated)
        finally:
            db.close()

    def release(self) -> None:
        db = SessionLocal()
        try:
            db.execute(delete(WebsiteSyncLockRow).where(WebsiteSyncLockRow.kb_id == self.kb_id, WebsiteSyncLockRow.owner_token == self.token))
            db.commit()
        finally:
            db.close()


@contextmanager
def website_sync_lease(kb_id: str) -> Iterator[WebsiteSyncLease]:
    lease = WebsiteSyncLease.acquire(kb_id)
    if not lease:
        raise WebsiteSyncBusy("该知识库正在同步")
    stop = threading.Event()
    worker = threading.Thread(target=lambda: _heartbeat(lease, stop), daemon=True)
    worker.start()
    try:
        yield lease
    finally:
        stop.set()
        worker.join(timeout=1)
        lease.release()


def _heartbeat(lease: WebsiteSyncLease, stop: threading.Event) -> None:
    interval = max(1, settings.website_sync_lease_seconds // 3)
    while not stop.wait(interval):
        if not lease.renew():
            return


def run_website_sync(kb_id: str) -> None:
    try:
        with website_sync_lease(kb_id) as lease:
            _run_site_sync(kb_id, lease)
    except WebsiteSyncBusy:
        return
    except Exception as exc:
        _fail_open_sync(kb_id, str(exc) or "站点同步中断")


def _run_site_sync(kb_id: str, lease: WebsiteSyncLease) -> None:
    db = SessionLocal()
    try:
        kb = db.get(KnowledgeBaseRow, kb_id)
        if not kb or not (kb.website_url or "").strip():
            raise RuntimeError("知识库未配置同步入口")
        root = normalize_url(kb.website_url or "")
        if not root:
            raise RuntimeError("网页链接无效")
        selector = (kb.website_selector or "").strip()
        link_selector = (kb.website_link_selector or "").strip()
        process = ProcessConfigIn(webSelector=selector).model_dump()
        known = {row.locator: row.id for row in db.query(SourceRow).filter(SourceRow.kb_id == kb_id, SourceRow.type == "web").all()}
    finally:
        db.close()
    # A configured website may be a curated subset of a larger crawl.  Subsequent
    # syncs must only refresh that explicit selection, not silently expand it.
    selected = set(known)
    seen: set[str] = set()
    for page in iter_site_pages(root, selector, link_selector, MAX_PAGES, MAX_DEPTH):
        if selected and page.url not in selected:
            continue
        lease.renew()
        seen.add(page.url)
        source_id, changed = _upsert_page(kb_id, page.url, page.title, page.text, content_hash(page.text), page.etag, page.last_modified, process)
        if changed:
            ingest_source(source_id)
    for url, source_id in known.items():
        if url not in seen and http_status(url) in (404, 410):
            _delete_web_source(kb_id, source_id)
    if not seen:
        raise RuntimeError("没有抓到可入库的静态页面")


def _upsert_page(kb_id: str, url: str, title: str, text: str, digest: str, etag: str, last_modified: str, process: dict) -> tuple[str, bool]:
    db = SessionLocal()
    try:
        row = db.query(SourceRow).filter(SourceRow.kb_id == kb_id, SourceRow.type == "web", SourceRow.locator == url).one_or_none()
        changed, stamp = row is None or row.content_hash != digest or row.status != "synced", now_stamp()
        if row is None:
            row = SourceRow(id=new_id("src"), kb_id=kb_id, type="web", title=title or url, locator=url, acl="internal", status="syncing", process=process, raw_text=text, content_hash=digest, last_seen_at=stamp, etag=etag or None, last_modified=last_modified or None, updated_at=stamp, chunk_count=0)
            db.add(row)
        else:
            row.title, row.last_seen_at, row.etag, row.last_modified = title or row.title, stamp, etag or None, last_modified or None
            if changed:
                row.raw_text, row.process, row.content_hash, row.status, row.error_message, row.updated_at = text, process, digest, "syncing", None, stamp
        db.commit()
        return row.id, changed
    finally:
        db.close()


def _delete_web_source(kb_id: str, source_id: str) -> None:
    db = SessionLocal()
    try:
        row = db.get(SourceRow, source_id)
        if not row or row.kb_id != kb_id or row.type != "web":
            return
        db.query(ChunkRow).filter(ChunkRow.source_id == source_id).delete()
        db.delete(row)
        db.commit()
    finally:
        db.close()
    delete_source_points(kb_id, source_id)
    delete_source_index(kb_id, source_id)


def _fail_open_sync(kb_id: str, message: str) -> None:
    db = SessionLocal()
    try:
        rows = db.query(SourceRow).filter(SourceRow.kb_id == kb_id, SourceRow.type == "web", SourceRow.status == "syncing", SourceRow.chunk_count == 0).all()
        for row in rows:
            row.status, row.error_message, row.updated_at = "error", message, now_stamp()
        db.commit()
    finally:
        db.close()
