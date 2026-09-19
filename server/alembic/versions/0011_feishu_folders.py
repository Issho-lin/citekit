"""Persist Feishu folder sources.

Revision ID: 0011_feishu_folders
Revises: 0008_website_link_selector
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
revision: str = "0011_feishu_folders"
down_revision: Union[str, Sequence[str], None] = "0008_website_link_selector"
branch_labels = None
depends_on = None
def upgrade() -> None:
    if "feishu_folders" not in set(inspect(op.get_bind()).get_table_names()):
        op.create_table("feishu_folders", sa.Column("id", sa.String(32), primary_key=True), sa.Column("kb_id", sa.String(32), sa.ForeignKey("knowledge_bases.id"), nullable=False, index=True), sa.Column("folder_token", sa.String(255), nullable=False), sa.Column("folder_name", sa.String(255), nullable=False, server_default=""), sa.Column("last_synced_at", sa.String(32), nullable=True), sa.Column("created_at", sa.String(32), nullable=False, server_default=""))
def downgrade() -> None:
    op.drop_table("feishu_folders")
