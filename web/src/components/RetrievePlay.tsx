import { FormEvent, useEffect, useState } from "react";
import { Alert, Button, Switch } from "@chakra-ui/react";
import { SEARCH_MODES } from "../constants";
import { retrieve, type Hit } from "../mock/retrieve";
import type { Chunk, RetrievalProfile, SearchConfig } from "../types";
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
        tip="低于该分数的结果会被丢掉。调高更准但更容易搜空，调低更全但噪声更多。"
        min={0}
        max={1}
        step={0.05}
        value={Number(search.similarity.toFixed(2))}
        onChange={(similarity) => patch({ similarity })}
      />
      <FgSlider
        label="引用上限"
        tip="一次最多返回多少条给 Agent。太多会占上下文，太少可能漏依据。"
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
  }) => Promise<{ hits: Hit[]; message?: string }>;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [message, setMessage] = useState<string | undefined>();
  const [ran, setRan] = useState(false);
  const [loading, setLoading] = useState(false);
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
      setMessage(result.message);
      setRan(true);
    } catch (err) {
      setHits([]);
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
          {hits.map((h) => (
            <div key={h.chunk.id} className="hit-card">
              <div className="hit-card-top">
                <strong>{h.chunk.title}</strong>
                <span className="tag">{h.score.toFixed(2)}</span>
              </div>
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
            </div>
          ))}
          {hits.length === 0 && !message && <Empty text="无命中。" />}
        </div>
      )}
    </div>
  );
}
