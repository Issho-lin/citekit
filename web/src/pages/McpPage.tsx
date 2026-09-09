import { Link, useNavigate } from "react-router-dom";
import { Button } from "@chakra-ui/react";
import { IconPlus } from "../components/icons";
import { ColorIcon } from "../components/ColorIcon";
import { DataTable, Empty, PageHero } from "../components/chrome";
import { useStore } from "../mock/store";

export function McpPage() {
  const nav = useNavigate();
  const { endpoints, kbsReady } = useStore();

  if (!kbsReady) {
    return <div className="page" aria-busy="true" />;
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHero
          title="MCP 端点"
          desc="把检索工具挂到白名单。Agent 只能搜被勾选的工具，没有搜全部。"
          action={
            <Button as={Link} to="/mcp/new" leftIcon={<IconPlus />}>
              新建端点
            </Button>
          }
        />
        {endpoints.length === 0 ? (
          <Empty text="还没有端点。" to="/mcp/new" cta="新建端点" />
        ) : (
          <DataTable headers={["名称", "环境", "URL", "工具"]}>
            {endpoints.map((ep) => (
              <tr key={ep.id} className="clickable" onClick={() => nav(`/mcp/${ep.id}`)}>
                <td>
                  <div className="name-cell">
                    <ColorIcon name="mcp" size={32} />
                    {ep.name}
                  </div>
                </td>
                <td>{ep.env}</td>
                <td className="mono">{ep.url}</td>
                <td>{ep.toolIds.length}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
