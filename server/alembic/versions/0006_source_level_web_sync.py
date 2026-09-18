"""Move web synchronization from knowledge bases to individual sources.

Revision ID: 0006_source_level_web_sync
Revises: 0005_website_sync_incremental
Create Date: 2026-09-18
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "0006_source_level_web_sync"
down_revision: Union[str, Sequence[str], None] = "0005_website_sync_incremental"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    inspector = inspect(op.get_bind())
    inspector.clear_cache()
    return table in inspector.get_table_names()


def _columns(table: str) -> set[str]:
    inspector = inspect(op.get_bind())
    inspector.clear_cache()
    if table not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table)}


def upgrade() -> None:
    # The old root URL was already seeded as a web Source when sync started.
    # Retaining historical Source rows preserves every independently indexed URL.
    if _has_table("website_sync_locks"):
        op.drop_table("website_sync_locks")
    columns = _columns("knowledge_bases")
    for name in ("website_selector", "website_url"):
        if name in columns:
            op.drop_column("knowledge_bases", name)


def downgrade() -> None:
    # Restoring a single root URL would lose the source-level semantics.
    pass
