from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from citekit_server.db import KnowledgeBaseRow, SourceRow
from citekit_server.ids import new_id
from citekit_server.kb.ingest import ingest_source, now_stamp


@dataclass(frozen=True)
class ConnectorDocument:
    title: str
    text: str
    locator: str


class PreviewedDocumentIn(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=500)
    text: str = Field(min_length=1, max_length=5_000_000)
    locator: str = Field(min_length=1, max_length=2_000)

    def to_document(self) -> ConnectorDocument:
        return ConnectorDocument(self.title, self.text, self.locator)


def connector_kb(db: Session, kb_id: str, kind: str, label: str) -> KnowledgeBaseRow:
    kb = db.get(KnowledgeBaseRow, kb_id)
    if not kb or kb.kind != kind:
        raise HTTPException(404, f"{label}知识库不存在")
    return kb


def connector_config(kb: KnowledgeBaseRow, key: str) -> dict[str, Any]:
    raw = kb.api_dataset_server if isinstance(kb.api_dataset_server, dict) else {}
    value = raw.get(key)
    return value if isinstance(value, dict) else {}


def persist_documents(
    db: Session,
    background: BackgroundTasks,
    *,
    kb_id: str,
    source_type: str,
    documents: Iterable[ConnectorDocument],
    process: dict[str, Any],
    parent_id: str | None,
) -> int:
    """Upsert usable connector documents and hand them to the common ingest worker."""
    source_ids: list[str] = []
    seen_locators: set[str] = set()
    for document in documents:
        text, locator = document.text.strip(), document.locator.strip()
        if not text or not locator or locator in seen_locators:
            continue
        seen_locators.add(locator)
        existing = (
            db.query(SourceRow)
            .filter(SourceRow.kb_id == kb_id, SourceRow.type == source_type, SourceRow.locator == locator)
            .one_or_none()
        )
        if existing:
            existing.title = document.title or existing.title
            existing.raw_text = text
            existing.process = process
            existing.status = "syncing"
            existing.error_message = None
            existing.updated_at = now_stamp()
            source_id = existing.id
        else:
            row = SourceRow(
                id=new_id("src"), kb_id=kb_id, parent_id=parent_id, type=source_type,
                title=document.title or "未命名文档", locator=locator, acl="internal",
                status="syncing", process=process, raw_text=text, updated_at=now_stamp(), chunk_count=0,
            )
            db.add(row)
            source_id = row.id
        source_ids.append(source_id)
    db.commit()
    for source_id in source_ids:
        background.add_task(ingest_source, source_id)
    return len(source_ids)
