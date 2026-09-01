import type { KnowledgeBase, ProcessConfig, RetrievalProfile, SearchConfig, SearchMode, SourceType } from "./types";

export const PROFILES: { id: RetrievalProfile; label: string }[] = [
  { id: "keyword_precise", label: "keyword_precise · 专名" },
  { id: "hybrid_balanced", label: "hybrid_balanced · 混合" },
  { id: "hybrid_rerank_strict", label: "hybrid_rerank_strict · 重排取 Top" },
  { id: "hybrid_rerank_cutoff", label: "hybrid_rerank_cutoff · 重排后丢低分" },
  { id: "parent_expand", label: "parent_expand · 父块展开" },
  { id: "filter_first", label: "filter_first · 先过滤" },
  { id: "mmr_diverse", label: "mmr_diverse · 多样" },
];

export const SEARCH_MODES: { id: SearchMode; label: string; desc: string }[] = [
  { id: "embedding", label: "语义检索", desc: "按向量相似度召回" },
  { id: "mix", label: "混合检索", desc: "向量检索 + 关键词搜索" },
  { id: "fullText", label: "全文检索", desc: "按关键词匹配" },
];

export const DEFAULT_QA_PROMPT = `你是知识库问答对提取助手。请从给定文本中提取尽可能多的问答对：
- 问题要具体、可检索
- 答案必须来自原文，不要杜撰
- 用 JSON 数组返回 [{q,a}]`;

export const DEFAULT_PROCESS: ProcessConfig = {
  trainingType: "chunk",
  chunkTriggerType: "minSize",
  chunkTriggerMinSize: 100,
  indexPrefixTitle: false,
  autoIndexes: false,
  imageIndex: false,
  chunkSettingMode: "auto",
  chunkSplitMode: "paragraph",
  paragraphChunkAIMode: "auto",
  paragraphChunkDeep: 5,
  chunkSize: 1000,
  chunkSplitter: "",
  indexSize: 512,
  qaPrompt: DEFAULT_QA_PROMPT,
  pdfEnhance: false,
  webSelector: "",
  chunkOverlap: 0,
  qaEnhance: false,
  customSplit: "",
};

export function fillProcess(partial: Partial<ProcessConfig> = {}): ProcessConfig {
  const next = { ...DEFAULT_PROCESS, ...partial };
  if (partial.qaEnhance && !partial.trainingType) next.trainingType = "qa";
  if (partial.customSplit !== undefined && partial.chunkSplitter === undefined) {
    next.chunkSplitter = partial.customSplit;
  }
  next.qaEnhance = next.trainingType === "qa";
  next.customSplit = next.chunkSplitter;
  return next;
}

export const INDEX_SIZES = [128, 256, 512, 1024, 2048];

export const SPLIT_SIGNS: { label: string; value: string }[] = [
  { label: "不设置", value: "" },
  { label: "1 个换行符", value: "\\n" },
  { label: "2 个换行符", value: "\\n\\n" },
  { label: "句号", value: ".|。" },
  { label: "感叹号", value: "!|！" },
  { label: "问号", value: "?|？" },
  { label: "分号", value: ";|；" },
  { label: "=====", value: "=====" },
  { label: "自定义", value: "Other" },
];

export const CHUNK_STRATEGIES = [
  "heading",
  "heading + parent-child",
  "table-row",
  "faq-pair",
  "recursive",
  "json-record",
];

export const DEFAULT_KB_SEARCH = {
  searchMode: "mix" as SearchMode,
  similarity: 0.2,
  limit: 20,
  usingRerank: false,
};

export const DEFAULT_SEARCH: SearchConfig = {
  ...DEFAULT_KB_SEARCH,
  filterFirst: false,
};

export function profileFromSearch(search: SearchConfig): RetrievalProfile {
  return search.filterFirst ? "filter_first" : "hybrid_balanced";
}

export function filtersFromSearch(search: SearchConfig): string[] {
  return search.filterFirst ? ["warehouse"] : [];
}

export const SOURCE_LABEL = {
  upload: "本地文件",
  web: "网页链接",
  feishu: "飞书文档",
  yuque: "语雀文档",
  dingtalk: "钉钉文档",
  manual: "手动数据集",
  folder: "文件夹",
  api: "API 文件",
  image: "图片数据集",
} as const;

export const IMPORT_SOURCES: {
  id: SourceType;
  title: string;
  desc: string;
}[] = [
  { id: "upload", title: "本地文件", desc: "PDF / Word / Markdown / CSV 等，上传后按参数切块" },
  { id: "web", title: "网页链接", desc: "填写网页 URL，批量拉取页面内容" },
  { id: "manual", title: "自定义文本", desc: "直接粘贴文本，适合 FAQ、制度摘录" },
  { id: "api", title: "API 文件", desc: "通过外部文件 API 拉取文档" },
  { id: "image", title: "图片数据集", desc: "图片入库，使用视觉模型解析" },
  { id: "feishu", title: "飞书文档", desc: "同步飞书云文档 / 知识库节点" },
  { id: "yuque", title: "语雀文档", desc: "同步语雀知识库文档" },
];

export const KB_KINDS: { id: KnowledgeBase["kind"]; title: string; desc: string; courseUrl?: string }[] = [
  { id: "dataset", title: "通用知识库", desc: "通过导入文件、网页链接或手动录入形式构建知识库" },
  {
    id: "website",
    title: "Web 站点同步",
    desc: "通过爬虫，批量爬取网页数据构建知识库",
    courseUrl: "https://doc.fastgpt.io/docs/introduction/guide/knowledge_base/websync",
  },
  {
    id: "api",
    title: "API 文件库",
    desc: "可以通过 API，使用外部文件库构建知识库",
    courseUrl: "https://doc.fastgpt.io/docs/introduction/guide/knowledge_base/api_dataset",
  },
  {
    id: "feishu",
    title: "飞书知识库",
    desc: "可通过配置飞书文档权限，使用飞书文档构建知识库，文档不会进行二次存储",
    courseUrl: "https://doc.fastgpt.io/docs/introduction/guide/knowledge_base/lark_dataset",
  },
  {
    id: "yuque",
    title: "语雀知识库",
    desc: "可通过配置语雀文档权限，使用语雀文档构建知识库，文档不会进行二次存储",
    courseUrl: "https://doc.fastgpt.io/docs/introduction/guide/knowledge_base/yuque_dataset",
  },
  {
    id: "dingtalk",
    title: "钉钉知识库",
    desc: "可通过配置钉钉知识库权限，使用钉钉在线文档构建知识库，文档不会进行二次存储",
    courseUrl: "https://doc.fastgpt.io/docs/introduction/guide/knowledge_base/dingtalk_dataset",
  },
];

export function searchFromKb(kb: KnowledgeBase): SearchConfig {
  return {
    searchMode: kb.searchMode,
    similarity: kb.similarity,
    limit: kb.limit,
    usingRerank: kb.usingRerank,
    filterFirst: false,
  };
}

export function searchFromTool(tool: { search: SearchConfig }): SearchConfig {
  return { ...DEFAULT_SEARCH, ...tool.search };
}
