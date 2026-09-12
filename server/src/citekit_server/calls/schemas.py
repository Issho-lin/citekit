from typing import Any

from pydantic import BaseModel


class ModelCallSummary(BaseModel):
    id: str
    createdAt: str
    modelId: str
    modelName: str
    mappedModel: str | None = None
    type: str
    provider: str
    purpose: str
    kind: str
    method: str
    url: str
    httpStatus: int | None = None
    ok: bool
    latencyMs: int
    error: str | None = None
    kbId: str | None = None
    sourceId: str | None = None
    promptTokens: int | None = None
    completionTokens: int | None = None
    totalTokens: int | None = None
    summary: str = ""


class ModelCallOut(ModelCallSummary):
    request: Any = None
    response: Any = None


class ModelCallListOut(BaseModel):
    items: list[ModelCallSummary]
    total: int


class McpCallSummary(BaseModel):
    id: str
    createdAt: str
    endpointId: str
    endpointName: str
    env: str = ""
    method: str
    toolId: str | None = None
    toolName: str = ""
    query: str = ""
    warehouse: str | None = None
    httpStatus: int | None = None
    ok: bool
    latencyMs: int
    error: str | None = None
    hitCount: int | None = None
    summary: str = ""
    clientIp: str = ""
    clientRegion: str = ""


class McpCallOut(McpCallSummary):
    request: Any = None
    response: Any = None


class McpCallListOut(BaseModel):
    items: list[McpCallSummary]
    total: int
