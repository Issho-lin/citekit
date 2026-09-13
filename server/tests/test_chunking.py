import unittest

from citekit_server.kb.chunking import (
    child_indexes,
    chunk_title,
    describe_process,
    index_text,
    split_parents,
)
from citekit_server.schemas import ProcessConfigIn


def _article(n: str, body: str) -> str:
    return f"第{n}条 {body}"


class SplitParentsTest(unittest.TestCase):
    def test_heading_sections_are_not_packed(self):
        rights = "业主在物业管理活动中，享有下列权利：" + "甲" * 600
        duties = "业主在物业管理活动中，履行下列义务：" + "乙" * 600
        text = "\n".join(
            [
                "## 第二章 业主及业主大会",
                _article("六", rights),
                _article("七", duties),
            ]
        )
        cfg = ProcessConfigIn(chunkSize=1000, chunkOverlap=0)
        parts = split_parents(text, cfg)
        self.assertGreaterEqual(len(parts), 2)
        joined_early = "\n".join(parts[:1])
        self.assertNotIn("履行下列义务", joined_early)
        self.assertTrue(any("履行下列义务" in part for part in parts))
        self.assertTrue(any("享有下列权利" in part for part in parts))
        self.assertLess(len(rights), 1000)
        self.assertLess(len(duties), 1000)
        self.assertGreater(len(rights) + len(duties), 1000)

    def test_plain_paragraphs_still_pack(self):
        paras = [f"这是第{i}段说明文字，用来拼进同一父块。" for i in range(12)]
        text = "\n\n".join(paras)
        cfg = ProcessConfigIn(chunkSize=200, chunkOverlap=0)
        parts = split_parents(text, cfg)
        self.assertLess(len(parts), len(paras))
        self.assertTrue(all(len(part) <= 200 or part == parts[-1] for part in parts[:-1]))

    def test_size_mode_overlap(self):
        text = "甲" * 1500
        cfg = ProcessConfigIn(
            chunkSettingMode="custom",
            chunkSplitMode="size",
            chunkSize=1000,
            chunkOverlap=200,
            chunkTriggerType="forceChunk",
        )
        parts = split_parents(text, cfg)
        self.assertGreaterEqual(len(parts), 2)
        self.assertEqual(parts[0][-200:], parts[1][:200])

    def test_size_mode_still_windows(self):
        text = "甲" * 2500
        cfg = ProcessConfigIn(chunkSettingMode="custom", chunkSplitMode="size", chunkSize=1000)
        parts = split_parents(text, cfg)
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(len(part) <= 1000 for part in parts[:-1]))

    def test_delimiter_keeps_sections_separate(self):
        left = "左段内容" + "甲" * 600
        right = "右段内容" + "乙" * 600
        text = f"{left}====={right}"
        cfg = ProcessConfigIn(
            chunkSettingMode="custom",
            chunkSplitMode="char",
            chunkSplitter="=====",
            chunkSize=1000,
        )
        parts = split_parents(text, cfg)
        self.assertEqual(len(parts), 2)
        self.assertIn("左段内容", parts[0])
        self.assertNotIn("右段内容", parts[0])
        self.assertIn("右段内容", parts[1])

    def test_oversized_heading_section_splits(self):
        body = "这是一句完整的说明。" * 80
        text = f"第一条 {body}"
        cfg = ProcessConfigIn(chunkSize=400, chunkOverlap=0)
        parts = split_parents(text, cfg)
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(len(part) <= 400 for part in parts[:-1]))

    def test_article_title_not_chapter_heading(self):
        part = "\n".join(
            [
                "## 第二章　业主及业主大会",
                "第六条　房屋的所有权人为业主。",
                "业主在物业管理活动中，享有下列权利：",
            ]
        )
        self.assertTrue(chunk_title(part).startswith("第六条"))

    def test_markdown_permalink_title_is_plain(self):
        part = "## [\u200b](https://docs.example.com/guide#rules)规则说明\n正文若干字。"
        self.assertEqual(chunk_title(part), "规则说明")


class ChildIndexTest(unittest.TestCase):
    def test_off_by_default(self):
        parent = "这是一句完整的说明。" * 80
        self.assertEqual(child_indexes(parent, ProcessConfigIn()), [])

    def test_auto_ignores_switch(self):
        parent = "这是一句完整的说明。" * 80
        cfg = ProcessConfigIn(useChildIndex=True, indexSize=128, chunkSize=1000)
        self.assertEqual(child_indexes(parent, cfg), [])

    def test_on_for_custom_mode(self):
        parent = "这是一句完整的说明。" * 80
        cfg = ProcessConfigIn(
            chunkSettingMode="custom",
            useChildIndex=True,
            indexSize=128,
            chunkSize=1000,
        )
        kids = child_indexes(parent, cfg)
        self.assertGreater(len(kids), 1)
        self.assertTrue(all(len(k) <= 128 for k in kids))

    def test_custom_can_turn_off(self):
        parent = "这是一句完整的说明。" * 80
        cfg = ProcessConfigIn(
            chunkSettingMode="custom",
            useChildIndex=False,
            indexSize=128,
            chunkSize=1000,
        )
        self.assertEqual(child_indexes(parent, cfg), [])

    def test_legacy_custom_infers_on(self):
        cfg = ProcessConfigIn.model_validate({"chunkSettingMode": "custom", "indexSize": 128})
        self.assertTrue(cfg.useChildIndex)
        self.assertIn("子块索引", describe_process(cfg))

    def test_legacy_auto_stays_off(self):
        cfg = ProcessConfigIn.model_validate({"chunkSettingMode": "auto"})
        self.assertFalse(cfg.useChildIndex)

    def test_child_split_uses_unwrapped_length(self):
        sentence = "这是一句完整的说明。[详见](https://example.com/very/long/path)。"
        parent = sentence * 40
        cfg = ProcessConfigIn(
            chunkSettingMode="custom",
            useChildIndex=True,
            indexSize=128,
            chunkSize=1000,
        )
        kids = child_indexes(parent, cfg)
        self.assertGreater(len(kids), 1)
        joined = "".join(kids)
        self.assertNotIn("http", joined)
        self.assertIn("详见", joined)


class IndexTextTest(unittest.TestCase):
    def test_unwraps_links_and_images_keeps_markdown(self):
        raw = "## 标题\n看[文档](https://example.com/a)和![图](https://cdn.example/x.png)。\n- 列表项 **加粗**"
        out = index_text(raw)
        self.assertEqual(
            out,
            "## 标题\n看文档和图。\n- 列表项 **加粗**",
        )
        self.assertNotIn("http", out)

    def test_drops_url_labels_and_bare_urls(self):
        raw = "见[https://example.com/a](https://example.com/a)与 https://example.com/b 和 <https://example.com/c>。"
        out = index_text(raw)
        self.assertNotIn("http", out)
        self.assertNotIn("example.com", out)
        self.assertIn("见", out)


if __name__ == "__main__":
    unittest.main()
