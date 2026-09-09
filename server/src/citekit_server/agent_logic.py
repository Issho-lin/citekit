from __future__ import annotations

import json
import re
from collections.abc import Iterator
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from citekit_server.call_log import call_scope
from citekit_server.db import AiModelRow, McpEndpointRow, ToolRow
from citekit_server.ingest import resolve_auth
from citekit_server.schemas import (
    AgentChatIn,
    AgentChatOut,
    AgentCitationOut,
    AgentStepOut,
    SearchOut,
)
from citekit_server.tools_logic import mcp_tool_list_item, search_tool
from citekit_server.upstream import chat_messages

MAX_ROUNDS = 6
MAX_HISTORY = 24
MAX_TOOL_CHARS = 6000
MAX_CITATION_CHARS = 360
ANSWER_CHUNK = 24

SYSTEM = """你是 Citekit 知识库助手，基于用户勾选的 MCP 检索工具回答。
规则：
1. 只能通过提供的检索工具查知识库，不要用训练知识编造条文或事实。
2. 根据工具描述选择最合适的一把或多把；相关主题可并行调用。
3. 工具参数 query 必须是独立完整问句，不要把多轮指代丢给检索。
4. 检索无命中就明确说没查到，并说明可能搜错了工具或问法；不要反复无意义改写同一问句超过两次。
5. 有命中时用自己的话回答，并在相关句子后标注引用编号，例如 [1][2]，编号必须与工具返回中的编号一致。
6. 不要原样粘贴整段检索结果；回答末尾不要再列参考文献清单。
"""


def _resolve_endpoint_ids(body: AgentChatIn) -> list[str]:
    ids = [item.strip() for item in (body.endpointIds or []) if item and item.strip()]
    if not ids and body.endpointId:
        ids = [body.endpointId.strip()]
    # 去重保序
    seen: set[str] = set()
    out: list[str] = []
    for item in ids:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out


def _pick_model(db: Session, model_id: str | None) -> AiModelRow:
    wanted = (model_id or "").strip()
    if wanted:
        row = db.get(AiModelRow, wanted)
        if not row:
            raise HTTPException(400, "所选模型不存在")
        if not row.is_active:
            raise HTTPException(400, "所选模型已停用")
        if row.type not in {"llm", "vlm"}:
            raise HTTPException(400, "请选择文本理解模型")
        return row
    from citekit_server.workspace_logic import ensure_workspace

    ws = ensure_workspace(db)
    fallback = (ws.llm_model or "").strip()
    if fallback:
        row = db.get(AiModelRow, fallback)
        if row and row.is_active and row.type in {"llm", "vlm"}:
            return row
        if row and not row.is_active:
            raise HTTPException(400, "工作空间的文本理解模型已停用，请改选模型")
    row = (
        db.query(AiModelRow)
        .filter(AiModelRow.type == "llm", AiModelRow.is_active.is_(True))
        .first()
    )
    if not row:
        raise HTTPException(400, "请先在设置中配置文本理解模型")
    return row


def _load_endpoints(db: Session, ids: list[str]) -> list[McpEndpointRow]:
    if not ids:
        raise HTTPException(400, "请至少选择一个 MCP 端点")
    rows = db.query(McpEndpointRow).filter(McpEndpointRow.id.in_(ids)).all()
    by_id = {row.id: row for row in rows}
    missing = [item for item in ids if item not in by_id]
    if missing:
        raise HTTPException(404, "有 MCP 端点不存在")
    return [by_id[item] for item in ids]


def _listed_tools(db: Session, endpoints: list[McpEndpointRow]) -> list[tuple[McpEndpointRow, ToolRow]]:
    pairs: list[tuple[McpEndpointRow, ToolRow]] = []
    seen_names: set[str] = set()
    for endpoint in endpoints:
        ids = list(endpoint.tool_ids or [])
        if not ids:
            continue
        rows = db.query(ToolRow).filter(ToolRow.id.in_(ids)).all()
        by_id = {row.id: row for row in rows}
        for tid in ids:
            tool = by_id.get(tid)
            if not tool:
                continue
            if tool.name in seen_names:
                continue
            seen_names.add(tool.name)
            pairs.append((endpoint, tool))
    if not pairs:
        raise HTTPException(400, "所选端点白名单是空的，先勾选工具再对话")
    return pairs


def _openai_tools(pairs: list[tuple[McpEndpointRow, ToolRow]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for endpoint, row in pairs:
        item = mcp_tool_list_item(row)
        desc = item["description"] or row.title
        if endpoint.name:
            desc = f"[{endpoint.name}] {desc}"
        out.append(
            {
                "type": "function",
                "function": {
                    "name": item["name"],
                    "description": desc,
                    "parameters": item["inputSchema"],
                },
            }
        )
    return out


def _parse_args(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {"query": text}
    return data if isinstance(data, dict) else {"query": str(data)}


def _excerpt(text: str, limit: int = MAX_CITATION_CHARS) -> str:
    compact = re.sub(r"\s+", " ", (text or "").strip())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1] + "…"


def _citations_from_search(
    out: SearchOut,
    *,
    tool_name: str,
    start_id: int,
) -> tuple[list[AgentCitationOut], int]:
    citations: list[AgentCitationOut] = []
    next_id = start_id
    for hit in out.hits:
        chunk = hit.chunk
        body = chunk.a.strip() if chunk.a else chunk.text
        citations.append(
            AgentCitationOut(
                id=next_id,
                tool=tool_name,
                title=chunk.title or "未命名片段",
                locator=chunk.locator or "",
                text=_excerpt(body),
                score=float(hit.score or 0),
                sourceId=chunk.sourceId or "",
            )
        )
        next_id += 1
    return citations, next_id


def _format_hits_for_model(out: SearchOut, citations: list[AgentCitationOut]) -> str:
    if out.message and not out.hits:
        return out.message
    lines: list[str] = []
    if out.message:
        lines.append(out.message)
    for item in citations:
        head = f"[{item.id}] {item.title}"
        if item.score:
            head += f"（相关度 {item.score:.2f}）"
        lines.append(head)
        lines.append(item.text)
        if item.locator:
            lines.append(f"定位：{item.locator}")
        lines.append("")
    text = "\n".join(lines).strip() or "无命中。"
    if len(text) > MAX_TOOL_CHARS:
        text = text[:MAX_TOOL_CHARS] + "\n…（已截断）"
    return text


def _split_thinking(content: str, reasoning: str) -> tuple[str, str]:
    think = (reasoning or "").strip()
    text = content or ""
    match = re.search(r"<think>([\s\S]*?)</think>", text, re.I)
    if match:
        think = (think + "\n" + match.group(1)).strip() if think else match.group(1).strip()
        text = (text[: match.start()] + text[match.end() :]).strip()
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.I).strip()
    return text, think


def _chunk_text(text: str, size: int = ANSWER_CHUNK) -> Iterator[str]:
    if not text:
        return
    for i in range(0, len(text), size):
        yield text[i : i + size]


def _event(kind: str, **payload: Any) -> dict[str, Any]:
    return {"type": kind, **payload}


def iter_agent_events(db: Session, body: AgentChatIn) -> Iterator[dict[str, Any]]:
    endpoint_ids = _resolve_endpoint_ids(body)
    endpoints = _load_endpoints(db, endpoint_ids)
    pairs = _listed_tools(db, endpoints)
    tools = [tool for _, tool in pairs]
    tool_by_name = {tool.name: (endpoint, tool) for endpoint, tool in pairs}
    model = _pick_model(db, body.modelId)
    auth = resolve_auth(db, model)

    history: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM}]
    for item in body.messages[-MAX_HISTORY:]:
        if item.role not in {"user", "assistant"}:
            continue
        text = (item.content or "").strip()
        if text:
            history.append({"role": item.role, "content": text})
    if not history or history[-1]["role"] != "user":
        raise HTTPException(400, "请先输入问题")

    openai_tools = _openai_tools(pairs)
    steps: list[AgentStepOut] = []
    all_citations: list[AgentCitationOut] = []
    next_cite_id = 1
    thinking_parts: list[str] = []
    kb_id = tools[0].kb_id if tools else None

    yield _event(
        "status",
        message=f"使用 {model.name or model.id} · {len(pairs)} 把工具",
        modelId=model.id,
        modelName=model.name or model.id,
        toolCount=len(pairs),
    )

    try:
        for round_index in range(MAX_ROUNDS):
            force_answer = round_index == MAX_ROUNDS - 1
            yield _event("status", message="正在思考…" if force_answer else "正在选择工具…")
            with call_scope(purpose="agent", kb_id=kb_id):
                reply = chat_messages(
                    model,
                    auth,
                    history,
                    tools=None if force_answer else openai_tools,
                    tool_choice="none" if force_answer else "auto",
                    max_tokens=1600,
                    timeout=90,
                    thinking=True,
                )
            calls = reply["tool_calls"] if not force_answer else []
            content, think = _split_thinking(reply.get("content") or "", reply.get("reasoning") or "")
            if think:
                thinking_parts.append(think)
                yield _event("thinking", text=think)

            if not calls:
                answer = content or ("工具调用次数已达上限，请根据已有检索结果作答。" if force_answer else "模型没有给出回答。")
                if force_answer and not content and steps:
                    # 再强制一轮纯文本（已在本轮 tool_choice=none）；若仍空则拼兜底
                    answer = content or "根据已检索到的内容，我暂时无法整理出完整答案。请换一种问法，或检查工具命中。"
                for piece in _chunk_text(answer):
                    yield _event("token", text=piece)
                yield _event(
                    "done",
                    answer=answer,
                    thinking="\n\n".join(thinking_parts).strip(),
                    steps=[step.model_dump() for step in steps],
                    citations=[item.model_dump() for item in all_citations],
                )
                return

            history.append(
                {
                    "role": "assistant",
                    "content": content,
                    "tool_calls": calls,
                }
            )
            for call in calls:
                fn = call.get("function") or {}
                name = str(fn.get("name") or "")
                arguments = _parse_args(str(fn.get("arguments") or ""))
                query = str(arguments.get("query") or "").strip()
                warehouse = str(arguments.get("warehouse") or "").strip() or None
                call_id = str(call.get("id") or f"call_{len(steps)}")
                endpoint, tool = tool_by_name.get(name, (None, None))
                endpoint_id = endpoint.id if endpoint else ""
                endpoint_name = endpoint.name if endpoint else ""

                yield _event(
                    "tool_start",
                    id=call_id,
                    tool=name or "unknown",
                    query=query,
                    endpointId=endpoint_id,
                    endpointName=endpoint_name,
                )

                if not tool:
                    preview = f"工具不在白名单：{name}"
                    is_error = True
                    citations: list[AgentCitationOut] = []
                elif not query:
                    preview = "缺少 query"
                    is_error = True
                    citations = []
                else:
                    out = search_tool(db, tool, query, warehouse)
                    citations, next_cite_id = _citations_from_search(
                        out, tool_name=name, start_id=next_cite_id
                    )
                    preview = _format_hits_for_model(out, citations)
                    is_error = bool(out.message and not out.hits)
                    all_citations.extend(citations)

                step = AgentStepOut(
                    tool=name or "unknown",
                    query=query,
                    ok=not is_error,
                    preview=preview,
                    endpointId=endpoint_id,
                    endpointName=endpoint_name,
                    citations=citations,
                )
                steps.append(step)
                yield _event(
                    "tool_result",
                    id=call_id,
                    tool=step.tool,
                    query=step.query,
                    ok=step.ok,
                    preview=step.preview,
                    endpointId=endpoint_id,
                    endpointName=endpoint_name,
                    citations=[item.model_dump() for item in citations],
                )
                history.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id"),
                        "name": name,
                        "content": preview,
                    }
                )

        # 理论上不会到这里：最后一轮 force_answer 已 return
        yield _event(
            "done",
            answer="对话中断，请重试。",
            thinking="\n\n".join(thinking_parts).strip(),
            steps=[step.model_dump() for step in steps],
            citations=[item.model_dump() for item in all_citations],
        )
    except RuntimeError as exc:
        yield _event("error", message=str(exc))


def run_agent(db: Session, body: AgentChatIn) -> AgentChatOut:
    answer = ""
    thinking = ""
    steps: list[AgentStepOut] = []
    citations: list[AgentCitationOut] = []
    error: str | None = None
    for event in iter_agent_events(db, body):
        kind = event.get("type")
        if kind == "token":
            answer += str(event.get("text") or "")
        elif kind == "done":
            answer = str(event.get("answer") or answer)
            thinking = str(event.get("thinking") or "")
            steps = [AgentStepOut.model_validate(item) for item in (event.get("steps") or [])]
            citations = [AgentCitationOut.model_validate(item) for item in (event.get("citations") or [])]
        elif kind == "error":
            error = str(event.get("message") or "对话失败")
    if error:
        raise RuntimeError(error)
    return AgentChatOut(answer=answer, thinking=thinking, steps=steps, citations=citations)
