"""MCP inbound call logs.

Revision ID: 0002_mcp_calls
Revises: 0001_baseline
Create Date: 2026-09-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_mcp_calls"
down_revision: Union[str, Sequence[str], None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mcp_calls",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.String(length=40), nullable=False),
        sa.Column("endpoint_id", sa.String(length=32), nullable=False),
        sa.Column("endpoint_name", sa.String(length=80), nullable=False),
        sa.Column("env", sa.String(length=8), nullable=False),
        sa.Column("method", sa.String(length=80), nullable=False),
        sa.Column("tool_id", sa.String(length=32), nullable=True),
        sa.Column("tool_name", sa.String(length=80), nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("warehouse", sa.String(length=80), nullable=True),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=True),
        sa.Column("summary", sa.String(length=255), nullable=False),
        sa.Column("request_body", sa.JSON(), nullable=True),
        sa.Column("response_body", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mcp_calls_created_at", "mcp_calls", ["created_at"])
    op.create_index("ix_mcp_calls_endpoint_id", "mcp_calls", ["endpoint_id"])
    op.create_index("ix_mcp_calls_method", "mcp_calls", ["method"])
    op.create_index("ix_mcp_calls_ok", "mcp_calls", ["ok"])


def downgrade() -> None:
    op.drop_index("ix_mcp_calls_ok", table_name="mcp_calls")
    op.drop_index("ix_mcp_calls_method", table_name="mcp_calls")
    op.drop_index("ix_mcp_calls_endpoint_id", table_name="mcp_calls")
    op.drop_index("ix_mcp_calls_created_at", table_name="mcp_calls")
    op.drop_table("mcp_calls")
