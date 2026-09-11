from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from citekit_server.db import EvalCaseRow, McpEndpointRow, ToolRow, get_db
from citekit_server.eval_logic import eval_summaries, get_run, list_runs, require_prod_ready, run_evals
from citekit_server.schemas import (
    EvalBatchRunOut,
    EvalCaseIn,
    EvalCaseOut,
    EvalRunIn,
    EvalRunOut,
    McpEndpointIn,
    McpEndpointOut,
    McpEndpointPatch,
    SearchOut,
    ToolIn,
    ToolOut,
    ToolPatch,
    ToolSearchIn,
    ToolSuggestIn,
    ToolSuggestOut,
)
from citekit_server.tools_logic import (
    endpoint_url,
    forget_tool,
    mcp_tool_list_item,
    new_api_key,
    require_kb,
    require_tool,
    search_config_of,
    search_tool,
    suggest_tool_meta,
    tool_to_out,
    validate_sources,
    validate_tool_name,
)

router = APIRouter(prefix="/api")


def _endpoint_out(row: McpEndpointRow) -> McpEndpointOut:
    return McpEndpointOut(
        id=row.id,
        name=row.name,
        env=row.env,
        toolIds=list(row.tool_ids or []),
        url=endpoint_url(row.id),
        apiKey=row.api_key,
    )


def _eval_out(row: EvalCaseRow) -> EvalCaseOut:
    return EvalCaseOut(
        id=row.id,
        query=row.query,
        toolId=row.tool_id,
        expect=row.expect,
        warehouse=row.warehouse,
    )


def _require_endpoint(db: Session, endpoint_id: str) -> McpEndpointRow:
    row = db.get(McpEndpointRow, endpoint_id)
    if not row:
        raise HTTPException(404, "端点不存在")
    return row


def _require_tools(db: Session, tool_ids: list[str], *, allow_empty: bool = False) -> list[str]:
    ids = [item for item in tool_ids if item]
    if not ids:
        if allow_empty:
            return []
        raise HTTPException(400, "至少勾选一把工具")
    found = {row.id for row in db.query(ToolRow).filter(ToolRow.id.in_(ids)).all()}
    missing = [item for item in ids if item not in found]
    if missing:
        raise HTTPException(400, "白名单里有不存在的工具")
    return ids


@router.get("/tools", response_model=list[ToolOut])
def list_tools(db: Session = Depends(get_db)) -> list[ToolOut]:
    rows = db.query(ToolRow).order_by(ToolRow.title).all()
    summaries = eval_summaries(db, [row.id for row in rows])
    return [tool_to_out(row, summaries.get(row.id)) for row in rows]


@router.post("/tools", response_model=ToolOut)
def create_tool(body: ToolIn, db: Session = Depends(get_db)) -> ToolOut:
    name = validate_tool_name(body.name, db)
    title = body.title.strip()
    description = body.description.strip()
    if not title or not description:
        raise HTTPException(400, "请填写标题和描述")
    require_kb(db, body.kbId)
    source_ids = validate_sources(db, body.kbId, body.sourceIds)
    search = search_config_of(body.search.model_dump())
    row = ToolRow(
        id=new_id("tool"),
        name=name,
        title=title,
        description=description,
        kb_id=body.kbId,
        source_ids=source_ids,
        search=search.model_dump(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return tool_to_out(row)


@router.post("/tools/suggest", response_model=ToolSuggestOut)
def suggest_tool(body: ToolSuggestIn, db: Session = Depends(get_db)) -> ToolSuggestOut:
    try:
        title, name, description = suggest_tool_meta(db, body)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    return ToolSuggestOut(title=title, name=name, description=description)


@router.get("/tools/{tool_id}", response_model=ToolOut)
def get_tool(tool_id: str, db: Session = Depends(get_db)) -> ToolOut:
    row = require_tool(db, tool_id)
    return tool_to_out(row, eval_summaries(db, [row.id]).get(row.id))


@router.patch("/tools/{tool_id}", response_model=ToolOut)
def patch_tool(tool_id: str, body: ToolPatch, db: Session = Depends(get_db)) -> ToolOut:
    row = require_tool(db, tool_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        row.name = validate_tool_name(data["name"], db, exclude_id=row.id)
    if "title" in data and data["title"] is not None:
        title = data["title"].strip()
        if not title:
            raise HTTPException(400, "请填写标题")
        row.title = title
    if "description" in data and data["description"] is not None:
        description = data["description"].strip()
        if not description:
            raise HTTPException(400, "空描述不能发布")
        row.description = description
    if "sourceIds" in data and data["sourceIds"] is not None:
        row.source_ids = validate_sources(db, row.kb_id, data["sourceIds"])
        flag_modified(row, "source_ids")
    if "search" in data and data["search"] is not None:
        current = search_config_of(row.search)
        row.search = current.model_copy(update=data["search"]).model_dump()
        flag_modified(row, "search")
    db.commit()
    db.refresh(row)
    return tool_to_out(row)


@router.delete("/tools/{tool_id}")
def delete_tool(tool_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    require_tool(db, tool_id)
    forget_tool(db, tool_id)
    db.commit()
    return {"ok": True}


@router.post("/tools/{tool_id}/search", response_model=SearchOut)
def search_with_tool(tool_id: str, body: ToolSearchIn, db: Session = Depends(get_db)) -> SearchOut:
    tool = require_tool(db, tool_id)
    return search_tool(db, tool, body.query, body.warehouse)


@router.get("/mcp-endpoints", response_model=list[McpEndpointOut])
def list_endpoints(db: Session = Depends(get_db)) -> list[McpEndpointOut]:
    rows = db.query(McpEndpointRow).order_by(McpEndpointRow.name).all()
    return [_endpoint_out(row) for row in rows]


@router.post("/mcp-endpoints", response_model=McpEndpointOut)
def create_endpoint(body: McpEndpointIn, db: Session = Depends(get_db)) -> McpEndpointOut:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "请填写名称")
    env = body.env if body.env in {"dev", "prod"} else "dev"
    tool_ids = _require_tools(db, body.toolIds)
    if env == "prod":
        require_prod_ready(db, tool_ids)
    row = McpEndpointRow(
        id=new_id("mcp"),
        name=name,
        env=env,
        tool_ids=tool_ids,
        api_key=new_api_key(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _endpoint_out(row)


@router.get("/mcp-endpoints/{endpoint_id}", response_model=McpEndpointOut)
def get_endpoint(endpoint_id: str, db: Session = Depends(get_db)) -> McpEndpointOut:
    return _endpoint_out(_require_endpoint(db, endpoint_id))


@router.patch("/mcp-endpoints/{endpoint_id}", response_model=McpEndpointOut)
def patch_endpoint(
    endpoint_id: str,
    body: McpEndpointPatch,
    db: Session = Depends(get_db),
) -> McpEndpointOut:
    row = _require_endpoint(db, endpoint_id)
    data = body.model_dump(exclude_unset=True)
    previous_env = row.env
    previous_tools = list(row.tool_ids or [])
    if "name" in data and data["name"] is not None:
        name = data["name"].strip()
        if not name:
            raise HTTPException(400, "请填写名称")
        row.name = name
    if "env" in data and data["env"] is not None:
        if data["env"] not in {"dev", "prod"}:
            raise HTTPException(400, "环境只能是 dev 或 prod")
        row.env = data["env"]
    if "toolIds" in data and data["toolIds"] is not None:
        row.tool_ids = _require_tools(db, data["toolIds"], allow_empty=True)
        flag_modified(row, "tool_ids")
    next_tools = list(row.tool_ids or [])
    added = [item for item in next_tools if item not in previous_tools]
    if row.env == "prod" and (previous_env != "prod" or added):
        require_prod_ready(db, next_tools)
    db.commit()
    db.refresh(row)
    return _endpoint_out(row)


@router.delete("/mcp-endpoints/{endpoint_id}")
def delete_endpoint(endpoint_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    row = _require_endpoint(db, endpoint_id)
    db.delete(row)
    db.commit()
    return {"ok": True}


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


@router.get("/mcp-endpoints/{endpoint_id}/tools-list")
def preview_tools_list(endpoint_id: str, db: Session = Depends(get_db)) -> dict:
    row = _require_endpoint(db, endpoint_id)
    tools = db.query(ToolRow).filter(ToolRow.id.in_(row.tool_ids or [])).all()
    by_id = {item.id: item for item in tools}
    listed = [by_id[tid] for tid in (row.tool_ids or []) if tid in by_id]
    return {"tools": [mcp_tool_list_item(item) for item in listed]}
