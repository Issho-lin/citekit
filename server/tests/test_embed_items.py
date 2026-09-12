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
