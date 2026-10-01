import unittest
from contextlib import nullcontext
from unittest.mock import Mock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from citekit_server.db import Base, KnowledgeBaseRow, SourceRow
from citekit_server.kb.sync import _run_site_sync
from citekit_server.kb.web import CrawledPage, content_hash

ROOT = "https://example.com/docs/"


def _status_error(code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", ROOT)
    return httpx.HTTPStatusError("boom", request=request, response=httpx.Response(code, request=request))


class WebsiteSyncTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine, expire_on_commit=False)
        self.pages: dict[str, CrawledPage | Exception] = {}
        self.ingest = Mock()
        self.crawl = Mock(return_value=iter(()))
        patches = [
            patch("citekit_server.kb.sync.SessionLocal", self.Session),
            patch("citekit_server.kb.sync.site_client", return_value=nullcontext(Mock())),
            patch("citekit_server.kb.sync.fetch_page", side_effect=self._fetch),
            patch("citekit_server.kb.sync.iter_site_pages", self.crawl),
            patch("citekit_server.kb.sync.ingest_source", self.ingest),
            patch("citekit_server.kb.sync.delete_source_points"),
            patch("citekit_server.kb.sync.delete_source_index"),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        db = self.Session()
        db.add(KnowledgeBaseRow(id="kb_1", name="站点", kind="website", website_url=ROOT, website_selector="article"))
        db.commit()
        db.close()

    def _fetch(self, url, _selector, _client):
        result = self.pages[url]
        if isinstance(result, Exception):
            raise result
        return result

    def _source(self, sid: str, url: str, text: str, process: dict | None = None) -> None:
        db = self.Session()
        db.add(SourceRow(
            id=sid, kb_id="kb_1", type="web", title=url, locator=url, status="synced",
            process=process or {}, raw_text=text, content_hash=content_hash(text),
            updated_at="2026-01-01 00:00", chunk_count=3,
        ))
        db.commit()
        db.close()

    def _get(self, sid: str) -> SourceRow | None:
        db = self.Session()
        try:
            return db.get(SourceRow, sid)
        finally:
            db.close()

    def test_unchanged_pages_are_checked_without_reingest(self):
        for index in range(3):
            url = f"{ROOT}p{index}"
            self._source(f"src_{index}", url, f"正文 {index}")
            self.pages[url] = CrawledPage(url, f"页 {index}", f"正文 {index}")
        _run_site_sync("kb_1", Mock())
        self.ingest.assert_not_called()
        self.crawl.assert_not_called()
        for index in range(3):
            row = self._get(f"src_{index}")
            self.assertEqual((row.status, row.updated_at), ("synced", "2026-01-01 00:00"))
            self.assertIsNotNone(row.last_seen_at)

    def test_changed_page_keeps_its_import_process_options(self):
        url = f"{ROOT}a"
        self._source("src_a", url, "旧正文", {"chunkSize": 300, "trainingType": "qa", "webSelector": "main"})
        self.pages[url] = CrawledPage(url, "A", "新正文")
        _run_site_sync("kb_1", Mock())
        self.ingest.assert_called_once_with("src_a")
        row = self._get("src_a")
        self.assertEqual(row.process, {"chunkSize": 300, "trainingType": "qa", "webSelector": "article"})
        self.assertEqual((row.raw_text, row.content_hash, row.status), ("新正文", content_hash("新正文"), "syncing"))

    def test_redirected_page_keeps_stored_locator(self):
        url = f"{ROOT}old"
        self._source("src_old", url, "旧")
        self.pages[url] = CrawledPage(f"{ROOT}new", "New", "新")
        _run_site_sync("kb_1", Mock())
        db = self.Session()
        self.assertEqual([row.locator for row in db.query(SourceRow).all()], [url])
        db.close()

    def test_gone_page_is_deleted_and_failed_fetch_is_marked_error(self):
        ok, gone, broken = f"{ROOT}ok", f"{ROOT}gone", f"{ROOT}broken"
        self._source("src_ok", ok, "正文")
        self._source("src_gone", gone, "正文")
        self._source("src_broken", broken, "正文")
        self.pages = {ok: CrawledPage(ok, "OK", "正文"), gone: _status_error(404), broken: _status_error(503)}
        _run_site_sync("kb_1", Mock())
        self.assertIsNone(self._get("src_gone"))
        row = self._get("src_broken")
        self.assertEqual((row.status, row.chunk_count), ("error", 3))
        self.assertIn("503", row.error_message)

    def test_all_fetches_failing_raises(self):
        url = f"{ROOT}x"
        self._source("src_x", url, "正文")
        self.pages[url] = httpx.ConnectError("down")
        with self.assertRaises(RuntimeError):
            _run_site_sync("kb_1", Mock())

    def test_first_sync_discovers_pages_from_root(self):
        self.crawl.return_value = iter([CrawledPage(f"{ROOT}a", "A", "甲"), CrawledPage(f"{ROOT}b", "B", "乙")])
        _run_site_sync("kb_1", Mock())
        self.crawl.assert_called_once()
        self.assertEqual(self.ingest.call_count, 2)


if __name__ == "__main__":
    unittest.main()
