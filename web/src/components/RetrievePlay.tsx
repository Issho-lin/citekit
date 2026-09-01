import { FormEvent, useState } from "react";
import { Alert, Button, Input, Switch } from "@chakra-ui/react";
import { SEARCH_MODES } from "../constants";
import { retrieve, type Hit } from "../mock/retrieve";
import type { Chunk, RetrievalProfile, SearchConfig } from "../types";
import { Empty } from "./chrome";
import { FgSlider } from "./FgSlider";
import { IconSearch } from "./icons";
import { MySelect } from "./MySelect";

export function RetrievePlay({
  sliceId,
  sliceIds,
  sourceIds,
  profile,
  search,
  onSearchChange,
  chunks,
  defaultQuery = "",
}: {
  sliceId?: string;
  sliceIds?: string[];
  sourceIds?: string[];
  profile?: RetrievalProfile;
  search?: SearchConfig;
  onSearchChange?: (next: SearchConfig) => void;
  chunks: Chunk[];
  defaultQuery?: string;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [warehouse, setWarehouse] = useState("华北");
  const [hits, setHits] = useState<Hit[]>([]);
  const [message, setMessage] = useState<string | undefined>();
  const [ran, setRan] = useState(false);

  function patchSearch(next: Partial<SearchConfig>) {
    if (search && onSearchChange) onSearchChange({ ...search, ...next });
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const result = retrieve(
      {
        sliceId,
        sliceIds,
        sourceIds,
        query,
        profile,
        search,
        warehouse: profile === "filter_first" ? warehouse : undefined,
      },
      chunks,
    );
    setHits(result.hits);
    setMessage(result.message);
    setRan(true);
  }

  return (
    <div>
      {search && (
        <div className="search-params">
          <label className="fg-field">
            <span>检索模式</span>
            <MySelect
              value={search.searchMode}
              onChange={(next) => patchSearch({ searchMode: next as SearchConfig["searchMode"] })}
              list={SEARCH_MODES.map((m) => ({ label: m.label, value: m.id }))}
            />
          </label>
          <FgSlider
            label="相似度"
            min={0}
            max={1}
            step={0.05}
            value={Number(search.similarity.toFixed(2))}
            onChange={(similarity) => patchSearch({ similarity })}
          />
          <FgSlider
            label="引用上限"
            min={1}
            max={50}
            step={1}
            value={search.limit}
            onChange={(limit) => patchSearch({ limit })}
          />
          <label className="switch-row">
            重排
            <Switch
              isChecked={search.usingRerank}
              onChange={(e) => patchSearch({ usingRerank: e.target.checked })}
            />
          </label>
        </div>
      )}
      <form onSubmit={onSearch} className="search-bar">
        <IconSearch />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入问题，测试当前知识库的检索"
        />
        {profile === "filter_first" && (
          <Input
            maxW="120px"
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            placeholder="warehouse"
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
