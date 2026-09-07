from __future__ import annotations

from datetime import datetime
from pathlib import Path

from qdrant_client.http.models import PointStruct
from sqlalchemy.orm import Session

from citekit_server.call_log import call_scope
from citekit_server.chunking import describe_process, process_size, split_text, unused_notes
from citekit_server.config import settings
from citekit_server.db import (
    AiModelRow,
    ChunkRow,
    KnowledgeBaseRow,
    SessionLocal,
    SourceRow,
    UploadedFileRow,
)
from citekit_server.ids import new_uuid
from citekit_server.parse import extract_text
from citekit_server.schemas import PreviewChunk, PreviewOut, ProcessConfigIn
from citekit_server.upstream import embed_texts
from citekit_server.vectors import delete_source_points, upsert_points
from citekit_server.workspace_logic import ensure_workspace


def now_stamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def process_of(source: SourceRow) -> ProcessConfigIn:
    data = source.process if isinstance(source.process, dict) else {}
    return ProcessConfigIn.model_validate(data or {})


def resolve_auth(db: Session, model: AiModelRow) -> str:
    token = (model.request_auth or "").strip()
    if token:
        return token
    from citekit_server.db import ProviderRow

    if not model.provider:
        return ""
    row = db.get(ProviderRow, model.provider)
    return (row.api_key or "").strip() if row else ""


def embedding_model(db: Session, kb: KnowledgeBaseRow) -> AiModelRow:
    model_id = (kb.vector_model or "").strip() or ensure_workspace(db).vector_model
    row = db.get(AiModelRow, model_id) if model_id else None
    if row and row.type == "embedding":
        return row
    fallback = (
        db.query(AiModelRow)
        .filter(AiModelRow.type == "embedding", AiModelRow.is_active.is_(True))
        .first()
    )
    if not fallback:
        raise RuntimeError("请先为知识库选择可用的索引模型")
    return fallback


def source_text(db: Session, source: SourceRow) -> str:
    if (source.raw_text or "").strip():
        return source.raw_text or ""
    if not source.file_id:
        return ""
    uploaded = db.get(UploadedFileRow, source.file_id)
    if not uploaded:
        raise RuntimeError("文件不存在")
    return extract_text(uploaded.path, uploaded.name)


PARSED_PREVIEW = 24_000
CHUNK_PREVIEW = 50


def build_preview(
    text: str,
    process: ProcessConfigIn | None,
    title: str,
    filename: str = "",
) -> PreviewOut:
    body = (text or "").strip()
    cfg = process or ProcessConfigIn()
    size, _overlap = process_size(cfg)
    parts = split_text(body, cfg)
    lengths = [len(part) for part in parts]
    chunks = [
        PreviewChunk(
            title=part.split("\n", 1)[0][:40] or f"{title} · 块 {index}",
            text=part,
            chars=len(part),
        )
        for index, part in enumerate(parts[:CHUNK_PREVIEW], start=1)
    ]
    return PreviewOut(
        chunks=chunks,
        total=len(parts),
        shown=len(chunks),
        parsedText=body[:PARSED_PREVIEW],
        parsedTruncated=len(body) > PARSED_PREVIEW,
        parsedChars=len(body),
        applied=describe_process(cfg),
        notes=unused_notes(cfg, filename=filename or title, parsed_chars=len(body)),
        minChars=min(lengths) if lengths else 0,
        maxChars=max(lengths) if lengths else 0,
        avgChars=round(sum(lengths) / len(lengths)) if lengths else 0,
        oversize=sum(1 for n in lengths if n > size),
        chunkSize=size,
    )


def ingest_source(source_id: str) -> None:
    db = SessionLocal()
    try:
        source = db.get(SourceRow, source_id)
        if not source:
            return
        kb = db.get(KnowledgeBaseRow, source.kb_id)
        if not kb:
            raise RuntimeError("知识库不存在")
        source.status = "syncing"
        source.error_message = None
        source.updated_at = now_stamp()
        db.commit()

        text = source_text(db, source)
        parts = split_text(text, process_of(source))
        if not parts:
            raise RuntimeError("没有解析出文本，无法入库")

        model = embedding_model(db, kb)
        with call_scope(purpose="ingest", kb_id=kb.id, source_id=source.id):
            vectors = embed_texts(model, resolve_auth(db, model), parts)
        dim = len(vectors[0])

        old_ids = [row.id for row in db.query(ChunkRow).filter(ChunkRow.source_id == source.id).all()]
        db.query(ChunkRow).filter(ChunkRow.source_id == source.id).delete()
        delete_source_points(kb.id, source.id)

        points: list[PointStruct] = []
        for index, (part, vector) in enumerate(zip(parts, vectors, strict=True), start=1):
            chunk_id = new_uuid()
            title = part.split("\n", 1)[0][:80] or f"{source.title} · 块 {index}"
            locator = f"{source.locator or source.title} #{index}"
            db.add(
                ChunkRow(
                    id=chunk_id,
                    kb_id=kb.id,
                    source_id=source.id,
                    title=title,
                    text=part,
                    locator=locator,
                    position=index,
                )
            )
            points.append(
                PointStruct(
                    id=chunk_id,
                    vector=vector,
                    payload={
                        "kb_id": kb.id,
                        "source_id": source.id,
                        "chunk_id": chunk_id,
                        "title": title,
                        "text": part,
                    },
                )
            )
        upsert_points(kb.id, dim, points)
        source.chunk_count = len(parts)
        source.status = "synced"
        source.error_message = None
        source.updated_at = now_stamp()
        db.commit()
        _ = old_ids
    except Exception as exc:
        db.rollback()
        source = db.get(SourceRow, source_id)
        if source:
            source.status = "error"
            source.error_message = str(exc)
            source.updated_at = now_stamp()
            db.commit()
    finally:
        db.close()


def uploads_dir(kb_id: str) -> Path:
    path = settings.data_dir / "uploads" / kb_id
    path.mkdir(parents=True, exist_ok=True)
    return path
