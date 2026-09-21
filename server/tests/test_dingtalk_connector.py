import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from citekit_server.connectors.dingtalk import _access_token, _config, _document_content, _document_text, _operator_union_id, _pages


class DingtalkConnectorTest(unittest.TestCase):
    def test_config_requires_app_and_operator(self):
        kb = Mock()
        kb.api_dataset_server = {"dingtalkServer": {"appKey": "", "appSecret": "", "userId": ""}}
        with self.assertRaises(HTTPException) as caught:
            _config(kb)
        self.assertEqual(caught.exception.status_code, 400)

    def test_access_token_reads_new_api_response(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"accessToken": "token"}
        with patch("citekit_server.connectors.dingtalk.httpx.post", return_value=response):
            self.assertEqual(_access_token("key", "secret"), "token")

    def test_document_text_preserves_heading_levels(self):
        with patch("citekit_server.connectors.dingtalk._get", return_value={"result": {"data": [
            {"blockType": "heading1", "heading1": {"text": "一级标题"}},
            {"blockType": "heading_2", "heading_2": {"text": "二级标题"}},
            {"blockType": "paragraph", "paragraph": {"text": "正文"}},
        ]}}):
            self.assertEqual(_document_text("node", "operator", "token"), "# 一级标题\n\n## 二级标题\n\n正文")


    def test_operator_union_id_resolves_configured_user_id(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"errcode": 0, "result": {"unionid": "union_123"}}
        with patch("citekit_server.connectors.dingtalk.httpx.post", return_value=response) as post:
            self.assertEqual(_operator_union_id("user_123", "token"), "union_123")
        self.assertEqual(post.call_args.kwargs["json"]["userid"], "user_123")


    def test_first_page_omits_empty_next_token(self):
        with patch("citekit_server.connectors.dingtalk._get", return_value={"workspaces": []}) as get:
            self.assertEqual(list(_pages("/v2.0/wiki/workspaces", "token", "workspaces", max_results=30, operatorId="union")), [])
        self.assertNotIn("nextToken", get.call_args.kwargs)
        self.assertEqual(get.call_args.kwargs["maxResults"], "30")


    def test_document_content_keeps_node_title(self):
        with patch("citekit_server.connectors.dingtalk._node", return_value={"name": "产品说明", "url": "https://example.com/doc"}), patch("citekit_server.connectors.dingtalk._document_text", return_value="正文"):
            self.assertEqual(_document_content("node", "operator", "token"), ("产品说明", "正文", "https://example.com/doc"))
