from typing import Any

from sqlalchemy import Boolean, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from citekit_server.db.base import Base


class ModelCallRow(Base):
    __tablename__ = "model_calls"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(40), index=True)
    model_id: Mapped[str] = mapped_column(String(200), default="", index=True)
    model_name: Mapped[str] = mapped_column(String(200), default="")
    mapped_model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    model_type: Mapped[str] = mapped_column(String(32), default="", index=True)
    provider: Mapped[str] = mapped_column(String(64), default="")
    purpose: Mapped[str] = mapped_column(String(32), default="", index=True)
    kind: Mapped[str] = mapped_column(String(32), default="")
    method: Mapped[str] = mapped_column(String(8), default="POST")
    url: Mapped[str] = mapped_column(Text, default="")
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ok: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    kb_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    source_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summary: Mapped[str] = mapped_column(String(255), default="")
    request_body: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    response_body: Mapped[Any | None] = mapped_column(JSON, nullable=True)


class McpCallRow(Base):
    __tablename__ = "mcp_calls"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(40), index=True)
    endpoint_id: Mapped[str] = mapped_column(String(32), default="", index=True)
    endpoint_name: Mapped[str] = mapped_column(String(80), default="")
    env: Mapped[str] = mapped_column(String(8), default="")
    method: Mapped[str] = mapped_column(String(80), default="", index=True)
    tool_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tool_name: Mapped[str] = mapped_column(String(80), default="")
    query: Mapped[str] = mapped_column(Text, default="")
    warehouse: Mapped[str | None] = mapped_column(String(80), nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ok: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    hit_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summary: Mapped[str] = mapped_column(String(255), default="")
    request_body: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    response_body: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    client_ip: Mapped[str] = mapped_column(String(64), default="")
    client_region: Mapped[str] = mapped_column(String(120), default="")
