import unittest
from unittest.mock import Mock, patch

from citekit_server.connectors.common import ConnectorDocument, persist_documents


class ConnectorCommonTest(unittest.TestCase):
    def _db(self, existing=None):
        db = Mock()
        query = db.query.return_value
        query.filter.return_value.one_or_none.return_value = existing
        return db

    @patch("citekit_server.connectors.common.ingest_source")
    @patch("citekit_server.connectors.common.new_id", return_value="src_new")
    def test_persists_unique_nonempty_documents_and_schedules_ingest(self, _new_id, ingest):
        db, background = self._db(), Mock()
        count = persist_documents(
            db, background, kb_id="kb_1", source_type="yuque", process={"chunkSize": 500}, parent_id="dir_1",
            documents=[
                ConnectorDocument("A", " body ", "https://example.com/a"),
                ConnectorDocument("Duplicate", "body", "https://example.com/a"),
                ConnectorDocument("Empty", "  ", "https://example.com/empty"),
            ],
        )
        self.assertEqual(count, 1)
        db.add.assert_called_once()
        created = db.add.call_args.args[0]
        self.assertEqual((created.kb_id, created.parent_id, created.type, created.raw_text), ("kb_1", "dir_1", "yuque", "body"))
        db.commit.assert_called_once()
        background.add_task.assert_called_once_with(ingest, "src_new")

    @patch("citekit_server.connectors.common.ingest_source")
    def test_updates_existing_source(self, ingest):
        existing = Mock(id="src_old", title="Old")
        db, background = self._db(existing), Mock()
        count = persist_documents(
            db, background, kb_id="kb_1", source_type="feishu", process={"mode": "auto"}, parent_id=None,
            documents=[ConnectorDocument("New", "content", "https://example.com/doc")],
        )
        self.assertEqual(count, 1)
        self.assertEqual((existing.title, existing.raw_text, existing.status, existing.process), ("New", "content", "syncing", {"mode": "auto"}))
        db.add.assert_not_called()
        background.add_task.assert_called_once_with(ingest, "src_old")
