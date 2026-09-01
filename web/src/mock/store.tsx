import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { chunksFromSources } from "./chunks";
import {
  chunks as seedChunks,
  endpoints as seedEndpoints,
  evalCases as seedEval,
  knowledgeBases as seedKbs,
  slices as seedSlices,
  sources as seedSources,
  tools as seedTools,
} from "./seed";
import { DEFAULT_SEARCH, fillProcess } from "../constants";
import { matchesType, seedAiModels, seedChannels } from "./models";
import type {
  AiModel,
  ApiDatasetServer,
  Chunk,
  EvalCase,
  KnowledgeBase,
  McpEndpoint,
  ModelChannel,
  ModelTestResult,
  ModelType,
  ProcessConfig,
  RetrievalProfile,
  RetrievalTool,
  Slice,
  Source,
  SourceType,
} from "../types";

function nid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function bumpVersion(v: string) {
  const n = Number(v.replace(/^v/i, ""));
  return `v${Number.isFinite(n) ? n + 1 : 1}`;
}

interface Store {
  knowledgeBases: KnowledgeBase[];
  slices: Slice[];
  sources: Source[];
  tools: RetrievalTool[];
  endpoints: McpEndpoint[];
  chunks: Chunk[];
  evalCases: EvalCase[];
  vectorModel: string;
  llmModel: string;
  vlmModel: string;
  rerankModel: string;
  rewriteFallback: boolean;
  aiModels: AiModel[];
  channels: ModelChannel[];
  setVectorModel: (v: string) => void;
  setLlmModel: (v: string) => void;
  setVlmModel: (v: string) => void;
  setRerankModel: (v: string) => void;
  setRewriteFallback: (v: boolean) => void;
  addAiModel: (model: AiModel) => string | undefined;
  updateAiModel: (model: string, patch: Partial<AiModel>) => void;
  removeAiModel: (model: string) => void;
  addChannel: (channel: Omit<ModelChannel, "id">) => string;
  updateChannel: (id: string, patch: Partial<ModelChannel>) => void;
  removeChannel: (id: string) => void;
  testAiModel: (model: string, channelId?: string) => Promise<ModelTestResult>;
  addKnowledgeBase: (input: {
    name: string;
    domain: string;
    description: string;
    kind?: KnowledgeBase["kind"];
    parentId?: string;
    websiteUrl?: string;
    websiteSelector?: string;
    apiDatasetServer?: ApiDatasetServer;
    vectorModel?: string;
    llmModel?: string;
    vlmModel?: string;
    rerankModel?: string;
  }) => string;
  updateKnowledgeBase: (id: string, patch: Partial<KnowledgeBase>) => void;
  removeKnowledgeBase: (id: string) => void;
  addSlice: (input: {
    kbId: string;
    name: string;
    chunkStrategy: string;
    sourceIds: string[];
  }) => string;
  rebuildSlice: (id: string) => void;
  removeSlice: (id: string) => void;
  addSource: (
    kbId: string,
    type: SourceType,
    title: string,
    locator: string,
    process?: ProcessConfig,
    parentId?: string,
  ) => string;
  updateSource: (id: string, patch: Partial<Source>) => void;
  retrainSource: (id: string) => void;
  updateChunk: (id: string, patch: Partial<Chunk>) => void;
  insertChunk: (sourceId: string, patch?: Partial<Pick<Chunk, "title" | "text" | "a" | "indexes">>) => string;
  removeChunk: (id: string) => void;
  removeSource: (id: string) => void;
  addTool: (input: {
    name: string;
    title: string;
    description: string;
    kbId: string;
    sourceIds: string[];
    profile: RetrievalProfile;
  }) => string;
  updateTool: (id: string, patch: Partial<RetrievalTool>) => void;
  removeTool: (id: string) => void;
  addEndpoint: (input: { name: string; env: "dev" | "prod"; toolIds: string[] }) => string;
  toggleEndpointTool: (endpointId: string, toolId: string) => void;
  addToolToEndpoint: (endpointId: string, toolId: string) => void;
  removeEndpoint: (id: string) => void;
  addEvalCase: (input: { query: string; toolId: string; expect: string; warehouse?: string }) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [knowledgeBases, setKnowledgeBases] = useState(seedKbs);
  const [slices, setSlices] = useState(seedSlices);
  const [sources, setSources] = useState(seedSources);
  const [tools, setTools] = useState(seedTools);
  const [endpoints, setEndpoints] = useState(seedEndpoints);
  const [chunks, setChunks] = useState(seedChunks);
  const [evalCases, setEvalCases] = useState(seedEval);
  const [vectorModel, setVectorModel] = useState("bge-m3");
  const [llmModel, setLlmModel] = useState("gpt-4o-mini");
  const [vlmModel, setVlmModel] = useState("gpt-4o-mini");
  const [rerankModel, setRerankModel] = useState("bge-reranker-v2-m3");
  const [rewriteFallback, setRewriteFallback] = useState(false);
  const [aiModels, setAiModels] = useState(seedAiModels);
  const [channels, setChannels] = useState(seedChannels);

  const pickFallback = useCallback((type: ModelType, except?: string) => {
    return aiModels.find((m) => m.isActive && matchesType(m, type) && m.model !== except)?.model;
  }, [aiModels]);

  const addAiModel = useCallback((model: AiModel) => {
    const id = model.model.trim();
    if (!id) return undefined;
    let duplicated = false;
    setAiModels((prev) => {
      if (prev.some((m) => m.model === id)) {
        duplicated = true;
        return prev;
      }
      return [{ ...model, model: id, isCustom: true, isActive: true }, ...prev];
    });
    return duplicated ? undefined : id;
  }, []);

  const updateAiModel = useCallback(
    (model: string, patch: Partial<AiModel>) => {
      setAiModels((prev) => prev.map((m) => (m.model === model ? { ...m, ...patch, model: m.model } : m)));
      if (patch.isActive === false) {
        if (vectorModel === model) {
          const next = pickFallback("embedding", model);
          if (next) setVectorModel(next);
        }
        if (llmModel === model) {
          const next = pickFallback("llm", model);
          if (next) setLlmModel(next);
        }
        if (vlmModel === model) {
          const next = pickFallback("vlm", model);
          if (next) setVlmModel(next);
        }
        if (rerankModel === model) {
          const next = pickFallback("rerank", model);
          if (next) setRerankModel(next);
        }
      }
    },
    [llmModel, pickFallback, rerankModel, vectorModel, vlmModel],
  );

  const removeAiModel = useCallback(
    (model: string) => {
      setAiModels((prev) => prev.filter((m) => m.model !== model));
      setChannels((prev) => prev.map((c) => ({ ...c, modelIds: c.modelIds.filter((id) => id !== model) })));
      if (vectorModel === model) {
        const next = pickFallback("embedding", model);
        if (next) setVectorModel(next);
      }
      if (llmModel === model) {
        const next = pickFallback("llm", model);
        if (next) setLlmModel(next);
      }
      if (vlmModel === model) {
        const next = pickFallback("vlm", model);
        if (next) setVlmModel(next);
      }
      if (rerankModel === model) {
        const next = pickFallback("rerank", model);
        if (next) setRerankModel(next);
      }
    },
    [llmModel, pickFallback, rerankModel, vectorModel, vlmModel],
  );

  const addChannel = useCallback((channel: Omit<ModelChannel, "id">) => {
    const id = nid("ch");
    setChannels((prev) => [{ ...channel, id }, ...prev]);
    return id;
  }, []);

  const updateChannel = useCallback((id: string, patch: Partial<ModelChannel>) => {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeChannel = useCallback((id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const testAiModel = useCallback(
    async (model: string, channelId?: string): Promise<ModelTestResult> => {
      const item = aiModels.find((m) => m.model === model);
      const wait = 420 + Math.floor(Math.random() * 780);
      await new Promise((r) => setTimeout(r, wait));
      if (!item) return { ok: false, ms: wait, message: "模型不存在" };
      const customOk = Boolean(item.requestUrl?.trim());
      const channel = channelId
        ? channels.find((c) => c.id === channelId)
        : channels
            .filter((c) => c.enabled && c.modelIds.includes(model))
            .sort((a, b) => b.priority - a.priority)[0];
      if (!customOk && !channel) {
        return { ok: false, ms: wait, message: "没有可用渠道，请先在「模型渠道」中配置" };
      }
      if (channel && !channel.enabled) {
        return { ok: false, ms: wait, message: "渠道已禁用" };
      }
      if (!customOk && channel && !channel.apiKey.trim()) {
        return { ok: false, ms: wait, message: "渠道缺少 API 密钥" };
      }
      if (channel && channelId && !channel.modelIds.includes(model)) {
        return { ok: false, ms: wait, message: "该渠道未勾选此模型" };
      }
      return { ok: true, ms: wait, message: "连接正常" };
    },
    [aiModels, channels],
  );

  const addKnowledgeBase = useCallback(
    (input: {
      name: string;
      domain: string;
      description: string;
      kind?: KnowledgeBase["kind"];
      parentId?: string;
      websiteUrl?: string;
      websiteSelector?: string;
      apiDatasetServer?: ApiDatasetServer;
      vectorModel?: string;
      llmModel?: string;
      vlmModel?: string;
      rerankModel?: string;
    }) => {
      const id = nid("kb");
      setKnowledgeBases((prev) => [
        {
          id,
          docCount: 0,
          kind: input.kind ?? "dataset",
          vectorModel,
          llmModel,
          vlmModel,
          rerankModel,
          ...DEFAULT_SEARCH,
          ...input,
        },
        ...prev,
      ]);
      return id;
    },
    [vectorModel, llmModel, vlmModel, rerankModel],
  );

  const updateKnowledgeBase = useCallback((id: string, patch: Partial<KnowledgeBase>) => {
    setKnowledgeBases((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  }, []);

  const removeKnowledgeBase = useCallback((id: string) => {
    setKnowledgeBases((prev) => {
      const drop = new Set<string>();
      const walk = (kid: string) => {
        drop.add(kid);
        prev.filter((k) => k.parentId === kid).forEach((k) => walk(k.id));
      };
      walk(id);
      const ids = [...drop];
      const sliceIds = slices.filter((s) => ids.includes(s.kbId)).map((s) => s.id);
      const toolIds = tools.filter((t) => ids.includes(t.kbId)).map((t) => t.id);
      setSources((s) => s.filter((x) => !ids.includes(x.kbId)));
      setSlices((s) => s.filter((x) => !ids.includes(x.kbId)));
      setChunks((c) => c.filter((x) => !sliceIds.includes(x.sliceId)));
      setTools((t) => t.filter((x) => !ids.includes(x.kbId)));
      setEndpoints((e) =>
        e.map((x) => ({ ...x, toolIds: x.toolIds.filter((tid) => !toolIds.includes(tid)) })),
      );
      setEvalCases((c) => c.filter((x) => !toolIds.includes(x.toolId)));
      return prev.filter((k) => !drop.has(k.id));
    });
  }, [slices, tools]);

  const addSlice = useCallback(
    (input: { kbId: string; name: string; chunkStrategy: string; sourceIds: string[] }) => {
      const id = nid("slice");
      const picked = sources.filter((s) => input.sourceIds.includes(s.id));
      const scope = picked.map((s) => s.title).join(" · ") || "全库";
      setSlices((prev) => [
        {
          id,
          embedding: vectorModel,
          status: "ready",
          version: "v1",
          scope,
          ...input,
        },
        ...prev,
      ]);
      setChunks((prev) => [...chunksFromSources(id, picked, () => nid("c")), ...prev]);
      return id;
    },
    [sources, vectorModel],
  );

  const rebuildSlice = useCallback(
    (id: string) => {
      setSlices((prev) => prev.map((s) => (s.id === id ? { ...s, status: "building" } : s)));
      window.setTimeout(() => {
        setSlices((prev) => {
          const slice = prev.find((s) => s.id === id);
          if (!slice) return prev;
          const picked = sources.filter((s) => slice.sourceIds.includes(s.id));
          setChunks((cs) => [
            ...chunksFromSources(id, picked, () => nid("c")),
            ...cs.filter((c) => c.sliceId !== id),
          ]);
          return prev.map((s) =>
            s.id === id
              ? { ...s, status: "ready", version: bumpVersion(s.version), embedding: vectorModel }
              : s,
          );
        });
      }, 700);
    },
    [sources, vectorModel],
  );

  const removeSlice = useCallback((id: string) => {
    const toolIds = tools.filter((t) => t.sliceId === id).map((t) => t.id);
    setSlices((prev) => prev.filter((s) => s.id !== id));
    setChunks((prev) => prev.filter((c) => c.sliceId !== id));
    setTools((prev) => prev.filter((t) => t.sliceId !== id));
    setEndpoints((prev) =>
      prev.map((e) => ({ ...e, toolIds: e.toolIds.filter((tid) => !toolIds.includes(tid)) })),
    );
    setEvalCases((prev) => prev.filter((c) => !toolIds.includes(c.toolId)));
  }, [tools]);

  const addSource = useCallback(
    (
      kbId: string,
      type: SourceType,
      title: string,
      locator: string,
      process?: ProcessConfig,
      parentId?: string,
    ) => {
      const now = new Date().toISOString().slice(0, 16).replace("T", " ");
      const source: Source = {
        id: nid("src"),
        kbId,
        parentId,
        type,
        title,
        locator,
        acl: type === "feishu" ? "restricted" : type === "web" ? "public" : "internal",
        status: type === "folder" ? "synced" : "syncing",
        updatedAt: now,
        ...fillProcess(process ?? {}),
      };
      setSources((prev) => [source, ...prev]);
      if (type === "folder") {
        return source.id;
      }
      setKnowledgeBases((prev) =>
        prev.map((k) => (k.id === kbId ? { ...k, docCount: k.docCount + 1 } : k)),
      );
      const mine = slices.filter((s) => s.kbId === kbId);
      const ready = { ...source, status: "synced" as const };
      if (mine.length === 0) {
        const sliceId = nid("slice");
        setSlices((prev) => [
          {
            id: sliceId,
            kbId,
            name: "默认索引",
            scope: title,
            sourceIds: [source.id],
            chunkStrategy: "adaptive",
            embedding: vectorModel,
            status: "ready",
            version: "v1",
          },
          ...prev,
        ]);
        setChunks((prev) => [...chunksFromSources(sliceId, [ready], () => nid("c")), ...prev]);
      } else {
        const t = mine[0];
        setSlices((prev) =>
          prev.map((s) =>
            s.id === t.id ? { ...s, sourceIds: [...s.sourceIds, source.id] } : s,
          ),
        );
        setChunks((prev) => [...chunksFromSources(t.id, [ready], () => nid("c")), ...prev]);
      }
      window.setTimeout(() => {
        setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, status: "synced" } : s)));
      }, 600);
      return source.id;
    },
    [slices, vectorModel],
  );

  const updateSource = useCallback((id: string, patch: Partial<Source>) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const retrainSource = useCallback((id: string) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, status: "syncing" } : s)));
    window.setTimeout(() => {
      setSources((prev) => {
        const source = prev.find((s) => s.id === id);
        if (!source) return prev;
        const slice = slices.find((sl) => sl.sourceIds.includes(id));
        const sliceId = slice?.id ?? nid("slice");
        const ready = { ...source, status: "synced" as const };
        setChunks((cs) => [
          ...cs.filter((c) => c.sourceId !== id),
          ...chunksFromSources(sliceId, [ready], () => nid("c")),
        ]);
        return prev.map((s) => (s.id === id ? { ...s, status: "synced" } : s));
      });
    }, 700);
  }, [slices]);

  const updateChunk = useCallback((id: string, patch: Partial<Chunk>) => {
    setChunks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const insertChunk = useCallback((sourceId: string, patch?: Partial<Pick<Chunk, "title" | "text" | "a" | "indexes">>) => {
    const source = sources.find((s) => s.id === sourceId);
    const slice = slices.find((sl) => sl.sourceIds.includes(sourceId));
    const id = nid("c");
    if (!source) return id;
    const sliceId = slice?.id ?? nid("slice");
    setChunks((prev) => [
      {
        id,
        sliceId,
        sourceId,
        title: patch?.title?.trim() || "手动插入",
        locator: `${source.locator} · new`,
        text: patch?.text ?? "",
        a: patch?.a,
        indexes: patch?.indexes,
      },
      ...prev,
    ]);
    return id;
  }, [sources, slices]);

  const removeChunk = useCallback((id: string) => {
    setChunks((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources((prev) => {
      const found = prev.find((s) => s.id === id);
      if (found) {
        setKnowledgeBases((kbs) =>
          kbs.map((k) =>
            k.id === found.kbId ? { ...k, docCount: Math.max(0, k.docCount - 1) } : k,
          ),
        );
      }
      return prev.filter((s) => s.id !== id);
    });
    setChunks((prev) => prev.filter((c) => c.sourceId !== id));
    setSlices((prev) =>
      prev.map((s) => ({ ...s, sourceIds: s.sourceIds.filter((sid) => sid !== id) })),
    );
    setTools((prev) =>
      prev.map((t) => ({ ...t, sourceIds: t.sourceIds.filter((sid) => sid !== id) })),
    );
  }, []);

  const addTool = useCallback(
    (input: {
      name: string;
      title: string;
      description: string;
      kbId: string;
      sourceIds: string[];
      profile: RetrievalProfile;
    }) => {
      const id = nid("tool");
      const requiredFilters = input.profile === "filter_first" ? ["warehouse"] : [];
      setTools((prev) => [{ id, requiredFilters, ...input }, ...prev]);
      return id;
    },
    [],
  );

  const updateTool = useCallback((id: string, patch: Partial<RetrievalTool>) => {
    setTools((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        if (patch.profile) {
          next.requiredFilters = patch.profile === "filter_first" ? ["warehouse"] : [];
        }
        return next;
      }),
    );
  }, []);

  const removeTool = useCallback((id: string) => {
    setTools((prev) => prev.filter((t) => t.id !== id));
    setEndpoints((prev) =>
      prev.map((e) => ({ ...e, toolIds: e.toolIds.filter((tid) => tid !== id) })),
    );
    setEvalCases((prev) => prev.filter((c) => c.toolId !== id));
  }, []);

  const addEndpoint = useCallback((input: { name: string; env: "dev" | "prod"; toolIds: string[] }) => {
    const id = nid("mcp");
    const slug = input.name.toLowerCase().replace(/\s+/g, "-").slice(0, 24);
    setEndpoints((prev) => [
      {
        id,
        url: `https://mcp.citekit.local/s/${slug || id}`,
        apiKey: `cb_live_${nid("k")}`,
        ...input,
      },
      ...prev,
    ]);
    return id;
  }, []);

  const toggleEndpointTool = useCallback((endpointId: string, toolId: string) => {
    setEndpoints((prev) =>
      prev.map((e) => {
        if (e.id !== endpointId) return e;
        const has = e.toolIds.includes(toolId);
        return {
          ...e,
          toolIds: has ? e.toolIds.filter((tid: string) => tid !== toolId) : [...e.toolIds, toolId],
        };
      }),
    );
  }, []);

  const addToolToEndpoint = useCallback((endpointId: string, toolId: string) => {
    setEndpoints((prev) =>
      prev.map((e) =>
        e.id === endpointId && !e.toolIds.includes(toolId)
          ? { ...e, toolIds: [...e.toolIds, toolId] }
          : e,
      ),
    );
  }, []);

  const removeEndpoint = useCallback((id: string) => {
    setEndpoints((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addEvalCase = useCallback(
    (input: { query: string; toolId: string; expect: string; warehouse?: string }) => {
      setEvalCases((prev) => [{ id: nid("ev"), ...input }, ...prev]);
    },
    [],
  );

  const value = useMemo<Store>(
    () => ({
      knowledgeBases,
      slices,
      sources,
      tools,
      endpoints,
      chunks,
      evalCases,
      vectorModel,
      llmModel,
      vlmModel,
      rerankModel,
      rewriteFallback,
      aiModels,
      channels,
      setVectorModel,
      setLlmModel,
      setVlmModel,
      setRerankModel,
      setRewriteFallback,
      addAiModel,
      updateAiModel,
      removeAiModel,
      addChannel,
      updateChannel,
      removeChannel,
      testAiModel,
      addKnowledgeBase,
      updateKnowledgeBase,
      removeKnowledgeBase,
      addSlice,
      rebuildSlice,
      removeSlice,
      addSource,
      updateSource,
      retrainSource,
      updateChunk,
      insertChunk,
      removeChunk,
      removeSource,
      addTool,
      updateTool,
      removeTool,
      addEndpoint,
      toggleEndpointTool,
      addToolToEndpoint,
      removeEndpoint,
      addEvalCase,
    }),
    [
      knowledgeBases,
      slices,
      sources,
      tools,
      endpoints,
      chunks,
      evalCases,
      vectorModel,
      llmModel,
      vlmModel,
      rerankModel,
      rewriteFallback,
      aiModels,
      channels,
      addAiModel,
      updateAiModel,
      removeAiModel,
      addChannel,
      updateChannel,
      removeChannel,
      testAiModel,
      addKnowledgeBase,
      updateKnowledgeBase,
      removeKnowledgeBase,
      addSlice,
      rebuildSlice,
      removeSlice,
      addSource,
      updateSource,
      retrainSource,
      updateChunk,
      insertChunk,
      removeChunk,
      removeSource,
      addTool,
      updateTool,
      removeTool,
      addEndpoint,
      toggleEndpointTool,
      addToolToEndpoint,
      removeEndpoint,
      addEvalCase,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
