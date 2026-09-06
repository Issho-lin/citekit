import type { AiModel, ModelType } from "../types";

export const MODEL_TYPE_META: {
  id: ModelType;
  label: string;
  tag: string;
  desc: string;
}[] = [
  { id: "llm", label: "语言模型", tag: "tag-blue", desc: "文本理解、问答增强、QA 抽取" },
  { id: "embedding", label: "索引模型", tag: "tag-yellow", desc: "把文本块转成向量，用于语义检索" },
  { id: "vlm", label: "图片理解", tag: "tag-purple", desc: "识别文档里的图片并生成描述" },
  { id: "rerank", label: "重排模型", tag: "tag-red", desc: "对检索结果再排序" },
];

export function typeMeta(type: ModelType) {
  return MODEL_TYPE_META.find((t) => t.id === type) ?? MODEL_TYPE_META[0];
}

export function matchesType(model: AiModel, type: ModelType) {
  if (type === "vlm") return model.type === "vlm" || (model.type === "llm" && !!model.vision);
  return model.type === type;
}

export function modelSelectList(models: AiModel[], type: ModelType, current?: string) {
  const active = models.filter((m) => m.isActive && matchesType(m, type));
  if (current && !active.some((m) => m.model === current)) {
    const extra = models.find((m) => m.model === current);
    if (extra) active.unshift(extra);
  }
  return active.map((m) => ({
    label: m.model,
    value: m.model,
    description: m.provider,
  }));
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
    return { ...base, maxToken: 8192, defaultToken: 512, batchSize: 100, normalization: true };
  }
  if (type === "vlm") {
    return { ...base, maxContext: 16000, vision: true };
  }
  return { ...base, maxToken: 8192 };
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
    type: "vlm",
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
