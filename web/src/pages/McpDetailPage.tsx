import { FormEvent, useEffect, useState } from "react";
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
import { IconSearch } from "../components/icons";
import { api, type McpRpc } from "../api";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";
import { evalStatus } from "../evalStatus";
import type { McpEndpoint, RetrievalTool } from "../types";

export function McpDetailPage() {
  const { endpointId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const del = useDisclosure();
  const { endpoints, tools, knowledgeBases, kbsReady, toggleEndpointTool, patchEndpoint, removeEndpoint } = useStore();
  const ep = endpoints.find((e) => e.id === endpointId);
  const listed = tools.filter((t) => ep?.toolIds.includes(t.id));
  const [playTool, setPlayTool] = useState("");
  const current = tools.find((t) => t.id === playTool) ?? listed[0];
  const firstListed = listed[0]?.id ?? "";

  useEffect(() => {
    if (!playTool && firstListed) setPlayTool(firstListed);
  }, [firstListed, playTool]);

  if (!kbsReady) {
    return <div className="page" aria-busy="true" />;
  }

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
        required: ["query"],
        properties: {
          query: { type: "string" },
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
            <Flex gap={2} align="center">
              <MySelect
                w="120px"
                value={ep.env}
                onChange={(next) => {
                  void patchEndpoint(ep.id, { env: next as "dev" | "prod" }).catch((err: unknown) =>
                    toast(err instanceof Error ? err.message : "无法更改环境"),
                  );
                }}
                list={[
                  { value: "dev", label: "dev" },
                  { value: "prod", label: "prod" },
                ]}
              />
              <Button as={Link} to={`/agent?endpoint=${ep.id}`}>
                在对话中使用
              </Button>
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
            void removeEndpoint(ep.id)
              .then(() => {
                toast("已删除");
                nav("/mcp");
              })
              .catch((err: unknown) => toast(err instanceof Error ? err.message : "删除失败"));
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
                          onChange={() => {
                            void toggleEndpointTool(ep.id, t.id).catch((err: unknown) =>
                              toast(err instanceof Error ? err.message : "更新白名单失败"),
                            );
                          }}
                        />
                        <span>
                          {t.name}
                          <div className="mono">
                            {knowledgeBases.find((k) => k.id === t.kbId)?.name} · {evalStatus(t.eval)}
                          </div>
                        </span>
                      </label>
                    ))
                  )}
                </Panel>
                <Panel title="list 预览">
                  {listed.length === 0 ? (
                    <Empty text="白名单为空。生产端点至少保留一把已通过评测的工具。" />
                  ) : (
                    listed.map((t) => (
                      <div key={t.id} className="hit">
                        <Link to={`/tools/${t.id}`}>{t.name}</Link>
                        <div className="page-desc">{t.description}</div>
                        <div className="mono">
                          {evalStatus(t.eval)} · <Link to={`/eval?tool=${t.id}`}>评测</Link>
                        </div>
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
              ) : current ? (
                <McpPlay endpoint={ep} tool={current} tools={listed} onTool={setPlayTool} />
              ) : (
                <Empty text="请选择一把白名单工具。" />
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
}

function mcpText(rpc: McpRpc) {
  if (rpc.error) return rpc.error.message;
  const bits = (rpc.result?.content || []).map((item) => item.text || "").filter(Boolean);
  if (bits.length) return bits.join("\n\n");
  if (rpc.result?.tools) {
    return rpc.result.tools.map((item) => `${item.name}\n${item.description || ""}`.trim()).join("\n\n") || "白名单为空。";
  }
  if (rpc.result?.protocolVersion) {
    return `initialize 成功 · ${rpc.result.protocolVersion} · ${rpc.result.serverInfo?.name || "citekit"}`;
  }
  return JSON.stringify(rpc, null, 2);
}

function McpPlay({
  endpoint,
  tool,
  tools,
  onTool,
}: {
  endpoint: McpEndpoint;
  tool: RetrievalTool;
  tools: RetrievalTool[];
  onTool: (id: string) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState<"list" | "call" | null>(null);
  const [method, setMethod] = useState("");
  const [reply, setReply] = useState<McpRpc | null>(null);
  const [error, setError] = useState("");

  async function rpc(nextMethod: string, params?: Record<string, unknown>) {
    const body =
      nextMethod === "initialize"
        ? {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "citekit-web", version: "0.1.0" },
            },
          }
        : { jsonrpc: "2.0", id: 2, method: nextMethod, params: params || {} };
    return api.mcpRpc(endpoint.id, endpoint.apiKey, body);
  }

  async function run(kind: "list" | "call") {
    if (kind === "call" && !query.trim()) {
      toast("请填写问句");
      return;
    }
    setLoading(kind);
    setError("");
    try {
      const handshake = await rpc("initialize");
      if (handshake.error) {
        setMethod("initialize");
        setReply(handshake);
        setError(handshake.error.message);
        return;
      }
      const nextMethod = kind === "list" ? "tools/list" : "tools/call";
      const params =
        kind === "list"
          ? {}
          : {
              name: tool.name,
              arguments: {
                query: query.trim(),
              },
            };
      const next = await rpc(nextMethod, params);
      setMethod(nextMethod);
      setReply(next);
      if (next.error) setError(next.error.message);
      else if (next.result?.isError) setError(mcpText(next));
    } catch (err) {
      setMethod(kind === "list" ? "tools/list" : "tools/call");
      setReply(null);
      setError(err instanceof Error ? err.message : "MCP 调用失败");
    } finally {
      setLoading(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run("call");
  }

  return (
    <Panel title="经 MCP 调用白名单工具">
      <p className="page-desc" style={{ marginBottom: 12 }}>
        走端点 URL 和密钥，先 initialize 再 {`tools/list`} 或 {`tools/call`}。检索策略以工具发布时为准，这里不改参数。
      </p>
      <label className="field">
        工具
        <MySelect
          value={tool.id}
          onChange={onTool}
          list={tools.map((item) => ({ label: item.name, value: item.id }))}
        />
      </label>
      <form onSubmit={onSubmit} className="search-bar" style={{ marginTop: 12 }}>
        <IconSearch />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="问句，对应 tools/call 的 query"
        />
        <Button type="submit" isLoading={loading === "call"}>
          tools/call
        </Button>
      </form>
      <Button
        mt={2}
        mb={2}
        variant="outline"
        isLoading={loading === "list"}
        onClick={() => void run("list")}
      >
        列出工具 tools/list
      </Button>
      {(error || reply) && (
        <div className="hit-list">
          {error ? (
            <Alert status="warning" mb={3}>
              {error}
            </Alert>
          ) : null}
          {reply && !reply.error && !reply.result?.isError ? (
            <div className="hit-card">
              <div className="hit-card-top">
                <strong>{method || "MCP"}</strong>
                <span className="tag">JSON-RPC</span>
              </div>
              <p style={{ whiteSpace: "pre-wrap" }}>{mcpText(reply)}</p>
              <div className="hit-card-meta">
                POST {endpoint.url} · Bearer {endpoint.apiKey.slice(0, 8)}…
              </div>
            </div>
          ) : null}
          {reply ? <pre className="code">{JSON.stringify(reply, null, 2)}</pre> : null}
        </div>
      )}
    </Panel>
  );
}
