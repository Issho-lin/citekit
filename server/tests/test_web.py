import unittest

from citekit_server.kb.web import html_from, in_scope, links_from, normalize_url, page_title, scope_prefix


class HtmlFromTest(unittest.TestCase):
    def test_strips_script_and_keeps_body(self):
        html = "<html><script>x=1</script><body><h1>标题</h1><p>正文一段</p></body></html>"
        text = html_from(html)
        self.assertIn("标题", text)
        self.assertIn("正文一段", text)
        self.assertNotIn("x=1", text)

    def test_selector(self):
        html = "<div class='nav'>导航</div><article id='doc'><p>法规正文</p></article>"
        text = html_from(html, "#doc")
        self.assertIn("法规正文", text)
        self.assertNotIn("导航", text)

    def test_keeps_hyperlinks_as_markdown(self):
        html = '<p>详见<a href="/privacy">用户隐私协议</a>。</p>'
        text = html_from(html, base_url="https://docs.example.com/help")
        self.assertIn("[用户隐私协议](https://docs.example.com/privacy)", text)
        self.assertNotIn("<a", text)

    def test_heading_permalinks_stay_plain_titles(self):
        html = (
            '<h2><a href="#rules">\u200b</a>规则说明</h2>'
            "<p>正文一段说明免费额度。</p>"
            '<p>详见<a href="/privacy">用户隐私协议</a>。</p>'
        )
        text = html_from(html, base_url="https://docs.example.com/help")
        self.assertIn("## 规则说明", text)
        self.assertNotIn("](https://docs.example.com/help#rules)", text)
        self.assertNotIn("\u200b", text)
        self.assertIn("[用户隐私协议](https://docs.example.com/privacy)", text)

    def test_heading_drops_copy_button(self):
        html = "<h1>新人免费额度<button>复制页面</button></h1><p>当您首次开通平台。</p>"
        text = html_from(html)
        self.assertIn("# 新人免费额度", text)
        self.assertNotIn("复制页面", text)

    def test_selector_miss(self):
        with self.assertRaises(RuntimeError):
            html_from("<p>hi</p>", "#missing")


class CrawlScopeTest(unittest.TestCase):
    def test_normalize_drops_fragment_and_assets(self):
        self.assertEqual(
            normalize_url("https://docs.example.com/guide/#install"),
            "https://docs.example.com/guide",
        )
        self.assertIsNone(normalize_url("https://docs.example.com/a.png"))
        self.assertIsNone(normalize_url("mailto:a@b.com"))
        self.assertEqual(
            normalize_url("/api/", "https://docs.example.com/guide"),
            "https://docs.example.com/api",
        )

    def test_scope_stays_on_host_and_path_prefix(self):
        root = "https://docs.example.com/guide"
        self.assertEqual(scope_prefix(root), ("docs.example.com", "/guide/"))
        self.assertTrue(in_scope(root, "https://docs.example.com/guide"))
        self.assertTrue(in_scope(root, "https://docs.example.com/guide/install"))
        self.assertFalse(in_scope(root, "https://docs.example.com/blog/hi"))
        self.assertFalse(in_scope(root, "https://other.example.com/guide/hi"))

    def test_file_root_uses_parent_dir(self):
        root = "https://docs.example.com/guide/intro.html"
        self.assertEqual(scope_prefix(root), ("docs.example.com", "/guide/"))
        self.assertTrue(in_scope(root, "https://docs.example.com/guide/setup.html"))

    def test_links_from_keeps_same_page_links_only_after_normalize(self):
        html = """
        <a href="/guide/a">A</a>
        <a href="https://evil.example/x">X</a>
        <a href="#top">top</a>
        <a href="b.html">B</a>
        """
        urls = links_from(html, "https://docs.example.com/guide/index.html")
        self.assertIn("https://docs.example.com/guide/a", urls)
        self.assertIn("https://docs.example.com/guide/b.html", urls)
        self.assertIn("https://evil.example/x", urls)
        self.assertFalse(in_scope("https://docs.example.com/guide", "https://evil.example/x"))

    def test_page_title_falls_back(self):
        self.assertEqual(page_title("<html><title> 手册 </title></html>", "https://x/a"), "手册")
        self.assertEqual(page_title("<h1>安装</h1>", "https://x/docs/setup"), "安装")
        self.assertEqual(page_title("<p>无标题</p>", "https://x/docs/setup"), "setup")
