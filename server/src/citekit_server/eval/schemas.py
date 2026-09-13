from pydantic import BaseModel

from citekit_server.tools.schemas import SearchConfigIn


class EvalCaseOut(BaseModel):
    id: str
    query: str
    toolId: str
    expect: str
    warehouse: str | None = None


class EvalCaseIn(BaseModel):
    query: str
    toolId: str
    expect: str
    warehouse: str | None = None


class EvalCaseFromMcpIn(BaseModel):
    callId: str


class EvalHitOut(BaseModel):
    title: str = ""
    locator: str = ""
    score: float = 0
    lexicalRank: int | None = None
    vectorRank: int | None = None
    vectorScore: float | None = None
    vectorDropped: bool = False
    fusedRank: int | None = None
    rerankScore: float | None = None


class EvalRunItemOut(BaseModel):
    id: str
    caseId: str | None = None
    query: str = ""
    expect: str = ""
    ok: bool
    detail: str
    hits: list[EvalHitOut] = []


class EvalRunOut(BaseModel):
    id: str
    toolId: str
    createdAt: str
    passed: int
    failed: int
    total: int
    ok: bool
    retrieve: SearchConfigIn | None = None
    vectorError: str | None = None
    items: list[EvalRunItemOut] = []


class EvalRunIn(BaseModel):
    toolId: str | None = None


class EvalBatchRunOut(BaseModel):
    runs: list[EvalRunOut]
    failed: int
