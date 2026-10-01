import unittest
from unittest.mock import Mock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from citekit_server.db import Base, KnowledgeBaseRow, ProcessingDraftRow, SourceRow
from citekit_server.kb.ingest import ingest_draft
from citekit_server.kb.web import content_hash


def _unit(text: str) -> dict:
    return {"title": "块", "text": text, "answer": "", "indexes": [], "metadata": {}}


class IngestDraftTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine, expire_on_commit=False)
        patches = [
            patch("citekit_server.kb.ingest.SessionLocal", self.Session),
            patch("citekit_server.kb.ingest.embedding_model", return_value=Mock()),
            patch("citekit_server.kb.ingest.resolve_auth", return_value=""),
            patch("citekit_server.kb.ingest.embed_texts", side_effect=lambda _m, _a, texts: [[0.1, 0.2] for _ in texts]),
            patch("citekit_server.kb.ingest.delete_source_points"),
            patch("citekit_server.kb.ingest.upsert_points"),
            patch("citekit_server.kb.ingest.replace_source"),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def _seed(self, *, kind: str, source_type: str, raw_text: str, site: dict | None = None) -> None:
        db = self.Session()
        db.add(KnowledgeBaseRow(id="kb_1", name="KB", kind=kind))
        result = {"preview": {}, "units": [_unit("正文内容")]}
        if site:
            result["site"] = site
        db.add(ProcessingDraftRow(
            id="drf_1", kb_id="kb_1", fingerprint="f", title="页面", source_type=source_type,
            locator="https://example.com/docs/a", raw_text=raw_text, process={}, result=result,
            status="ready", created_at="2026-01-01 00:00:00", expires_at="2999-01-01 00:00:00",
        ))
        db.commit()
        db.close()

    def test_web_draft_records_content_hash_and_site_config(self):
        site = {"root": "https://example.com/docs/", "selector": "article", "linkSelector": "nav a"}
        self._seed(kind="website", source_type="web", raw_text="页面正文", site=site)
        ingest_draft("drf_1")
        db = self.Session()
        source = db.query(SourceRow).one()
        kb = db.get(KnowledgeBaseRow, "kb_1")
        self.assertEqual((source.type, source.status, source.chunk_count), ("web", "synced", 1))
        self.assertEqual(source.content_hash, content_hash("页面正文"))
        self.assertEqual((kb.website_url, kb.website_selector, kb.website_link_selector), (site["root"], "article", "nav a"))
        self.assertEqual(db.get(ProcessingDraftRow, "drf_1").status, "committed")

    def test_non_web_draft_leaves_site_config_and_hash_untouched(self):
        self._seed(kind="feishu", source_type="feishu", raw_text="文档正文")
        ingest_draft("drf_1")
        db = self.Session()
        source = db.query(SourceRow).one()
        kb = db.get(KnowledgeBaseRow, "kb_1")
        self.assertEqual(source.type, "feishu")
        self.assertIsNone(source.content_hash)
        self.assertIsNone(kb.website_url)


if __name__ == "__main__":
    unittest.main()
