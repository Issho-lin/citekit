import unittest
from unittest.mock import Mock, patch

import httpx
from fastapi import HTTPException

from citekit_server.connectors.yuque import _config, _get


class YuqueConnectorTest(unittest.TestCase):
    def test_config_requires_user_and_token(self):
        kb = Mock()
        kb.api_dataset_server = {"yuqueServer": {"userId": "", "token": ""}}
        with self.assertRaises(HTTPException) as caught:
            _config(kb)
        self.assertEqual(caught.exception.status_code, 400)

    def test_get_follows_yuque_redirects(self):
        response = Mock()
        response.status_code = 200
        response.is_error = False
        response.json.return_value = {"data": []}
        with patch("citekit_server.connectors.yuque.httpx.get", return_value=response) as get:
            self.assertEqual(_get("/users/me/repos", "token"), [])
        self.assertTrue(get.call_args.kwargs["follow_redirects"])

    def test_proxy_error_includes_actionable_network_detail(self):
        with patch("citekit_server.connectors.yuque.httpx.get", side_effect=httpx.ProxyError("403 Forbidden")):
            with self.assertRaises(HTTPException) as caught:
                _get("/users/me/repos", "token")
        self.assertEqual(caught.exception.status_code, 502)
        self.assertIn("ProxyError", caught.exception.detail)

    def test_provider_message_becomes_safe_client_error(self):
        response = Mock()
        response.status_code = 200
        response.is_error = False
        response.json.return_value = {"message": "invalid token"}
        with patch("citekit_server.connectors.yuque.httpx.get", return_value=response):
            with self.assertRaises(HTTPException) as caught:
                _get("/users/me/repos", "token")
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.detail, "invalid token")
