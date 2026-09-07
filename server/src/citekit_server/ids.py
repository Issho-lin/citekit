from __future__ import annotations

import uuid


def new_id(prefix: str, width: int = 12) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:width]}"


def new_uuid() -> str:
    return str(uuid.uuid4())
