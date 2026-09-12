import unittest

from citekit_server.eval.logic import expect_hit, retrieve_label, retrieve_of, retrieve_snapshot
from citekit_server.schemas import SearchConfigIn


class ExpectHitTest(unittest.TestCase):
    def test_title_and_locator(self):
        self.assertTrue(expect_hit("第七条", "第七条　义务", "file #8", "履行下列义务"))
        self.assertTrue(expect_hit("file #8", "第七条", "file #8", "义务"))
        self.assertFalse(expect_hit("第七条", "第八条", "file #9", "业主大会"))

    def test_short_article_not_body(self):
        self.assertFalse(expect_hit("第六条", "## 第二章", "file #7", "第六条　房屋的所有权人为业主"))
        self.assertTrue(expect_hit("第六条", "第六条　业主", "file #7", "其它条文也会写到第六条"))

    def test_long_phrase_in_body(self):
        self.assertTrue(
            expect_hit(
                "房屋的所有权人为业主",
                "## 第二章",
                "file #7",
                "第六条　房屋的所有权人为业主。",
            )
        )


class RetrieveSnapshotTest(unittest.TestCase):
    def test_roundtrip_and_label(self):
        snap = retrieve_snapshot(SearchConfigIn(searchMode="mix", similarity=0.2, limit=5, usingRerank=True))
        parsed = retrieve_of(snap)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.limit, 5)
        self.assertTrue(parsed.usingRerank)
        self.assertEqual(retrieve_label(parsed), "混合检索 · top-k 5 · 重排")
        self.assertIsNone(retrieve_of(None))
        self.assertEqual(retrieve_label(None), "")


class McpExpectTest(unittest.TestCase):
    def test_locator_line(self):
        from citekit_server.eval.logic import _expect_from_mcp_response

        body = {
            "result": {
                "content": [
                    {"type": "text", "text": "1. 第七条（0.80 · mix）\n业主应当履行义务\n定位：file_abc #8\n"}
                ]
            }
        }
        self.assertEqual(_expect_from_mcp_response(body), "file_abc #8")
        self.assertEqual(_expect_from_mcp_response({}), "")
