from pathlib import Path
import unittest

from alembic.script import ScriptDirectory

from citekit_server.calls.client import region_of
from citekit_server.calls.mcp_log import should_log_mcp_method
from citekit_server.db.migrate import alembic_config


class AlembicLayoutTests(unittest.TestCase):
    def test_single_head(self) -> None:
        script = ScriptDirectory.from_config(alembic_config())
        heads = script.get_heads()
        self.assertEqual(heads, ["0004_drop_rewrite_fallback"])

    def test_ini_and_versions_exist(self) -> None:
        root = Path(__file__).resolve().parents[1]
        self.assertTrue((root / "alembic.ini").is_file())
        self.assertTrue((root / "alembic" / "versions" / "0001_baseline.py").is_file())
        self.assertTrue((root / "alembic" / "versions" / "0003_mcp_call_client.py").is_file())


class McpLogTests(unittest.TestCase):
    def test_skips_keepalive(self) -> None:
        self.assertFalse(should_log_mcp_method("ping"))
        self.assertFalse(should_log_mcp_method("notifications/initialized"))
        self.assertFalse(should_log_mcp_method("notifications/cancelled"))
        self.assertFalse(should_log_mcp_method("notifications/progress"))

    def test_keeps_real_calls(self) -> None:
        self.assertTrue(should_log_mcp_method("initialize"))
        self.assertTrue(should_log_mcp_method("tools/list"))
        self.assertTrue(should_log_mcp_method("tools/call"))
        self.assertTrue(should_log_mcp_method("auth"))
        self.assertTrue(should_log_mcp_method(""))


class ClientRegionTests(unittest.TestCase):
    def test_loopback(self) -> None:
        self.assertEqual(region_of("127.0.0.1"), "本机")
        self.assertEqual(region_of("::1"), "本机")

    def test_private(self) -> None:
        self.assertEqual(region_of("192.168.1.8"), "内网")
        self.assertEqual(region_of("10.0.0.2"), "内网")
