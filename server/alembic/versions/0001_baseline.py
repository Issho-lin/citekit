"""Baseline: current ORM schema plus leftover patches from ensure_schema.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-09-11

Existing databases already created by metadata.create_all + ensure_schema can
run this revision safely: missing tables/columns are added, present ones skip.
New empty databases get the full schema from Base.metadata.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

from citekit_server.db.base import Base
import citekit_server.db  # noqa: F401

revision: str = "0001_baseline"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _names() -> set[str]:
    insp = inspect(op.get_bind())
    insp.clear_cache()
    return set(insp.get_table_names())


def _columns(table: str) -> set[str]:
    insp = inspect(op.get_bind())
    insp.clear_cache()
    if table not in insp.get_table_names():
        return set()
    return {item["name"] for item in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    names = _names()
    if "channels" in names:
        op.drop_table("channels")
    if "channel_types" in names:
        op.drop_table("channel_types")

    Base.metadata.create_all(bind=bind)

    cols = _columns("ai_models")
    if cols:
        if "mapped_model" not in cols:
            op.add_column("ai_models", sa.Column("mapped_model", sa.String(200), nullable=True))
        if "multimodal" not in cols:
            op.add_column("ai_models", sa.Column("multimodal", sa.Boolean(), nullable=True))
            bind.execute(
                text(
                    """
                    UPDATE ai_models
                    SET multimodal = 1
                    WHERE type = 'embedding'
                      AND (
                        LOWER(id) LIKE '%vl-embedding%'
                        OR LOWER(IFNULL(mapped_model, '')) LIKE '%vl-embedding%'
                        OR LOWER(id) LIKE '%multimodal-embed%'
                      )
                    """
                )
            )
        bind.execute(text("UPDATE ai_models SET type = 'llm', vision = 1 WHERE type = 'vlm'"))

    cols = _columns("providers")
    if cols:
        if "is_visible" not in cols:
            op.add_column(
                "providers",
                sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            )
        if "default_base_url" not in cols:
            op.add_column("providers", sa.Column("default_base_url", sa.Text(), nullable=True))
        if "api_key" not in cols:
            op.add_column("providers", sa.Column("api_key", sa.Text(), nullable=True))

    cols = _columns("kb_chunks")
    if cols:
        if "answer" not in cols:
            op.add_column("kb_chunks", sa.Column("answer", sa.Text(), nullable=True))
        if "indexes" not in cols:
            op.add_column("kb_chunks", sa.Column("indexes", sa.JSON(), nullable=True))

    cols = _columns("eval_runs")
    if cols and "retrieve" not in cols:
        op.add_column("eval_runs", sa.Column("retrieve", sa.JSON(), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("baseline is not reversible; restore from backup")
