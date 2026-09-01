import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Textarea } from "@chakra-ui/react";
import { ColorIcon } from "../components/ColorIcon";
import { Crumb, Empty, PageHero } from "../components/chrome";
import { FieldHead } from "../components/QuestionTip";
import { SearchParamsFields } from "../components/RetrievePlay";
import { IconCheckSmall } from "../components/icons";
import { MySelect } from "../components/MySelect";
import { DEFAULT_SEARCH, SOURCE_LABEL, searchFromKb } from "../constants";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";
import type { SearchConfig, SourceType } from "../types";

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

export function NewToolPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { knowledgeBases, sources, addTool } = useStore();
  const kbs = knowledgeBases.filter((k) => k.kind !== "folder");
  const presetKb = params.get("kb") ?? kbs[0]?.id ?? "";
  const [kbId, setKbId] = useState(presetKb);
  const kb = knowledgeBases.find((k) => k.id === kbId);
  const kbSources = useMemo(
    () => sources.filter((s) => s.kbId === kbId && s.type !== "folder"),
    [sources, kbId],
  );
  const [picked, setPicked] = useState<string[]>(() =>
    sources.filter((s) => s.kbId === presetKb && s.type !== "folder").map((s) => s.id),
  );
  const [title, setTitle] = useState(kb ? `${kb.name}检索` : "");
  const [name, setName] = useState(kb ? slug(kb.name) : "search_");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState<SearchConfig>(() => (kb ? searchFromKb(kb) : DEFAULT_SEARCH));

  const allIds = kbSources.map((s) => s.id);
  const allOn = allIds.length > 0 && allIds.every((id) => picked.includes(id));

  function onKb(id: string) {
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !title.trim() || !kbId || !description.trim()) {
      toast("请填写名称、标题、描述并选择知识库");
      return;
    }
    if (picked.length === 0) {
      toast("至少勾选一个集合，否则工具没有可搜内容");
      return;
    }
    const id = addTool({
      name: name.trim(),
      title: title.trim(),
      description: description.trim(),
      kbId,
      sourceIds: picked,
      search,
    });
    toast("工具已创建，策略已保存在工具上");
    nav(`/tools/${id}`);
  }

  return (
    <div className="page">
      <div className="page-inner">
        <Crumb
          items={[
            { label: "检索工具", href: "/tools" },
            { label: "新建" },
          ]}
        />
        <PageHero
          title="新建检索工具"
          desc="范围和检索策略都写在这把工具上。默认拷贝该库搜索测试的参数，创建后互不影响。同一库可以再拆多把。"
        />
        {kbs.length === 0 ? (
          <Empty text="还没有知识库。" to="/kb/new" cta="先建知识库" />
        ) : kbSources.length === 0 ? (
          <Empty text="这个知识库还没有集合。" to={kbId ? `/kb/${kbId}/import` : "/kb"} cta="去导入" />
        ) : (
          <form className="form-stack form-stack-wide" onSubmit={onSubmit}>
            <label>
              <FieldHead
                title="知识库"
                tip="一把工具只能绑一个库。退货政策和仓报价如果检索方式不同，应拆成两把工具，让 Agent 按问题选。"
              />
              <MySelect
                value={kbId}
                onChange={onKb}
                list={kbs.map((k) => ({ label: k.name, value: k.id }))}
              />
            </label>
            <div className="field">
              <FieldHead
                title="检索范围"
                tip="Agent 一次调用只会搜勾选的集合。默认全选；若某类文档需要另一套策略，不要勾进这把工具，另建一把。"
                extra={
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setPicked(allOn ? [] : allIds)}
                  >
                    {allOn ? "取消全选" : "全选"}
                  </button>
                }
              />
              <p className="field-hint">已选 {picked.length} / {kbSources.length} 个集合</p>
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
            </div>
            <div className="field">
              <FieldHead
                title="检索策略"
                tip="这些参数只属于这把工具。改知识库里的搜索测试，不会改已经建好的工具。"
              />
              <SearchParamsFields search={search} onChange={setSearch} showFilterFirst />
            </div>
            <label>
              <FieldHead title="标题" tip="给人看的名字，出现在工具列表和 MCP 管理页。" />
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              <FieldHead
                title="调用名"
                tip="Agent 实际调用的标识，对应 MCP tools/list 里的 name。建议英文小写加下划线，例如 search_refund_policy。"
              />
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <FieldHead
                title="描述"
                tip="Agent 靠这段话决定什么时候调用。写清覆盖范围，并写不要用来做什么，避免和别的工具抢召回。"
              />
              <Textarea
                placeholder="例如：仅覆盖中国大陆七天无理由与质量问题退货。不含海外仓、延保。"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div>
              <Button type="submit">创建工具</Button>
              <Button as={Link} to={kbId ? `/kb/${kbId}` : "/tools"} variant="outline" colorScheme="gray" ml={2}>
                取消
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
