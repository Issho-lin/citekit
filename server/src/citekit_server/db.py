from sqlalchemy import Boolean, Integer, String, Text, create_engine, inspect, text
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
