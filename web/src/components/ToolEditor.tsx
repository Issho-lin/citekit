import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input, Textarea } from "@chakra-ui/react";
import { api } from "../api";
import { SOURCE_LABEL, searchFromKb } from "../constants";
import { useStore } from "../mock/store";
import { useToast } from "./Toast";
import { ColorIcon } from "./ColorIcon";
import { FieldHead, QuestionTip } from "./QuestionTip";
import { SearchParamsFields } from "./RetrievePlay";
import { IconCheckSmall, IconSpark } from "./icons";
import { MySelect } from "./MySelect";
import type { SearchConfig, SourceType } from "../types";

export type ToolDraft = {
  kbId: string;
  sourceIds: string[];
  title: string;
  name: string;
  description: string;
  search: SearchConfig;
};

function slug(name: string) {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  return s ? `search_${s}` : "search_";
}

function sourceIcon(t: SourceType) {
  if (t === "web") return "website" as const;
  if (t === "feishu") return "feishu" as const;
  if (t === "yuque") return "yuque" as const;
  if (t === "dingtalk") return "dingtalk" as const;
  if (t === "api") return "api" as const;
  if (t === "image") return "image" as const;
  if (t === "folder") return "folder" as const;
  return "dataset" as const;
}

export function ToolEditor({
  initial,
  kbLocked,
  showSearch = true,
  excludeId,
  submitLabel,
  submitting,
  cancelTo,
  onSubmit,
}: {
  initial: ToolDraft;
  kbLocked?: boolean;
  showSearch?: boolean;
  excludeId?: string;
  submitLabel: string;
  submitting?: boolean;
  cancelTo?: string;
  onSubmit: (draft: ToolDraft) => Promise<void>;
}) {
  const toast = useToast();
  const { knowledgeBases, sources } = useStore();
  const kbs = knowledgeBases.filter((k) => k.kind !== "folder");
  const [kbId, setKbId] = useState(initial.kbId);
  const kb = knowledgeBases.find((k) => k.id === kbId);
  const kbSources = useMemo(
    () => sources.filter((s) => s.kbId === kbId && s.type !== "folder"),
    [sources, kbId],
  );
  const [picked, setPicked] = useState<string[]>(initial.sourceIds);
  const [title, setTitle] = useState(initial.title);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [search, setSearch] = useState<SearchConfig>(initial.search);
  const [suggesting, setSuggesting] = useState(false);
  const [justFilled, setJustFilled] = useState(false);

  const allIds = kbSources.map((s) => s.id);
  const allOn = allIds.length > 0 && allIds.every((id) => picked.includes(id));

  useEffect(() => {
    if (!justFilled) return;
    const timer = window.setTimeout(() => setJustFilled(false), 1200);
    return () => window.clearTimeout(timer);
  }, [justFilled]);

  function onKb(id: string) {
    if (kbLocked) return;
    setKbId(id);
    const k = knowledgeBases.find((x) => x.id === id);
    setPicked(sources.filter((s) => s.kbId === id && s.type !== "folder").map((s) => s.id));
    if (k) {
      setTitle(`${k.name}检索`);
      setName(slug(k.name));
      setSearch(searchFromKb(k));
    }
  }

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSuggest() {
    if (!kbId) {
      toast("请先选择知识库");
      return;
    }
    if (picked.length === 0) {
      toast("至少勾选一个集合");
      return;
    }
    setSuggesting(true);
    try {
      const out = await api.suggestTool({ kbId, sourceIds: picked, excludeId });
      setTitle(out.title);
      setName(out.name);
      setDescription(out.description);
      setJustFilled(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "生成失败");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !title.trim() || !kbId || !description.trim()) {
      toast("请填写名称、标题、描述并选择知识库");
      return;
    }
    if (picked.length === 0) {
      toast("至少勾选一个集合，否则工具没有可搜内容");
      return;
    }
    await onSubmit({
      kbId,
      sourceIds: picked,
      title: title.trim(),
      name: name.trim(),
      description: description.trim(),
      search,
    });
  }

  return (
    <form className="form-stack form-stack-wide" onSubmit={(e) => void handleSubmit(e)}>
      <label>
        <FieldHead
          title="知识库"
          tip="一把工具只能绑一个库。退货政策和仓报价如果检索方式不同，应拆成两把工具，让 Agent 按问题选。"
        />
        {kbLocked ? (
          <p className="field-hint">
            {kb ? <Link to={`/kb/${kb.id}`}>{kb.name}</Link> : "未找到知识库"}
            。换库请另建一把工具。
          </p>
        ) : (
          <MySelect
            value={kbId}
            onChange={onKb}
            list={kbs.map((k) => ({ label: k.name, value: k.id }))}
          />
        )}
      </label>
      <div className="field">
        <FieldHead
          title="检索范围"
          tip="Agent 一次调用只会搜勾选的集合。默认全选；若某类文档需要另一套策略，不要勾进这把工具，另建一把。"
          extra={
            kbSources.length > 0 ? (
              <button type="button" className="linkish" onClick={() => setPicked(allOn ? [] : allIds)}>
                {allOn ? "取消全选" : "全选"}
              </button>
            ) : null
          }
        />
        {kbSources.length === 0 ? (
          <p className="field-hint">这个知识库还没有集合。</p>
        ) : (
          <>
            <p className="field-hint">
              已选 {picked.length} / {kbSources.length} 个集合
            </p>
            <div className="source-pick">
              {kbSources.map((s) => {
                const on = picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`source-pick-card${on ? " on" : ""}`}
                    aria-pressed={on}
                    onClick={() => toggle(s.id)}
                  >
                    <ColorIcon name={sourceIcon(s.type)} size={32} />
                    <span className="source-pick-name">{s.title}</span>
                    <span className="mono">{SOURCE_LABEL[s.type]}</span>
                    {on ? (
                      <span className="source-pick-check" aria-hidden>
                        <IconCheckSmall size={11} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      {showSearch ? (
        <div className="field">
          <FieldHead
            title="检索策略"
            tip="这些参数只属于这把工具。改知识库里的搜索测试，不会改已经建好的工具。"
          />
          <SearchParamsFields search={search} onChange={setSearch} />
        </div>
      ) : null}
      <div
        className={`tool-copy${suggesting ? " is-busy" : ""}${justFilled ? " is-filled" : ""}`}
        aria-busy={suggesting}
      >
        <div className="tool-copy-head">
          <div className="tool-copy-brand">
            <span className="tool-copy-mark">
              <IconSpark size={16} />
            </span>
            <div>
              <div className="tool-copy-kicker">
                工具文案
                <QuestionTip
                  maxW="360px"
                  label="标题给人看；调用名是 MCP tools/list 里的 name；描述给 Agent 决定何时调用。生成结果仍可改。"
                />
              </div>
              <p className="tool-copy-hint">按知识库和勾选集合一次起草标题、调用名与描述</p>
            </div>
          </div>
          <button
            type="button"
            className={`ai-btn${suggesting ? " is-busy" : ""}`}
            disabled={suggesting}
            onClick={() => void onSuggest()}
          >
            <IconSpark size={14} />
            {suggesting ? "生成中" : "AI 生成"}
          </button>
        </div>
        <div className="tool-copy-body">
          <label>
            标题
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            调用名
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            描述
            <Textarea
              minH="96px"
              placeholder="例如：仅覆盖中国大陆七天无理由与质量问题退货。不含海外仓、延保。"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div>
        <Button type="submit" isLoading={submitting}>
          {submitLabel}
        </Button>
        {cancelTo ? (
          <Button as={Link} to={cancelTo} variant="outline" colorScheme="gray" ml={2}>
            取消
          </Button>
        ) : null}
      </div>
    </form>
  );
}
