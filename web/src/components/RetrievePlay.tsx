import { FormEvent, useEffect, useState } from "react";
import { Alert, Button, Switch } from "@chakra-ui/react";
import { SEARCH_MODES } from "../constants";
import { retrieve, type Hit } from "../mock/retrieve";
import type { Chunk, HitTrace, RetrievalProfile, SearchConfig, SearchDebug } from "../types";
import { Empty } from "./chrome";
import { FgSlider } from "./FgSlider";
import { IconSearch } from "./icons";
import { MySelect } from "./MySelect";
import { QuestionTip } from "./QuestionTip";
import { useStore } from "../mock/store";

function SwitchField({
  title,
  tip,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  tip: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="fg-slider">
      <div className="fg-slider-label">
        {title}
        <QuestionTip label={tip} maxW="360px" />
      </div>
      <Switch
        size="md"
        isChecked={checked}
        isDisabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

export function SearchParamsFields({
  search,
  onChange,
}: {
  search: SearchConfig;
  onChange: (next: SearchConfig) => void;
}) {
  const { aiModels } = useStore();
  const hasRerank = aiModels.some((m) => m.isActive && m.type === "rerank");
  function patch(next: Partial<SearchConfig>) {
    onChange({ ...search, ...next });
  }

  return (
    <div className="search-params">
      <div className="fg-slider">
        <div className="fg-slider-label">
          检索模式
          <QuestionTip
            maxW="360px"
            label={"语义：按意思找，适合「怎么退货」这类问法。\n全文：按关键词命中，适合货号、专名。\n混合：两种一起排，一般作为默认。"}
          />
        </div>
        <div className="fg-slider-control">
          <MySelect
            h="32px"
            value={search.searchMode}
            onChange={(next) => patch({ searchMode: next as SearchConfig["searchMode"] })}
            list={SEARCH_MODES.map((m) => ({ label: m.label, value: m.id, description: m.desc }))}
          />
        </div>
      </div>
      <FgSlider
        label="相似度"
        tip="只作用于向量召回：余弦低于该值的点不进融合。全文是 BM25，混合检索用 RRF（k=60）合两路排名，分数不再直接相加或取 max。"
        min={0}
        max={1}
        step={0.05}
        value={Number(search.similarity.toFixed(2))}
        onChange={(similarity) => patch({ similarity })}
      />
      <FgSlider
        label="引用上限"
        tip="最终返回条数，即 top-k，只截断排好序的名单。BM25/向量各取至少 50 条再融合；开重排时这 50 条全部送进 rerank，再截成 k 条。因此 k=3 与 k=20 的前三名应相同。"
        min={1}
        max={50}
        step={1}
        value={search.limit}
        onChange={(limit) => patch({ limit })}
      />
      <SwitchField
        title="重排"
        tip={
          hasRerank
            ? "先召回一批候选，再用重排模型精排。更准、更慢。制度问答建议开，纯关键词查找可关。"
            : "当前没有可用的重排模型。通义、豆包、DeepSeek、混元、Kimi、MiniMax 的 OpenAI 兼容接口通常不提供，检索仍可用。"
        }
        checked={hasRerank && search.usingRerank}
        disabled={!hasRerank}
        onChange={(usingRerank) => patch({ usingRerank })}
      />
    </div>
  );
}

function rankBit(label: string, rank?: number | null, extra?: string) {
  if (rank == null && !extra) return null;
  const n = rank != null ? `#${rank}` : "";
  return extra ? `${label} ${n} ${extra}`.replace(/\s+/g, " ").trim() : `${label} ${n}`.trim();
}

function formatTrace(t: HitTrace) {
  const bits: string[] = [];
  const lex = rankBit("全文", t.lexicalRank);
  if (lex) bits.push(lex);
  if (t.vectorDropped && t.vectorScore != null) {
    bits.push(`向量 ${t.vectorScore.toFixed(4)} 低于阈值`);
  } else {
    const vec = rankBit(
      "向量",
      t.vectorRank,
      t.vectorScore != null ? t.vectorScore.toFixed(4) : undefined,
    );
    if (vec) bits.push(vec);
  }
  const fused = rankBit("融合", t.fusedRank);
  if (fused) bits.push(fused);
  if (t.rerankScore != null) bits.push(`重排 ${t.rerankScore.toFixed(4)}`);
  return bits.join(" · ");
}

function pinnedHitIds(query: string, hits: Hit[], pins?: { query: string; expect: string }[]) {
  if (!pins?.length) return [];
  const nq = query.trim();
  return hits
    .filter((h) =>
      pins.some((pin) => {
        if (pin.query.trim() !== nq) return false;
        const expect = pin.expect.trim();
        return Boolean(expect && (h.chunk.locator.includes(expect) || h.chunk.title.includes(expect)));
      }),
    )
    .map((h) => h.chunk.id);
}

export function RetrievePlay({
  sliceId,
  sliceIds,
  sourceIds,
  profile,
  search,
  onSearchChange,
  chunks,
  defaultQuery = "",
  placeholder = "输入问题，测试检索",
  onRetrieve,
  onAddEval,
  evalPins,
}: {
  sliceId?: string;
  sliceIds?: string[];
  sourceIds?: string[];
  profile?: RetrievalProfile;
  search?: SearchConfig;
  onSearchChange?: (next: SearchConfig) => void;
  chunks: Chunk[];
  defaultQuery?: string;
  placeholder?: string;
  onRetrieve?: (input: {
    query: string;
    sourceIds?: string[];
    search?: SearchConfig;
  }) => Promise<{ hits: Hit[]; message?: string; debug?: SearchDebug | null }>;
  onAddEval?: (input: { query: string; title: string; locator: string }) => boolean | Promise<boolean>;
  evalPins?: { query: string; expect: string }[];
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [debug, setDebug] = useState<SearchDebug | null>(null);
  const [message, setMessage] = useState<string | undefined>();
  const [ran, setRan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [localSearch, setLocalSearch] = useState(search);
  const activeSearch = localSearch ?? search;

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = onRetrieve
        ? await onRetrieve({ query, sourceIds, search: activeSearch })
        : retrieve(
            {
              sliceId,
              sliceIds,
              sourceIds,
              query,
              profile,
              search: activeSearch,
            },
            chunks,
          );
      setHits(result.hits);
      setDebug(result.debug ?? null);
      setMessage(result.message);
      setAddedIds(pinnedHitIds(query, result.hits, evalPins));
      setRan(true);
    } catch (err) {
      setHits([]);
      setDebug(null);
      setMessage(err instanceof Error ? err.message : "检索失败");
      setRan(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {activeSearch && onSearchChange && (
        <SearchParamsFields
          search={activeSearch}
          onChange={(next) => {
            setLocalSearch(next);
            onSearchChange(next);
          }}
        />
      )}
      <form onSubmit={onSearch} className="search-bar">
        <IconSearch />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
        <Button type="submit" isLoading={loading}>
          检索测试
        </Button>
      </form>
      {ran && (
        <div className="hit-list">
          {message && (
            <Alert status="warning" mb={3}>
              {message}
            </Alert>
          )}
          {debug ? (
            <p className={debug.vectorError ? "hit-debug-summary is-warn" : "hit-debug-summary"}>
              全文 {debug.lexicalCount} · 向量 {debug.vectorCount}
              {debug.vectorDroppedCount ? `（${debug.vectorDroppedCount} 条低于阈值）` : ""}
              {debug.fusedCount ? ` · 融合 ${debug.fusedCount}` : ""}
              {debug.reranked ? " · 已重排" : ""}
              {debug.vectorError ? ` · 向量失败：${debug.vectorError}` : ""}
            </p>
          ) : null}
          {hits.map((h) => {
            const added = addedIds.includes(h.chunk.id);
            return (
            <div key={h.chunk.id} className={["hit-card", onAddEval ? "has-eval" : "", added ? "is-added" : ""].filter(Boolean).join(" ")}>
              <div className="hit-card-top">
                <strong>{h.chunk.title}</strong>
                <span className="tag">{Math.abs(h.score) >= 1 ? h.score.toFixed(2) : h.score.toFixed(4)}</span>
              </div>
              {onAddEval ? (
                added ? (
                  <span className="hit-eval is-done">已加入评测</span>
                ) : (
                  <button
                    type="button"
                    className="hit-eval"
                    disabled={addingId === h.chunk.id}
                    onClick={() => {
                      void (async () => {
                        setAddingId(h.chunk.id);
                        try {
                          const ok = await onAddEval({
                            query,
                            title: h.chunk.title,
                            locator: h.chunk.locator,
                          });
                          if (ok) setAddedIds((prev) => (prev.includes(h.chunk.id) ? prev : [...prev, h.chunk.id]));
                        } finally {
                          setAddingId(null);
                        }
                      })();
                    }}
                  >
                    {addingId === h.chunk.id ? "加入中…" : "加入评测"}
                  </button>
                )
              ) : null}
              {h.chunk.a ? (
                <>
                  <p>
                    <span className="hit-card-qa">问：</span>
                    {h.chunk.text}
                  </p>
                  <p className="hit-card-answer">
                    <span className="hit-card-qa">答：</span>
                    {h.chunk.a}
                  </p>
                </>
              ) : (
                <p>{h.chunk.text}</p>
              )}
              <div className="hit-card-meta">
                {h.chunk.locator} · {h.note}
              </div>
              {h.trace ? <div className="hit-card-trace">{formatTrace(h.trace)}</div> : null}
            </div>
            );
          })}
          {hits.length === 0 && !message && <Empty text="无命中。" />}
        </div>
      )}
    </div>
  );
}
