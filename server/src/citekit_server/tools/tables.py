from sqlalchemy import ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from citekit_server.db.base import Base


class ToolRow(Base):
    __tablename__ = "retrieval_tools"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    kb_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_bases.id"), index=True)
    source_ids: Mapped[list] = mapped_column(JSON, default=list)
    search: Mapped[dict] = mapped_column(JSON, default=dict)


class McpEndpointRow(Base):
    __tablename__ = "mcp_endpoints"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    env: Mapped[str] = mapped_column(String(8), default="dev")
    tool_ids: Mapped[list] = mapped_column(JSON, default=list)
    api_key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
