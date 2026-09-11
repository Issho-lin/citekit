from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from citekit_server.db import EvalCaseRow, get_db
from citekit_server.eval.logic import get_run, list_runs, run_evals
from citekit_server.ids import new_id
from citekit_server.schemas import (
    EvalBatchRunOut,
    EvalCaseIn,
    EvalCaseOut,
    EvalRunIn,
    EvalRunOut,
)
from citekit_server.tools.logic import require_tool

router = APIRouter(prefix="/api")


def _eval_out(row: EvalCaseRow) -> EvalCaseOut:
    return EvalCaseOut(
        id=row.id,
        query=row.query,
        toolId=row.tool_id,
        expect=row.expect,
        warehouse=row.warehouse,
    )


@router.get("/eval-cases", response_model=list[EvalCaseOut])
def list_eval_cases(toolId: str | None = None, db: Session = Depends(get_db)) -> list[EvalCaseOut]:
    q = db.query(EvalCaseRow).order_by(EvalCaseRow.id.desc())
    if toolId:
        q = q.filter(EvalCaseRow.tool_id == toolId)
    return [_eval_out(row) for row in q.all()]


@router.post("/eval-cases", response_model=EvalCaseOut)
def create_eval_case(body: EvalCaseIn, db: Session = Depends(get_db)) -> EvalCaseOut:
    query = body.query.strip()
    expect = body.expect.strip()
    if not query or not expect:
        raise HTTPException(400, "请填写问句和应命中定位")
    tool = require_tool(db, body.toolId)
    row = EvalCaseRow(
        id=new_id("ev"),
        query=query,
        tool_id=tool.id,
        expect=expect,
        warehouse=(body.warehouse or "").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _eval_out(row)


@router.delete("/eval-cases/{case_id}")
def delete_eval_case(case_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    row = db.get(EvalCaseRow, case_id)
    if not row:
        raise HTTPException(404, "用例不存在")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/eval-cases/run", response_model=EvalBatchRunOut)
def run_eval_cases(body: EvalRunIn = EvalRunIn(), db: Session = Depends(get_db)) -> EvalBatchRunOut:
    tool_id = (body.toolId or "").strip() or None
    runs = run_evals(db, tool_id)
    return EvalBatchRunOut(runs=runs, failed=sum(item.failed for item in runs))


@router.get("/eval-runs", response_model=list[EvalRunOut])
def list_eval_runs(toolId: str | None = None, limit: int = 10, db: Session = Depends(get_db)) -> list[EvalRunOut]:
    return list_runs(db, toolId, limit)


@router.get("/eval-runs/{run_id}", response_model=EvalRunOut)
def get_eval_run(run_id: str, db: Session = Depends(get_db)) -> EvalRunOut:
    return get_run(db, run_id)
