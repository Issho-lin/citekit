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
