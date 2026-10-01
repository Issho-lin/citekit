import unittest

from citekit_server.kb.chunking import (
    block_indexes,
    child_indexes,
    chunk_title,
    describe_process,
    index_text,
    markdown_blocks,
    split_markdown_parents,
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


def _table(rows: int, width: int = 6) -> str:
    lines = ["| 名称 | 数值 | 备注 |", "| --- | :---: | --- |"]
    lines += [f"| 项{i} | {i * 10} | {'说明' * width} |" for i in range(rows)]
    return "\n".join(lines)


class MarkdownTableChunkingTest(unittest.TestCase):
    def test_table_is_detected_only_with_matching_delimiter_row(self):
        blocks = markdown_blocks(f"说明\n\n{_table(2)}\n\n结尾")
        self.assertEqual([block.kind for block in blocks], ["paragraph", "table", "paragraph"])
        self.assertEqual(blocks[1].metadata, {"columns": 3, "rows": 2})
        mismatched = markdown_blocks("| a | b |\n| --- |\n| 1 | 2 |")
        self.assertNotIn("table", [block.kind for block in mismatched])
        fenced = markdown_blocks(f"```\n{_table(2)}\n```")
        self.assertEqual([block.kind for block in fenced], ["code"])

    def test_small_table_stays_whole_with_its_heading(self):
        table = _table(3)
        cfg = ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=400)
        parts = split_markdown_parents(f"# 配置\n\n{table}", cfg)
        self.assertEqual(parts, [f"# 配置\n\n{table}"])

    def test_oversized_table_splits_between_rows_and_repeats_header(self):
        table = _table(30)
        cfg = ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=200)
        parts = split_markdown_parents(f"前言段落。\n\n## 参数表\n\n{table}\n\n结尾段落。", cfg)
        table_parts = [part for part in parts if "| --- | :---: | --- |" in part]
        self.assertGreater(len(table_parts), 1)
        for part in table_parts:
            self.assertIn("## 参数表\n\n| 名称 | 数值 | 备注 |\n| --- | :---: | --- |", part)
            self.assertLessEqual(len(part), cfg.chunkSize)
        rows = [line for part in table_parts for line in part.splitlines() if line.startswith("| 项")]
        self.assertEqual(rows, table.splitlines()[2:])

    def test_heading_is_carried_to_the_table_instead_of_dangling(self):
        table = _table(12, width=8)
        cfg = ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=300)
        parts = split_markdown_parents(f"# 手册\n\n下表列出参数。\n\n## 参数表\n\n{table}\n\n结尾。", cfg)
        self.assertEqual(parts[0], "# 手册\n\n下表列出参数。")
        self.assertTrue(all(not part.endswith("## 参数表") for part in parts))
        self.assertEqual(sum(part.startswith("## 参数表\n\n| 名称") for part in parts), len(parts) - 1)

    def test_heading_before_code_leads_the_atomic_chunk(self):
        code = "```bash\n" + "echo hi\n" * 20 + "```"
        cfg = ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=60)
        parts = split_markdown_parents(f"前文说明。\n\n## 安装\n\n{code}", cfg)
        self.assertEqual(parts, ["前文说明。", f"## 安装\n\n{code}"])

    def test_trailing_heading_at_document_end_is_kept(self):
        cfg = ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=1000)
        parts = split_markdown_parents(f"{_table(2)}\n\n## 附录", cfg)
        self.assertTrue(parts[-1].endswith("## 附录"))

    def test_single_oversized_row_is_never_cut(self):
        long_row = "| 长 | 1 | " + "很长的内容" * 60 + " |"
        table = "| 名称 | 数值 | 备注 |\n| --- | --- | --- |\n| 短 | 0 | 正常 |\n" + long_row
        cfg = ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=100)
        parts = split_markdown_parents(table, cfg)
        self.assertEqual(sum(long_row in part for part in parts), 1)
        self.assertTrue(all(part.startswith("| 名称 | 数值 | 备注 |") for part in parts))

    def test_plain_text_with_gfm_table_takes_markdown_path(self):
        table = _table(30)
        cfg = ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=200)
        parts = split_parents(f"概述\n\n{table}", cfg)
        rows = [line for part in parts for line in part.splitlines() if line.startswith("| 项")]
        self.assertEqual(rows, table.splitlines()[2:])

    def test_pipe_text_without_delimiter_is_not_a_table(self):
        self.assertEqual([block.kind for block in markdown_blocks("a | b\nc | d")], ["paragraph"])

    def test_row_indexes_pair_cells_with_headers_when_child_index_enabled(self):
        part = "## 价格\n\n| 版本 | 价格 | 说明 |\n| --- | --- | --- |\n| 基础版 | 0 |  |\n| 专业版 | 99 | 含 a\\|b |"
        enabled = ProcessConfigIn(chunkSettingMode="custom", useChildIndex=True, chunkSize=1000, indexSize=200)
        children, rows = block_indexes(part, enabled)
        self.assertEqual(rows, ["版本: 基础版；价格: 0", "版本: 专业版；价格: 99；说明: 含 a|b"])
        self.assertEqual(children, [])
        self.assertEqual(block_indexes(part, ProcessConfigIn()), ([], []))

    def test_table_chunk_title_uses_header_cells(self):
        self.assertEqual(chunk_title(_table(1), "fallback"), "名称 / 数值 / 备注")


class MarkdownBlockChunkingTest(unittest.TestCase):
    def test_code_fence_keeps_hash_and_whitespace_atomic(self):
        text = """# 使用方式

说明文字。

```python
    # 这是 Python 注释，不是 Markdown 标题
def run():
    return "# literal"
```

## 后续

后续说明。"""
        cfg = ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=30)
        parts = split_markdown_parents(text, cfg)
        code = next(part for part in parts if part.startswith("```python"))
        self.assertEqual(code, """```python
    # 这是 Python 注释，不是 Markdown 标题
def run():
    return "# literal"
```""")
        self.assertEqual(sum("这是 Python 注释" in part for part in parts), 1)
        self.assertTrue(any(part.startswith("## 后续") for part in parts))

    def test_mermaid_is_atomic_when_oversized(self):
        diagram = "```mermaid\ngraph TD\n" + "A-->B\n" * 80 + "```"
        cfg = ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=64)
        parts = split_markdown_parents(f"# 流程\n\n{diagram}\n\n说明。", cfg)
        self.assertEqual(parts, [f"# 流程\n\n{diagram}", "说明。"])
        self.assertGreater(len(diagram), cfg.chunkSize)

    def test_unclosed_fence_consumes_remaining_headings(self):
        text = """# 标题

```sql
-- 注释
SELECT 1;
## 这不是标题
"""
        blocks = markdown_blocks(text)
        self.assertEqual([block.kind for block in blocks], ["heading", "code"])
        self.assertTrue(blocks[-1].metadata["unclosed_fence"])
        parts = split_parents(text, ProcessConfigIn(chunkTriggerType="forceChunk", chunkSize=20))
        self.assertEqual(parts, [text.strip()])

    def test_tilde_fence_requires_matching_closer(self):
        text = """~~~~yaml
# not a heading
~~~
still code
~~~~
# actual heading
正文。"""
        blocks = markdown_blocks(text)
        self.assertEqual([block.kind for block in blocks], ["code", "heading", "paragraph"])
        self.assertIn("~~~", blocks[0].text)



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
