import unittest

from citekit_server.eval.logic import expect_hit, retrieve_label, retrieve_of, retrieve_snapshot
from citekit_server.schemas import SearchConfigIn


class ExpectHitTest(unittest.TestCase):
    def test_title_and_body(self):
        self.assertTrue(expect_hit("第七条", "第七条　义务", "file #8", "履行下列义务"))
        self.assertTrue(expect_hit("第六条", "## 第二章", "file #7", "第六条　房屋的所有权人为业主"))
        self.assertFalse(expect_hit("第七条", "第八条", "file #9", "业主大会"))
        self.assertTrue(expect_hit("file #8", "第七条", "file #8", "义务"))


class RetrieveSnapshotTest(unittest.TestCase):
    def test_roundtrip_and_label(self):
        snap = retrieve_snapshot(SearchConfigIn(searchMode="mix", similarity=0.2, limit=5, usingRerank=True))
        parsed = retrieve_of(snap)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.limit, 5)
        self.assertTrue(parsed.usingRerank)
        self.assertEqual(retrieve_label(parsed), "混合检索 · 召回 5 条 · 重排")
        self.assertIsNone(retrieve_of(None))
        self.assertEqual(retrieve_label(None), "")
