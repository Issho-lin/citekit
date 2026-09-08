import { Link } from "react-router-dom";
import { Button } from "@chakra-ui/react";
import { IconPlus } from "../components/icons";
import { ColorIcon } from "../components/ColorIcon";
import { DataTable, Empty, PageHero, Panel } from "../components/chrome";
import { kbNext } from "../mock/pipeline";
import { useStore } from "../mock/store";

export function WorkbenchPage() {
  const { knowledgeBases, kbsReady, sources, tools, endpoints } = useStore();
  const unpublished = tools.filter((t) => !endpoints.some((e) => e.toolIds.includes(t.id)));

  if (!kbsReady) {
    return <div className="page" aria-busy="true" />;
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHero
          title="工作台"
          desc="先入库并试搜语料，再按职责拆成检索工具（范围+策略），最后用 MCP 发给 Agent。"
          action={
            <Button as={Link} to="/kb/new" leftIcon={<IconPlus />}>
              新建知识库
            </Button>
          }
        />

        <div className="steps">
          <Link className="step" to="/kb">
            <ColorIcon name="dataset" size={40} />
            <div>
              <div className="n">1 知识库</div>
              <div className="t">{knowledgeBases.filter((k) => k.kind !== "folder").length} 个库</div>
              <div className="c">{sources.length} 个集合</div>
            </div>
          </Link>
          <Link className="step" to="/tools">
            <ColorIcon name="tool" size={40} />
            <div>
              <div className="n">2 检索工具</div>
              <div className="t">{tools.length} 把工具</div>
              <div className="c">{unpublished.length} 未发布</div>
            </div>
          </Link>
          <Link className="step" to="/mcp">
            <ColorIcon name="mcp" size={40} />
            <div>
              <div className="n">3 MCP</div>
              <div className="t">{endpoints.length} 个端点</div>
              <div className="c">{endpoints.filter((e) => e.env === "prod").length} 个 prod</div>
            </div>
          </Link>
        </div>

        <Panel title="知识库状态">
          {knowledgeBases.length === 0 ? (
            <Empty text="还没有知识库。" to="/kb/new" cta="新建知识库" />
          ) : (
            <DataTable headers={["知识库", "进度", "下一步"]}>
              {knowledgeBases.filter((k) => k.kind !== "folder").map((kb) => {
                const next = kbNext(kb, sources, tools, endpoints);
                const src = sources.filter((s) => s.kbId === kb.id).length;
                const tl = tools.filter((t) => t.kbId === kb.id).length;
                return (
                  <tr key={kb.id}>
                    <td>
                      <Link to={`/kb/${kb.id}`}>{kb.name}</Link>
                      <div className="mono">{kb.domain}</div>
                    </td>
                    <td className="mono">
                      集合 {src} · 工具 {tl}
                    </td>
                    <td>
                      <Link to={next.to}>{next.cta}</Link>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </Panel>
      </div>
    </div>
  );
}
