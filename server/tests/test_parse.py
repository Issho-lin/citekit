import tempfile
import unittest
from pathlib import Path

from citekit_server.kb.parse import parse_file
from citekit_server.kb.process import image_prompt_for, join_image_markdown, run_process
from citekit_server.schemas import ProcessConfigIn

# 1x1 PNG
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


class ParseImageTest(unittest.TestCase):
    def test_png_is_an_image_not_text(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "shot.png"
            path.write_bytes(PNG)
            parsed = parse_file(str(path), "shot.png")
        self.assertEqual(parsed.text, "")
        self.assertEqual(len(parsed.images), 1)
        self.assertEqual(parsed.images[0][:8], b"\x89PNG\r\n\x1a\n")

    def test_unknown_suffix_still_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "a.bin"
            path.write_bytes(b"not-an-image")
            with self.assertRaises(ValueError):
                parse_file(str(path), "a.bin")


class ImageProcessTest(unittest.TestCase):
    def test_image_without_vlm_stays_empty(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "shot.png"
            path.write_bytes(PNG)
            result = run_process(
                cfg=ProcessConfigIn(imageIndex=True),
                title="示意图",
                filename="shot.png",
                file_path=str(path),
            )
        self.assertEqual(result.units, [])
        self.assertTrue(any("图片理解" in note or "图片没有生成" in note for note in result.notes))


class ImagePromptTest(unittest.TestCase):
    def test_modes_are_not_one_caption(self):
        auto = image_prompt_for("auto")
        self.assertIn("Markdown", auto)
        self.assertIn("空一行", auto)
        self.assertIn("表格", auto)
        self.assertNotIn("一两句话描述", auto)
        transcribe = image_prompt_for("transcribe")
        self.assertIn("不要总结", transcribe)
        self.assertIn("Markdown", transcribe)
        self.assertIn("Markdown 表", image_prompt_for("extract"))

    def test_join_keeps_paragraphs_not_bullets(self):
        one = join_image_markdown(["## 标题\n\n第一段。\n\n第二段。"])
        self.assertEqual(one, "## 标题\n\n第一段。\n\n第二段。")
        self.assertNotIn("- ", one)
        two = join_image_markdown(["甲段", "乙段"])
        self.assertIn("## 图 1", two)
        self.assertIn("甲段", two)
        self.assertIn("## 图 2", two)
