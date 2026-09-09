import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Crumb, Empty, PageHero } from "../components/chrome";
import { ToolEditor } from "../components/ToolEditor";
import { DEFAULT_SEARCH, searchFromKb } from "../constants";
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
  const { knowledgeBases, sources, addTool, kbsReady } = useStore();
  const kbs = knowledgeBases.filter((k) => k.kind !== "folder");
  const presetKb = params.get("kb") ?? kbs[0]?.id ?? "";
  const kb = knowledgeBases.find((k) => k.id === presetKb);
  const kbSources = useMemo(
    () => sources.filter((s) => s.kbId === presetKb && s.type !== "folder"),
    [sources, presetKb],
  );
  const initial = useMemo(
    () => ({
      kbId: presetKb,
      sourceIds: kbSources.map((s) => s.id),
      title: kb ? `${kb.name}检索` : "",
      name: kb ? slug(kb.name) : "search_",
      description: "",
      search: kb ? searchFromKb(kb) : DEFAULT_SEARCH,
    }),
    [presetKb, kb, kbSources],
  );

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
        {kbsReady === false ? (
          <div aria-busy="true" />
        ) : kbs.length === 0 ? (
          <Empty text="还没有知识库。" to="/kb/new" cta="先建知识库" />
        ) : kbSources.length === 0 ? (
          <Empty text="这个知识库还没有集合。" to={presetKb ? `/kb/${presetKb}/import` : "/kb"} cta="去导入" />
        ) : (
          <ToolEditor
            key={presetKb}
            initial={initial}
            submitLabel="创建工具"
            cancelTo={presetKb ? `/kb/${presetKb}` : "/tools"}
            onSubmit={async (draft) => {
              try {
                const id = await addTool(draft);
                toast("工具已创建，策略已保存在工具上");
                nav(`/tools/${id}`);
              } catch (err) {
                toast(err instanceof Error ? err.message : "创建失败");
                throw err;
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
