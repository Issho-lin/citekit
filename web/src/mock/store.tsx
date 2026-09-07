import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { chunksFromSources } from "./chunks";
import {
  endpoints as seedEndpoints,
  evalCases as seedEval,
  slices as seedSlices,
  tools as seedTools,
} from "./seed";
import { fillProcess, filtersFromSearch, profileFromSearch } from "../constants";
import type {
  AiModel,
  ApiDatasetServer,
  Chunk,
  EvalCase,
  KnowledgeBase,
  McpEndpoint,
  ModelProvider,
  ModelTestResult,
  ProcessConfig,
  RetrievalTool,
  SearchConfig,
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
  kbsReady: boolean;
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
  providers: ModelProvider[];
  setVectorModel: (v: string) => void;
  setLlmModel: (v: string) => void;
  setVlmModel: (v: string) => void;
  setRerankModel: (v: string) => void;
  setRewriteFallback: (v: boolean) => void;
  addAiModel: (model: AiModel) => Promise<string | undefined>;
  updateAiModel: (model: string, patch: Partial<AiModel>) => Promise<void>;
  removeAiModel: (model: string) => Promise<void>;
  testAiModel: (model: string) => Promise<ModelTestResult>;
  updateProvider: (id: string, patch: { apiKey?: string; clearApiKey?: boolean }) => Promise<void>;
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
  }) => Promise<string>;
  updateKnowledgeBase: (id: string, patch: Partial<KnowledgeBase>) => Promise<void>;
  removeKnowledgeBase: (id: string) => Promise<void>;
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
    extra?: { fileId?: string; rawText?: string },
  ) => Promise<string>;
  updateSource: (id: string, patch: Partial<Source>) => Promise<void>;
  retrainSource: (id: string) => Promise<void>;
  updateChunk: (id: string, patch: Partial<Chunk>) => void;
  insertChunk: (sourceId: string, patch?: Partial<Pick<Chunk, "title" | "text" | "a" | "indexes">>) => string;
  removeChunk: (id: string) => void;
  removeSource: (id: string) => Promise<void>;
  loadSourceChunks: (sourceId: string) => Promise<void>;
  addTool: (input: {
    name: string;
    title: string;
    description: string;
    kbId: string;
    sourceIds: string[];
    search: SearchConfig;
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
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [kbsReady, setKbsReady] = useState(false);
  const [slices, setSlices] = useState(seedSlices);
  const [sources, setSources] = useState<Source[]>([]);
  const [tools, setTools] = useState(seedTools);
  const [endpoints, setEndpoints] = useState(seedEndpoints);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [evalCases, setEvalCases] = useState(seedEval);
  const [vectorModel, setVectorModelState] = useState("");
  const [llmModel, setLlmModelState] = useState("");
  const [vlmModel, setVlmModelState] = useState("");
  const [rerankModel, setRerankModelState] = useState("");
  const [rewriteFallback, setRewriteFallbackState] = useState(false);
  const [aiModels, setAiModels] = useState<AiModel[]>([]);
  const [providers, setProviders] = useState<ModelProvider[]>([]);

  const applyWorkspace = useCallback((ws: {
    llmModel: string;
    vectorModel: string;
    vlmModel: string;
    rerankModel: string;
    rewriteFallback: boolean;
  }) => {
    setLlmModelState(ws.llmModel);
    setVectorModelState(ws.vectorModel);
    setVlmModelState(ws.vlmModel);
    setRerankModelState(ws.rerankModel);
    setRewriteFallbackState(ws.rewriteFallback);
  }, []);

  const reloadKbs = useCallback(async () => {
    const kbs = await api.listKbs();
    setKnowledgeBases(kbs);
    const nested = await Promise.all(kbs.map((kb) => api.listSources(kb.id)));
    setSources(nested.flat());
    setKbsReady(true);
  }, []);

  const reloadCatalog = useCallback(async () => {
    const [models, ws, providerList] = await Promise.all([
      api.listModels(),
      api.getWorkspace(),
      api.listProviders(),
    ]);
    setAiModels(models);
    setProviders(providerList);
    applyWorkspace(ws);
  }, [applyWorkspace]);

  useEffect(() => {
    void Promise.all([reloadCatalog(), reloadKbs()]).catch((err: unknown) => {
      console.error("加载配置失败", err);
    });
  }, [reloadCatalog, reloadKbs]);

  useEffect(() => {
    if (!sources.some((s) => s.status === "syncing")) return;
    const timer = window.setInterval(() => {
      void reloadKbs().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [sources, reloadKbs]);

  const persistWorkspace = useCallback(
    async (patch: {
      llmModel?: string;
      vectorModel?: string;
      vlmModel?: string;
      rerankModel?: string;
      rewriteFallback?: boolean;
    }) => {
      applyWorkspace(await api.patchWorkspace(patch));
    },
    [applyWorkspace],
  );

  const setVectorModel = useCallback((v: string) => {
    setVectorModelState(v);
    void persistWorkspace({ vectorModel: v });
  }, [persistWorkspace]);
  const setLlmModel = useCallback((v: string) => {
    setLlmModelState(v);
    void persistWorkspace({ llmModel: v });
  }, [persistWorkspace]);
  const setVlmModel = useCallback((v: string) => {
    setVlmModelState(v);
    void persistWorkspace({ vlmModel: v });
  }, [persistWorkspace]);
  const setRerankModel = useCallback((v: string) => {
    setRerankModelState(v);
    void persistWorkspace({ rerankModel: v });
  }, [persistWorkspace]);
  const setRewriteFallback = useCallback((v: boolean) => {
    setRewriteFallbackState(v);
    void persistWorkspace({ rewriteFallback: v });
  }, [persistWorkspace]);

  const addAiModel = useCallback(async (model: AiModel) => {
    const created = await api.createModel(model);
    await reloadCatalog();
    return created.model;
  }, [reloadCatalog]);

  const updateAiModel = useCallback(
    async (model: string, patch: Partial<AiModel>) => {
      await api.patchModel(model, patch);
      await reloadCatalog();
    },
    [reloadCatalog],
  );

  const removeAiModel = useCallback(
    async (model: string) => {
      await api.deleteModel(model);
      await reloadCatalog();
    },
    [reloadCatalog],
  );

  const testAiModel = useCallback(
    async (model: string): Promise<ModelTestResult> => {
      try {
        return await api.testModel(model);
      } catch (err) {
        return { ok: false, ms: 0, message: err instanceof Error ? err.message : "测试失败" };
      }
    },
    [],
  );

  const updateProvider = useCallback(
    async (id: string, patch: { apiKey?: string; clearApiKey?: boolean }) => {
      await api.patchProvider(id, patch);
      await reloadCatalog();
    },
    [reloadCatalog],
  );

  const addKnowledgeBase = useCallback(
    async (input: {
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
      const created = await api.createKb({
        ...input,
        vectorModel: input.vectorModel || vectorModel,
        llmModel: input.llmModel || llmModel,
        vlmModel: input.vlmModel || vlmModel,
        rerankModel: input.rerankModel ?? rerankModel,
      });
      await reloadKbs();
      return created.id;
    },
    [vectorModel, llmModel, vlmModel, rerankModel, reloadKbs],
  );

  const updateKnowledgeBase = useCallback(
    async (id: string, patch: Partial<KnowledgeBase>) => {
      const updated = await api.patchKb(id, patch);
      setKnowledgeBases((prev) => prev.map((k) => (k.id === id ? updated : k)));
    },
    [],
  );

  const removeKnowledgeBase = useCallback(
    async (id: string) => {
      await api.deleteKb(id);
      await reloadKbs();
    },
    [reloadKbs],
  );

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
    async (
      kbId: string,
      type: SourceType,
      title: string,
      locator: string,
      process?: ProcessConfig,
      parentId?: string,
      extra?: { fileId?: string; rawText?: string },
    ) => {
      const created = await api.createSource(kbId, {
        type,
        title,
        locator,
        parentId,
        process,
        fileId: extra?.fileId,
        rawText: extra?.rawText,
      });
      await reloadKbs();
      return created.id;
    },
    [reloadKbs],
  );

  const updateSource = useCallback(
    async (id: string, patch: Partial<Source>) => {
      const processKeys: (keyof ProcessConfig)[] = [
        "trainingType",
        "chunkTriggerType",
        "chunkTriggerMinSize",
        "indexPrefixTitle",
        "autoIndexes",
        "imageIndex",
        "chunkSettingMode",
        "chunkSplitMode",
        "paragraphChunkAIMode",
        "paragraphChunkDeep",
        "chunkSize",
        "chunkSplitter",
        "indexSize",
        "qaPrompt",
        "pdfEnhance",
        "webSelector",
        "chunkOverlap",
        "qaEnhance",
        "customSplit",
      ];
      const process = Object.fromEntries(
        processKeys.filter((key) => patch[key] !== undefined).map((key) => [key, patch[key]]),
      ) as Partial<ProcessConfig>;
      const body: { title?: string; process?: ProcessConfig } = {};
      if (patch.title) body.title = patch.title;
      if (Object.keys(process).length) body.process = fillProcess({ ...process });
      const updated = await api.patchSource(id, body);
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
    },
    [],
  );

  const retrainSource = useCallback(
    async (id: string) => {
      const updated = await api.retrainSource(id);
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
    },
    [],
  );

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

  const removeSource = useCallback(
    async (id: string) => {
      await api.deleteSource(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
      setChunks((prev) => prev.filter((c) => c.sourceId !== id));
      await reloadKbs();
    },
    [reloadKbs],
  );

  const loadSourceChunks = useCallback(async (sourceId: string) => {
    const rows = await api.listChunks(sourceId);
    setChunks((prev) => [...prev.filter((c) => c.sourceId !== sourceId), ...rows]);
  }, []);

  const addTool = useCallback(
    (input: {
      name: string;
      title: string;
      description: string;
      kbId: string;
      sourceIds: string[];
      search: SearchConfig;
    }) => {
      const id = nid("tool");
      const search = { ...input.search };
      setTools((prev) => [
        {
          id,
          name: input.name,
          title: input.title,
          description: input.description,
          kbId: input.kbId,
          sourceIds: input.sourceIds,
          search,
          profile: profileFromSearch(search),
          requiredFilters: filtersFromSearch(search),
        },
        ...prev,
      ]);
      return id;
    },
    [],
  );

  const updateTool = useCallback((id: string, patch: Partial<RetrievalTool>) => {
    setTools((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        if (patch.search) {
          next.search = { ...t.search, ...patch.search };
          next.profile = profileFromSearch(next.search);
          next.requiredFilters = filtersFromSearch(next.search);
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
      kbsReady,
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
      providers,
      setVectorModel,
      setLlmModel,
      setVlmModel,
      setRerankModel,
      setRewriteFallback,
      addAiModel,
      updateAiModel,
      removeAiModel,
      testAiModel,
      updateProvider,
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
      loadSourceChunks,
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
      kbsReady,
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
      providers,
      setVectorModel,
      setLlmModel,
      setVlmModel,
      setRerankModel,
      setRewriteFallback,
      addAiModel,
      updateAiModel,
      removeAiModel,
      testAiModel,
      updateProvider,
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
      loadSourceChunks,
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
