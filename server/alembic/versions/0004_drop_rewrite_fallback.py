"""Drop unused workspace.rewrite_fallback column.

Revision ID: 0004_drop_rewrite_fallback
Revises: 0003_mcp_call_client
Create Date: 2026-09-14

The rewrite-fallback flag was never read by retrieval logic (anaphora
resolution is owned by the Agent prompt), so the setting and its column
are removed. Databases created after the ORM change never had the column,
so the drop is guarded by an existence check.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0004_drop_rewrite_fallback"
down_revision: Union[str, Sequence[str], None] = "0003_mcp_call_client"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = inspect(bind)
    insp.clear_cache()
    if table not in insp.get_table_names():
        return False
    return column in {item["name"] for item in insp.get_columns(table)}


def upgrade() -> None:
    if _has_column("workspace", "rewrite_fallback"):
        op.drop_column("workspace", "rewrite_fallback")


def downgrade() -> None:
    if not _has_column("workspace", "rewrite_fallback"):
        op.add_column(
            "workspace",
            sa.Column("rewrite_fallback", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )
