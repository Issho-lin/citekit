from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from minio.error import S3Error
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from citekit_server.db import (
    ChunkRow,
    KnowledgeBaseRow,
    SourceRow,
    UploadedFileRow,
    get_db,
)
from citekit_server.ids import new_id
from citekit_server.ingest import build_preview_from_kb, ingest_source, now_stamp, reindex_chunk
from citekit_server.retrieve import search_kb
from citekit_server.schemas import (
    FileOut,
    KnowledgeBaseIn,
    KnowledgeBaseOut,
    KnowledgeBasePatch,
    OriginalFileText,
    PreviewIn,
    PreviewOut,
    SearchIn,
    SearchOut,
    SourceIn,
    SourceOut,
    SourcePatch,
    ChunkOut,
    ChunkPatch,
)
from citekit_server.serialize import chunk_to_out, kb_to_out, source_to_out
from citekit_server.parse import extract_text
from citekit_server.storage import (
    as_local_path,
    delete_object,
    delete_prefix,
    object_key,
    object_stat,
    open_object,
    put_bytes,
)
from citekit_server.vectors import delete_source_points, drop_kb
from citekit_server.workspace_logic import ensure_workspace, pick_active

router = APIRouter(prefix="/api")
MAX_UPLOAD = 50 * 1024 * 1024


def _kb(db: Session, kb_id: str) -> KnowledgeBaseRow:
    row = db.get(KnowledgeBaseRow, kb_id)
    if not row:
        raise HTTPException(404, "知识库不存在")
    return row


def _source(db: Session, source_id: str) -> SourceRow:
    row = db.get(SourceRow, source_id)
    if not row:
        raise HTTPException(404, "数据集不存在")
    return row


def _uploaded_for(db: Session, row: SourceRow) -> UploadedFileRow | None:
    if not row.file_id:
        return None
    uploaded = db.get(UploadedFileRow, row.file_id)
    if not uploaded or uploaded.kb_id != row.kb_id:
        return None
    return uploaded


def _guess_mime(name: str, stored: str = "") -> str:
    if stored:
        return stored
    guessed, _ = mimetypes.guess_type(name)
    return guessed or "application/octet-stream"


def _disposition(name: str, *, download: bool) -> str:
    kind = "attachment" if download else "inline"
    try:
        name.encode("ascii")
        fallback = name.replace('"', "")
    except UnicodeEncodeError:
        fallback = "file"
    return f"{kind}; filename=\"{fallback}\"; filename*=UTF-8''{quote(name)}"


def _forget_upload(db: Session, file_id: str | None, *, except_source_id: str | None = None) -> None:
    if not file_id:
        return
    others = db.query(SourceRow).filter(SourceRow.file_id == file_id)
    if except_source_id:
        others = others.filter(SourceRow.id != except_source_id)
    if others.first():
        return
    uploaded = db.get(UploadedFileRow, file_id)
    if not uploaded:
        return
    delete_object(uploaded.path)
    db.delete(uploaded)


def _doc_count(db: Session, kb_id: str) -> int:
    return (
        db.query(SourceRow)
        .filter(SourceRow.kb_id == kb_id, SourceRow.type != "folder")
        .count()
    )


def _kb_out(db: Session, row: KnowledgeBaseRow) -> KnowledgeBaseOut:
    return kb_to_out(row, _doc_count(db, row.id))


@router.get("/kbs", response_model=list[KnowledgeBaseOut])
def list_kbs(db: Session = Depends(get_db)) -> list[KnowledgeBaseOut]:
    rows = db.query(KnowledgeBaseRow).order_by(KnowledgeBaseRow.name).all()
    return [_kb_out(db, row) for row in rows]


@router.post("/kbs", response_model=KnowledgeBaseOut)
def create_kb(body: KnowledgeBaseIn, db: Session = Depends(get_db)) -> KnowledgeBaseOut:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "请填写名称")
    ws = ensure_workspace(db)
    vector_model = body.vectorModel or ws.vector_model or pick_active(db, "embedding")
    if not vector_model:
        raise HTTPException(400, "请先在设置里启用一个索引模型")
    row = KnowledgeBaseRow(
        id=new_id("kb"),
        name=name,
        domain=body.domain or "",
        description=body.description or "",
        kind=body.kind or "dataset",
        parent_id=body.parentId,
        website_url=body.websiteUrl,
        website_selector=body.websiteSelector,
        api_dataset_server=body.apiDatasetServer,
        vector_model=vector_model,
        llm_model=body.llmModel or ws.llm_model or pick_active(db, "llm"),
        vlm_model=body.vlmModel or ws.vlm_model or pick_active(db, "vlm"),
        rerank_model=body.rerankModel if body.rerankModel is not None else (ws.rerank_model or ""),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _kb_out(db, row)


@router.get("/kbs/{kb_id}", response_model=KnowledgeBaseOut)
def get_kb(kb_id: str, db: Session = Depends(get_db)) -> KnowledgeBaseOut:
    return _kb_out(db, _kb(db, kb_id))


@router.patch("/kbs/{kb_id}", response_model=KnowledgeBaseOut)
def patch_kb(kb_id: str, body: KnowledgeBasePatch, db: Session = Depends(get_db)) -> KnowledgeBaseOut:
    row = _kb(db, kb_id)
    data = body.model_dump(exclude_unset=True)
    mapping = {
        "name": "name",
        "domain": "domain",
        "description": "description",
        "parentId": "parent_id",
        "websiteUrl": "website_url",
        "websiteSelector": "website_selector",
        "apiDatasetServer": "api_dataset_server",
        "vectorModel": "vector_model",
        "llmModel": "llm_model",
        "vlmModel": "vlm_model",
        "rerankModel": "rerank_model",
        "searchMode": "search_mode",
        "similarity": "similarity",
        "limit": "limit",
        "usingRerank": "using_rerank",
    }
    for key, column in mapping.items():
        if key in data:
            value = data[key]
            if key == "name" and isinstance(value, str):
                value = value.strip() or row.name
            setattr(row, column, value)
    db.commit()
    db.refresh(row)
    return _kb_out(db, row)


@router.delete("/kbs/{kb_id}")
def delete_kb(kb_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    row = _kb(db, kb_id)
    drop = [row.id]
    changed = True
    while changed:
        changed = False
        kids = db.query(KnowledgeBaseRow).filter(KnowledgeBaseRow.parent_id.in_(drop)).all()
        for kid in kids:
            if kid.id not in drop:
                drop.append(kid.id)
                changed = True
    for kid_id in drop:
        db.query(ChunkRow).filter(ChunkRow.kb_id == kid_id).delete()
        db.query(SourceRow).filter(SourceRow.kb_id == kid_id).delete()
        db.query(UploadedFileRow).filter(UploadedFileRow.kb_id == kid_id).delete()
        drop_kb(kid_id)
        delete_prefix(f"{kid_id}/")
        item = db.get(KnowledgeBaseRow, kid_id)
        if item:
            db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/kbs/{kb_id}/files", response_model=FileOut)
async def upload_file(kb_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)) -> FileOut:
    _kb(db, kb_id)
    data = await file.read()
    if not data:
        raise HTTPException(400, "文件为空")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(400, "文件超过 50MB")
    file_id = new_id("file")
    name = Path(file.filename or "upload.bin").name
    key = object_key(kb_id, file_id, name)
    try:
        put_bytes(key, data, file.content_type or "application/octet-stream")
    except Exception as exc:
        raise HTTPException(503, "对象存储不可用，无法上传文件") from exc
    row = UploadedFileRow(
        id=file_id,
        kb_id=kb_id,
        name=name,
        path=key,
        size=len(data),
        mime=file.content_type or "",
    )
    db.add(row)
    db.commit()
    return FileOut(id=file_id, name=name, size=len(data))


@router.post("/kbs/{kb_id}/preview", response_model=PreviewOut)
def preview(kb_id: str, body: PreviewIn, db: Session = Depends(get_db)) -> PreviewOut:
    kb = _kb(db, kb_id)
    text = (body.rawText or "").strip()
    title = "预览"
    filename = ""
    file_path = None
    if body.fileId:
        uploaded = db.get(UploadedFileRow, body.fileId)
        if not uploaded or uploaded.kb_id != kb_id:
            raise HTTPException(404, "文件不存在")
        title = uploaded.name
        filename = uploaded.name
        file_path = uploaded.path
    try:
        with as_local_path(file_path, filename) as local_path:
            return build_preview_from_kb(
                db,
                kb,
                text=text,
                file_path=local_path,
                filename=filename,
                title=title,
                process=body.process,
            )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/kbs/{kb_id}/sources", response_model=list[SourceOut])
def list_sources(kb_id: str, db: Session = Depends(get_db)) -> list[SourceOut]:
    _kb(db, kb_id)
    rows = db.query(SourceRow).filter(SourceRow.kb_id == kb_id).order_by(SourceRow.updated_at.desc()).all()
    return [source_to_out(row) for row in rows]


@router.post("/kbs/{kb_id}/sources", response_model=SourceOut)
def create_source(
    kb_id: str,
    body: SourceIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
) -> SourceOut:
    kb = _kb(db, kb_id)
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "请填写名称")
    locator = body.locator or ""
    file_id = body.fileId
    raw_text = (body.rawText or "").strip() or None
    if file_id:
        uploaded = db.get(UploadedFileRow, file_id)
        if not uploaded or uploaded.kb_id != kb_id:
            raise HTTPException(404, "文件不存在")
        locator = locator or uploaded.name
        title = title or uploaded.name
    source_type = body.type or ("manual" if raw_text and not file_id else "upload")
    needs_train = bool(file_id or raw_text) and source_type != "folder"
    row = SourceRow(
        id=new_id("src"),
        kb_id=kb.id,
        parent_id=body.parentId,
        type=source_type,
        title=title,
        locator=locator or title,
        acl="internal",
        status="syncing" if needs_train else "synced",
        process=(body.process.model_dump() if body.process else None),
        file_id=file_id,
        raw_text=raw_text,
        updated_at=now_stamp(),
        chunk_count=0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    if needs_train:
        background.add_task(ingest_source, row.id)
    return source_to_out(row)


@router.patch("/sources/{source_id}", response_model=SourceOut)
def patch_source(source_id: str, body: SourcePatch, db: Session = Depends(get_db)) -> SourceOut:
    row = _source(db, source_id)
    if body.title is not None:
        row.title = body.title.strip() or row.title
    if body.process is not None:
        row.process = body.process.model_dump()
    row.updated_at = now_stamp()
    db.commit()
    db.refresh(row)
    return source_to_out(row)


@router.delete("/sources/{source_id}")
def delete_source(source_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    row = _source(db, source_id)
    db.query(ChunkRow).filter(ChunkRow.source_id == row.id).delete()
    delete_source_points(row.kb_id, row.id)
    _forget_upload(db, row.file_id, except_source_id=row.id)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/sources/{source_id}/retrain", response_model=SourceOut)
def retrain_source(source_id: str, background: BackgroundTasks, db: Session = Depends(get_db)) -> SourceOut:
    row = _source(db, source_id)
    if row.type == "folder":
        return source_to_out(row)
    row.status = "syncing"
    row.error_message = None
    row.updated_at = now_stamp()
    db.commit()
    db.refresh(row)
    background.add_task(ingest_source, row.id)
    return source_to_out(row)


@router.get("/sources/{source_id}/file")
def get_source_file(
    source_id: str,
    download: bool = False,
    format: str | None = None,
    db: Session = Depends(get_db),
):
    row = _source(db, source_id)
    uploaded = _uploaded_for(db, row)
    raw = (row.raw_text or "").strip()
    if format == "text":
        if uploaded:
            try:
                with as_local_path(uploaded.path, uploaded.name) as path:
                    if not path:
                        raise HTTPException(404, "原文件不存在")
                    try:
                        text = extract_text(path, uploaded.name)
                    except ValueError:
                        text = ""
            except RuntimeError as exc:
                raise HTTPException(404, str(exc)) from exc
            return OriginalFileText(
                name=uploaded.name,
                mime=_guess_mime(uploaded.name, uploaded.mime),
                size=uploaded.size,
                text=text,
            )
        if raw:
            name = f"{Path(row.title).stem or '原文'}.txt"
            data = raw.encode("utf-8")
            return OriginalFileText(name=name, mime="text/plain; charset=utf-8", size=len(data), text=raw)
        raise HTTPException(404, "该集合没有原文件")

    if uploaded:
        mime = _guess_mime(uploaded.name, uploaded.mime)
        headers = {"Content-Disposition": _disposition(uploaded.name, download=download)}
        local = Path(uploaded.path)
        if local.is_file():
            return FileResponse(path=local, media_type=mime, headers=headers)
        try:
            obj = open_object(uploaded.path)
            stat = object_stat(uploaded.path)
            headers["Content-Length"] = str(stat.size)
        except S3Error as exc:
            raise HTTPException(404, "原文件不存在或对象存储不可用") from exc

        def _close() -> None:
            obj.close()
            obj.release_conn()

        return StreamingResponse(
            obj.stream(64 * 1024),
            media_type=mime,
            headers=headers,
            background=BackgroundTask(_close),
        )
    if raw:
        name = f"{Path(row.title).stem or '原文'}.txt"
        data = raw.encode("utf-8")
        return Response(
            content=data,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": _disposition(name, download=download)},
        )
    raise HTTPException(404, "该集合没有原文件")


@router.get("/sources/{source_id}/chunks", response_model=list[ChunkOut])
def list_chunks(source_id: str, db: Session = Depends(get_db)) -> list[ChunkOut]:
    _source(db, source_id)
    rows = db.query(ChunkRow).filter(ChunkRow.source_id == source_id).order_by(ChunkRow.position).all()
    return [chunk_to_out(row) for row in rows]


@router.patch("/chunks/{chunk_id}", response_model=ChunkOut)
def patch_chunk(chunk_id: str, body: ChunkPatch, db: Session = Depends(get_db)) -> ChunkOut:
    row = db.get(ChunkRow, chunk_id)
    if not row:
        raise HTTPException(404, "数据不存在")
    if body.title is not None:
        row.title = body.title.strip()[:255] or row.title
    if body.text is not None:
        row.text = body.text
    if body.a is not None:
        row.answer = body.a or None
    if body.indexes is not None:
        row.indexes = body.indexes
    try:
        reindex_chunk(db, row)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    db.refresh(row)
    return chunk_to_out(row)


@router.post("/kbs/{kb_id}/search", response_model=SearchOut)
def search(kb_id: str, body: SearchIn, db: Session = Depends(get_db)) -> SearchOut:
    return search_kb(db, _kb(db, kb_id), body)
