from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from citekit_server.db.base import Base


class AiModelRow(Base):
    __tablename__ = "ai_models"

    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(32))
    provider: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=True)
    vision: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    multimodal: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    tool_choice: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    max_context: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_response: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_token: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_token: Mapped[int | None] = mapped_column(Integer, nullable=True)
    batch_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    normalization: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    request_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_auth: Mapped[str | None] = mapped_column(Text, nullable=True)
    mapped_model: Mapped[str | None] = mapped_column(String(200), nullable=True)


class ProviderRow(Base):
    __tablename__ = "providers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    avatar: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    default_base_url: Mapped[str] = mapped_column(Text, default="")
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)


class WorkspaceRow(Base):
    __tablename__ = "workspace"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    llm_model: Mapped[str] = mapped_column(String(200), default="")
    vector_model: Mapped[str] = mapped_column(String(200), default="")
    vlm_model: Mapped[str] = mapped_column(String(200), default="")
    rerank_model: Mapped[str] = mapped_column(String(200), default="")
    rewrite_fallback: Mapped[bool] = mapped_column(Boolean, default=False)
