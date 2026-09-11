from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, model_validator


ModelType = Literal["llm", "embedding", "rerank"]


def _fold_vlm(data: Any) -> Any:
    if isinstance(data, dict) and data.get("type") == "vlm":
        return {**data, "type": "llm", "vision": True}
    return data


class SecretEnvelope(BaseModel):
    wrappedKey: str
    iv: str
    ciphertext: str


class AiModelOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    model: str
    name: str
    type: ModelType
    provider: str
    isActive: bool
    isCustom: bool
    vision: bool | None = None
    multimodal: bool | None = None
    toolChoice: bool | None = None
    maxContext: int | None = None
    maxResponse: int | None = None
    maxToken: int | None = None
    defaultToken: int | None = None
    batchSize: int | None = None
    normalization: bool | None = None
    requestUrl: str | None = None
    requestAuth: str | None = None
    hasRequestAuth: bool = False
    mappedModel: str | None = None


class AiModelIn(BaseModel):
    model: str
    name: str
    type: ModelType
    provider: str = "OpenAI"
    isActive: bool = True
    isCustom: bool = True
    vision: bool | None = None
    multimodal: bool | None = None
    toolChoice: bool | None = None
    maxContext: int | None = None
    maxResponse: int | None = None
    maxToken: int | None = None
    defaultToken: int | None = None
    batchSize: int | None = None
    normalization: bool | None = None
    requestUrl: str | None = None
    requestAuthEnc: SecretEnvelope | None = None
    mappedModel: str | None = None

    @model_validator(mode="before")
    @classmethod
    def fold_vlm(cls, data: Any) -> Any:
        return _fold_vlm(data)


class AiModelPatch(BaseModel):
    model: str | None = None
    name: str | None = None
    type: ModelType | None = None
    provider: str | None = None
    isActive: bool | None = None
    vision: bool | None = None
    multimodal: bool | None = None
    toolChoice: bool | None = None
    maxContext: int | None = None
    maxResponse: int | None = None
    maxToken: int | None = None
    defaultToken: int | None = None
    batchSize: int | None = None
    normalization: bool | None = None
    requestUrl: str | None = None
    requestAuthEnc: SecretEnvelope | None = None
    mappedModel: str | None = None

    @model_validator(mode="before")
    @classmethod
    def fold_vlm(cls, data: Any) -> Any:
        return _fold_vlm(data)


class WorkspaceOut(BaseModel):
    llmModel: str
    vectorModel: str
    vlmModel: str
    rerankModel: str
    rewriteFallback: bool


class WorkspacePatch(BaseModel):
    llmModel: str | None = None
    vectorModel: str | None = None
    vlmModel: str | None = None
    rerankModel: str | None = None
    rewriteFallback: bool | None = None


class ProviderOut(BaseModel):
    id: str
    name: str
    avatar: str
    order: int
    isVisible: bool
    defaultBaseUrl: str = ""
    hasApiKey: bool = False
    rerankUrlTip: str = ""
    embeddingUrlTip: str = ""


class TestOut(BaseModel):
    ok: bool
    ms: int
    message: str


class ProviderPatch(BaseModel):
    apiKeyEnc: SecretEnvelope | None = None
    clearApiKey: bool = False


class DiscoverIn(BaseModel):
    baseUrl: str = ""
    apiKeyEnc: SecretEnvelope | None = None
    modelId: str | None = None
    providerId: str | None = None


class DiscoverOut(BaseModel):
    ids: list[str]


class PublicKeyOut(BaseModel):
    pem: str


class ProcessConfigIn(BaseModel):
    trainingType: Literal["chunk", "qa"] = "chunk"
    chunkTriggerType: Literal["minSize", "maxSize", "forceChunk"] = "minSize"
    chunkTriggerMinSize: int = 100
    indexPrefixTitle: bool = False
    autoIndexes: bool = False
    imageIndex: bool = False
    chunkSettingMode: Literal["auto", "custom"] = "auto"
    chunkSplitMode: Literal["paragraph", "size", "char"] = "paragraph"
    paragraphChunkAIMode: Literal["auto", "forbid", "force"] = "auto"
    paragraphChunkDeep: int = 5
    chunkSize: int = 1000
    chunkSplitter: str = ""
    indexSize: int = 512
    qaPrompt: str = ""
    pdfEnhance: bool = False
    webSelector: str = ""
    chunkOverlap: int = 0
    qaEnhance: bool = False
    customSplit: str = ""
    useChildIndex: bool = False

    @model_validator(mode="before")
    @classmethod
    def _infer_child_index(cls, data: Any) -> Any:
        if not isinstance(data, dict) or "useChildIndex" in data:
            return data
        qa = data.get("trainingType") == "qa" or data.get("qaEnhance")
        custom = data.get("chunkSettingMode") == "custom"
        return {**data, "useChildIndex": bool(custom and not qa)}


class KnowledgeBaseOut(BaseModel):
    id: str
    name: str
    domain: str = ""
    description: str = ""
    docCount: int = 0
    kind: str
    parentId: str | None = None
    websiteUrl: str | None = None
    websiteSelector: str | None = None
    apiDatasetServer: dict | None = None
    vectorModel: str = ""
    llmModel: str = ""
    vlmModel: str = ""
    rerankModel: str = ""
    searchMode: str = "mix"
    similarity: float = 0.2
    limit: int = 20
    usingRerank: bool = False


class KnowledgeBaseIn(BaseModel):
    name: str
    domain: str = ""
    description: str = ""
    kind: str = "dataset"
    parentId: str | None = None
    websiteUrl: str | None = None
    websiteSelector: str | None = None
    apiDatasetServer: dict | None = None
    vectorModel: str | None = None
    llmModel: str | None = None
    vlmModel: str | None = None
    rerankModel: str | None = None


class KnowledgeBasePatch(BaseModel):
    name: str | None = None
    domain: str | None = None
    description: str | None = None
    parentId: str | None = None
    websiteUrl: str | None = None
    websiteSelector: str | None = None
    apiDatasetServer: dict | None = None
    vectorModel: str | None = None
    llmModel: str | None = None
    vlmModel: str | None = None
    rerankModel: str | None = None
    searchMode: str | None = None
    similarity: float | None = None
    limit: int | None = None
    usingRerank: bool | None = None


class SourceOut(BaseModel):
    id: str
    kbId: str
    parentId: str | None = None
    type: str
    title: str
    locator: str
    acl: str = "internal"
    status: str
    errorMessage: str | None = None
    updatedAt: str
    chunkCount: int = 0
    trainingType: str = "chunk"
    chunkTriggerType: str = "minSize"
    chunkTriggerMinSize: int = 100
    indexPrefixTitle: bool = False
    autoIndexes: bool = False
    imageIndex: bool = False
    chunkSettingMode: str = "auto"
    chunkSplitMode: str = "paragraph"
    paragraphChunkAIMode: str = "auto"
    paragraphChunkDeep: int = 5
    chunkSize: int = 1000
    chunkSplitter: str = ""
    indexSize: int = 512
    qaPrompt: str = ""
    pdfEnhance: bool = False
    webSelector: str = ""
    chunkOverlap: int = 0
    qaEnhance: bool = False
    customSplit: str = ""
    useChildIndex: bool = False
    fileId: str | None = None
    hasOriginal: bool = False


class SourceIn(BaseModel):
    type: str = "upload"
    title: str
    parentId: str | None = None
    fileId: str | None = None
    rawText: str | None = None
    locator: str | None = None
    process: ProcessConfigIn | None = None


class SourcePatch(BaseModel):
    title: str | None = None
    process: ProcessConfigIn | None = None


class ChunkOut(BaseModel):
    id: str
    sliceId: str = ""
    sourceId: str
    title: str
    text: str
    locator: str
    a: str | None = None
    indexes: list[dict] | None = None


class ChunkPatch(BaseModel):
    title: str | None = None
    text: str | None = None
    a: str | None = None
    indexes: list[dict] | None = None


class FileOut(BaseModel):
    id: str
    name: str
    size: int


class OriginalFileText(BaseModel):
    name: str
    mime: str
    size: int
    text: str


class PreviewIn(BaseModel):
    fileId: str | None = None
    rawText: str | None = None
    process: ProcessConfigIn | None = None


class PreviewChunk(BaseModel):
    title: str
    text: str
    chars: int = 0
    answer: str = ""
    indexes: list[dict] = []


class PreviewOut(BaseModel):
    chunks: list[PreviewChunk]
    total: int
    shown: int = 0
    parsedText: str = ""
    parsedTruncated: bool = False
    parsedChars: int = 0
    applied: str = ""
    notes: list[str] = []
    minChars: int = 0
    maxChars: int = 0
    avgChars: int = 0
    oversize: int = 0
    chunkSize: int = 1000
    indexCount: int = 0


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


class EvalHitOut(BaseModel):
    title: str = ""
    locator: str = ""
    score: float = 0


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
    items: list[EvalRunItemOut] = []


class EvalRunIn(BaseModel):
    toolId: str | None = None


class EvalBatchRunOut(BaseModel):
    runs: list[EvalRunOut]
    failed: int


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
