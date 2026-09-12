"""Add MCP caller IP and region.

Revision ID: 0003_mcp_call_client
Revises: 0002_mcp_calls
Create Date: 2026-09-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_mcp_call_client"
down_revision: Union[str, Sequence[str], None] = "0002_mcp_calls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("mcp_calls", sa.Column("client_ip", sa.String(length=64), nullable=False, server_default=""))
    op.add_column("mcp_calls", sa.Column("client_region", sa.String(length=120), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("mcp_calls", "client_region")
    op.drop_column("mcp_calls", "client_ip")
