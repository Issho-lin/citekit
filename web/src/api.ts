import type { AiModel, Chunk, KnowledgeBase, ModelCall, ModelCallSummary, ModelProvider, ModelTestResult, ProcessConfig, SearchConfig, Source } from "./types";
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
  rewriteFallback: boolean;
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
    if (isPlainSecret(requestAuth)) payload.requestAuthEnc = await encryptSecret(requestAuth.trim());
    return request<AiModel>("/api/models", { method: "POST", body: JSON.stringify(payload) });
  },
  patchModel: async (id: string, patch: Partial<AiModel>) => {
    const { requestAuth, ...rest } = patch;
    const payload: Record<string, unknown> = { ...rest };
    if (isPlainSecret(requestAuth)) payload.requestAuthEnc = await encryptSecret(requestAuth.trim());
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
  uploadKbFile: (kbId: string, file: File, signal?: AbortSignal, onProgress?: (p: number) => void) =>
    uploadFile<{ id: string; name: string; size: number }>(
      `/api/kbs/${encodeURIComponent(kbId)}/files`,
      file,
      signal,
      onProgress,
    ),
  previewKb: (kbId: string, body: { fileId?: string; rawText?: string; process?: ProcessConfig }) =>
    request<{
      chunks: { title: string; text: string; chars: number }[];
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
  listChunks: (sourceId: string) => request<Chunk[]>(`/api/sources/${encodeURIComponent(sourceId)}/chunks`),
  searchKb: (
    kbId: string,
    body: {
      query: string;
      sourceIds?: string[];
      searchMode?: SearchConfig["searchMode"];
      similarity?: number;
      limit?: number;
      usingRerank?: boolean;
    },
  ) =>
    request<{ hits: { chunk: Chunk; score: number; note: string }[]; message?: string | null }>(
      `/api/kbs/${encodeURIComponent(kbId)}/search`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listModelCalls: (params?: {
    modelId?: string;
    type?: string;
    purpose?: string;
    ok?: boolean;
    q?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.modelId) query.set("modelId", params.modelId);
    if (params?.type) query.set("type", params.type);
    if (params?.purpose) query.set("purpose", params.purpose);
    if (params?.ok !== undefined) query.set("ok", String(params.ok));
    if (params?.q) query.set("q", params.q);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const suffix = query.toString();
    return request<{ items: ModelCallSummary[]; total: number }>(
      `/api/model-calls${suffix ? `?${suffix}` : ""}`,
    );
  },
  getModelCall: (id: string) => request<ModelCall>(`/api/model-calls/${encodeURIComponent(id)}`),
  clearModelCalls: () => request<{ ok: boolean; deleted: number }>("/api/model-calls", { method: "DELETE" }),
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
