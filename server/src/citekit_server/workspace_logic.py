from sqlalchemy.orm import Session

from citekit_server.db import AiModelRow, WorkspaceRow


def ensure_workspace(db: Session) -> WorkspaceRow:
    row = db.get(WorkspaceRow, 1)
    if row:
        return row
    row = WorkspaceRow(id=1)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _matches(row: AiModelRow, kind: str) -> bool:
    if kind == "vlm":
        return row.type == "vlm" or (row.type == "llm" and bool(row.vision))
    return row.type == kind


def pick_fallback(db: Session, leaving: AiModelRow) -> None:
    workspace = ensure_workspace(db)
    slots = (
        ("llm_model", "llm"),
        ("vector_model", "embedding"),
        ("vlm_model", "vlm"),
        ("rerank_model", "rerank"),
    )
    for column, kind in slots:
        if getattr(workspace, column) != leaving.id:
            continue
        nxt = (
            db.query(AiModelRow)
            .filter(AiModelRow.id != leaving.id, AiModelRow.is_active.is_(True))
            .all()
        )
        found = next((item.id for item in nxt if _matches(item, kind)), "")
        setattr(workspace, column, found)


def retarget_model_id(db: Session, old_id: str, new_id: str) -> None:
    workspace = ensure_workspace(db)
    for column in ("llm_model", "vector_model", "vlm_model", "rerank_model"):
        if getattr(workspace, column) == old_id:
            setattr(workspace, column, new_id)
