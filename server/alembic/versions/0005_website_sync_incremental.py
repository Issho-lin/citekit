"""Add durable website-sync lease and page change metadata.

Revision ID: 0005_website_sync_incremental
Revises: 0004_drop_rewrite_fallback
Create Date: 2026-09-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0005_website_sync_incremental"
down_revision: Union[str, Sequence[str], None] = "0004_drop_rewrite_fallback"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(table: str) -> set[str]:
    inspector = inspect(op.get_bind())
    inspector.clear_cache()
    if table not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    columns = _columns("kb_sources")
    additions = {
        "content_hash": sa.String(64),
        "last_seen_at": sa.String(32),
        "etag": sa.String(512),
        "last_modified": sa.String(128),
    }
    for name, kind in additions.items():
        if name not in columns:
            op.add_column("kb_sources", sa.Column(name, kind, nullable=True))

    inspector = inspect(op.get_bind())
    if "website_sync_locks" not in inspector.get_table_names():
        op.create_table(
            "website_sync_locks",
            sa.Column("kb_id", sa.String(32), sa.ForeignKey("knowledge_bases.id"), primary_key=True),
            sa.Column("owner_token", sa.String(64), nullable=False),
            sa.Column("locked_until", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_website_sync_locks_locked_until", "website_sync_locks", ["locked_until"])


def downgrade() -> None:
    # These fields only improve synchronization. Retaining them is safer than
    # deleting production state during a rollback.
    pass
