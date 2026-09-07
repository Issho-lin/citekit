from sqlalchemy import update
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from citekit_server.db import AiModelRow, ProviderRow, WorkspaceRow, get_db
from citekit_server.schemas import (
    AiModelIn,
    AiModelOut,
    AiModelPatch,
    DiscoverIn,
    DiscoverOut,
    PublicKeyOut,
    ProviderOut,
    ProviderPatch,
    SecretEnvelope,
    TestOut,
    WorkspaceOut,
    WorkspacePatch,
)
from citekit_server.serialize import (
    apply_model_in,
    model_to_out,
    provider_to_out,
    workspace_to_out,
)
from citekit_server.upstream import list_remote_models, test_model
from citekit_server.secretbox import decrypt_envelope, public_pem
from citekit_server.workspace_logic import ensure_workspace, pick_fallback, retarget_model_id

router = APIRouter(prefix="/api")


def unwrap_secret(enc: SecretEnvelope | None) -> str:
    if enc is None:
        raise HTTPException(400, "请填写 API 密钥")
    try:
        return decrypt_envelope(enc.wrappedKey, enc.iv, enc.ciphertext).strip()
    except Exception:
        raise HTTPException(400, "密钥密文无效")


def provider_api_key(db: Session, provider_id: str | None) -> str:
    if not provider_id:
        return ""
    row = db.get(ProviderRow, provider_id)
    return (row.api_key or "").strip() if row else ""


def resolve_model_auth(db: Session, model: AiModelRow) -> str:
    return (model.request_auth or "").strip() or provider_api_key(db, model.provider)


@router.get("/crypto/public-key", response_model=PublicKeyOut)
def crypto_public_key() -> PublicKeyOut:
    return PublicKeyOut(pem=public_pem())


@router.get("/providers", response_model=list[ProviderOut])
def list_providers(db: Session = Depends(get_db)) -> list[ProviderOut]:
    rows = db.query(ProviderRow).order_by(ProviderRow.sort_order, ProviderRow.id).all()
    return [provider_to_out(row) for row in rows]


@router.patch("/providers/{provider_id}", response_model=ProviderOut)
def patch_provider(provider_id: str, body: ProviderPatch, db: Session = Depends(get_db)) -> ProviderOut:
    row = db.get(ProviderRow, provider_id)
    if not row:
        raise HTTPException(404, "供应商不存在")
    if body.clearApiKey:
        row.api_key = ""
    elif body.apiKeyEnc is not None:
        secret = unwrap_secret(body.apiKeyEnc)
        if secret:
            row.api_key = secret
    db.commit()
    db.refresh(row)
    return provider_to_out(row)


@router.post("/models/discover", response_model=DiscoverOut)
async def discover_models(body: DiscoverIn, db: Session = Depends(get_db)) -> DiscoverOut:
    base = body.baseUrl.strip()
    key = ""
    provider_id = (body.providerId or "").strip()
    if body.apiKeyEnc is not None:
        key = unwrap_secret(body.apiKeyEnc)
    if body.modelId:
        row = db.get(AiModelRow, body.modelId)
        if not row:
            raise HTTPException(404, "模型不存在")
        if not key:
            key = (row.request_auth or "").strip()
        if not base:
            base = (row.request_url or "").strip()
        if not provider_id:
            provider_id = row.provider
    if not key:
        key = provider_api_key(db, provider_id)
    if not base:
        raise HTTPException(400, "请填写接口地址")
    if not key:
        raise HTTPException(400, "请填写 API 密钥，或先在供应商配置里保存密钥")
    try:
        ids = await list_remote_models(base, key)
    except Exception as exc:
        raise HTTPException(502, str(exc) or "无法获取上游模型列表") from exc
    return DiscoverOut(ids=ids)


@router.get("/models", response_model=list[AiModelOut])
def list_models(db: Session = Depends(get_db)) -> list[AiModelOut]:
    rows = db.query(AiModelRow).order_by(AiModelRow.is_custom.desc(), AiModelRow.id).all()
    return [model_to_out(row) for row in rows]


@router.post("/models", response_model=AiModelOut)
def create_model(body: AiModelIn, db: Session = Depends(get_db)) -> AiModelOut:
    model_id = body.model.strip()
    if not model_id:
        raise HTTPException(400, "请填写模型 ID")
    if db.get(AiModelRow, model_id):
        raise HTTPException(409, "模型 ID 已存在")
    row = AiModelRow(id=model_id, is_custom=True)
    apply_model_in(row, body.model_copy(update={"model": model_id, "isCustom": True}))
    if body.requestAuthEnc is not None:
        row.request_auth = unwrap_secret(body.requestAuthEnc)
    if not (row.request_auth or "").strip() and not provider_api_key(db, body.provider):
        raise HTTPException(400, "请填写 API 密钥，或先在供应商配置里保存密钥")
    db.add(row)
    db.commit()
    db.refresh(row)
    return model_to_out(row)


@router.patch("/models/{model_id:path}", response_model=AiModelOut)
def patch_model(model_id: str, body: AiModelPatch, db: Session = Depends(get_db)) -> AiModelOut:
    row = db.get(AiModelRow, model_id)
    if not row:
        raise HTTPException(404, "模型不存在")
    data = body.model_dump(exclude_unset=True)
    data.pop("requestAuthEnc", None)
    new_id = data.pop("model", None)
    if isinstance(new_id, str):
        new_id = new_id.strip()
        if new_id and new_id != row.id:
            if db.get(AiModelRow, new_id):
                raise HTTPException(409, "模型 ID 已存在")
            old_id = row.id
            db.execute(update(AiModelRow).where(AiModelRow.id == old_id).values(id=new_id))
            retarget_model_id(db, old_id, new_id)
            db.flush()
            db.expire_all()
            row = db.get(AiModelRow, new_id)
            if not row:
                raise HTTPException(500, "更新模型 ID 失败")
    mapping = {
        "name": "name",
        "type": "type",
        "provider": "provider",
        "isActive": "is_active",
        "vision": "vision",
        "multimodal": "multimodal",
        "toolChoice": "tool_choice",
        "maxContext": "max_context",
        "maxResponse": "max_response",
        "maxToken": "max_token",
        "defaultToken": "default_token",
        "batchSize": "batch_size",
        "normalization": "normalization",
        "requestUrl": "request_url",
        "mappedModel": "mapped_model",
    }
    for key, column in mapping.items():
        if key in data:
            setattr(row, column, data[key])
    if body.requestAuthEnc is not None:
        secret = unwrap_secret(body.requestAuthEnc)
        if secret:
            row.request_auth = secret
    if data.get("isActive") is False:
        pick_fallback(db, row)
    db.commit()
    db.refresh(row)
    return model_to_out(row)


@router.delete("/models/{model_id:path}")
def delete_model(model_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    row = db.get(AiModelRow, model_id)
    if not row:
        raise HTTPException(404, "模型不存在")
    pick_fallback(db, row)
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/models/{model_id:path}/test", response_model=TestOut)
async def test_one_model(model_id: str, db: Session = Depends(get_db)) -> TestOut:
    row = db.get(AiModelRow, model_id)
    if not row:
        return TestOut(ok=False, ms=0, message="模型不存在")
    return await test_model(row, resolve_model_auth(db, row))


@router.get("/workspace", response_model=WorkspaceOut)
def get_workspace(db: Session = Depends(get_db)) -> WorkspaceOut:
    return workspace_to_out(ensure_workspace(db))


@router.patch("/workspace", response_model=WorkspaceOut)
def patch_workspace(body: WorkspacePatch, db: Session = Depends(get_db)) -> WorkspaceOut:
    row = ensure_workspace(db)
    data = body.model_dump(exclude_unset=True)
    mapping = {
        "llmModel": "llm_model",
        "vectorModel": "vector_model",
        "vlmModel": "vlm_model",
        "rerankModel": "rerank_model",
        "rewriteFallback": "rewrite_fallback",
    }
    for key, column in mapping.items():
        if key in data:
            setattr(row, column, data[key])
    db.commit()
    db.refresh(row)
    return workspace_to_out(row)
