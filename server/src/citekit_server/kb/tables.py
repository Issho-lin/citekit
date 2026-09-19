from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from citekit_server.db.base import Base


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
    website_link_selector: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    # Web contents are fingerprinted after extraction, not from raw HTML.
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_seen_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    etag: Mapped[str | None] = mapped_column(String(512), nullable=True)
    last_modified: Mapped[str | None] = mapped_column(String(128), nullable=True)


class WebsiteSyncLockRow(Base):
    __tablename__ = "website_sync_locks"

    kb_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_bases.id"), primary_key=True)
    owner_token: Mapped[str] = mapped_column(String(64), nullable=False)
    locked_until: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)


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


class FeishuOAuthStateRow(Base):
    __tablename__ = "feishu_oauth_states"

    state: Mapped[str] = mapped_column(String(128), primary_key=True)
    kb_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_bases.id"), index=True)
    code_verifier: Mapped[str] = mapped_column(String(160), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)


class FeishuConnectionRow(Base):
    __tablename__ = "feishu_connections"

    kb_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_bases.id"), primary_key=True)
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    refresh_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scopes: Mapped[str] = mapped_column(String(2000), default="")


class FeishuAppConfigRow(Base):
    __tablename__ = "feishu_app_configs"

    kb_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_bases.id"), primary_key=True)
    app_id: Mapped[str] = mapped_column(String(200), nullable=False)
    app_secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False)


class FeishuFolderRow(Base):
    __tablename__ = "feishu_folders"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    kb_id: Mapped[str] = mapped_column(String(32), ForeignKey("knowledge_bases.id"), index=True)
    folder_token: Mapped[str] = mapped_column(String(255), nullable=False)
    folder_name: Mapped[str] = mapped_column(String(255), default="")
    last_synced_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), default="")
