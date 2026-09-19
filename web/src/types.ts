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
  indexChunkTitle: boolean;
  autoIndexes: boolean;
  imageIndex: boolean;
  imageIndexMode: "auto" | "transcribe" | "extract";
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

export interface HitTrace {
  lexicalRank?: number | null;
  lexicalScore?: number | null;
  vectorRank?: number | null;
  vectorScore?: number | null;
  vectorKind?: string;
  vectorDropped?: boolean;
  fusedRank?: number | null;
  fusedScore?: number | null;
  rerankScore?: number | null;
}

export interface SearchDropped {
  title: string;
  locator: string;
  reason: string;
  lexicalRank?: number | null;
  vectorRank?: number | null;
  vectorScore?: number | null;
}

export interface SearchDebug {
  lexicalCount: number;
  vectorCount: number;
  vectorDroppedCount: number;
  fusedCount: number;
  reranked: boolean;
  vectorError?: string | null;
  dropped: SearchDropped[];
}

export interface ApiDatasetServer {
  apiServer?: { baseUrl: string; authorization?: string; basePath?: string };
  feishuServer?: { appId: string; appSecret: string };
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
  websiteLinkSelector?: string;
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

export interface ToolEval {
  cases: number;
  lastRunId?: string | null;
  lastRunAt?: string | null;
  passed: number;
  failed: number;
  total: number;
  ok?: boolean | null;
}

export interface EvalCase {
  id: string;
  query: string;
  toolId: string;
  expect: string;
  warehouse?: string;
}

export interface EvalHit {
  title: string;
  locator: string;
  score: number;
  lexicalRank?: number | null;
  vectorRank?: number | null;
  vectorScore?: number | null;
  vectorDropped?: boolean;
  fusedRank?: number | null;
  rerankScore?: number | null;
}

export interface EvalRunItem {
  id: string;
  caseId?: string | null;
  query: string;
  expect: string;
  ok: boolean;
  detail: string;
  hits: EvalHit[];
}

export interface EvalRun {
  id: string;
  toolId: string;
  createdAt: string;
  passed: number;
  failed: number;
  total: number;
  ok: boolean;
  retrieve?: SearchConfig | null;
  vectorError?: string | null;
  items: EvalRunItem[];
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
  eval?: ToolEval;
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

export interface McpCallSummary {
  id: string;
  createdAt: string;
  endpointId: string;
  endpointName: string;
  env: string;
  method: string;
  toolId?: string | null;
  toolName: string;
  query: string;
  warehouse?: string | null;
  httpStatus?: number | null;
  ok: boolean;
  latencyMs: number;
  error?: string | null;
  hitCount?: number | null;
  summary: string;
  clientIp?: string;
  clientRegion?: string;
}

export interface McpCall extends McpCallSummary {
  request: unknown;
  response: unknown;
}
