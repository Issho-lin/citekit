from typing import Any

from sqlalchemy import Boolean, Float, ForeignKey, Integer, JSON, String, Text, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from citekit_server.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


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


class KnowledgeBaseRow(Base):
    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    domain: Mapped[str] = mapped_column(String(80), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(32), default="dataset")
    parent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    vector_model: Mapped[str] = mapped_column(String(200), default="")
    llm_model: Mapped[str] = mapped_column(String(200), default="")
    vlm_model: Mapped[str] = mapped_column(String(200), default="")
    rerank_model: Mapped[str] = mapped_column(String(200), default="")
    search_mode: Mapped[str] = mapped_column(String(32), default="mix")
    similarity: Mapped[float] = mapped_column(Float, default=0.2)
    limit: Mapped[int] = mapped_column(Integer, default=20)
    using_rerank: Mapped[bool] = mapped_column(Boolean, default=False)
    website_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_selector: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_dataset_server: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class UploadedFileRow(Base):
    __tablename__ = "uploaded_files"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    kb_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_bases.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    path: Mapped[str] = mapped_column(Text)
    size: Mapped[int] = mapped_column(Integer, default=0)
    mime: Mapped[str] = mapped_column(String(120), default="")


class SourceRow(Base):
    __tablename__ = "kb_sources"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    kb_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_bases.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    type: Mapped[str] = mapped_column(String(32), default="upload")
    title: Mapped[str] = mapped_column(String(255))
    locator: Mapped[str] = mapped_column(Text, default="")
    acl: Mapped[str] = mapped_column(String(32), default="internal")
    status: Mapped[str] = mapped_column(String(32), default="syncing")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    process: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    file_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[str] = mapped_column(String(32), default="")
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)


class ChunkRow(Base):
    __tablename__ = "kb_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kb_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_bases.id"), index=True)
    source_id: Mapped[str] = mapped_column(String(32), ForeignKey("kb_sources.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    locator: Mapped[str] = mapped_column(String(255), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    indexes: Mapped[list | None] = mapped_column(JSON, nullable=True)


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


class EvalCaseRow(Base):
    __tablename__ = "eval_cases"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    query: Mapped[str] = mapped_column(Text)
    tool_id: Mapped[str] = mapped_column(String(32), ForeignKey("retrieval_tools.id"), index=True)
    expect: Mapped[str] = mapped_column(String(255))
    warehouse: Mapped[str | None] = mapped_column(String(80), nullable=True)


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


def ensure_schema() -> None:
    inspector = inspect(engine)
    names = inspector.get_table_names()
    with engine.begin() as conn:
        if "channels" in names:
            conn.execute(text("DROP TABLE IF EXISTS channels"))
        if "channel_types" in names:
            conn.execute(text("DROP TABLE IF EXISTS channel_types"))
        if "ai_models" in names:
            cols = {item["name"] for item in inspector.get_columns("ai_models")}
            if "mapped_model" not in cols:
                conn.execute(text("ALTER TABLE ai_models ADD COLUMN mapped_model VARCHAR(200) NULL"))
            if "multimodal" not in cols:
                conn.execute(text("ALTER TABLE ai_models ADD COLUMN multimodal BOOLEAN NULL"))
                conn.execute(
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
            conn.execute(text("UPDATE ai_models SET type = 'llm', vision = 1 WHERE type = 'vlm'"))
        if "providers" in names:
            cols = {item["name"] for item in inspector.get_columns("providers")}
            if "is_visible" not in cols:
                conn.execute(text("ALTER TABLE providers ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT 1"))
            if "default_base_url" not in cols:
                conn.execute(text("ALTER TABLE providers ADD COLUMN default_base_url TEXT NULL"))
            if "api_key" not in cols:
                conn.execute(text("ALTER TABLE providers ADD COLUMN api_key TEXT NULL"))
        if "kb_chunks" in names:
            cols = {item["name"] for item in inspector.get_columns("kb_chunks")}
            if "answer" not in cols:
                conn.execute(text("ALTER TABLE kb_chunks ADD COLUMN answer TEXT NULL"))
            if "indexes" not in cols:
                conn.execute(text("ALTER TABLE kb_chunks ADD COLUMN indexes JSON NULL"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
