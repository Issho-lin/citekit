export type SourceType =
  | "upload"
  | "web"
  | "feishu"
  | "yuque"
  | "dingtalk"
  | "manual"
  | "folder"
  | "api"
  | "image";

export type KbKind =
  | "dataset"
  | "website"
  | "feishu"
  | "yuque"
  | "api"
  | "dingtalk"
  | "folder";

export type SearchMode = "embedding" | "mix" | "fullText";

export type RetrievalProfile =
  | "keyword_precise"
  | "hybrid_balanced"
  | "hybrid_rerank_strict"
  | "hybrid_rerank_cutoff"
  | "parent_expand"
  | "filter_first"
  | "mmr_diverse";

export type SliceStatus = "ready" | "building" | "failed";

export interface ProcessConfig {
  trainingType: "chunk" | "qa";
  chunkTriggerType: "minSize" | "maxSize" | "forceChunk";
  chunkTriggerMinSize: number;
  indexPrefixTitle: boolean;
  autoIndexes: boolean;
  imageIndex: boolean;
  chunkSettingMode: "auto" | "custom";
  chunkSplitMode: "paragraph" | "size" | "char";
  paragraphChunkAIMode: "auto" | "forbid" | "force";
  paragraphChunkDeep: number;
  chunkSize: number;
  chunkSplitter: string;
  indexSize: number;
  qaPrompt: string;
  pdfEnhance: boolean;
  webSelector: string;
  chunkOverlap: number;
  qaEnhance: boolean;
  customSplit: string;
  useChildIndex: boolean;
}

export interface SearchConfig {
  searchMode: SearchMode;
  similarity: number;
  limit: number;
  usingRerank: boolean;
  filterFirst: boolean;
}

export interface ApiDatasetServer {
  apiServer?: { baseUrl: string; authorization?: string; basePath?: string };
  feishuServer?: { appId: string; appSecret: string; folderToken: string };
  yuqueServer?: { userId: string; token: string; basePath?: string };
  dingtalkServer?: { appKey: string; appSecret: string; userId: string };
}

export interface KnowledgeBase {
  id: string;
  name: string;
  domain: string;
  description: string;
  docCount: number;
  kind: KbKind;
  parentId?: string;
  websiteUrl?: string;
  websiteSelector?: string;
  apiDatasetServer?: ApiDatasetServer;
  vectorModel: string;
  llmModel: string;
  vlmModel: string;
  rerankModel: string;
  searchMode: SearchMode;
  similarity: number;
  limit: number;
  usingRerank: boolean;
}

export interface Source extends ProcessConfig {
  id: string;
  kbId: string;
  parentId?: string;
  type: SourceType;
  title: string;
  locator: string;
  acl: "internal" | "restricted" | "public";
  status: "synced" | "syncing" | "error";
  errorMessage?: string;
  updatedAt: string;
  chunkCount?: number;
  fileId?: string;
  hasOriginal?: boolean;
}

export interface Slice {
  id: string;
  kbId: string;
  name: string;
  scope: string;
  sourceIds: string[];
  chunkStrategy: string;
  embedding: string;
  status: SliceStatus;
  version: string;
}

export interface EvalCase {
  id: string;
  query: string;
  toolId: string;
  expect: string;
  warehouse?: string;
}

export interface RetrievalTool {
  id: string;
  name: string;
  title: string;
  description: string;
  kbId: string;
  sourceIds: string[];
  sliceId?: string;
  search: SearchConfig;
  profile: RetrievalProfile;
  requiredFilters: string[];
}

export interface McpEndpoint {
  id: string;
  name: string;
  env: "dev" | "prod";
  toolIds: string[];
  url: string;
  apiKey: string;
}

export interface Chunk {
  id: string;
  sliceId: string;
  text: string;
  title: string;
  locator: string;
  sku?: string;
  warehouse?: string;
  sourceId?: string;
  a?: string;
  indexes?: ChunkIndex[];
}

export type ChunkIndexType = "default" | "custom" | "child" | "auto" | "image";

export interface ChunkIndex {
  id: string;
  type: ChunkIndexType;
  text: string;
}

export type ModelType = "llm" | "embedding" | "rerank";
/** 工作空间/知识库槽位。图片理解不是独立类型，来自带视觉能力的语言模型。 */
export type ModelSlot = ModelType | "vlm";

export interface AiModel {
  model: string;
  name: string;
  type: ModelType;
  provider: string;
  isActive: boolean;
  isCustom: boolean;
  vision?: boolean;
  multimodal?: boolean;
  toolChoice?: boolean;
  maxContext?: number;
  maxResponse?: number;
  maxToken?: number;
  defaultToken?: number;
  batchSize?: number;
  normalization?: boolean;
  requestUrl?: string;
  requestAuth?: string;
  hasRequestAuth?: boolean;
  mappedModel?: string;
}

export interface ModelProvider {
  id: string;
  name: string;
  avatar: string;
  order: number;
  isVisible: boolean;
  defaultBaseUrl?: string;
  hasApiKey?: boolean;
  rerankUrlTip?: string;
  embeddingUrlTip?: string;
}

export interface ModelTestResult {
  ok: boolean;
  ms: number;
  message: string;
}

export interface ModelCallSummary {
  id: string;
  createdAt: string;
  modelId: string;
  modelName: string;
  mappedModel?: string | null;
  type: string;
  provider: string;
  purpose: string;
  kind: string;
  method: string;
  url: string;
  httpStatus?: number | null;
  ok: boolean;
  latencyMs: number;
  error?: string | null;
  kbId?: string | null;
  sourceId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  summary: string;
}

export interface ModelCall extends ModelCallSummary {
  request: unknown;
  response: unknown;
}
