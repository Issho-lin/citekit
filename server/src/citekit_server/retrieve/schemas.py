from citekit_server.kb.schemas import ChunkOut
from pydantic import BaseModel


class SearchIn(BaseModel):
    query: str
    sourceIds: list[str] | None = None
    searchMode: str = "mix"
    similarity: float = 0.2
    limit: int = 20
    usingRerank: bool = False
    warehouse: str | None = None


class SearchHit(BaseModel):
    chunk: ChunkOut
    score: float
    note: str


class SearchOut(BaseModel):
    hits: list[SearchHit]
    message: str | None = None
