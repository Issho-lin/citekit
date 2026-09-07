import type { AiModel, ModelSlot, ModelType } from "../types";

export const MODEL_TYPE_META: {
  id: ModelType;
  label: string;
  tag: string;
  desc: string;
}[] = [
  { id: "llm", label: "语言模型", tag: "tag-blue", desc: "文本理解、问答增强、QA 抽取" },
  { id: "embedding", label: "索引模型", tag: "tag-yellow", desc: "把文本块转成向量，用于语义检索" },
  { id: "rerank", label: "重排模型", tag: "tag-red", desc: "对检索结果再排序" },
];

export function typeMeta(type: ModelType) {
  return MODEL_TYPE_META.find((t) => t.id === type) ?? MODEL_TYPE_META[0];
}

export function guessChatVision(id: string) {
  const n = id.toLowerCase();
  if (n.includes("embed") || n.includes("rerank")) return false;
  return ["-vl-", "_vl_", "-vlm", "vlm-", "vision", "gpt-4o", "gpt-4.1"].some((x) => n.includes(x));
}

export function guessMultimodalEmbedding(id: string) {
  const n = id.toLowerCase();
  return n.includes("vl-embedding") || n.includes("multimodal-embed") || n.includes("vision-embed");
}

export function guessRerankVision(id: string) {
  const n = id.toLowerCase();
  return n.includes("vl-rerank") || n.includes("vision-rerank");
}

export function guessFromModelId(id: string, type: ModelType): Partial<AiModel> {
  const n = id.toLowerCase();
  if (n.includes("rerank")) {
    return { type: "rerank", vision: guessRerankVision(id), multimodal: false };
  }
  if (n.includes("embed")) {
    return { type: "embedding", vision: false, multimodal: guessMultimodalEmbedding(id) };
  }
  if (type === "llm") return { vision: guessChatVision(id) };
  if (type === "embedding") return { multimodal: guessMultimodalEmbedding(id) };
  if (type === "rerank") return { vision: guessRerankVision(id) };
  return {};
}

export function matchesType(model: AiModel, slot: ModelSlot) {
  if (slot === "vlm") return model.type === "llm" && !!model.vision;
  return model.type === slot;
}

export function modelSelectList(
  models: AiModel[],
  slot: ModelSlot,
  current?: string,
  noneLabel?: string,
) {
  const active = models.filter((m) => m.isActive && matchesType(m, slot));
  if (current && !active.some((m) => m.model === current)) {
    const extra = models.find((m) => m.model === current);
    if (extra) active.unshift(extra);
  }
  const options = active.map((m) => ({
    label: m.model,
    value: m.model,
    description: m.provider,
  }));
  if (noneLabel != null) {
    return [{ label: noneLabel, value: "" }, ...options];
  }
  return options;
}

export function blankModel(type: ModelType): AiModel {
  const base: AiModel = {
    model: "",
    name: "",
    type,
    provider: "OpenAI",
    isActive: true,
    isCustom: true,
    requestUrl: "https://api.openai.com/v1",
  };
  if (type === "llm") {
    return { ...base, maxContext: 16000, maxResponse: 4000, vision: false, toolChoice: true };
  }
  if (type === "embedding") {
    return { ...base, maxToken: 8192, defaultToken: 512, batchSize: 100, normalization: true, multimodal: false };
  }
  return { ...base, maxToken: 8192, vision: false };
}

export const seedAiModels: AiModel[] = [
  {
    model: "gpt-4o-mini",
    name: "GPT-4o mini",
    type: "llm",
    provider: "OpenAI",
    isActive: true,
    isCustom: false,
    vision: true,
    toolChoice: true,
    maxContext: 128000,
    maxResponse: 16000,
  },
  {
    model: "qwen-plus",
    name: "通义千问 Plus",
    type: "llm",
    provider: "Qwen",
    isActive: true,
    isCustom: false,
    toolChoice: true,
    maxContext: 131072,
    maxResponse: 8192,
  },
  {
    model: "deepseek-chat",
    name: "DeepSeek Chat",
    type: "llm",
    provider: "DeepSeek",
    isActive: true,
    isCustom: false,
    toolChoice: true,
    maxContext: 65536,
    maxResponse: 8192,
  },
  {
    model: "bge-m3",
    name: "BGE-M3",
    type: "embedding",
    provider: "BAAI",
    isActive: true,
    isCustom: false,
    maxToken: 8192,
    defaultToken: 512,
    batchSize: 100,
    normalization: true,
  },
  {
    model: "text-embedding-3-large",
    name: "text-embedding-3-large",
    type: "embedding",
    provider: "OpenAI",
    isActive: true,
    isCustom: false,
    maxToken: 8191,
    defaultToken: 512,
    batchSize: 100,
  },
  {
    model: "text-embedding-3-small",
    name: "text-embedding-3-small",
    type: "embedding",
    provider: "OpenAI",
    isActive: false,
    isCustom: false,
    maxToken: 8191,
    defaultToken: 512,
    batchSize: 100,
  },
  {
    model: "qwen-vl-plus",
    name: "通义千问 VL Plus",
    type: "llm",
    provider: "Qwen",
    isActive: true,
    isCustom: false,
    vision: true,
    maxContext: 32000,
  },
  {
    model: "bge-reranker-v2-m3",
    name: "BGE Reranker v2 M3",
    type: "rerank",
    provider: "BAAI",
    isActive: true,
    isCustom: false,
    maxToken: 8192,
  },
  {
    model: "jina-reranker-v2-base-multilingual",
    name: "Jina Reranker v2",
    type: "rerank",
    provider: "Jina",
    isActive: true,
    isCustom: false,
    maxToken: 8192,
  },
];
