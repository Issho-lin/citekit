from __future__ import annotations

import json
import re
from collections.abc import Iterator
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from citekit_server.calls.log import call_scope
from citekit_server.db import AiModelRow, McpEndpointRow, ToolRow
from citekit_server.kb.ingest import resolve_auth
from citekit_server.schemas import (
    AgentChatIn,
    AgentChatOut,
    AgentCitationOut,
    AgentStepOut,
    SearchOut,
)
from citekit_server.tools.logic import format_hits, mcp_tool_list_item, search_tool
from citekit_server.infra.upstream import iter_chat_messages

MAX_ROUNDS = 6
MAX_HISTORY = 24
ANSWER_CHUNK = 24

SYSTEM = """你是 Citekit 知识库助手，基于用户勾选的 MCP 检索工具回答。
规则：
1. 只能通过提供的检索工具查知识库，不要用训练知识编造库里没有的事实。
2. 根据工具描述选择最合适的一把或多把；相关主题可并行调用。
3. 工具参数 query 必须是独立完整问句，不要把多轮指代丢给检索。
4. 检索无命中就明确说没查到；不要反复无意义改写同一问句超过两次。
5. 回答结构：先用一两句直接回应用户问题，再补充必要要点；控制在简洁可读的篇幅。
6. 用自己的话概括，禁止整段照抄检索原文。
7. 引用编号与工具返回条目序号一致，写成 [1] 或 [1][2]，紧跟相关句子；不要写成「结果1」这种无括号形式。
8. 只标注真正用到的编号；回答末尾不要再列参考文献清单。
"""

RECOVER = (
    "请只根据上面工具返回的检索结果作答。"
    "先用一两句直接回答用户问题，再用自己的话概括要点，不要整段照抄原文列表。"
    "引用必须写成 [1][2] 这种方括号形式，编号与工具返回条目序号一致。"
    "不要再调用工具，不要输出思考标签。"
)


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
    from citekit_server.catalog.logic import ensure_workspace

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


def _citations_from_search(
    out: SearchOut,
    *,
    tool_name: str,
) -> list[AgentCitationOut]:
    """UI 引用用；正文与编号对齐 MCP format_hits（从 1 起）。不做截断。"""
    citations: list[AgentCitationOut] = []
    for index, hit in enumerate(out.hits, start=1):
        chunk = hit.chunk
        body = chunk.a.strip() if chunk.a else chunk.text
        citations.append(
            AgentCitationOut(
                id=index,
                tool=tool_name,
                title=chunk.title or "未命名片段",
                locator=chunk.locator or "",
                text=(body or "").strip(),
                score=float(hit.score or 0),
                sourceId=chunk.sourceId or "",
            )
        )
    return citations


def _split_thinking(content: str, reasoning: str) -> tuple[str, str]:
    think = (reasoning or "").strip()
    text = content or ""
    match = re.search(r"<think>([\s\S]*?)</think>", text, re.I)
    if match:
        think = (think + "\n" + match.group(1)).strip() if think else match.group(1).strip()
        text = (text[: match.start()] + text[match.end() :]).strip()
    text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.I).strip()
    return text, think


def _has_retrieval_hits(steps: list[AgentStepOut]) -> bool:
    return any(step.ok and (step.preview or "").strip() and step.preview.strip() != "无命中。" for step in steps)


def _chunk_text(text: str, size: int = ANSWER_CHUNK) -> Iterator[str]:
    if not text:
        return
    for i in range(0, len(text), size):
        yield text[i : i + size]


def _event(kind: str, **payload: Any) -> dict[str, Any]:
    return {"type": kind, **payload}


def _iter_llm(
    model: AiModelRow,
    auth: str,
    history: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None,
    tool_choice: str | dict[str, Any] | None,
    thinking: bool,
) -> Iterator[dict[str, Any]]:
    content = ""
    reasoning = ""
    calls: list[dict[str, Any]] = []
    streamed = False
    for event in iter_chat_messages(
        model,
        auth,
        history,
        tools=tools,
        tool_choice=tool_choice,
        max_tokens=1600,
        timeout=90,
        thinking=thinking,
    ):
        kind = event.get("type")
        if kind == "token":
            text = str(event.get("text") or "")
            if not text:
                continue
            if not streamed:
                yield _event("status", message="正在整理回答…")
                streamed = True
            content += text
            yield _event("token", text=text)
        elif kind == "thinking":
            text = str(event.get("text") or "")
            if text:
                reasoning += text
                yield _event("thinking", text=text)
        elif kind == "message":
            calls = list(event.get("tool_calls") or [])
            if not content:
                content = str(event.get("content") or "")
            if not reasoning:
                reasoning = str(event.get("reasoning") or "")
    content, think = _split_thinking(content, reasoning)
    if think and think not in reasoning:
        yield _event("thinking", text=think)
        reasoning = (reasoning + "\n" + think).strip()
    if content and not streamed and not calls:
        for piece in _chunk_text(content):
            yield _event("token", text=piece)
        streamed = True
    yield _event(
        "llm_done",
        content=content.strip(),
        thinking=reasoning.strip(),
        tool_calls=calls,
        streamed=streamed,
    )


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
            has_hits = _has_retrieval_hits(steps)
            force_answer = has_hits or round_index >= MAX_ROUNDS - 1
            yield _event("status", message="正在整理回答…" if force_answer else "正在选择工具…")
            done = None
            with call_scope(purpose="agent", kb_id=kb_id):
                for event in _iter_llm(
                    model,
                    auth,
                    history,
                    tools=None if force_answer else openai_tools,
                    tool_choice="none" if force_answer else "auto",
                    thinking=not force_answer,
                ):
                    if event.get("type") == "llm_done":
                        done = event
                    else:
                        yield event
            content = str((done or {}).get("content") or "")
            think = str((done or {}).get("thinking") or "")
            calls = list((done or {}).get("tool_calls") or []) if not force_answer else []
            streamed = bool((done or {}).get("streamed"))
            if think:
                thinking_parts.append(think)

            if force_answer or not calls:
                answer = content.strip()
                if not answer and _has_retrieval_hits(steps):
                    yield _event("status", message="正在根据检索结果整理回答…")
                    recover_history = [*history, {"role": "user", "content": RECOVER}]
                    with call_scope(purpose="agent", kb_id=kb_id):
                        recover = None
                        for event in _iter_llm(
                            model,
                            auth,
                            recover_history,
                            tools=None,
                            tool_choice="none",
                            thinking=False,
                        ):
                            if event.get("type") == "llm_done":
                                recover = event
                            else:
                                yield event
                    answer = str((recover or {}).get("content") or "").strip()
                    extra_think = str((recover or {}).get("thinking") or "").strip()
                    if extra_think:
                        thinking_parts.append(extra_think)
                    streamed = streamed or bool((recover or {}).get("streamed"))
                if not answer:
                    if _has_retrieval_hits(steps):
                        answer = "检索已有命中，但模型未能整理成回答。请重试，或换一个文本理解模型。"
                    elif steps:
                        answer = "检索未找到足够相关的内容。请换一种问法，或检查所选 MCP / 工具范围。"
                    else:
                        answer = "模型没有给出回答。"
                    if not streamed:
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
                    # 与 MCP tools/call 一致：原样返回 format_hits，不做 Agent 层截断/改写
                    preview = format_hits(out)
                    citations = _citations_from_search(out, tool_name=name)
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
