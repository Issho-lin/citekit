import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  Flex,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useDisclosure,
} from "@chakra-ui/react";
import { Crumb, Empty, PageHero, Panel } from "../components/chrome";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MySelect } from "../components/MySelect";
import { RetrievePlay } from "../components/RetrievePlay";
import { searchFromKb } from "../constants";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";

export function McpDetailPage() {
  const { endpointId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const del = useDisclosure();
  const { endpoints, tools, knowledgeBases, chunks, toggleEndpointTool, removeEndpoint } = useStore();
  const ep = endpoints.find((e) => e.id === endpointId);
  const listed = tools.filter((t) => ep?.toolIds.includes(t.id));
  const [playTool, setPlayTool] = useState(listed[0]?.id ?? "");
  const current = tools.find((t) => t.id === playTool) ?? listed[0];

  if (!ep) {
    return (
      <div className="page">
        <Empty text="未找到端点。" to="/mcp" cta="返回列表" />
      </div>
    );
  }

  const listPayload = {
    tools: listed.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: {
        type: "object",
        required: ["query", ...t.requiredFilters],
        properties: {
          query: { type: "string" },
          ...Object.fromEntries(t.requiredFilters.map((f) => [f, { type: "string" }])),
        },
      },
    })),
  };

  const cursorSnippet = `{
  "mcpServers": {
    "${ep.name.replace(/\s+/g, "-")}": {
      "url": "${ep.url}",
      "headers": {
        "Authorization": "Bearer ${ep.apiKey}"
      }
    }
  }
}`;

  return (
    <div className="page">
      <div className="page-inner">
        <Crumb items={[{ label: "MCP 端点", href: "/mcp" }, { label: ep.name }]} />
        <PageHero
          title={ep.name}
          desc={`${ep.env} · ${ep.url}`}
          action={
            <Flex gap={2}>
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(ep.url);
                  toast("已复制 URL");
                }}
              >
                复制 URL
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(ep.apiKey);
                  toast("已复制密钥");
                }}
              >
                复制密钥
              </Button>
              <Button colorScheme="red" variant="outline" onClick={del.onOpen}>
                删除
              </Button>
            </Flex>
          }
        />
        <ConfirmDialog
          isOpen={del.isOpen}
          onClose={del.onClose}
          title="删除端点？"
          onConfirm={() => {
            removeEndpoint(ep.id);
            toast("已删除");
            nav("/mcp");
          }}
        >
          Agent 将无法再调用这些工具。
        </ConfirmDialog>
        <Alert status="info" mb={4} borderRadius="md">
          tools/list 只返回勾选工具。请传入独立问句；复杂问题请并行调用多把工具。
        </Alert>

        <Tabs>
          <TabList>
            <Tab>白名单</Tab>
            <Tab>接入</Tab>
            <Tab>在线调用</Tab>
          </TabList>
          <TabPanels>
            <TabPanel px={0}>
              <div className="panel-grid">
                <Panel title="工具白名单">
                  {tools.length === 0 ? (
                    <Empty text="没有工具可勾选。" to="/tools/new" cta="新建工具" />
                  ) : (
                    tools.map((t) => (
                      <label key={t.id} className="source-check">
                        <Checkbox
                          isChecked={ep.toolIds.includes(t.id)}
                          onChange={() => toggleEndpointTool(ep.id, t.id)}
                        />
                        <span>
                          {t.name}
                          <div className="mono">{knowledgeBases.find((k) => k.id === t.kbId)?.name}</div>
                        </span>
                      </label>
                    ))
                  )}
                </Panel>
                <Panel title="list 预览">
                  {listed.length === 0 ? (
                    <Empty text="白名单为空。生产端点至少保留一把工具。" />
                  ) : (
                    listed.map((t) => (
                      <div key={t.id} className="hit">
                        <Link to={`/tools/${t.id}`}>{t.name}</Link>
                        <div className="page-desc">{t.description}</div>
                      </div>
                    ))
                  )}
                </Panel>
              </div>
            </TabPanel>
            <TabPanel px={0}>
              <Panel title="Cursor mcp.json">
                <pre className="code">{cursorSnippet}</pre>
                <Button
                  mt={2}
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(cursorSnippet);
                    toast("已复制配置");
                  }}
                >
                  复制配置
                </Button>
              </Panel>
              <Panel title="tools/list 响应">
                <pre className="code">{JSON.stringify(listPayload, null, 2)}</pre>
              </Panel>
            </TabPanel>
            <TabPanel px={0}>
              {listed.length === 0 ? (
                <Empty text="白名单为空，无法调用。" />
              ) : (
                <Panel title="模拟 Agent 调 tools/call">
                  <label className="field">
                    工具
                    <MySelect
                      value={current?.id ?? playTool}
                      onChange={setPlayTool}
                      list={listed.map((t) => ({ label: t.name, value: t.id }))}
                    />
                  </label>
                  {current && (
                    <div style={{ marginTop: 12 }}>
                      <RetrievePlay
                        sourceIds={current.sourceIds}
                        profile={current.profile}
                        search={(() => {
                          const kb = knowledgeBases.find((k) => k.id === current.kbId);
                          return kb ? searchFromKb(kb) : undefined;
                        })()}
                        chunks={chunks}
                        defaultQuery="七天无理由怎么退"
                      />
                    </div>
                  )}
                </Panel>
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
}
