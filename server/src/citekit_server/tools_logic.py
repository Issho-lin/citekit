from __future__ import annotations

import re
import secrets

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from citekit_server.call_log import call_scope
from citekit_server.chunking import parse_model_json
from citekit_server.config import settings
from citekit_server.db import AiModelRow, KnowledgeBaseRow, McpEndpointRow, SourceRow, ToolRow
from citekit_server.ingest import chat_model, resolve_auth
from citekit_server.retrieve import search_kb
from citekit_server.schemas import SearchConfigIn, SearchIn, SearchOut, ToolEvalOut, ToolOut, ToolSuggestIn
from citekit_server.upstream import chat_completion

_TOOL_NAME = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{1,63}$")


def search_config_of(raw: dict | None) -> SearchConfigIn:
    data = SearchConfigIn.model_validate(raw or {})
    data.filterFirst = False
    return data


def profile_of(_search: SearchConfigIn) -> str:
    return "hybrid_balanced"


def filters_of(_search: SearchConfigIn) -> list[str]:
    return []


def tool_to_out(row: ToolRow, eval_summary: ToolEvalOut | None = None) -> ToolOut:
    search = search_config_of(row.search)
    return ToolOut(
        id=row.id,
        name=row.name,
        title=row.title,
        description=row.description or "",
        kbId=row.kb_id,
        sourceIds=list(row.source_ids or []),
        search=search,
        profile=profile_of(search),
        requiredFilters=filters_of(search),
        eval=eval_summary or ToolEvalOut(),
    )


def endpoint_url(endpoint_id: str) -> str:
    return f"{settings.public_url.rstrip('/')}/mcp/{endpoint_id}"


def new_api_key() -> str:
    return f"ck_{secrets.token_urlsafe(24)}"


def validate_tool_name(name: str, db: Session, *, exclude_id: str | None = None) -> str:
    value = (name or "").strip()
    if not _TOOL_NAME.match(value):
        raise HTTPException(400, "调用名需为字母开头的英文、数字或下划线，例如 search_refund_policy")
    q = db.query(ToolRow).filter(ToolRow.name == value)
    if exclude_id:
        q = q.filter(ToolRow.id != exclude_id)
    if q.first():
        raise HTTPException(400, "调用名已存在")
    return value


def normalize_tool_name(raw: str) -> str:
    text = (raw or "").strip().strip("`\"'")
    lines = text.splitlines()
    text = lines[0].strip() if lines else ""
    match = re.search(r"search_[a-zA-Z0-9_]+", text, re.I)
    if not match:
        match = re.search(r"[a-zA-Z][a-zA-Z0-9_]{1,63}", text)
    value = match.group(0) if match else text
    value = re.sub(r"[^a-zA-Z0-9_]", "", value.replace("-", "_")).lower()
    value = re.sub(r"_+", "_", value).strip("_")
    if not value:
        return ""
    if value[0].isdigit():
        value = f"search_{value}"
    return value[:64]


def uniquify_tool_name(db: Session, name: str, *, exclude_id: str | None = None) -> str:
    if not _TOOL_NAME.match(name):
        raise HTTPException(400, "模型没有给出合法调用名")
    q = db.query(ToolRow.name)
    if exclude_id:
        q = q.filter(ToolRow.id != exclude_id)
    taken = {item for (item,) in q.all()}
    if name not in taken:
        return name
    for i in range(2, 50):
        suffix = f"_{i}"
        candidate = f"{name[: 64 - len(suffix)]}{suffix}"
        if candidate not in taken and _TOOL_NAME.match(candidate):
            return candidate
    raise HTTPException(400, "调用名已存在")


_META_PROMPT = """你是 MCP 检索工具的文案助手。根据知识库和勾选集合，一次生成标题、调用名和描述。

只返回 JSON 对象，不要 markdown，不要解释。键必须是 title、name、description。

title：给人看的中文短名，不超过 20 字，例如「民法典检索」
name：英文调用名，以 search_ 开头，只能含小写字母、数字、下划线，长度 2 到 64，例如 search_civil_code。不要使用这些已占用名字：{taken}
description：给 Agent 看的中文，2 到 4 句，不超过 240 字。覆盖下面列出的全部集合，不要漏掉，也不要只写其中一份文件。若同库已有其他工具，写清本工具不覆盖什么；没有其他工具时不要虚构「去调用别的工具」。不要写调用方法、参数或示例问句堆砌。

知识库：{kb}
领域：{domain}
知识库说明：{kb_desc}
集合：{sources}
同库已有工具：
{siblings}
"""


def _suggest_llm(db: Session, body: ToolSuggestIn) -> tuple[KnowledgeBaseRow, AiModelRow, str, list[str]]:
    kb = require_kb(db, body.kbId)
    try:
        model = chat_model(db, kb)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not model:
        raise HTTPException(400, "请先为知识库选择可用的文本理解模型")
    auth = resolve_auth(db, model)
    source_titles: list[str] = []
    if body.sourceIds:
        rows = (
            db.query(SourceRow)
            .filter(SourceRow.kb_id == kb.id, SourceRow.id.in_(body.sourceIds), SourceRow.type != "folder")
            .all()
        )
        source_titles = [row.title for row in rows if row.title]
    return kb, model, auth, source_titles


def _chat_suggest(model: AiModelRow, auth: str, prompt: str, *, purpose: str, kb_id: str, max_tokens: int) -> str:
    try:
        with call_scope(purpose=purpose, kb_id=kb_id):
            return chat_completion(model, auth, prompt, max_tokens=max_tokens, timeout=45, thinking=False)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc


def _sibling_lines(db: Session, kb_id: str, *, exclude_id: str | None = None) -> str:
    q = db.query(ToolRow).filter(ToolRow.kb_id == kb_id)
    if exclude_id:
        q = q.filter(ToolRow.id != exclude_id)
    rows = q.order_by(ToolRow.title).all()
    lines = []
    for row in rows[:12]:
        summary = (row.description or "").strip() or row.title
        lines.append(f"- {row.name}：{summary[:80]}")
    return "\n".join(lines) or "无"


def normalize_tool_description(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    text = text.strip("`\"' \n")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        raise HTTPException(400, "模型没有给出描述")
    return text[:800]


def suggest_tool_meta(db: Session, body: ToolSuggestIn) -> tuple[str, str, str]:
    kb, model, auth, source_titles = _suggest_llm(db, body)
    q = db.query(ToolRow.name)
    if body.excludeId:
        q = q.filter(ToolRow.id != body.excludeId)
    taken = [item for (item,) in q.all()]
    prompt = _META_PROMPT.format(
        taken="、".join(taken[:40]) or "无",
        kb=kb.name or "未命名",
        domain=(kb.domain or "").strip() or "未填",
        kb_desc=(kb.description or "").strip() or "未填",
        sources="、".join(source_titles[:12]) or "未勾选",
        siblings=_sibling_lines(db, kb.id, exclude_id=body.excludeId),
    )
    reply = _chat_suggest(model, auth, prompt, purpose="suggest_tool_meta", kb_id=kb.id, max_tokens=500)
    try:
        data = parse_model_json(reply)
    except ValueError as exc:
        raise HTTPException(400, "模型没有返回可用的标题和描述") from exc
    if not isinstance(data, dict):
        raise HTTPException(400, "模型没有返回可用的标题和描述")
    title = re.sub(r"\s+", " ", str(data.get("title") or "").strip())
    if not title:
        title = f"{kb.name}检索" if kb.name else "检索工具"
    title = title[:80]
    name = uniquify_tool_name(db, normalize_tool_name(str(data.get("name") or "")), exclude_id=body.excludeId)
    description = normalize_tool_description(str(data.get("description") or ""))
    return title, name, description


def validate_sources(db: Session, kb_id: str, source_ids: list[str]) -> list[str]:
    ids = [item for item in source_ids if item]
    if not ids:
        raise HTTPException(400, "至少勾选一个集合，否则工具没有可搜内容")
    rows = (
        db.query(SourceRow)
        .filter(SourceRow.kb_id == kb_id, SourceRow.id.in_(ids), SourceRow.type != "folder")
        .all()
    )
    found = {row.id for row in rows}
    missing = [item for item in ids if item not in found]
    if missing:
        raise HTTPException(400, "勾选的集合不属于该知识库，或不存在")
    return ids


def require_kb(db: Session, kb_id: str) -> KnowledgeBaseRow:
    row = db.get(KnowledgeBaseRow, kb_id)
    if not row:
        raise HTTPException(404, "知识库不存在")
    return row


def require_tool(db: Session, tool_id: str) -> ToolRow:
    row = db.get(ToolRow, tool_id)
    if not row:
        raise HTTPException(404, "工具不存在")
    return row


def tool_input_schema(row: ToolRow) -> dict:
    return {
        "type": "object",
        "required": ["query"],
        "properties": {
            "query": {"type": "string", "description": "独立完整问句，不要丢给平台做多轮改写"},
        },
    }


def mcp_tool_list_item(row: ToolRow) -> dict:
    return {
        "name": row.name,
        "description": row.description or "",
        "inputSchema": tool_input_schema(row),
    }


def search_tool(db: Session, tool: ToolRow, query: str, warehouse: str | None = None) -> SearchOut:
    search = search_config_of(tool.search)
    kb = require_kb(db, tool.kb_id)
    body = SearchIn(
        query=query,
        sourceIds=list(tool.source_ids or []),
        searchMode=search.searchMode,
        similarity=search.similarity,
        limit=search.limit,
        usingRerank=search.usingRerank,
    )
    return search_kb(db, kb, body)


def format_hits(out: SearchOut) -> str:
    if out.message and not out.hits:
        return out.message
    lines: list[str] = []
    if out.message:
        lines.append(out.message)
    for index, hit in enumerate(out.hits, start=1):
        chunk = hit.chunk
        head = f"{index}. {chunk.title}（{hit.score:.2f} · {hit.note}）"
        lines.append(head)
        if chunk.a:
            lines.append(f"问：{chunk.text}")
            lines.append(f"答：{chunk.a}")
        else:
            lines.append(chunk.text)
        if chunk.locator:
            lines.append(f"定位：{chunk.locator}")
        lines.append("")
    return "\n".join(lines).strip() or "无命中。"


def forget_tools_for_kbs(db: Session, kb_ids: list[str]) -> None:
    if not kb_ids:
        return
    tools = db.query(ToolRow).filter(ToolRow.kb_id.in_(kb_ids)).all()
    tool_ids = [row.id for row in tools]
    if not tool_ids:
        return
    from citekit_server.eval_logic import forget_eval_for_tools

    forget_eval_for_tools(db, tool_ids)
    drop = set(tool_ids)
    for ep in db.query(McpEndpointRow).all():
        kept = [item for item in (ep.tool_ids or []) if item not in drop]
        if kept != list(ep.tool_ids or []):
            ep.tool_ids = kept
            flag_modified(ep, "tool_ids")
    db.query(ToolRow).filter(ToolRow.id.in_(tool_ids)).delete(synchronize_session=False)


def forget_tool(db: Session, tool_id: str) -> None:
    from citekit_server.eval_logic import forget_eval_for_tools

    forget_eval_for_tools(db, [tool_id])
    for ep in db.query(McpEndpointRow).all():
        ids = list(ep.tool_ids or [])
        if tool_id not in ids:
            continue
        ep.tool_ids = [item for item in ids if item != tool_id]
        flag_modified(ep, "tool_ids")
    row = db.get(ToolRow, tool_id)
    if row:
        db.delete(row)
