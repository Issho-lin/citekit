from sqlalchemy.orm import Session

from citekit_server.db import AiModelRow, ProviderRow, WorkspaceRow

# FastGPT ModelProviderMap（zh-CN）；图标来自 plugin 仓库 logo.svg，放在 web/public/providers
PROVIDERS: list[dict] = [
    {"id": "OpenAI", "name": "OpenAI", "base": "https://api.openai.com/v1"},
    {"id": "Claude", "name": "Claude", "base": "https://api.anthropic.com/v1"},
    {"id": "Gemini", "name": "Gemini", "base": "https://generativelanguage.googleapis.com/v1beta/openai"},
    {"id": "Meta", "name": "Meta", "base": "https://api.llama.com/compat/v1"},
    {"id": "MistralAI", "name": "MistralAI", "base": "https://api.mistral.ai/v1"},
    {"id": "Grok", "name": "Grok", "base": "https://api.x.ai/v1"},
    {"id": "Groq", "name": "Groq", "base": "https://api.groq.com/openai/v1"},
    {"id": "Jina", "name": "Jina", "base": "https://api.jina.ai/v1"},
    {"id": "Qwen", "name": "通义千问", "base": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    {"id": "Doubao", "name": "豆包", "base": "https://ark.cn-beijing.volces.com/api/v3"},
    {"id": "DeepSeek", "name": "DeepSeek", "base": "https://api.deepseek.com/v1"},
    {"id": "ChatGLM", "name": "智谱", "base": "https://open.bigmodel.cn/api/paas/v4"},
    {"id": "MiniMax", "name": "MiniMax", "base": "https://api.minimaxi.com/v1"},
    {"id": "Moonshot", "name": "月之暗面", "base": "https://api.moonshot.cn/v1"},
    {"id": "Ernie", "name": "文心一言", "base": "https://qianfan.baidubce.com/v2"},
    {"id": "SparkDesk", "name": "讯飞星火", "base": "https://spark-api-open.xf-yun.com/v1"},
    {"id": "Hunyuan", "name": "混元", "base": "https://tokenhub.tencentmaas.com/v1"},
    {"id": "AntLing", "name": "蚂蚁百灵", "base": "https://lingapi.alipay.com/v1"},
    {"id": "Baichuan", "name": "百川智能", "base": "https://api.baichuan-ai.com/v1"},
    {"id": "StepFun", "name": "阶跃星辰", "base": "https://api.stepfun.ai/v1"},
    {"id": "ai360", "name": "ai360", "base": "https://api.360.cn/v1"},
    {"id": "Yi", "name": "零一万物", "base": "https://api.lingyiwanwu.com/v1"},
    {"id": "BAAI", "name": "北京智源", "base": "https://api.siliconflow.cn/v1"},
    {"id": "FishAudio", "name": "FishAudio", "base": "https://api.fish.audio/v1"},
    {"id": "InternLM", "name": "书生大模型", "base": "https://chat.intern-ai.org.cn/puyu/api/v1"},
    {"id": "Moka", "name": "Moka", "base": "https://api.moka.ai/v1"},
    {"id": "Ollama", "name": "Ollama", "base": "http://127.0.0.1:11434/v1"},
    {"id": "OpenRouter", "name": "OpenRouter", "base": "https://openrouter.ai/api/v1"},
    {"id": "vertexai", "name": "vertexai", "base": "https://aiplatform.googleapis.com/v1"},
    {"id": "novita", "name": "novita", "base": "https://api.novita.ai/v3/openai"},
    {"id": "AliCloud", "name": "阿里云", "base": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    {"id": "Siliconflow", "name": "硅基流动", "base": "https://api.siliconflow.cn/v1"},
    {"id": "PPIO", "name": "PPIO", "base": "https://api.ppio.com/openai"},
    {"id": "SangforAICP", "name": "深信服", "base": "https://aicp.sangfor.com/v1"},
    {"id": "Other", "name": "其他", "base": ""},
]

CATALOG: list[dict] = [
    {
        "id": "gpt-4o-mini",
        "name": "GPT-4o mini",
        "type": "llm",
        "provider": "OpenAI",
        "is_custom": False,
        "vision": True,
        "tool_choice": True,
        "max_context": 128000,
        "max_response": 16000,
    },
    {
        "id": "qwen-plus",
        "name": "通义千问 Plus",
        "type": "llm",
        "provider": "Qwen",
        "is_custom": False,
        "tool_choice": True,
        "max_context": 131072,
        "max_response": 8192,
    },
    {
        "id": "deepseek-chat",
        "name": "DeepSeek Chat",
        "type": "llm",
        "provider": "DeepSeek",
        "is_custom": False,
        "tool_choice": True,
        "max_context": 65536,
        "max_response": 8192,
    },
    {
        "id": "bge-m3",
        "name": "BGE-M3",
        "type": "embedding",
        "provider": "BAAI",
        "is_custom": False,
        "max_token": 8192,
        "default_token": 512,
        "batch_size": 100,
        "normalization": True,
    },
    {
        "id": "text-embedding-3-large",
        "name": "text-embedding-3-large",
        "type": "embedding",
        "provider": "OpenAI",
        "is_custom": False,
        "max_token": 8191,
        "default_token": 512,
        "batch_size": 100,
    },
    {
        "id": "text-embedding-3-small",
        "name": "text-embedding-3-small",
        "type": "embedding",
        "provider": "OpenAI",
        "is_active": False,
        "is_custom": False,
        "max_token": 8191,
        "default_token": 512,
        "batch_size": 100,
    },
    {
        "id": "qwen-vl-plus",
        "name": "通义千问 VL Plus",
        "type": "vlm",
        "provider": "Qwen",
        "is_custom": False,
        "vision": True,
        "max_context": 32000,
    },
    {
        "id": "bge-reranker-v2-m3",
        "name": "BGE Reranker v2 M3",
        "type": "rerank",
        "provider": "BAAI",
        "is_custom": False,
        "max_token": 8192,
    }
]


def seed_providers(db: Session) -> None:
    existing = {row.id: row for row in db.query(ProviderRow).all()}
    for index, item in enumerate(PROVIDERS):
        avatar = f"/providers/{item['id']}.svg"
        base = item.get("base", "")
        row = existing.get(item["id"])
        if row:
            row.name = item["name"]
            row.avatar = avatar
            row.sort_order = index
            row.default_base_url = base
        else:
            db.add(
                ProviderRow(
                    id=item["id"],
                    name=item["name"],
                    avatar=avatar,
                    sort_order=index,
                    is_visible=item.get("visible", True),
                    default_base_url=base,
                )
            )
    aliases = {"Alibaba": "Qwen", "SiliconFlow": "Siliconflow"}
    for row in db.query(AiModelRow).all():
        nxt = aliases.get(row.provider)
        if nxt:
            row.provider = nxt


def seed_if_empty(db: Session) -> None:
    seed_providers(db)
    if db.query(AiModelRow).count() == 0:
        for item in CATALOG:
            db.add(
                AiModelRow(
                    id=item["id"],
                    name=item["name"],
                    type=item["type"],
                    provider=item["provider"],
                    is_active=item.get("is_active", True),
                    is_custom=item.get("is_custom", False),
                    vision=item.get("vision"),
                    tool_choice=item.get("tool_choice"),
                    max_context=item.get("max_context"),
                    max_response=item.get("max_response"),
                    max_token=item.get("max_token"),
                    default_token=item.get("default_token"),
                    batch_size=item.get("batch_size"),
                    normalization=item.get("normalization"),
                )
            )
    if db.get(WorkspaceRow, 1) is None:
        db.add(
            WorkspaceRow(
                id=1,
                llm_model="gpt-4o-mini",
                vector_model="bge-m3",
                vlm_model="gpt-4o-mini",
                rerank_model="bge-reranker-v2-m3",
                rewrite_fallback=False,
            )
        )
    db.commit()
