import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Checkbox, Input, Textarea } from "@chakra-ui/react";
import { Crumb, Empty, PageHero } from "../components/chrome";
import { MySelect } from "../components/MySelect";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";

function slug(name: string) {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  return s ? `search_${s}` : "search_";
}

export function NewToolPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { knowledgeBases, sources, addTool } = useStore();
  const presetKb = params.get("kb") ?? knowledgeBases[0]?.id ?? "";
  const [kbId, setKbId] = useState(presetKb);
  const kb = knowledgeBases.find((k) => k.id === kbId);
  const kbSources = useMemo(() => sources.filter((s) => s.kbId === kbId), [sources, kbId]);
  const [picked, setPicked] = useState<string[]>(() =>
    sources.filter((s) => s.kbId === presetKb).map((s) => s.id),
  );
  const [title, setTitle] = useState(kb ? `${kb.name}检索` : "");
  const [name, setName] = useState(kb ? slug(kb.name) : "search_");
  const [description, setDescription] = useState("");

  function onKb(id: string) {
    setKbId(id);
    const k = knowledgeBases.find((x) => x.id === id);
    setPicked(sources.filter((s) => s.kbId === id).map((s) => s.id));
    if (k) {
      setTitle(`${k.name}检索`);
      setName(slug(k.name));
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
      profile: "hybrid_balanced",
    });
    toast("工具已创建，可试检索或发布到 MCP");
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
          desc="把这个库已经调好的检索封装成 Agent 可调用的工具。默认搜全部集合，需要时再收窄。"
        />
        {knowledgeBases.length === 0 ? (
          <Empty text="还没有知识库。" to="/kb/new" cta="先建知识库" />
        ) : kbSources.length === 0 ? (
          <Empty text="这个知识库还没有集合。" to={kbId ? `/kb/${kbId}/import` : "/kb"} cta="去导入" />
        ) : (
          <form className="form-stack" onSubmit={onSubmit}>
            <label>
              知识库
              <MySelect
                value={kbId}
                onChange={onKb}
                list={knowledgeBases.map((k) => ({ label: k.name, value: k.id }))}
              />
            </label>
            <div className="field">
              <span>检索范围（集合，默认全选）</span>
              {kbSources.map((s) => (
                <label key={s.id} className="source-check">
                  <Checkbox isChecked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
                  <span>{s.title}</span>
                </label>
              ))}
            </div>
            <label>
              标题
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              name
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              描述（覆盖范围与不要用来做什么）
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <p className="page-desc">
              检索模式、相似度、重排跟随知识库「{kb?.name}」的配置，不在工具上再选一套互斥策略。
            </p>
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
