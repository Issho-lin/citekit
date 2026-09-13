from __future__ import annotations

import re
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from citekit_server.db import EvalCaseRow, EvalRunItemRow, EvalRunRow, ToolRow
from citekit_server.ids import new_id
from citekit_server.schemas import EvalCaseOut, EvalHitOut, EvalRunItemOut, EvalRunOut, SearchConfigIn, ToolEvalOut


def _stamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def retrieve_of(raw: dict | None) -> SearchConfigIn | None:
    if not raw or not isinstance(raw, dict):
        return None
    return SearchConfigIn.model_validate(raw)


def retrieve_snapshot(search: SearchConfigIn) -> dict:
    return search.model_dump()


def retrieve_label(search: SearchConfigIn | None) -> str:
    if not search:
        return ""
    mode = "语义" if search.searchMode == "embedding" else "全文" if search.searchMode == "fullText" else "混合"
    bits = [f"{mode}检索", f"top-k {search.limit}"]
    if search.usingRerank:
        bits.append("重排")
    return " · ".join(bits)


def expect_hit(expect: str, title: str, locator: str, text: str) -> bool:
    needle = (expect or "").strip()
    if not needle:
        return False
    loc = locator or ""
    tit = title or ""
    if needle == loc or needle in loc:
        return True
    if needle in tit:
        return True
    compact = re.sub(r"\s+", "", needle)
    if len(compact) < 8:
        return False
    return needle in (text or "")


def _eval_hit(item: object) -> dict:
    chunk = getattr(item, "chunk", None)
    trace = getattr(item, "trace", None)
    return {
        "title": getattr(chunk, "title", "") or "",
        "locator": getattr(chunk, "locator", "") or "",
        "score": float(getattr(item, "score", 0) or 0),
        "lexicalRank": getattr(trace, "lexicalRank", None),
        "vectorRank": getattr(trace, "vectorRank", None),
        "vectorScore": getattr(trace, "vectorScore", None),
        "vectorDropped": bool(getattr(trace, "vectorDropped", False)),
        "fusedRank": getattr(trace, "fusedRank", None),
        "rerankScore": getattr(trace, "rerankScore", None),
    }


def _item_out(row: EvalRunItemRow) -> EvalRunItemOut:
    raw = row.hits if isinstance(row.hits, list) else []
    hits: list[EvalHitOut] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        hits.append(
            EvalHitOut(
                title=str(item.get("title") or ""),
                locator=str(item.get("locator") or ""),
                score=float(item.get("score") or 0),
                lexicalRank=item.get("lexicalRank"),
                vectorRank=item.get("vectorRank"),
                vectorScore=item.get("vectorScore"),
                vectorDropped=bool(item.get("vectorDropped")),
                fusedRank=item.get("fusedRank"),
                rerankScore=item.get("rerankScore"),
            )
        )
    return EvalRunItemOut(
        id=row.id,
        caseId=row.case_id,
        query=row.query,
        expect=row.expect,
        ok=row.ok,
        detail=row.detail,
        hits=hits,
    )


def run_out(run: EvalRunRow, items: list[EvalRunItemRow] | None = None) -> EvalRunOut:
    return EvalRunOut(
        id=run.id,
        toolId=run.tool_id,
        createdAt=run.created_at,
        passed=run.passed,
        failed=run.failed,
        total=run.total,
        ok=run.failed == 0 and run.total > 0,
        retrieve=retrieve_of(run.retrieve if isinstance(getattr(run, "retrieve", None), dict) else None),
        items=[_item_out(item) for item in (items or [])],
    )


def eval_summaries(db: Session, tool_ids: list[str]) -> dict[str, ToolEvalOut]:
    if not tool_ids:
        return {}
    counts = dict(
        db.query(EvalCaseRow.tool_id, func.count(EvalCaseRow.id))
        .filter(EvalCaseRow.tool_id.in_(tool_ids))
        .group_by(EvalCaseRow.tool_id)
        .all()
    )
    latest_ts = (
        db.query(EvalRunRow.tool_id, func.max(EvalRunRow.created_at))
        .filter(EvalRunRow.tool_id.in_(tool_ids))
        .group_by(EvalRunRow.tool_id)
        .all()
    )
    runs: dict[str, EvalRunRow] = {}
    for tool_id, ts in latest_ts:
        row = (
            db.query(EvalRunRow)
            .filter(EvalRunRow.tool_id == tool_id, EvalRunRow.created_at == ts)
            .order_by(EvalRunRow.id.desc())
            .first()
        )
        if row:
            runs[tool_id] = row
    out: dict[str, ToolEvalOut] = {}
    for tool_id in tool_ids:
        run = runs.get(tool_id)
        cases = int(counts.get(tool_id) or 0)
        out[tool_id] = ToolEvalOut(
            cases=cases,
            lastRunId=run.id if run else None,
            lastRunAt=run.created_at if run else None,
            passed=run.passed if run else 0,
            failed=run.failed if run else 0,
            total=run.total if run else 0,
            ok=None if not run else bool(run.failed == 0 and run.total > 0),
        )
    return out


def prod_block(db: Session, tool_ids: list[str]) -> str | None:
    ids = [item for item in tool_ids if item]
    if not ids:
        return "生产端点至少要有一把工具，并先通过评测"
    tools = {row.id: row for row in db.query(ToolRow).filter(ToolRow.id.in_(ids)).all()}
    summaries = eval_summaries(db, ids)
    blocked: list[str] = []
    for tid in ids:
        tool = tools.get(tid)
        name = tool.name if tool else tid
        summary = summaries.get(tid) or ToolEvalOut()
        if summary.cases <= 0:
            blocked.append(f"「{name}」还没有评测用例")
        elif summary.lastRunAt is None:
            blocked.append(f"「{name}」还没有跑过评测")
        elif summary.ok is not True:
            blocked.append(f"「{name}」最近一次评测未通过（{summary.passed}/{summary.total}）")
    if not blocked:
        return None
    return "不能标成 prod：" + "；".join(blocked)


def require_prod_ready(db: Session, tool_ids: list[str]) -> None:
    message = prod_block(db, tool_ids)
    if message:
        raise HTTPException(400, message)


def list_runs(db: Session, tool_id: str | None, limit: int = 10) -> list[EvalRunOut]:
    q = db.query(EvalRunRow).order_by(EvalRunRow.created_at.desc(), EvalRunRow.id.desc())
    if tool_id:
        q = q.filter(EvalRunRow.tool_id == tool_id)
    rows = q.limit(max(1, min(limit, 50))).all()
    if not rows:
        return []
    items = db.query(EvalRunItemRow).filter(EvalRunItemRow.run_id.in_([row.id for row in rows])).all()
    by_run: dict[str, list[EvalRunItemRow]] = {}
    for item in items:
        by_run.setdefault(item.run_id, []).append(item)
    return [run_out(row, by_run.get(row.id, [])) for row in rows]


def get_run(db: Session, run_id: str) -> EvalRunOut:
    row = db.get(EvalRunRow, run_id)
    if not row:
        raise HTTPException(404, "评测记录不存在")
    items = db.query(EvalRunItemRow).filter(EvalRunItemRow.run_id == row.id).all()
    return run_out(row, items)


def run_tool_eval(db: Session, tool: ToolRow) -> EvalRunOut:
    from citekit_server.tools.logic import require_kb, search_from_kb, search_tool

    cases = db.query(EvalCaseRow).filter(EvalCaseRow.tool_id == tool.id).order_by(EvalCaseRow.id.desc()).all()
    search = search_from_kb(require_kb(db, tool.kb_id))
    run = EvalRunRow(
        id=new_id("erun"),
        created_at=_stamp(),
        tool_id=tool.id,
        passed=0,
        failed=0,
        total=len(cases),
        retrieve=retrieve_snapshot(search),
    )
    db.add(run)
    db.flush()
    items: list[EvalRunItemRow] = []
    if not cases:
        run.failed = 0
        db.commit()
        db.refresh(run)
        return run_out(run, [])
    for case in cases:
        out = search_tool(db, tool, case.query, case.warehouse, debug=True)
        hits = [_eval_hit(item) for item in out.hits]
        if out.message and not out.hits:
            ok = False
            detail = out.message
        else:
            ok = any(
                expect_hit(case.expect, item.chunk.title, item.chunk.locator, item.chunk.text)
                for item in out.hits
            )
            titles = "、".join((item.chunk.title or item.chunk.locator or "未命名")[:40] for item in out.hits) or "无"
            detail = f"命中 {case.expect}" if ok else f"未命中，返回 {len(out.hits)} 条：{titles}"
        row = EvalRunItemRow(
            id=new_id("erit"),
            run_id=run.id,
            case_id=case.id,
            query=case.query,
            expect=case.expect,
            ok=ok,
            detail=detail,
            hits=hits,
        )
        db.add(row)
        items.append(row)
        if ok:
            run.passed += 1
        else:
            run.failed += 1
    db.commit()
    db.refresh(run)
    return run_out(run, items)


def run_evals(db: Session, tool_id: str | None) -> list[EvalRunOut]:
    if tool_id:
        tool = db.get(ToolRow, tool_id)
        if not tool:
            raise HTTPException(404, "工具不存在")
        return [run_tool_eval(db, tool)]
    tools = db.query(ToolRow).order_by(ToolRow.title).all()
    runs = []
    for tool in tools:
        count = db.query(EvalCaseRow).filter(EvalCaseRow.tool_id == tool.id).count()
        if count:
            runs.append(run_tool_eval(db, tool))
    return runs


def forget_eval_for_tools(db: Session, tool_ids: list[str]) -> None:
    if not tool_ids:
        return
    run_ids = [row.id for row in db.query(EvalRunRow.id).filter(EvalRunRow.tool_id.in_(tool_ids)).all()]
    if run_ids:
        db.query(EvalRunItemRow).filter(EvalRunItemRow.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(EvalRunRow).filter(EvalRunRow.id.in_(run_ids)).delete(synchronize_session=False)
    db.query(EvalCaseRow).filter(EvalCaseRow.tool_id.in_(tool_ids)).delete(synchronize_session=False)


_LOCATOR_LINE = re.compile(r"^定位：\s*(.+)\s*$", re.M)


def case_from_mcp_call(db: Session, call_id: str) -> EvalCaseOut:
    from citekit_server.calls.tables import McpCallRow

    row = db.get(McpCallRow, call_id)
    if not row:
        raise HTTPException(404, "调用记录不存在")
    if row.method != "tools/call":
        raise HTTPException(400, "只能从「调用工具」的记录出题")
    if not row.tool_id:
        raise HTTPException(400, "记录里没有工具，无法出题")
    tool = db.get(ToolRow, row.tool_id)
    if not tool:
        raise HTTPException(400, "记录里的工具已删除")
    query = (row.query or "").strip()
    if not query:
        raise HTTPException(400, "记录里没有问句")
    expect = _expect_from_mcp_response(row.response_body)
    if not expect:
        raise HTTPException(400, "这次调用没有定位，无法自动填写应召回。请到评测页手写。")
    if len(expect) > 255:
        expect = expect[:255]
    warehouse = _warehouse_from_mcp_request(row.request_body)
    existing = (
        db.query(EvalCaseRow)
        .filter(
            EvalCaseRow.tool_id == tool.id,
            EvalCaseRow.query == query,
            EvalCaseRow.expect == expect,
        )
        .first()
    )
    if existing:
        return EvalCaseOut(
            id=existing.id,
            query=existing.query,
            toolId=existing.tool_id,
            expect=existing.expect,
            warehouse=existing.warehouse,
        )
    case = EvalCaseRow(
        id=new_id("ev"),
        query=query,
        tool_id=tool.id,
        expect=expect,
        warehouse=warehouse,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return EvalCaseOut(
        id=case.id,
        query=case.query,
        toolId=case.tool_id,
        expect=case.expect,
        warehouse=case.warehouse,
    )


def _warehouse_from_mcp_request(body: object) -> str | None:
    if not isinstance(body, dict):
        return None
    params = body.get("params") if isinstance(body.get("params"), dict) else {}
    arguments = params.get("arguments") if isinstance(params.get("arguments"), dict) else {}
    value = str(arguments.get("warehouse") or "").strip()
    return value or None


def _expect_from_mcp_response(body: object) -> str:
    text = _mcp_response_text(body)
    match = _LOCATOR_LINE.search(text)
    if match:
        return match.group(1).strip()
    return ""


def _mcp_response_text(body: object) -> str:
    if not isinstance(body, dict):
        return ""
    result = body.get("result")
    if not isinstance(result, dict):
        return ""
    content = result.get("content")
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for item in content:
        if isinstance(item, dict) and isinstance(item.get("text"), str):
            parts.append(item["text"])
    return "\n".join(parts)
