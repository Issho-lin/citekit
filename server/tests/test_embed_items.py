import unittest

from citekit_server.kb.chunking import Unit
from citekit_server.kb.process import embed_items


class EmbedItemsTest(unittest.TestCase):
    def test_heading_gets_its_own_vector(self):
        unit = Unit(title="第六条　业主的权利", text="第六条　业主的权利\n" + "后续列举项。" * 40)
        items = embed_items(unit, "", False)
        kinds = [kind for kind, _ in items]
        self.assertIn("title", kinds)
        self.assertIn("default", kinds)
        heading = next(text for kind, text in items if kind == "title")
        self.assertEqual(heading, "第六条　业主的权利")
        body = next(text for kind, text in items if kind == "default")
        self.assertGreater(len(body), len(heading))

    def test_one_sentence_chunk_not_duplicated(self):
        unit = Unit(title="只有一句的段落。", text="只有一句的段落。")
        kinds = [kind for kind, _ in embed_items(unit, "", False)]
        self.assertEqual(kinds, ["default"])

    def test_plain_paragraph_has_no_title_vector(self):
        lead = "昨日市政府召开防汛会议并部署相关工作"
        unit = Unit(title=lead, text=lead + "。各区县已完成隐患排查。" + "后续报道。" * 20)
        kinds = [kind for kind, _ in embed_items(unit, "", False)]
        self.assertNotIn("title", kinds)
        self.assertIn("default", kinds)

    def test_heading_vector_can_be_disabled(self):
        unit = Unit(title="第六条　业主的权利", text="第六条　业主的权利\n" + "后续列举项。" * 40)
        kinds = [kind for kind, _ in embed_items(unit, "", False, False)]
        self.assertNotIn("title", kinds)
        self.assertIn("default", kinds)

    def test_document_title_prefixes_vectors(self):
        unit = Unit(title="只有一句的段落。", text="只有一句的段落。")
        _, text = embed_items(unit, "防汛工作通报", True)[0]
        self.assertTrue(text.startswith("防汛工作通报\n"))

    def test_permalink_heading_indexes_plain_title(self):
        unit = Unit(
            title="规则说明",
            text="## 规则说明\n" + "后续说明文字。" * 40,
        )
        heading = next(text for kind, text in embed_items(unit, "", False) if kind == "title")
        self.assertEqual(heading, "规则说明")
        self.assertNotIn("http", heading)

    def test_vector_unwraps_links_keeps_headings(self):
        raw = "## 计费\n详见[价格](https://docs.example.com/pricing)与![表](https://cdn.example/t.png)。"
        unit = Unit(title="", text=raw)
        kinds = [kind for kind, _ in embed_items(unit, "", False)]
        self.assertEqual(kinds, ["default"])
        body = next(text for kind, text in embed_items(unit, "", False) if kind == "default")
        self.assertIn("## 计费", body)
        self.assertIn("价格", body)
        self.assertIn("表", body)
        self.assertNotIn("http", body)
        self.assertEqual(unit.text, raw)

    def test_vector_drops_url_shaped_labels(self):
        raw = "见[https://docs.example.com/a](https://docs.example.com/a) 与 https://docs.example.com/b。"
        unit = Unit(title="", text=raw)
        body = next(text for kind, text in embed_items(unit, "", False) if kind == "default")
        self.assertNotIn("http", body)
        self.assertNotIn("example.com", body)
        self.assertEqual(unit.text, raw)
