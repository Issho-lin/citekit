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
    debug: bool = False


class HitTrace(BaseModel):
    lexicalRank: int | None = None
    lexicalScore: float | None = None
    vectorRank: int | None = None
    vectorScore: float | None = None
    vectorKind: str = ""
    vectorDropped: bool = False
    fusedRank: int | None = None
    fusedScore: float | None = None
    rerankScore: float | None = None


class SearchDropped(BaseModel):
    title: str
    locator: str
    reason: str
    lexicalRank: int | None = None
    vectorRank: int | None = None
    vectorScore: float | None = None


class SearchDebug(BaseModel):
    lexicalCount: int = 0
    vectorCount: int = 0
    vectorDroppedCount: int = 0
    fusedCount: int = 0
    reranked: bool = False
    dropped: list[SearchDropped] = []


class SearchHit(BaseModel):
    chunk: ChunkOut
    score: float
    note: str
    trace: HitTrace | None = None


class SearchOut(BaseModel):
    hits: list[SearchHit]
    message: str | None = None
    debug: SearchDebug | None = None
