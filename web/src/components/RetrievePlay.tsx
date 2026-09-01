import { FormEvent, useState } from "react";
import { Alert, Button, Input, Switch } from "@chakra-ui/react";
import { SEARCH_MODES } from "../constants";
import { retrieve, type Hit } from "../mock/retrieve";
import type { Chunk, RetrievalProfile, SearchConfig } from "../types";
import { Empty } from "./chrome";
import { FgSlider } from "./FgSlider";
import { IconSearch } from "./icons";
import { MySelect } from "./MySelect";
import { QuestionTip } from "./QuestionTip";

function SwitchField({
  title,
  tip,
  checked,
  onChange,
}: {
  title: string;
  tip: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="fg-slider">
      <div className="fg-slider-label">
        {title}
        <QuestionTip label={tip} maxW="360px" />
      </div>
      <Switch size="md" isChecked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

export function SearchParamsFields({
  search,
  onChange,
  showFilterFirst = false,
}: {
  search: SearchConfig;
  onChange: (next: SearchConfig) => void;
  showFilterFirst?: boolean;
}) {
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
        tip="先召回一批候选，再用重排模型精排。更准、更慢，且需要已配置重排模型。制度问答建议开，纯关键词查找可关。"
        checked={search.usingRerank}
        onChange={(usingRerank) => patch({ usingRerank })}
      />
      {showFilterFirst && (
        <SwitchField
          title="先按仓库过滤"
          tip="调用时必须带上仓库（如华北、华南），只在该仓数据里检索，避免全表语义碰运气。适合报价、库存；制度、FAQ 不要开。Agent 入参字段名是 warehouse。"
          checked={search.filterFirst}
          onChange={(filterFirst) => patch({ filterFirst })}
        />
      )}
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
  showFilterFirst = false,
  chunks,
  defaultQuery = "",
  placeholder = "输入问题，测试检索",
}: {
  sliceId?: string;
  sliceIds?: string[];
  sourceIds?: string[];
  profile?: RetrievalProfile;
  search?: SearchConfig;
  onSearchChange?: (next: SearchConfig) => void;
  showFilterFirst?: boolean;
  chunks: Chunk[];
  defaultQuery?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [warehouse, setWarehouse] = useState("华北");
  const [hits, setHits] = useState<Hit[]>([]);
  const [message, setMessage] = useState<string | undefined>();
  const [ran, setRan] = useState(false);
  const filterFirst = search?.filterFirst || profile === "filter_first";

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const result = retrieve(
      {
        sliceId,
        sliceIds,
        sourceIds,
        query,
        profile: filterFirst ? "filter_first" : profile,
        search,
        warehouse: filterFirst ? warehouse : undefined,
      },
      chunks,
    );
    setHits(result.hits);
    setMessage(result.message);
    setRan(true);
  }

  return (
    <div>
      {search && onSearchChange && (
        <SearchParamsFields search={search} onChange={onSearchChange} showFilterFirst={showFilterFirst} />
      )}
      <form onSubmit={onSearch} className="search-bar">
        <IconSearch />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
        {filterFirst && (
          <Input
            maxW="120px"
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            placeholder="仓库，如华北"
          />
        )}
        <Button type="submit">检索测试</Button>
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
              <p>{h.chunk.text}</p>
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
