import { Link, useNavigate } from "react-router-dom";
import { Button } from "@chakra-ui/react";
import { IconPlus } from "../components/icons";
import { evalStatus } from "../evalStatus";
import { ColorIcon, kbIcon } from "../components/ColorIcon";
import { DataTable, Empty, PageHero } from "../components/chrome";
import { useStore } from "../mock/store";

export function ToolsPage() {
  const nav = useNavigate();
  const { tools, knowledgeBases, sources, endpoints, kbsReady } = useStore();

  if (!kbsReady) {
    return <div className="page" aria-busy="true" />;
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHero
          title="检索工具"
          desc="一把工具 = 一个库里的若干集合 + 一套检索策略。同一库可建多把，让 Agent 并行调用。"
          action={
            <Button as={Link} to="/tools/new" leftIcon={<IconPlus />}>
              新建工具
            </Button>
          }
        />
        {tools.length === 0 ? (
          <Empty text="还没有检索工具。" to="/tools/new" cta="新建工具" />
        ) : (
          <DataTable headers={["工具", "知识库", "检索范围", "评测", "MCP"]}>
            {tools.map((t) => {
              const n = endpoints.filter((e) => e.toolIds.includes(t.id)).length;
              const scope =
                t.sourceIds.length === 0
                  ? "全库"
                  : t.sourceIds
                      .map((id) => sources.find((s) => s.id === id)?.title)
                      .filter(Boolean)
                      .join("、");
              return (
                <tr key={t.id} className="clickable" onClick={() => nav(`/tools/${t.id}`)}>
                  <td>
                    <div className="name-cell">
                      <ColorIcon name="tool" size={32} />
                      <div>
                        {t.title}
                        <div className="mono">{t.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {(() => {
                      const kb = knowledgeBases.find((item) => item.id === t.kbId);
                      return kb ? <div className="name-cell"><ColorIcon name={kbIcon(kb.kind)} size={28} /><Link to={`/kb/${kb.id}`}>{kb.name}</Link></div> : "未找到知识库";
                    })()}
                  </td>
                  <td>{scope}</td>
                  <td>{evalStatus(t.eval)}</td>
                  <td>{n === 0 ? "未发布" : `${n} 个端点`}</td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </div>
    </div>
  );
}
