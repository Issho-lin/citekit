import type { AiModel, ModelProvider, ModelTestResult } from "./types";
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
};
