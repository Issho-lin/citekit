import type { AiModel, ChannelProtocol, ModelChannel, ModelType } from "../types";

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

export const PROVIDERS: { id: string; name: string; color: string }[] = [
  { id: "OpenAI", name: "OpenAI", color: "#10a37f" },
  { id: "Alibaba", name: "阿里云", color: "#ff6a00" },
  { id: "DeepSeek", name: "DeepSeek", color: "#4d6bfe" },
  { id: "BAAI", name: "智源", color: "#3370ff" },
  { id: "Jina", name: "Jina", color: "#ea580c" },
  { id: "SiliconFlow", name: "硅基流动", color: "#7c3aed" },
  { id: "Ollama", name: "Ollama", color: "#111827" },
  { id: "Other", name: "其他", color: "#667085" },
];

export const CHANNEL_PROTOCOLS: {
  id: ChannelProtocol;
  label: string;
  defaultBaseUrl: string;
}[] = [
  { id: "openai", label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "azure", label: "Azure OpenAI", defaultBaseUrl: "https://{resource}.openai.azure.com" },
  { id: "anthropic", label: "Anthropic", defaultBaseUrl: "https://api.anthropic.com" },
  { id: "google", label: "Google", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "ollama", label: "Ollama", defaultBaseUrl: "http://127.0.0.1:11434/v1" },
];

export function providerOf(id: string) {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
}

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
    label: m.name,
    value: m.model,
    description: m.name === m.model ? providerOf(m.provider).name : m.model,
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
    provider: "Alibaba",
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
    provider: "Alibaba",
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

export const seedChannels: ModelChannel[] = [
  {
    id: "ch_openai",
    name: "OpenAI 官方",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-mock-openai",
    modelIds: ["gpt-4o-mini", "text-embedding-3-large", "text-embedding-3-small"],
    mapping: {},
    enabled: true,
    priority: 1,
  },
  {
    id: "ch_ali",
    name: "阿里百炼",
    protocol: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "sk-mock-ali",
    modelIds: ["qwen-plus", "qwen-vl-plus"],
    mapping: {},
    enabled: true,
    priority: 1,
  },
  {
    id: "ch_silicon",
    name: "硅基流动",
    protocol: "openai",
    baseUrl: "https://api.siliconflow.cn/v1",
    apiKey: "sk-mock-silicon",
    modelIds: ["deepseek-chat", "bge-m3", "bge-reranker-v2-m3"],
    mapping: {},
    enabled: true,
    priority: 2,
  },
  {
    id: "ch_jina",
    name: "Jina",
    protocol: "openai",
    baseUrl: "https://api.jina.ai/v1",
    apiKey: "",
    modelIds: ["jina-reranker-v2-base-multilingual"],
    mapping: {},
    enabled: false,
    priority: 1,
  },
];
