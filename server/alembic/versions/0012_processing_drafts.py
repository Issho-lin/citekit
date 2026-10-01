"""Persist reviewable processing drafts.

Revision ID: 0012_processing_drafts
Revises: 0011_feishu_folders
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "0012_processing_drafts"
down_revision: Union[str, Sequence[str], None] = "0011_feishu_folders"
branch_labels = None
depends_on = None

def upgrade() -> None:
    if "kb_processing_drafts" not in set(inspect(op.get_bind()).get_table_names()):
        op.create_table("kb_processing_drafts",
            sa.Column("id", sa.String(32), primary_key=True),
            sa.Column("kb_id", sa.String(32), sa.ForeignKey("knowledge_bases.id"), nullable=False, index=True),
            sa.Column("fingerprint", sa.String(64), nullable=False, index=True),
            sa.Column("title", sa.String(255), nullable=False, server_default=""),
            sa.Column("source_type", sa.String(32), nullable=False, server_default="upload"),
            sa.Column("locator", sa.Text(), nullable=False),
            sa.Column("parent_id", sa.String(32), nullable=True),
            sa.Column("file_id", sa.String(32), nullable=True),
            sa.Column("raw_text", sa.Text(), nullable=True),
            sa.Column("process", sa.JSON(), nullable=False),
            sa.Column("result", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(32), nullable=False, server_default="ready"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.String(32), nullable=False),
            sa.Column("expires_at", sa.String(32), nullable=False, index=True),
        )

def downgrade() -> None:
    op.drop_table("kb_processing_drafts")
