from typing import Any, Literal

from pydantic import BaseModel, model_validator


class ProcessConfigIn(BaseModel):
    trainingType: Literal["chunk", "qa"] = "chunk"
    chunkTriggerType: Literal["minSize", "maxSize", "forceChunk"] = "minSize"
    chunkTriggerMinSize: int = 100
    indexPrefixTitle: bool = False
    indexChunkTitle: bool = True
    autoIndexes: bool = False
    imageIndex: bool = False
    imageIndexMode: Literal["auto", "transcribe", "extract"] = "auto"
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
    indexChunkTitle: bool = True
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
