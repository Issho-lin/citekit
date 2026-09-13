from pydantic import BaseModel


class SearchConfigIn(BaseModel):
    searchMode: str = "mix"
    similarity: float = 0.2
    limit: int = 20
    usingRerank: bool = False
    filterFirst: bool = False


class ToolEvalOut(BaseModel):
    cases: int = 0
    lastRunId: str | None = None
    lastRunAt: str | None = None
    passed: int = 0
    failed: int = 0
    total: int = 0
    ok: bool | None = None


class ToolOut(BaseModel):
    id: str
    name: str
    title: str
    description: str
    kbId: str
    sourceIds: list[str]
    search: SearchConfigIn
    profile: str
    requiredFilters: list[str]
    eval: ToolEvalOut = ToolEvalOut()


class ToolIn(BaseModel):
    name: str
    title: str
    description: str
    kbId: str
    sourceIds: list[str]
    search: SearchConfigIn = SearchConfigIn()


class ToolPatch(BaseModel):
    name: str | None = None
    title: str | None = None
    description: str | None = None
    sourceIds: list[str] | None = None
    search: SearchConfigIn | None = None


class ToolSearchIn(BaseModel):
    query: str
    warehouse: str | None = None
    debug: bool = False


class ToolSuggestIn(BaseModel):
    kbId: str
    sourceIds: list[str] = []
    excludeId: str | None = None


class ToolSuggestOut(BaseModel):
    title: str
    name: str
    description: str


class McpEndpointOut(BaseModel):
    id: str
    name: str
    env: str
    toolIds: list[str]
    url: str
    apiKey: str


class McpEndpointIn(BaseModel):
    name: str
    env: str = "dev"
    toolIds: list[str]


class McpEndpointPatch(BaseModel):
    name: str | None = None
    env: str | None = None
    toolIds: list[str] | None = None
