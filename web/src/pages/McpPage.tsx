import { Link, useNavigate } from "react-router-dom";
import { Button, HStack } from "@chakra-ui/react";
import { IconPlus } from "../components/icons";
import { ColorIcon } from "../components/ColorIcon";
import { evalStatus } from "../evalStatus";
import { DataTable, Empty, PageHero } from "../components/chrome";
import { useStore } from "../mock/store";

export function McpPage() {
  const nav = useNavigate();
  const { endpoints, kbsReady, tools } = useStore();

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
            <HStack spacing={2}>
            <Button as={Link} to="/calls?kind=mcp" variant="outline">
              调用记录
            </Button>
            <Button as={Link} to="/mcp/new" leftIcon={<IconPlus />}>
              新建端点
            </Button>
            </HStack>
          }
        />
        {endpoints.length === 0 ? (
          <Empty text="还没有端点。" to="/mcp/new" cta="新建端点" />
        ) : (
          <DataTable headers={["名称", "环境", "评测", "URL", "工具"]}>
            {endpoints.map((ep) => {
              const listed = ep.toolIds
                .map((id) => tools.find((t) => t.id === id))
                .filter((item): item is NonNullable<typeof item> => Boolean(item));
              const blocked = listed.some((t) => t.eval?.ok !== true);
              return (
              <tr key={ep.id} className="clickable" onClick={() => nav(`/mcp/${ep.id}`)}>
                <td>
                  <div className="name-cell">
                    <ColorIcon name="mcp" size={32} />
                    {ep.name}
                  </div>
                </td>
                <td>{ep.env}</td>
                <td>
                  {listed.length === 0
                    ? "—"
                    : ep.env === "prod" && !blocked
                      ? "可发布"
                      : listed.map((t) => evalStatus(t.eval)).join("；")}
                </td>
                <td className="mono">{ep.url}</td>
                <td>{ep.toolIds.length}</td>
              </tr>
              );
            })}
          </DataTable>
        )}
      </div>
    </div>
  );
}
