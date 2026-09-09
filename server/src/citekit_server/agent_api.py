from __future__ import annotations

import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from citekit_server.agent_logic import iter_agent_events, run_agent
from citekit_server.db import get_db
from citekit_server.schemas import AgentChatIn, AgentChatOut

router = APIRouter(prefix="/api")


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/agent/chat", response_model=AgentChatOut)
def agent_chat(body: AgentChatIn, db: Session = Depends(get_db)) -> AgentChatOut:
    try:
        return run_agent(db, body)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/agent/chat/stream")
def agent_chat_stream(body: AgentChatIn, db: Session = Depends(get_db)) -> StreamingResponse:
    def generate() -> Iterator[str]:
        try:
            for event in iter_agent_events(db, body):
                yield _sse(event)
                if event.get("type") in {"done", "error"}:
                    break
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
            yield _sse({"type": "error", "message": detail})
        except Exception as exc:  # noqa: BLE001 — surface to client
            yield _sse({"type": "error", "message": str(exc) or "对话失败"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
