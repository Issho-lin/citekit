import type {
  AiModel,
  Chunk,
  EvalCase,
  EvalRun,
  KnowledgeBase,
  McpCall,
  McpCallSummary,
  McpEndpoint,
  ModelCall,
  ModelCallSummary,
  ModelProvider,
  ModelTestResult,
  ProcessConfig,
  RetrievalTool,
  SearchConfig,
  SearchDebug,
  HitTrace,
  Source,
} from "./types";
import { encryptSecret } from "./encryptSecret";

export function isPlainSecret(value?: string) {
  const text = value?.trim() ?? "";
  if (!text) return false;
  if (/^\*+$/.test(text)) return false;
  if (text.includes("****")) return false;
  return true;
}

export const SECRET_MASK = "************************";

export interface WorkspaceSettings {
  llmModel: string;
  vectorModel: string;
  vlmModel: string;
  rerankModel: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail) detail = JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail || `请求失败 ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listModels: () => request<AiModel[]>("/api/models"),
  discoverModels: async (body: { baseUrl: string; apiKey?: string; modelId?: string; providerId?: string }) => {
    const payload: Record<string, unknown> = { baseUrl: body.baseUrl };
    if (body.apiKey?.trim()) payload.apiKeyEnc = await encryptSecret(body.apiKey.trim());
    if (body.modelId) payload.modelId = body.modelId;
    if (body.providerId) payload.providerId = body.providerId;
    return request<{ ids: string[] }>("/api/models/discover", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  createModel: async (model: AiModel) => {
    const { requestAuth, ...rest } = model;
    const payload: Record<string, unknown> = { ...rest };
    if (isPlainSecret(requestAuth)) payload.requestAuthEnc = await encryptSecret(requestAuth!.trim());
    return request<AiModel>("/api/models", { method: "POST", body: JSON.stringify(payload) });
  },
  patchModel: async (id: string, patch: Partial<AiModel>) => {
    const { requestAuth, ...rest } = patch;
    const payload: Record<string, unknown> = { ...rest };
    if (isPlainSecret(requestAuth)) payload.requestAuthEnc = await encryptSecret(requestAuth!.trim());
    return request<AiModel>(`/api/models/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteModel: (id: string) =>
    request<{ ok: boolean }>(`/api/models/${encodeURIComponent(id)}`, { method: "DELETE" }),
  testModel: (id: string) =>
    request<ModelTestResult>(`/api/models/${encodeURIComponent(id)}/test`, {
      method: "POST",
    }),
  getWorkspace: () => request<WorkspaceSettings>("/api/workspace"),
  patchWorkspace: (patch: Partial<WorkspaceSettings>) =>
    request<WorkspaceSettings>("/api/workspace", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  listProviders: () => request<ModelProvider[]>("/api/providers"),
  patchProvider: async (id: string, patch: { apiKey?: string; clearApiKey?: boolean }) => {
    const payload: Record<string, unknown> = {};
    if (patch.clearApiKey) payload.clearApiKey = true;
    else if (isPlainSecret(patch.apiKey)) payload.apiKeyEnc = await encryptSecret(patch.apiKey!.trim());
    return request<ModelProvider>(`/api/providers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  listKbs: () => request<KnowledgeBase[]>("/api/kbs"),
  createKb: (body: Partial<KnowledgeBase> & { name: string }) =>
    request<KnowledgeBase>("/api/kbs", { method: "POST", body: JSON.stringify(body) }),
  patchKb: (id: string, patch: Partial<KnowledgeBase>) =>
    request<KnowledgeBase>(`/api/kbs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteKb: (id: string) =>
    request<{ ok: boolean }>(`/api/kbs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  syncWebsite: (kbId: string, body: { url: string; selector?: string }) =>
    request<{ ok: boolean; maxPages: number; maxDepth: number }>(
      `/api/kbs/${encodeURIComponent(kbId)}/website-sync`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  uploadKbFile: (kbId: string, file: File, signal?: AbortSignal, onProgress?: (p: number) => void) =>
    uploadFile<{ id: string; name: string; size: number }>(
      `/api/kbs/${encodeURIComponent(kbId)}/files`,
      file,
      signal,
      onProgress,
    ),
  previewKb: (kbId: string, body: { fileId?: string; rawText?: string; process?: ProcessConfig }) =>
    request<{
      chunks: { title: string; text: string; chars: number; answer?: string; indexes?: { id?: string; type?: string; text: string }[] }[];
      total: number;
      shown: number;
      parsedText: string;
      parsedTruncated: boolean;
      parsedChars: number;
      applied: string;
      notes: string[];
      minChars: number;
      maxChars: number;
      avgChars: number;
      oversize: number;
      chunkSize: number;
      indexCount: number;
    }>(`/api/kbs/${encodeURIComponent(kbId)}/preview`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listSources: (kbId: string) => request<Source[]>(`/api/kbs/${encodeURIComponent(kbId)}/sources`),
  createSource: (
    kbId: string,
    body: {
      type?: string;
      title: string;
      parentId?: string;
      fileId?: string;
      rawText?: string;
      locator?: string;
      process?: ProcessConfig;
    },
  ) =>
    request<Source>(`/api/kbs/${encodeURIComponent(kbId)}/sources`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchSource: (id: string, patch: { title?: string; process?: ProcessConfig }) =>
    request<Source>(`/api/sources/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteSource: (id: string) =>
    request<{ ok: boolean }>(`/api/sources/${encodeURIComponent(id)}`, { method: "DELETE" }),
  retrainSource: (id: string) =>
    request<Source>(`/api/sources/${encodeURIComponent(id)}/retrain`, { method: "POST" }),
  sourceFileUrl: (id: string, download = false) =>
    `/api/sources/${encodeURIComponent(id)}/file${download ? "?download=1" : ""}`,
  sourceFileText: (id: string) =>
    request<{ name: string; mime: string; size: number; text: string }>(
      `/api/sources/${encodeURIComponent(id)}/file?format=text`,
    ),
  listChunks: (sourceId: string) => request<Chunk[]>(`/api/sources/${encodeURIComponent(sourceId)}/chunks`),
  patchChunk: (id: string, patch: { title?: string; text?: string; a?: string; indexes?: Chunk["indexes"] }) =>
    request<Chunk>(`/api/chunks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  searchKb: (
    kbId: string,
    body: {
      query: string;
      sourceIds?: string[];
      searchMode?: SearchConfig["searchMode"];
      similarity?: number;
      limit?: number;
      usingRerank?: boolean;
      warehouse?: string;
      debug?: boolean;
    },
  ) =>
    request<{
      hits: { chunk: Chunk; score: number; note: string; trace?: HitTrace | null }[];
      message?: string | null;
      debug?: SearchDebug | null;
    }>(
      `/api/kbs/${encodeURIComponent(kbId)}/search`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listModelCalls: (params?: {
    modelId?: string;
    type?: string;
    purpose?: string;
    ok?: boolean;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.modelId) query.set("modelId", params.modelId);
    if (params?.type) query.set("type", params.type);
    if (params?.purpose) query.set("purpose", params.purpose);
    if (params?.ok !== undefined) query.set("ok", String(params.ok));
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.offset != null) query.set("offset", String(params.offset));
    const suffix = query.toString();
    return request<{ items: ModelCallSummary[]; total: number }>(
      `/api/model-calls${suffix ? `?${suffix}` : ""}`,
    );
  },
  getModelCall: (id: string) => request<ModelCall>(`/api/model-calls/${encodeURIComponent(id)}`),
  clearModelCalls: () => request<{ ok: boolean; deleted: number }>("/api/model-calls", { method: "DELETE" }),
  listMcpCalls: (params?: {
    endpointId?: string;
    method?: string;
    ok?: boolean;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.endpointId) query.set("endpointId", params.endpointId);
    if (params?.method) query.set("method", params.method);
    if (params?.ok !== undefined) query.set("ok", String(params.ok));
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.offset != null) query.set("offset", String(params.offset));
    const suffix = query.toString();
    return request<{ items: McpCallSummary[]; total: number }>(`/api/mcp-calls${suffix ? `?${suffix}` : ""}`);
  },
  getMcpCall: (id: string) => request<McpCall>(`/api/mcp-calls/${encodeURIComponent(id)}`),
  clearMcpCalls: () => request<{ ok: boolean; deleted: number }>("/api/mcp-calls", { method: "DELETE" }),
  listTools: () => request<RetrievalTool[]>("/api/tools"),
  suggestTool: (body: { kbId: string; sourceIds?: string[]; excludeId?: string }) =>
    request<{ title: string; name: string; description: string }>("/api/tools/suggest", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createTool: (body: {
    name: string;
    title: string;
    description: string;
    kbId: string;
    sourceIds: string[];
    search: SearchConfig;
  }) => request<RetrievalTool>("/api/tools", { method: "POST", body: JSON.stringify(body) }),
  patchTool: (id: string, patch: Partial<Pick<RetrievalTool, "name" | "title" | "description" | "sourceIds">> & { search?: SearchConfig }) =>
    request<RetrievalTool>(`/api/tools/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteTool: (id: string) =>
    request<{ ok: boolean }>(`/api/tools/${encodeURIComponent(id)}`, { method: "DELETE" }),
  searchTool: (id: string, body: { query: string; warehouse?: string; debug?: boolean }) =>
    request<{
      hits: { chunk: Chunk; score: number; note: string; trace?: HitTrace | null }[];
      message?: string | null;
      debug?: SearchDebug | null;
    }>(
      `/api/tools/${encodeURIComponent(id)}/search`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listEndpoints: () => request<McpEndpoint[]>("/api/mcp-endpoints"),
  createEndpoint: (body: { name: string; env: "dev" | "prod"; toolIds: string[] }) =>
    request<McpEndpoint>("/api/mcp-endpoints", { method: "POST", body: JSON.stringify(body) }),
  patchEndpoint: (id: string, patch: Partial<Pick<McpEndpoint, "name" | "env" | "toolIds">>) =>
    request<McpEndpoint>(`/api/mcp-endpoints/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteEndpoint: (id: string) =>
    request<{ ok: boolean }>(`/api/mcp-endpoints/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listEvalCases: (toolId?: string) =>
    request<EvalCase[]>(`/api/eval-cases${toolId ? `?toolId=${encodeURIComponent(toolId)}` : ""}`),
  createEvalCase: (body: { query: string; toolId: string; expect: string; warehouse?: string }) =>
    request<EvalCase>("/api/eval-cases", { method: "POST", body: JSON.stringify(body) }),
  createEvalCaseFromMcp: (callId: string) =>
    request<EvalCase>("/api/eval-cases/from-mcp-call", { method: "POST", body: JSON.stringify({ callId }) }),
  deleteEvalCase: (id: string) =>
    request<{ ok: boolean }>(`/api/eval-cases/${encodeURIComponent(id)}`, { method: "DELETE" }),
  runEvalCases: (toolId?: string) =>
    request<{ runs: EvalRun[]; failed: number }>("/api/eval-cases/run", {
      method: "POST",
      body: JSON.stringify(toolId ? { toolId } : {}),
    }),
  listEvalRuns: (toolId?: string, limit = 8) => {
    const query = new URLSearchParams();
    if (toolId) query.set("toolId", toolId);
    query.set("limit", String(limit));
    return request<EvalRun[]>(`/api/eval-runs?${query.toString()}`);
  },
  mcpRpc: (endpointId: string, apiKey: string, body: unknown) =>
    request<McpRpc>(`/mcp/${encodeURIComponent(endpointId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    }),
  agentChat: (body: AgentChatBody) =>
    request<AgentChatResult>("/api/agent/chat", { method: "POST", body: JSON.stringify(body) }),
  agentChatStream: (body: AgentChatBody, opts: { signal?: AbortSignal; onEvent: (event: AgentStreamEvent) => void }) =>
    streamAgentChat(body, opts),
};

export type AgentCitation = {
  id: number;
  tool: string;
  title: string;
  locator: string;
  text: string;
  score: number;
  sourceId: string;
};

export type AgentStep = {
  tool: string;
  query: string;
  ok: boolean;
  preview: string;
  endpointId?: string;
  endpointName?: string;
  citations?: AgentCitation[];
};

export type AgentChatBody = {
  messages: { role: "user" | "assistant"; content: string }[];
  endpointIds: string[];
  modelId?: string;
};

export type AgentChatResult = {
  answer: string;
  thinking: string;
  steps: AgentStep[];
  citations: AgentCitation[];
};

export type AgentStreamEvent =
  | { type: "status"; message: string; modelId?: string; modelName?: string; toolCount?: number }
  | { type: "thinking"; text: string }
  | {
      type: "tool_start";
      id: string;
      tool: string;
      query: string;
      endpointId?: string;
      endpointName?: string;
    }
  | {
      type: "tool_result";
      id: string;
      tool: string;
      query: string;
      ok: boolean;
      preview: string;
      endpointId?: string;
      endpointName?: string;
      citations?: AgentCitation[];
    }
  | { type: "token"; text: string }
  | {
      type: "done";
      answer: string;
      thinking: string;
      steps: AgentStep[];
      citations: AgentCitation[];
    }
  | { type: "error"; message: string };

async function streamAgentChat(
  body: AgentChatBody,
  opts: { signal?: AbortSignal; onEvent: (event: AgentStreamEvent) => void },
) {
  const res = await fetch("/api/agent/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const payload = (await res.json()) as { detail?: unknown };
      if (typeof payload.detail === "string") detail = payload.detail;
      else if (payload.detail) detail = JSON.stringify(payload.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail || `请求失败 ${res.status}`);
  }
  if (!res.body) throw new Error("浏览器不支持流式响应");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          opts.onEvent(JSON.parse(raw) as AgentStreamEvent);
        } catch {
          /* ignore malformed */
        }
      }
    }
  }
}

export type McpRpc = {
  jsonrpc?: string;
  id?: number | string;
  result?: {
    protocolVersion?: string;
    tools?: { name: string; description?: string }[];
    content?: { type: string; text?: string }[];
    isError?: boolean;
    serverInfo?: { name: string; version: string };
  };
  error?: { code: number; message: string };
};

function uploadFile<T>(
  path: string,
  file: File,
  signal?: AbortSignal,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as T);
        return;
      }
      let detail = xhr.statusText;
      try {
        const body = JSON.parse(xhr.responseText) as { detail?: unknown };
        if (typeof body.detail === "string") detail = body.detail;
      } catch {
        /* ignore */
      }
      reject(new Error(detail || `上传失败 ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("上传失败"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
