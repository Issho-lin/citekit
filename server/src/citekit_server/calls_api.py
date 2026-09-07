from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from citekit_server.db import ModelCallRow, get_db
from citekit_server.schemas import ModelCallListOut, ModelCallOut
from citekit_server.serialize import call_to_out, call_to_summary

router = APIRouter(prefix="/api")


@router.get("/model-calls", response_model=ModelCallListOut)
def list_model_calls(
    model_id: str | None = Query(None, alias="modelId"),
    model_type: str | None = Query(None, alias="type"),
    purpose: str | None = None,
    ok: bool | None = None,
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> ModelCallListOut:
    query = db.query(ModelCallRow)
    if model_id:
        query = query.filter(ModelCallRow.model_id == model_id)
    if model_type:
        query = query.filter(ModelCallRow.model_type == model_type)
    if purpose:
        query = query.filter(ModelCallRow.purpose == purpose)
    if ok is not None:
        query = query.filter(ModelCallRow.ok.is_(ok))
    needle = (q or "").strip()
    if needle:
        like = f"%{needle}%"
        query = query.filter(
            or_(
                ModelCallRow.model_id.like(like),
                ModelCallRow.model_name.like(like),
                ModelCallRow.mapped_model.like(like),
                ModelCallRow.summary.like(like),
                ModelCallRow.error.like(like),
                ModelCallRow.url.like(like),
            )
        )
    total = query.count()
    rows = query.order_by(ModelCallRow.created_at.desc(), ModelCallRow.id.desc()).offset(offset).limit(limit).all()
    return ModelCallListOut(items=[call_to_summary(row) for row in rows], total=total)


@router.get("/model-calls/{call_id}", response_model=ModelCallOut)
def get_model_call(call_id: str, db: Session = Depends(get_db)) -> ModelCallOut:
    row = db.get(ModelCallRow, call_id)
    if not row:
        raise HTTPException(404, "记录不存在")
    return call_to_out(row)


@router.delete("/model-calls")
def clear_model_calls(db: Session = Depends(get_db)) -> dict[str, bool | int]:
    deleted = db.query(ModelCallRow).delete()
    db.commit()
    return {"ok": True, "deleted": int(deleted)}