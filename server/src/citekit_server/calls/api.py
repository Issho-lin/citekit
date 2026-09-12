from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from citekit_server.calls.log import prune_model_calls
from citekit_server.calls.mcp_log import prune_mcp_calls
from citekit_server.db import McpCallRow, ModelCallRow, get_db
from citekit_server.schemas import McpCallListOut, McpCallOut, ModelCallListOut, ModelCallOut
from citekit_server.serialize import call_to_out, call_to_summary, mcp_call_to_out, mcp_call_to_summary

router = APIRouter(prefix="/api")


@router.get("/model-calls", response_model=ModelCallListOut)
def list_model_calls(
    model_id: str | None = Query(None, alias="modelId"),
    model_type: str | None = Query(None, alias="type"),
    purpose: str | None = None,
    ok: bool | None = None,
    day_from: str | None = Query(None, alias="from"),
    day_to: str | None = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> ModelCallListOut:
    prune_model_calls(db)
    db.commit()
    query = db.query(ModelCallRow).filter(ModelCallRow.kind != "models", ModelCallRow.purpose != "discover")
    if model_id:
        query = query.filter(ModelCallRow.model_id == model_id)
    if model_type:
        query = query.filter(ModelCallRow.model_type == model_type)
    if purpose:
        query = query.filter(ModelCallRow.purpose == purpose)
    if ok is not None:
        query = query.filter(ModelCallRow.ok.is_(ok))
    start = (day_from or "").strip()
    end = (day_to or "").strip()
    if start:
        query = query.filter(ModelCallRow.created_at >= start)
    if end:
        query = query.filter(ModelCallRow.created_at < end)
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


@router.get("/mcp-calls", response_model=McpCallListOut)
def list_mcp_calls(
    endpoint_id: str | None = Query(None, alias="endpointId"),
    method: str | None = None,
    ok: bool | None = None,
    day_from: str | None = Query(None, alias="from"),
    day_to: str | None = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> McpCallListOut:
    prune_mcp_calls(db)
    db.commit()
    query = db.query(McpCallRow)
    if endpoint_id:
        query = query.filter(McpCallRow.endpoint_id == endpoint_id)
    if method:
        query = query.filter(McpCallRow.method == method)
    if ok is not None:
        query = query.filter(McpCallRow.ok.is_(ok))
    start = (day_from or "").strip()
    end = (day_to or "").strip()
    if start:
        query = query.filter(McpCallRow.created_at >= start)
    if end:
        query = query.filter(McpCallRow.created_at < end)
    total = query.count()
    rows = query.order_by(McpCallRow.created_at.desc(), McpCallRow.id.desc()).offset(offset).limit(limit).all()
    return McpCallListOut(items=[mcp_call_to_summary(row) for row in rows], total=total)


@router.get("/mcp-calls/{call_id}", response_model=McpCallOut)
def get_mcp_call(call_id: str, db: Session = Depends(get_db)) -> McpCallOut:
    row = db.get(McpCallRow, call_id)
    if not row:
        raise HTTPException(404, "记录不存在")
    return mcp_call_to_out(row)


@router.delete("/mcp-calls")
def clear_mcp_calls(db: Session = Depends(get_db)) -> dict[str, bool | int]:
    deleted = db.query(McpCallRow).delete()
    db.commit()
    return {"ok": True, "deleted": int(deleted)}