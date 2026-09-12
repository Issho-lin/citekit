from __future__ import annotations

from datetime import datetime

from qdrant_client.http.models import PointStruct
from sqlalchemy.orm import Session

from citekit_server.calls.log import call_scope
from citekit_server.kb.chunking import process_size
from citekit_server.db import (
    AiModelRow,
    ChunkRow,
    KnowledgeBaseRow,
    SessionLocal,
    SourceRow,
    UploadedFileRow,
)
from citekit_server.ids import new_uuid
from citekit_server.kb.process import Unit, ProcessResult, embed_items, run_process
from citekit_server.schemas import PreviewChunk, PreviewOut, ProcessConfigIn
from citekit_server.infra.storage import as_local_path
from citekit_server.infra.upstream import embed_texts
from citekit_server.infra.vectors import delete_chunk_points, delete_source_points, upsert_points
from citekit_server.catalog.logic import ensure_workspace, pick_active


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
    row = _model_by_slot(db, kb, "vector")
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


def chat_model(db: Session, kb: KnowledgeBaseRow) -> AiModelRow | None:
    row = _model_by_slot(db, kb, "llm")
    if row and row.type in {"llm", "vlm"}:
        return row
    return (
        db.query(AiModelRow)
        .filter(AiModelRow.type == "llm", AiModelRow.is_active.is_(True))
        .first()
    )


def vision_model(db: Session, kb: KnowledgeBaseRow) -> AiModelRow | None:
    row = _model_by_slot(db, kb, "vlm")
    if row and (row.vision or row.type == "vlm"):
        return row
    llm = chat_model(db, kb)
    if llm and llm.vision:
        return llm
    return (
        db.query(AiModelRow)
        .filter(AiModelRow.is_active.is_(True), AiModelRow.vision.is_(True))
        .first()
    )


def _model_by_slot(db: Session, kb: KnowledgeBaseRow, slot: str) -> AiModelRow | None:
    ws = ensure_workspace(db)
    labels = {"llm": "文本理解", "vector": "索引", "vlm": "图片理解", "rerank": "重排"}
    mapping = {
        "llm": (kb.llm_model, ws.llm_model),
        "vector": (kb.vector_model, ws.vector_model),
        "vlm": (kb.vlm_model, ws.vlm_model),
        "rerank": (kb.rerank_model, ws.rerank_model),
    }
    kb_id, ws_id = mapping[slot]
    label = labels[slot]
    if (kb_id or "").strip():
        row = db.get(AiModelRow, kb_id.strip())
        if row and row.is_active:
            return row
        if row:
            raise RuntimeError(f"知识库选用的{label}模型「{kb_id}」已停用，请在设置中启用或改选。")
        raise RuntimeError(
            f"知识库选用的{label}模型「{kb_id}」不在模型列表里。"
            "请到设置添加该模型，或在知识库信息里改选一个已有模型。"
        )
    if (ws_id or "").strip():
        row = db.get(AiModelRow, ws_id.strip())
        if row and row.is_active:
            return row
    picked = pick_active(
        db,
        "vlm" if slot == "vlm" else "llm" if slot == "llm" else "embedding" if slot == "vector" else "rerank",
    )
    return db.get(AiModelRow, picked) if picked else None


def _pair(db: Session, model: AiModelRow | None) -> tuple[AiModelRow, str] | None:
    if not model:
        return None
    return model, resolve_auth(db, model)


def source_file(db: Session, source: SourceRow) -> tuple[str, str | None, str]:
    raw = (source.raw_text or "").strip()
    if not source.file_id:
        return raw, None, source.title
    uploaded = db.get(UploadedFileRow, source.file_id)
    if not uploaded:
        raise RuntimeError("文件不存在")
    return raw, uploaded.path, uploaded.name


PARSED_PREVIEW = 24_000
CHUNK_PREVIEW = 50


def build_preview_from_kb(
    db: Session,
    kb: KnowledgeBaseRow,
    *,
    text: str,
    file_path: str | None,
    filename: str,
    title: str,
    process: ProcessConfigIn | None,
) -> PreviewOut:
    cfg = process or ProcessConfigIn()
    llm = chat_model(db, kb)
    vlm = vision_model(db, kb)
    result = run_process(
        cfg=cfg,
        title=title,
        filename=filename,
        raw_text=text,
        file_path=file_path,
        preview=True,
        llm=_pair(db, llm),
        vlm=_pair(db, vlm),
        llm_max_context=llm.max_context if llm else None,
    )
    return _preview_out(result, cfg, title)


def _preview_out(result: ProcessResult, cfg: ProcessConfigIn, title: str) -> PreviewOut:
    lengths = result.chunk_lengths or [len(unit.text) + len(unit.answer) for unit in result.units]
    size, _ = process_size(cfg)
    units = result.units[:CHUNK_PREVIEW]
    chunks = [
        PreviewChunk(
            title=unit.title or f"{title} · 块 {index}",
            text=unit.text,
            chars=len(unit.text),
            answer=unit.answer,
            indexes=unit.indexes,
        )
        for index, unit in enumerate(units, start=1)
    ]
    return PreviewOut(
        chunks=chunks,
        total=result.chunk_total or len(result.units),
        shown=len(chunks),
        parsedText=result.parsed_text[:PARSED_PREVIEW],
        parsedTruncated=len(result.parsed_text) > PARSED_PREVIEW,
        parsedChars=len(result.parsed_text),
        applied=result.applied,
        notes=result.notes,
        minChars=min(lengths) if lengths else 0,
        maxChars=max(lengths) if lengths else 0,
        avgChars=round(sum(lengths) / len(lengths)) if lengths else 0,
        oversize=sum(1 for n in lengths if size > 0 and n > size),
        chunkSize=size,
        indexCount=sum(len(unit.indexes) for unit in result.units),
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

        cfg = process_of(source)
        raw, stored, filename = source_file(db, source)
        if not raw and not stored and source.type == "web":
            from citekit_server.kb.web import fetch_web

            raw = fetch_web(source.locator, cfg.webSelector)
            source.raw_text = raw
            db.commit()
        llm = chat_model(db, kb)
        vlm = vision_model(db, kb)
        with as_local_path(stored, filename) as path:
            with call_scope(purpose="ingest", kb_id=kb.id, source_id=source.id):
                result = run_process(
                    cfg=cfg,
                    title=source.title,
                    filename=filename,
                    raw_text=raw,
                    file_path=path,
                    preview=False,
                    llm=_pair(db, llm),
                    vlm=_pair(db, vlm),
                    llm_max_context=llm.max_context if llm else None,
                )
        if not result.units:
            raise RuntimeError("没有解析出可入库内容")

        model = embedding_model(db, kb)
        auth = resolve_auth(db, model)
        texts: list[str] = []
        meta: list[tuple[str, str]] = []
        units_with_id: list[tuple[str, Unit]] = []
        titles: dict[str, str] = {}
        for unit in result.units:
            chunk_id = new_uuid()
            units_with_id.append((chunk_id, unit))
            titles[chunk_id] = unit.title
            for kind, text in embed_items(
                unit, source.title, cfg.indexPrefixTitle, cfg.indexChunkTitle
            ):
                texts.append(text)
                meta.append((chunk_id, kind))

        if not texts:
            raise RuntimeError("没有可向量化的文本")

        with call_scope(purpose="ingest", kb_id=kb.id, source_id=source.id):
            vectors = embed_texts(model, auth, texts)
        dim = len(vectors[0])

        db.query(ChunkRow).filter(ChunkRow.source_id == source.id).delete()
        delete_source_points(kb.id, source.id)

        points: list[PointStruct] = []
        for index, (chunk_id, unit) in enumerate(units_with_id, start=1):
            locator = f"{source.locator or source.title} #{index}"
            db.add(
                ChunkRow(
                    id=chunk_id,
                    kb_id=kb.id,
                    source_id=source.id,
                    title=unit.title[:255],
                    text=unit.text,
                    locator=locator,
                    position=index,
                    answer=unit.answer or None,
                    indexes=unit.indexes or None,
                )
            )
        for (chunk_id, kind), vector in zip(meta, vectors, strict=True):
            points.append(
                PointStruct(
                    id=new_uuid(),
                    vector=vector,
                    payload={
                        "kb_id": kb.id,
                        "source_id": source.id,
                        "chunk_id": chunk_id,
                        "index_type": kind,
                        "title": titles[chunk_id][:80],
                    },
                )
            )
        upsert_points(kb.id, dim, points)
        source.chunk_count = len(result.units)
        source.status = "synced"
        source.error_message = None
        source.updated_at = now_stamp()
        db.commit()
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


def reindex_chunk(db: Session, row: ChunkRow) -> None:
    source = db.get(SourceRow, row.source_id)
    kb = db.get(KnowledgeBaseRow, row.kb_id)
    if not source or not kb:
        raise RuntimeError("数据集或知识库不存在")
    cfg = process_of(source)
    unit = Unit(
        title=row.title,
        text=row.text,
        answer=row.answer or "",
        indexes=list(row.indexes or []),
    )
    items = embed_items(unit, source.title, cfg.indexPrefixTitle, cfg.indexChunkTitle)
    delete_chunk_points(kb.id, row.id)
    if not items:
        return
    model = embedding_model(db, kb)
    auth = resolve_auth(db, model)
    texts = [text for _, text in items]
    with call_scope(purpose="ingest", kb_id=kb.id, source_id=source.id):
        vectors = embed_texts(model, auth, texts)
    points = [
        PointStruct(
            id=new_uuid(),
            vector=vector,
            payload={
                "kb_id": kb.id,
                "source_id": source.id,
                "chunk_id": row.id,
                "index_type": kind,
                "title": (row.title or "")[:80],
            },
        )
        for (kind, _), vector in zip(items, vectors, strict=True)
    ]
    upsert_points(kb.id, len(vectors[0]), points)
