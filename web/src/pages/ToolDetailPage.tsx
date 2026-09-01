import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Textarea,
  useDisclosure,
} from "@chakra-ui/react";
import { Crumb, Empty, NextBar, PageHero, Panel } from "../components/chrome";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RetrievePlay } from "../components/RetrievePlay";
import { searchFromKb } from "../constants";
import { toolNext } from "../mock/pipeline";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";

export function ToolDetailPage() {
  const { toolId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const del = useDisclosure();
  const { tools, knowledgeBases, sources, endpoints, chunks, updateTool, addToolToEndpoint, removeTool } =
    useStore();
  const tool = tools.find((t) => t.id === toolId);
  const kb = knowledgeBases.find((k) => k.id === tool?.kbId);
  const [desc, setDesc] = useState(tool?.description ?? "");
  const unpublished = endpoints.filter((e) => tool && !e.toolIds.includes(tool.id));

  if (!tool || !kb) {
    return (
      <div className="page">
        <Empty text="未找到工具。" to="/tools" cta="返回列表" />
      </div>
    );
  }

  const next = toolNext(tool.id, endpoints);
  const schema = {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: "object",
      required: ["query", ...tool.requiredFilters],
      properties: {
        query: { type: "string", description: "独立完整问句，不要丢给平台做多轮改写" },
        ...(tool.requiredFilters.includes("warehouse")
          ? { warehouse: { type: "string", description: "仓库，先过滤再检索" } }
          : {}),
      },
    },
  };

  return (
    <div className="page">
      <div className="page-inner">
        <Crumb items={[{ label: "检索工具", href: "/tools" }, { label: tool.title }]} />
        <PageHero
          title={tool.title}
          desc={tool.name}
          action={
            <Button as={Link} to={`/mcp/new?tool=${tool.id}`}>
              发布到 MCP
            </Button>
          }
        />
        <NextBar {...next} />

        <Tabs>
          <TabList>
            <Tab>契约</Tab>
            <Tab>试检索</Tab>
            <Tab>发布</Tab>
          </TabList>
          <TabPanels>
            <TabPanel px={0}>
              <div className="panel-grid">
                <Panel title="描述与策略">
                  <div className="form-stack">
                    <label>
                      描述
                      <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
                    </label>
                    <div>
                      <Button
                        onClick={() => {
                          if (!desc.trim()) {
                            toast("空描述不能发布");
                            return;
                          }
                          updateTool(tool.id, { description: desc.trim() });
                          toast("已保存");
                        }}
                      >
                        保存描述
                      </Button>
                    </div>
                    <div>
                      知识库：<Link to={`/kb/${kb.id}`}>{kb.name}</Link>
                    </div>
                    <div className="page-desc">
                      检索范围：
                      {tool.sourceIds
                        .map((id) => sources.find((s) => s.id === id)?.title)
                        .filter(Boolean)
                        .join("、") || "全库"}
                    </div>
                    <p className="page-desc">
                      检索跟随知识库配置。要改策略请到{" "}
                      <Link to={`/kb/${kb.id}?tab=test`}>搜索测试</Link>。
                    </p>
                  </div>
                </Panel>
                <Panel title="tools/list 将下发">
                  <pre className="code">{JSON.stringify(schema, null, 2)}</pre>
                </Panel>
              </div>
              <Button colorScheme="red" variant="outline" mt={4} onClick={del.onOpen}>
                删除工具
              </Button>
              <ConfirmDialog
                isOpen={del.isOpen}
                onClose={del.onClose}
                title="删除工具？"
                onConfirm={() => {
                  removeTool(tool.id);
                  toast("已删除");
                  nav("/tools");
                }}
              >
                将从所有 MCP 白名单中移除。
              </ConfirmDialog>
            </TabPanel>
            <TabPanel px={0}>
              <Panel title="用知识库当前检索配置，只搜勾选的集合">
                <RetrievePlay
                  sourceIds={tool.sourceIds}
                  profile={tool.profile}
                  search={searchFromKb(kb)}
                  chunks={chunks}
                  defaultQuery="七天无理由怎么退"
                />
              </Panel>
            </TabPanel>
            <TabPanel px={0}>
              {endpoints.filter((e) => e.toolIds.includes(tool.id)).length === 0 ? (
                <p className="page-desc">尚未出现在任何端点白名单。</p>
              ) : (
                endpoints
                  .filter((e) => e.toolIds.includes(tool.id))
                  .map((e) => (
                    <div key={e.id} className="hit">
                      <Link to={`/mcp/${e.id}`}>{e.name}</Link>
                      <div className="mono">{e.url}</div>
                    </div>
                  ))
              )}
              {unpublished.map((e) => (
                <Button
                  key={e.id}
                  variant="outline"
                  mt={2}
                  onClick={() => {
                    addToolToEndpoint(e.id, tool.id);
                    toast(`已加入「${e.name}」`);
                  }}
                >
                  加入 {e.name}
                </Button>
              ))}
              <div>
                <Button mt={3} as={Link} to={`/mcp/new?tool=${tool.id}`}>
                  新建端点并挂上
                </Button>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
}
