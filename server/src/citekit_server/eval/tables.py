from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from citekit_server.db.base import Base


class EvalCaseRow(Base):
    __tablename__ = "eval_cases"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    query: Mapped[str] = mapped_column(Text)
    tool_id: Mapped[str] = mapped_column(String(32), ForeignKey("retrieval_tools.id"), index=True)
    expect: Mapped[str] = mapped_column(String(255))
    warehouse: Mapped[str | None] = mapped_column(String(80), nullable=True)


class EvalRunRow(Base):
    __tablename__ = "eval_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(40), index=True)
    tool_id: Mapped[str] = mapped_column(String(32), ForeignKey("retrieval_tools.id"), index=True)
    passed: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    retrieve: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class EvalRunItemRow(Base):
    __tablename__ = "eval_run_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(32), ForeignKey("eval_runs.id"), index=True)
    case_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    query: Mapped[str] = mapped_column(Text, default="")
    expect: Mapped[str] = mapped_column(String(255), default="")
    ok: Mapped[bool] = mapped_column(Boolean, default=False)
    detail: Mapped[str] = mapped_column(Text, default="")
    hits: Mapped[list | None] = mapped_column(JSON, nullable=True)
