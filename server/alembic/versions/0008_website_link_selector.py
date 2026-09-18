"""Add a navigation selector for website link discovery.

Revision ID: 0008_website_link_selector
Revises: 0007_restore_website_sync
Create Date: 2026-09-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0008_website_link_selector"
down_revision: Union[str, Sequence[str], None] = "0007_restore_website_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    inspector.clear_cache()
    columns = {item["name"] for item in inspector.get_columns("knowledge_bases")}
    if "website_link_selector" not in columns:
        op.add_column("knowledge_bases", sa.Column("website_link_selector", sa.Text(), nullable=True))


def downgrade() -> None:
    pass
