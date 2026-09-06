from citekit_server.secretbox import mask_secret
from citekit_server.db import AiModelRow, ProviderRow, WorkspaceRow
from citekit_server.schemas import AiModelIn, AiModelOut, ProviderOut, WorkspaceOut


def model_to_out(row: AiModelRow) -> AiModelOut:
    return AiModelOut(
        model=row.id,
        name=row.name,
        type=row.type,  # type: ignore[arg-type]
        provider=row.provider,
        isActive=row.is_active,
        isCustom=row.is_custom,
        vision=row.vision,
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
    return ProviderOut(
        id=row.id,
        name=row.name,
        avatar=row.avatar,
        order=row.sort_order,
        isVisible=row.is_visible,
        defaultBaseUrl=row.default_base_url or "",
        hasApiKey=bool((row.api_key or "").strip()),
    )


def workspace_to_out(row: WorkspaceRow) -> WorkspaceOut:
    return WorkspaceOut(
        llmModel=row.llm_model,
        vectorModel=row.vector_model,
        vlmModel=row.vlm_model,
        rerankModel=row.rerank_model,
        rewriteFallback=row.rewrite_fallback,
    )
