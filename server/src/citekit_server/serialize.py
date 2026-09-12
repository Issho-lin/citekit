from citekit_server.kb.chunking import chunk_title
from citekit_server.infra.protocol import protocol_of
from citekit_server.secretbox import mask_secret
from citekit_server.db import AiModelRow, ChunkRow, KnowledgeBaseRow, McpCallRow, ModelCallRow, ProviderRow, SourceRow, WorkspaceRow
from citekit_server.schemas import (
    AiModelIn,
    AiModelOut,
    ChunkOut,
    KnowledgeBaseOut,
    McpCallOut,
    McpCallSummary,
    ModelCallOut,
    ModelCallSummary,
    ProcessConfigIn,
    ProviderOut,
    SourceOut,
    WorkspaceOut,
)


def model_to_out(row: AiModelRow) -> AiModelOut:
    kind = "llm" if row.type == "vlm" else row.type
    vision = True if row.type == "vlm" else row.vision
    return AiModelOut(
        model=row.id,
        name=row.name,
        type=kind,  # type: ignore[arg-type]
        provider=row.provider,
        isActive=row.is_active,
        isCustom=row.is_custom,
        vision=vision,
        multimodal=row.multimodal,
        toolChoice=row.tool_choice,
        maxContext=row.max_context,
        maxResponse=row.max_response,
        maxToken=row.max_token,
        defaultToken=row.default_token,
        batchSize=row.batch_size,
        normalization=row.normalization,
        requestUrl=row.request_url,
        requestAuth=mask_secret(row.request_auth),
        hasRequestAuth=bool((row.request_auth or "").strip()),
        mappedModel=row.mapped_model,
    )


def apply_model_in(row: AiModelRow, data: AiModelIn) -> None:
    row.name = data.name
    row.type = data.type
    row.provider = data.provider
    row.is_active = data.isActive
    row.is_custom = data.isCustom
    row.vision = data.vision
    row.multimodal = data.multimodal
    row.tool_choice = data.toolChoice
    row.max_context = data.maxContext
    row.max_response = data.maxResponse
    row.max_token = data.maxToken
    row.default_token = data.defaultToken
    row.batch_size = data.batchSize
    row.normalization = data.normalization
    row.request_url = data.requestUrl
    row.mapped_model = data.mappedModel


def provider_to_out(row: ProviderRow) -> ProviderOut:
    proto = protocol_of(row.id)
    return ProviderOut(
        id=row.id,
        name=row.name,
        avatar=row.avatar,
        order=row.sort_order,
        isVisible=row.is_visible,
        defaultBaseUrl=row.default_base_url or "",
        hasApiKey=bool((row.api_key or "").strip()),
        rerankUrlTip=proto.rerank_url_tip,
        embeddingUrlTip=proto.embedding_url_tip,
    )


def workspace_to_out(row: WorkspaceRow) -> WorkspaceOut:
    return WorkspaceOut(
        llmModel=row.llm_model,
        vectorModel=row.vector_model,
        vlmModel=row.vlm_model,
        rerankModel=row.rerank_model,
        rewriteFallback=row.rewrite_fallback,
    )


def kb_to_out(row: KnowledgeBaseRow, doc_count: int = 0) -> KnowledgeBaseOut:
    return KnowledgeBaseOut(
        id=row.id,
        name=row.name,
        domain=row.domain or "",
        description=row.description or "",
        docCount=doc_count,
        kind=row.kind,
        parentId=row.parent_id,
        websiteUrl=row.website_url,
        websiteSelector=row.website_selector,
        apiDatasetServer=row.api_dataset_server,
        vectorModel=row.vector_model,
        llmModel=row.llm_model,
        vlmModel=row.vlm_model,
        rerankModel=row.rerank_model,
        searchMode=row.search_mode,
        similarity=row.similarity,
        limit=row.limit,
        usingRerank=row.using_rerank,
    )


def source_to_out(row: SourceRow) -> SourceOut:
    process = ProcessConfigIn.model_validate(row.process or {})
    data = process.model_dump()
    return SourceOut(
        id=row.id,
        kbId=row.kb_id,
        parentId=row.parent_id,
        type=row.type,
        title=row.title,
        locator=row.locator or "",
        acl=row.acl,
        status=row.status,
        errorMessage=row.error_message,
        updatedAt=row.updated_at,
        chunkCount=row.chunk_count,
        **data,
        fileId=row.file_id,
        hasOriginal=bool(row.file_id or (row.raw_text or "").strip()),
    )


def chunk_to_out(row: ChunkRow) -> ChunkOut:
    return ChunkOut(
        id=row.id,
        sliceId="",
        sourceId=row.source_id,
        title=chunk_title(row.text or "", row.title or "") or row.title,
        text=row.text,
        locator=row.locator,
        a=row.answer,
        indexes=row.indexes,
    )


def call_to_summary(row: ModelCallRow) -> ModelCallSummary:
    return ModelCallSummary(
        id=row.id,
        createdAt=row.created_at,
        modelId=row.model_id,
        modelName=row.model_name,
        mappedModel=row.mapped_model,
        type=row.model_type,
        provider=row.provider,
        purpose=row.purpose,
        kind=row.kind,
        method=row.method,
        url=row.url,
        httpStatus=row.http_status,
        ok=row.ok,
        latencyMs=row.latency_ms,
        error=row.error,
        kbId=row.kb_id,
        sourceId=row.source_id,
        promptTokens=row.prompt_tokens,
        completionTokens=row.completion_tokens,
        totalTokens=row.total_tokens,
        summary=row.summary or "",
    )


def call_to_out(row: ModelCallRow) -> ModelCallOut:
    data = call_to_summary(row).model_dump()
    return ModelCallOut(**data, request=row.request_body, response=row.response_body)


def mcp_call_to_summary(row: McpCallRow) -> McpCallSummary:
    return McpCallSummary(
        id=row.id,
        createdAt=row.created_at,
        endpointId=row.endpoint_id,
        endpointName=row.endpoint_name,
        env=row.env,
        method=row.method,
        toolId=row.tool_id,
        toolName=row.tool_name,
        query=row.query or "",
        warehouse=row.warehouse,
        httpStatus=row.http_status,
        ok=row.ok,
        latencyMs=row.latency_ms,
        error=row.error,
        hitCount=row.hit_count,
        summary=row.summary or "",
        clientIp=row.client_ip or "",
        clientRegion=row.client_region or "",
    )


def mcp_call_to_out(row: McpCallRow) -> McpCallOut:
    data = mcp_call_to_summary(row).model_dump()
    return McpCallOut(**data, request=row.request_body, response=row.response_body)
