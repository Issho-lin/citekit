"""Restore website knowledge-base configuration after source-only experiment.

Revision ID: 0007_restore_website_sync
Revises: 0006_source_level_web_sync
Create Date: 2026-09-18
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0007_restore_website_sync"
down_revision: Union[str, Sequence[str], None] = "0006_source_level_web_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    inspector = inspect(op.get_bind())
    inspector.clear_cache()
    return {item["name"] for item in inspector.get_columns(table)} if table in inspector.get_table_names() else set()


def upgrade() -> None:
    columns = _columns("knowledge_bases")
    if "website_url" not in columns:
        op.add_column("knowledge_bases", sa.Column("website_url", sa.Text(), nullable=True))
    if "website_selector" not in columns:
        op.add_column("knowledge_bases", sa.Column("website_selector", sa.Text(), nullable=True))
    inspector = inspect(op.get_bind())
    if "website_sync_locks" not in inspector.get_table_names():
        op.create_table("website_sync_locks", sa.Column("kb_id", sa.String(32), sa.ForeignKey("knowledge_bases.id"), primary_key=True), sa.Column("owner_token", sa.String(64), nullable=False), sa.Column("locked_until", sa.DateTime(), nullable=False))
        op.create_index("ix_website_sync_locks_locked_until", "website_sync_locks", ["locked_until"])


def downgrade() -> None:
    pass
