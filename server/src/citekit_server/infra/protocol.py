from __future__ import annotations

from dataclasses import dataclass

# 各供应商怎么拼路径、怎么组请求体。未列出的走 DEFAULT（OpenAI 兼容）。
# 模型上的 request_url 仍是 Base URL，这里只描述相对 Base 的协议。


@dataclass(frozen=True)
class ProviderProtocol:
    chat_path: str = "chat/completions"
    embedding_path: str = "embeddings"
    embedding_multimodal_path: str | None = None
    embedding_mm_body: str = "text"  # text | tokenhub
    rerank_path: str = "rerank"
    rerank_join: str = "base"  # base：接在 Base URL 后；origin：剥掉 /v1 等后缀再接
    rerank_body: str = "flat"  # flat | nested
    refuse_rerank_if_host: tuple[str, ...] = ()
    rerank_url_tip: str = ""
    embedding_url_tip: str = ""
    # 主路径失败时再试另一套聊天接口（豆包：chat/completions ↔ responses）。
    chat_fallback_path: str | None = None


DEFAULT = ProviderProtocol()

QWEN = ProviderProtocol(
    rerank_path="api/v1/services/rerank/text-rerank/text-rerank",
    rerank_join="origin",
    rerank_body="nested",
    refuse_rerank_if_host=("dashscope.aliyuncs.com",),
    rerank_url_tip="百炼重排请填业务空间地址，例如 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1，也可以填完整的 /text-rerank 路径。不要用 compatible-mode。",
)

HUNYUAN = ProviderProtocol(
    embedding_multimodal_path="embeddings/multimodal",
    embedding_mm_body="tokenhub",
    embedding_url_tip="混元多模态向量走 /embeddings/multimodal，普通索引模型走 /embeddings。填 TokenHub 的 /v1 即可。",
)

DOUBAO = ProviderProtocol(chat_fallback_path="responses")

BY_ID: dict[str, ProviderProtocol] = {
    "Qwen": QWEN,
    "AliCloud": QWEN,
    "Hunyuan": HUNYUAN,
    "Doubao": DOUBAO,
    "Siliconflow": DEFAULT,
    "BAAI": DEFAULT,
    "Jina": DEFAULT,
}

ALIASES = {"Alibaba": "Qwen", "SiliconFlow": "Siliconflow"}

BASE_SUFFIXES = (
    "/compatible-mode/v1",
    "/compatible-api/v1",
    "/compatible-mode",
    "/compatible-api",
    "/api/v1",
    "/v1",
)


def protocol_of(provider_id: str | None) -> ProviderProtocol:
    pid = ALIASES.get(provider_id or "", provider_id or "")
    return BY_ID.get(pid, DEFAULT)
