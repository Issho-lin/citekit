from pydantic import BaseModel


class AgentChatMessage(BaseModel):
    role: str
    content: str


class AgentChatIn(BaseModel):
    messages: list[AgentChatMessage]
    endpointIds: list[str] = []
    endpointId: str | None = None  # 兼容旧入参
    modelId: str | None = None


class AgentCitationOut(BaseModel):
    id: int
    tool: str
    title: str
    locator: str = ""
    text: str
    score: float = 0
    sourceId: str = ""


class AgentStepOut(BaseModel):
    tool: str
    query: str
    ok: bool
    preview: str
    endpointId: str = ""
    endpointName: str = ""
    citations: list[AgentCitationOut] = []


class AgentChatOut(BaseModel):
    answer: str
    thinking: str = ""
    steps: list[AgentStepOut] = []
    citations: list[AgentCitationOut] = []
