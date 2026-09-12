import unittest

from citekit_server.kb.web import html_from


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

    def test_selector_miss(self):
        with self.assertRaises(RuntimeError):
            html_from("<p>hi</p>", "#missing")
