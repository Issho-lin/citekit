from pathlib import Path

from alembic import command
from alembic.config import Config

_SERVER_DIR = Path(__file__).resolve().parents[3]


def alembic_config() -> Config:
    cfg = Config(str(_SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_SERVER_DIR / "alembic"))
    cfg.set_main_option("prepend_sys_path", str(_SERVER_DIR / "src"))
    return cfg


def apply_migrations() -> None:
    command.upgrade(alembic_config(), "head")
