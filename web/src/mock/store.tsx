import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { chunksFromSources } from "./chunks";
import { slices as seedSlices } from "./seed";
import { fillProcess } from "../constants";
import type {
  AiModel,
  ApiDatasetServer,
  Chunk,
  EvalCase,
  EvalRun,
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
  syncWebsite: (kbId: string, input: { url: string; selector?: string }) => Promise<{ maxPages: number; maxDepth: number }>;
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
  updateChunk: (id: string, patch: Partial<Chunk>) => Promise<void>;
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
  }) => Promise<string>;
  updateTool: (id: string, patch: Partial<RetrievalTool> & { search?: SearchConfig }) => Promise<void>;
  removeTool: (id: string) => Promise<void>;
  addEndpoint: (input: { name: string; env: "dev" | "prod"; toolIds: string[] }) => Promise<string>;
  patchEndpoint: (id: string, patch: Partial<Pick<McpEndpoint, "name" | "env" | "toolIds">>) => Promise<void>;
  toggleEndpointTool: (endpointId: string, toolId: string) => Promise<void>;
  addToolToEndpoint: (endpointId: string, toolId: string) => Promise<void>;
  removeEndpoint: (id: string) => Promise<void>;
  addEvalCase: (input: { query: string; toolId: string; expect: string; warehouse?: string }) => Promise<void>;
  addEvalCaseFromMcp: (callId: string) => Promise<EvalCase>;
  removeEvalCase: (id: string) => Promise<void>;
  runEvalCases: (toolId?: string) => Promise<{ runs: EvalRun[]; failed: number }>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [kbsReady, setKbsReady] = useState(false);
  const [slices, setSlices] = useState(seedSlices);
  const [sources, setSources] = useState<Source[]>([]);
  const [tools, setTools] = useState<RetrievalTool[]>([]);
  const [endpoints, setEndpoints] = useState<McpEndpoint[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [evalCases, setEvalCases] = useState<EvalCase[]>([]);
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
  }, []);

  const reloadTools = useCallback(async () => {
    const [toolList, endpointList, evalList] = await Promise.all([
      api.listTools(),
      api.listEndpoints(),
      api.listEvalCases(),
    ]);
    setTools(toolList);
    setEndpoints(endpointList);
    setEvalCases(evalList);
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
    void Promise.all([reloadCatalog(), reloadKbs(), reloadTools()])
      .catch((err: unknown) => {
        console.error("加载配置失败", err);
      })
      .finally(() => setKbsReady(true));
  }, [reloadCatalog, reloadKbs, reloadTools]);

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

  const syncWebsite = useCallback(
    async (kbId: string, input: { url: string; selector?: string }) => {
      const result = await api.syncWebsite(kbId, input);
      await reloadKbs();
      return { maxPages: result.maxPages, maxDepth: result.maxDepth };
    },
    [reloadKbs],
  );

  const removeKnowledgeBase = useCallback(
    async (id: string) => {
      await api.deleteKb(id);
      await Promise.all([reloadKbs(), reloadTools()]);
    },
    [reloadKbs, reloadTools],
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
        "indexChunkTitle",
        "autoIndexes",
        "imageIndex",
        "imageIndexMode",
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
        "useChildIndex",
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

  const updateChunk = useCallback(async (id: string, patch: Partial<Chunk>) => {
    const updated = await api.patchChunk(id, {
      title: patch.title,
      text: patch.text,
      a: patch.a,
      indexes: patch.indexes,
    });
    setChunks((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
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
    async (input: {
      name: string;
      title: string;
      description: string;
      kbId: string;
      sourceIds: string[];
      search: SearchConfig;
    }) => {
      const created = await api.createTool(input);
      setTools((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      return created.id;
    },
    [],
  );

  const updateTool = useCallback(async (id: string, patch: Partial<RetrievalTool> & { search?: SearchConfig }) => {
    const updated = await api.patchTool(id, patch);
    setTools((prev) => prev.map((item) => (item.id === id ? updated : item)));
  }, []);

  const removeTool = useCallback(async (id: string) => {
    await api.deleteTool(id);
    setTools((prev) => prev.filter((item) => item.id !== id));
    setEndpoints((prev) =>
      prev.map((item) => ({ ...item, toolIds: item.toolIds.filter((tid) => tid !== id) })),
    );
    setEvalCases((prev) => prev.filter((item) => item.toolId !== id));
  }, []);

  const addEndpoint = useCallback(async (input: { name: string; env: "dev" | "prod"; toolIds: string[] }) => {
    const created = await api.createEndpoint(input);
    setEndpoints((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
    return created.id;
  }, []);

  const patchEndpoint = useCallback(async (id: string, patch: Partial<Pick<McpEndpoint, "name" | "env" | "toolIds">>) => {
    const updated = await api.patchEndpoint(id, patch);
    setEndpoints((prev) => prev.map((item) => (item.id === id ? updated : item)));
  }, []);

  const toggleEndpointTool = useCallback(async (endpointId: string, toolId: string) => {
    const current = endpoints.find((item) => item.id === endpointId);
    if (!current) return;
    const has = current.toolIds.includes(toolId);
    const toolIds = has ? current.toolIds.filter((tid) => tid !== toolId) : [...current.toolIds, toolId];
    const updated = await api.patchEndpoint(endpointId, { toolIds });
    setEndpoints((prev) => prev.map((item) => (item.id === endpointId ? updated : item)));
  }, [endpoints]);

  const addToolToEndpoint = useCallback(async (endpointId: string, toolId: string) => {
    const current = endpoints.find((item) => item.id === endpointId);
    if (!current || current.toolIds.includes(toolId)) return;
    const updated = await api.patchEndpoint(endpointId, { toolIds: [...current.toolIds, toolId] });
    setEndpoints((prev) => prev.map((item) => (item.id === endpointId ? updated : item)));
  }, [endpoints]);

  const removeEndpoint = useCallback(async (id: string) => {
    await api.deleteEndpoint(id);
    setEndpoints((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addEvalCaseFromMcp = useCallback(async (callId: string) => {
    const created = await api.createEvalCaseFromMcp(callId);
    setEvalCases((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
    const toolList = await api.listTools();
    setTools(toolList);
    return created;
  }, []);

  const addEvalCase = useCallback(
    async (input: { query: string; toolId: string; expect: string; warehouse?: string }) => {
      const created = await api.createEvalCase(input);
      setEvalCases((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      const toolList = await api.listTools();
      setTools(toolList);
    },
    [],
  );

  const removeEvalCase = useCallback(async (id: string) => {
    await api.deleteEvalCase(id);
    setEvalCases((prev) => prev.filter((item) => item.id !== id));
    const toolList = await api.listTools();
    setTools(toolList);
  }, []);

  const runEvalCases = useCallback(async (toolId?: string) => {
    const result = await api.runEvalCases(toolId);
    const toolList = await api.listTools();
    setTools(toolList);
    return result;
  }, []);

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
      syncWebsite,
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
      patchEndpoint,
      toggleEndpointTool,
      addToolToEndpoint,
      removeEndpoint,
      addEvalCase,
      addEvalCaseFromMcp,
      removeEvalCase,
      runEvalCases,
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
      syncWebsite,
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
      patchEndpoint,
      toggleEndpointTool,
      addToolToEndpoint,
      removeEndpoint,
      addEvalCase,
      addEvalCaseFromMcp,
      removeEvalCase,
      runEvalCases,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
