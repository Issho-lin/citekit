import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Flex,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useDisclosure,
} from "@chakra-ui/react";
import { Crumb, Empty, NextBar, PageHero, Panel } from "../components/chrome";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RetrievePlay } from "../components/RetrievePlay";
import { ToolEditor, type ToolDraft } from "../components/ToolEditor";
import { searchFromTool } from "../constants";
import { api } from "../api";
import { toolNext } from "../mock/pipeline";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";

export function ToolDetailPage() {
  const { toolId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const del = useDisclosure();
  const rename = useDisclosure();
  const { tools, knowledgeBases, sources, endpoints, kbsReady, updateTool, addToolToEndpoint, removeTool } =
    useStore();
  const tool = tools.find((t) => t.id === toolId);
  const kb = knowledgeBases.find((k) => k.id === tool?.kbId);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<ToolDraft | null>(null);
  const unpublished = endpoints.filter((e) => tool && !e.toolIds.includes(tool.id));
  const published = endpoints.filter((e) => tool && e.toolIds.includes(tool.id));

  if (!kbsReady) {
    return <div className="page" aria-busy="true" />;
  }

  if (!tool || !kb) {
    return (
      <div className="page">
        <Empty text="未找到工具。" to="/tools" cta="返回列表" />
      </div>
    );
  }

  const search = searchFromTool(tool);
  const next = toolNext(tool, endpoints);
  const schema = {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "独立完整问句，不要丢给平台做多轮改写" },
      },
    },
  };

  const modeLabel =
    search.searchMode === "embedding" ? "语义" : search.searchMode === "fullText" ? "全文" : "混合";

  async function commit(draft: ToolDraft) {
    setSaving(true);
    try {
      await updateTool(tool.id, {
        name: draft.name,
        title: draft.title,
        description: draft.description,
        sourceIds: draft.sourceIds,
      });
      toast(
        published.length > 0
          ? `已重新发布到 ${published.map((e) => `「${e.name}」`).join("、")}，下次 tools/list 即新契约`
          : "已保存",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存失败");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function onSave(draft: ToolDraft) {
    if (published.length > 0 && draft.name !== tool.name) {
      setPending(draft);
      rename.onOpen();
      return;
    }
    await commit(draft);
  }

  return (
    <div className="page">
      <div className="page-inner">
        <Crumb items={[{ label: "检索工具", href: "/tools" }, { label: tool.title }]} />
        <PageHero
          title={tool.title}
          desc={tool.name}
          action={
            <Flex gap={2}>
              {published.length === 0 ? (
                <Button as={Link} to={`/mcp/new?tool=${tool.id}`}>
                  发布到 MCP
                </Button>
              ) : (
                <Button as={Link} to={`/mcp/${published[0].id}`} variant="outline">
                  查看端点
                </Button>
              )}
              <Button as={Link} to={`/eval?tool=${tool.id}`} variant="outline">
                评测
              </Button>
            </Flex>
          }
        />
        <NextBar {...next} />

        <Tabs>
          <TabList>
            <Tab>配置</Tab>
            <Tab>检索策略</Tab>
            <Tab>发布</Tab>
          </TabList>
          <TabPanels>
            <TabPanel px={0}>
              <ToolEditor
                key={tool.id}
                initial={{
                  kbId: tool.kbId,
                  sourceIds: tool.sourceIds,
                  title: tool.title,
                  name: tool.name,
                  description: tool.description,
                  search,
                }}
                kbLocked
                showSearch={false}
                excludeId={tool.id}
                submitLabel={published.length > 0 ? "保存并重新发布" : "保存"}
                submitting={saving}
                onSubmit={onSave}
              />
              <Box mt={5}>
                <Panel title="tools/list 当前下发">
                  <p className="page-desc">保存后，已挂端点会按这份契约返回。</p>
                  <pre className="code">{JSON.stringify(schema, null, 2)}</pre>
                  <p className="page-desc" style={{ marginTop: 12 }}>
                    当前策略：{modeLabel} · 相似度 {search.similarity} · 上限 {search.limit}
                    {search.usingRerank ? " · 重排" : ""}
                    。在「检索策略」里改会立即写入这把工具。
                  </p>
                </Panel>
              </Box>
              <Button colorScheme="red" variant="outline" mt={4} onClick={del.onOpen}>
                删除工具
              </Button>
              <ConfirmDialog
                isOpen={del.isOpen}
                onClose={del.onClose}
                title="删除工具？"
                onConfirm={() => {
                  void removeTool(tool.id)
                    .then(() => {
                      toast("已删除");
                      nav("/tools");
                    })
                    .catch((err: unknown) => toast(err instanceof Error ? err.message : "删除失败"));
                }}
              >
                将从所有 MCP 白名单中移除。
              </ConfirmDialog>
              <ConfirmDialog
                isOpen={rename.isOpen}
                onClose={() => {
                  setPending(null);
                  rename.onClose();
                }}
                title="调用名会变"
                confirmText="保存并重新发布"
                confirmScheme="primary"
                onConfirm={async () => {
                  if (!pending) return;
                  await commit(pending);
                  setPending(null);
                }}
              >
                调用名将从 <span className="mono">{tool.name}</span> 改为{" "}
                <span className="mono">{pending?.name}</span>。已接入的 Agent 需要重新拉取 tools/list，否则会继续调旧名。
              </ConfirmDialog>
            </TabPanel>
            <TabPanel px={0}>
              <Panel title="只搜勾选的集合，策略保存在这把工具上">
                <RetrievePlay
                  sourceIds={tool.sourceIds}
                  profile={tool.profile}
                  search={search}
                  onSearchChange={(nextSearch) => {
                    void updateTool(tool.id, { search: nextSearch }).catch((err: unknown) =>
                      toast(err instanceof Error ? err.message : "保存策略失败"),
                    );
                  }}
                  chunks={[]}
                  placeholder="输入问题，测试这把工具的检索"
                  onRetrieve={async ({ query }) => {
                    const result = await api.searchTool(tool.id, { query });
                    return { hits: result.hits, message: result.message ?? undefined };
                  }}
                />
              </Panel>
            </TabPanel>
            <TabPanel px={0}>
              <Alert status="info" mb={4} borderRadius="md">
                MCP 不存快照。保存修改后，已挂端点的 tools/list / tools/call 立刻用新契约。改调用名后请让 Agent 重新拉工具列表。
              </Alert>
              {published.length === 0 ? (
                <p className="page-desc">尚未出现在任何端点白名单。保存只改工具本身，Agent 仍调不到。</p>
              ) : (
                published.map((e) => (
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
                    void addToolToEndpoint(e.id, tool.id)
                      .then(() => toast(`已加入「${e.name}」，该端点下次 list 会带上这把工具`))
                      .catch((err: unknown) => toast(err instanceof Error ? err.message : "加入失败"));
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
