import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

from citekit_server.connectors.feishu import _files, _tenant_token


class FeishuConnectorTest(unittest.TestCase):
    def test_file_listing_follows_page_token(self):
        responses = iter([
            {"files": [{"token": "first"}], "has_more": True, "next_page_token": "next"},
            {"files": [{"token": "second"}], "has_more": False},
        ])
        with patch("citekit_server.connectors.feishu._get", side_effect=lambda *_args, **_kwargs: next(responses)) as get:
            self.assertEqual([item["token"] for item in _files("folder", "tenant")], ["first", "second"])
        self.assertEqual(get.call_args_list[1].kwargs["page_token"], "next")

    def test_token_exchange_rejects_feishu_error(self):
        kb = Mock()
        kb.api_dataset_server = {"feishuServer": {"appId": "cli_x", "appSecret": "secret", "folderToken": "fld_x"}}
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"code": 999, "msg": "invalid app"}
        with patch("citekit_server.connectors.feishu.httpx.post", return_value=response):
            with self.assertRaises(HTTPException) as caught:
                _tenant_token(kb)
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, "invalid app")
