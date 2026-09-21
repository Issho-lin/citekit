import { Box, Button, Checkbox, Flex, Input, Spinner, Stack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { MySelect } from "../components/MySelect";
import { useToast } from "../components/Toast";
import { useStore } from "../mock/store";
import { useDatasetImport } from "./Context";
import { DataProcess } from "./DataProcess";
import { PreviewData } from "./PreviewData";
import { UploadStep } from "./Upload";

export function FileApiDataset() {
  const { kbId, activeStep } = useDatasetImport();
  const { knowledgeBases } = useStore();
  const kb = knowledgeBases.find((item) => item.id === kbId);
  if (kb?.kind !== "feishu" && kb?.kind !== "yuque" && kb?.kind !== "dingtalk") return <UnsupportedDataset kind={kb?.kind} />;
  if (activeStep === 0) return kb.kind === "yuque" ? <YuqueDocPicker /> : kb.kind === "dingtalk" ? <DingtalkDocPicker /> : <FeishuImportPicker />;
  if (activeStep === 1) return <DataProcess />;
  if (activeStep === 2) return <PreviewData />;
  return <UploadStep />;
}

type FeishuFile = { token: string; name: string; type: string; url: string };

function FeishuImportPicker() {
  const [mode, setMode] = useState<"drive" | "wiki">("drive");
  return (
    <Box>
      <Flex gap={2} mb={4}>
        <Button size="sm" variant={mode === "drive" ? "solid" : "whiteBase"} onClick={() => setMode("drive")}>云盘文件夹</Button>
        <Button size="sm" variant={mode === "wiki" ? "solid" : "whiteBase"} onClick={() => setMode("wiki")}>Wiki 知识空间</Button>
      </Flex>
      {mode === "drive" ? <FeishuDrivePicker /> : <FeishuWikiPicker />}
    </Box>
  );
}

function FeishuDrivePicker() {
  const toast = useToast();
  const { kbId, setSources, setFolderToken: saveFolderToken, goToNext } = useDatasetImport();
  const [folderToken, setFolderToken] = useState("");
  const [files, setFiles] = useState<FeishuFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    void api.listFeishuFolders(kbId)
      .then((folders) => {
        if (active && folders[0]?.token) setFolderToken(folders[0].token);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [kbId]);

  async function loadFiles(tokenInput = folderToken) {
    const token = tokenInput.trim();
    if (!token) {
      toast("请填写 Folder Token");
      return;
    }
    setLoading(true);
    setSelected([]);
    try {
      setFiles(await api.listFeishuFiles(kbId, token));
      setFolderToken(token);
      saveFolderToken?.(token);
      await api.saveFeishuFolder(kbId, { token });
    } catch (err) {
      toast(err instanceof Error ? err.message : "读取飞书目录失败");
    } finally {
      setLoading(false);
    }
  }

  function toggle(token: string) {
    setSelected((current) => current.includes(token) ? current.filter((item) => item !== token) : [...current, token]);
  }

  async function chooseSelected() {
    if (!selected.length) return;
    setImporting(true);
    try {
      const picked = await Promise.all(selected.map(async (token) => {
        const file = files.find((item) => item.token === token);
        const preview = await api.previewFeishuFile(kbId, folderToken.trim(), token);
        return { id: token, createStatus: "waiting" as const, sourceName: preview.name || file?.name || "飞书文档", rawText: preview.text, link: file?.url || token };
      }));
      setSources(picked);
      goToNext();
    } catch (err) {
      toast(err instanceof Error ? err.message : "读取飞书文档失败");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Box className="connector-import-panel">
      <Flex className="connector-import-heading" align="flex-start" justify="space-between">
        <Box>
          <Box className="connector-import-title">选择飞书文档</Box>
          <Box className="connector-import-desc">输入一个飞书文件夹 Token，读取后选择要导入的新版文档。应用需具备「获取云空间文件夹下的云文档清单」和「查看新版文档」权限。</Box>
        </Box>
        {files.length > 0 && <Box className="connector-import-count">已选 {selected.length} / {files.length}</Box>}
      </Flex>
      <Flex className="connector-import-input" gap={3}>
        <Input value={folderToken} onChange={(event) => setFolderToken(event.target.value)} placeholder="输入 Folder Token" onKeyDown={(event) => { if (event.key === "Enter") void loadFiles(); }} />
        <Button variant="whiteBase" onClick={() => void loadFiles()} isLoading={loading}>读取目录</Button>
      </Flex>
      {loading ? <Flex minH="150px" align="center" justify="center"><Spinner /></Flex> : files.length ? (
        <Stack className="connector-file-list" spacing={0}>
          {files.map((file) => (
            <Checkbox key={file.token} className="connector-file-row" isChecked={selected.includes(file.token)} onChange={() => toggle(file.token)}>
              <Box className="connector-file-name">{file.name}</Box>
              <Box className="connector-file-kind">飞书文档</Box>
            </Checkbox>
          ))}
        </Stack>
      ) : <Box className="connector-import-empty">输入 Folder Token 后，点击“读取目录”选择要导入的文档。</Box>}
      <Flex className="connector-import-footer" align="center" justify="space-between">
        <Box color="myGray.600" fontSize="sm">导入后将按当前处理配置自动切块和索引。</Box>
        <Button onClick={() => void chooseSelected()} isDisabled={!selected.length} isLoading={importing}>下一步</Button>
      </Flex>
    </Box>
  );
}

function FeishuWikiPicker() {
  const toast = useToast();
  const { kbId, setSources, goToNext } = useDatasetImport();
  const [spaces, setSpaces] = useState<{ id: string; name: string; description: string }[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [nodes, setNodes] = useState<{ token: string; title: string; type: string; objToken: string; hasChild: boolean }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshingSpaces, setRefreshingSpaces] = useState(false);
  async function refreshSpaces() {
    setRefreshingSpaces(true);
    try {
      const next = await api.listFeishuSpaces(kbId);
      setSpaces(next);
      const selectedSpaceId = next.some((space) => space.id === spaceId) ? spaceId : "";
      setSpaceId(selectedSpaceId);
      setSelected([]);
      if (selectedSpaceId) {
        setLoading(true);
        try {
          setNodes(await api.listFeishuWikiNodes(kbId, selectedSpaceId));
        } finally {
          setLoading(false);
        }
      } else {
        setNodes([]);
      }
      toast(next.length ? `已读取 ${next.length} 个知识空间` : "未发现可访问的知识空间");
    } catch (err) {
      toast(err instanceof Error ? err.message : "读取飞书知识空间失败");
    } finally {
      setRefreshingSpaces(false);
    }
  }
  async function loadNodes(id = spaceId) { if (!id) return; setLoading(true); try { setSpaceId(id); setNodes(await api.listFeishuWikiNodes(kbId, id)); setSelected([]); } catch (err) { toast(err instanceof Error ? err.message : "读取 Wiki 节点失败"); } finally { setLoading(false); } }
  async function choose() { if (!selected.length) return; setLoading(true); try { const picked = await Promise.all(selected.map(async (token) => { const node = nodes.find((item) => item.token === token)!; const preview = await api.previewFeishuWikiNode(kbId, node.objToken); return { id: token, createStatus: "waiting" as const, sourceName: node.title || preview.name || "飞书 Wiki 文档", rawText: preview.text, connectorMeta: { source: "feishu-wiki", spaceId, objToken: node.objToken }, link: `https://feishu.cn/wiki/${token}` }; })); setSources(picked); goToNext(); } catch (err) { toast(err instanceof Error ? err.message : "读取 Wiki 文档失败"); } finally { setLoading(false); } }
  return <Box className="connector-import-panel"><Flex className="connector-import-heading" align="flex-start" justify="space-between"><Box><Box className="connector-import-title">选择飞书 Wiki 文档</Box><Box className="connector-import-desc">选择知识空间，再勾选需要导入的 Wiki 文档节点。</Box></Box></Flex><Flex className="connector-import-input" gap={3}><Box flex={1}><MySelect value={spaceId} list={spaces.map((space) => ({ value: space.id, label: space.name, description: space.description || undefined }))} onChange={(id) => void loadNodes(id)} placeholder={spaces.length ? "选择知识空间" : "未发现可访问的知识空间"} isDisabled={!spaces.length} /></Box><Button onClick={() => void refreshSpaces()} isLoading={refreshingSpaces} loadingText="读取中" variant="whiteBase">读取空间</Button></Flex>{!loading && !spaces.length ? <Box className="connector-import-empty">请先点击“读取空间”。应用需具备「查看知识库」和「查看新版文档」权限，并可访问目标知识空间。</Box> : loading ? <Flex minH="150px" align="center" justify="center"><Spinner /></Flex> : nodes.length ? <Stack className="connector-file-list" spacing={0}>{nodes.filter((node) => node.type === "docx" || node.type === "doc").map((node) => <Checkbox key={node.token} className="connector-file-row" isChecked={selected.includes(node.token)} onChange={() => setSelected((items) => items.includes(node.token) ? items.filter((item) => item !== node.token) : [...items, node.token])}><Box className="connector-file-name">{node.title}</Box><Box className="connector-file-kind">Wiki 文档</Box></Checkbox>)}</Stack> : <Box className="connector-import-empty">请选择知识空间后读取节点。</Box>}<Flex className="connector-import-footer" align="center" justify="space-between"><Box color="myGray.600" fontSize="sm">导入后将按当前处理配置自动切块和索引。</Box><Button onClick={() => void choose()} isDisabled={!selected.length} isLoading={loading}>下一步</Button></Flex></Box>;
}

type ConnectorItem = { id: string; name: string; url: string };

type ConnectorPickerProps = {
  title: string;
  description: string;
  itemLabel: string;
  rootLabel: string;
  rootPlaceholder: string;
  empty: string;
  loadRoots: () => Promise<{ id: string; name: string; description: string }[]>;
  loadItems: (id: string) => Promise<ConnectorItem[]>;
  preview: (rootId: string, item: ConnectorItem) => Promise<{ name: string; text: string }>;
  meta: (rootId: string, item: ConnectorItem) => Record<string, string>;
};

function ConnectorDocumentPicker({ title, description, itemLabel, rootLabel, rootPlaceholder, empty, loadRoots, loadItems, preview, meta }: ConnectorPickerProps) {
  const toast = useToast();
  const { setSources, goToNext } = useDatasetImport();
  const [roots, setRoots] = useState<{ id: string; name: string; description: string }[]>([]);
  const [rootId, setRootId] = useState("");
  const [items, setItems] = useState<ConnectorItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function refreshRoots() {
    setLoading(true);
    try {
      const next = await loadRoots();
      setRoots(next); setRootId(""); setItems([]); setSelected([]);
      toast(next.length ? `已读取 ${next.length} 个${rootLabel}` : `未找到可访问的${rootLabel}`);
    } catch (err) { toast(err instanceof Error ? err.message : `读取${rootLabel}失败`); }
    finally { setLoading(false); }
  }
  async function selectRoot(id: string) {
    setLoading(true);
    try { setRootId(id); setItems(await loadItems(id)); setSelected([]); }
    catch (err) { toast(err instanceof Error ? err.message : `读取${itemLabel}失败`); }
    finally { setLoading(false); }
  }
  async function choose() {
    if (!rootId || !selected.length) return;
    setLoading(true);
    try {
      const picked = await Promise.all(selected.map(async (id) => {
        const item = items.find((candidate) => candidate.id === id)!;
        const result = await preview(rootId, item);
        return { id, createStatus: "waiting" as const, sourceName: result.name || item.name, rawText: result.text, connectorMeta: meta(rootId, item), link: item.url };
      }));
      setSources(picked); goToNext();
    } catch (err) { toast(err instanceof Error ? err.message : `读取${itemLabel}失败`); }
    finally { setLoading(false); }
  }
  return <Box className="connector-import-panel"><Flex className="connector-import-heading" align="flex-start" justify="space-between"><Box><Box className="connector-import-title">{title}</Box><Box className="connector-import-desc">{description}</Box></Box></Flex><Flex className="connector-import-input" gap={3}><Box flex={1}><MySelect value={rootId} list={roots.map((root) => ({ value: root.id, label: root.name, description: root.description || undefined }))} onChange={(id) => void selectRoot(id)} placeholder={roots.length ? rootPlaceholder : `请先读取${rootLabel}`} isDisabled={!roots.length} /></Box><Button onClick={() => void refreshRoots()} isLoading={loading} loadingText="读取中" variant="whiteBase">读取{rootLabel}</Button></Flex>{loading ? <Flex minH="150px" align="center" justify="center"><Spinner /></Flex> : items.length ? <Stack className="connector-file-list" spacing={0}>{items.map((item) => <Checkbox key={item.id} className="connector-file-row" isChecked={selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}><Box className="connector-file-name">{item.name}</Box><Box className="connector-file-kind">{itemLabel}</Box></Checkbox>)}</Stack> : <Box className="connector-import-empty">{empty}</Box>}<Flex className="connector-import-footer" align="center" justify="space-between"><Box color="myGray.600" fontSize="sm">导入后将按当前处理配置自动切块和索引。</Box><Button onClick={() => void choose()} isDisabled={!selected.length} isLoading={loading}>下一步</Button></Flex></Box>;
}

function YuqueDocPicker() {
  const { kbId } = useDatasetImport();
  return <ConnectorDocumentPicker title="选择语雀文档" description="使用创建知识库时配置的 User ID 和 Token，读取个人知识库后选择文档导入。" itemLabel="语雀文档" rootLabel="语雀知识库" rootPlaceholder="选择语雀知识库" empty="请先点击“读取知识库”。需要在语雀创建个人 Token，并填写具备目标知识库访问权限的 User ID。" loadRoots={() => api.listYuqueRepos(kbId)} loadItems={async (repoId) => (await api.listYuqueDocs(kbId, repoId)).map((doc) => ({ id: doc.id, name: doc.title, url: doc.url }))} preview={(repoId, doc) => api.previewYuqueDoc(kbId, repoId, doc.id)} meta={(repoId) => ({ source: "yuque", repoId })} />;
}

function DingtalkDocPicker() {
  const { kbId } = useDatasetImport();
  return <ConnectorDocumentPicker title="选择钉钉文档" description="使用企业内部应用凭据和成员 User ID，读取该成员可访问的钉钉知识库与文档。" itemLabel="钉钉文档" rootLabel="钉钉知识库" rootPlaceholder="选择钉钉知识库" empty="请先点击“读取知识库”。应用需开通知识库与企业存储文件读取权限。" loadRoots={() => api.listDingtalkWorkspaces(kbId)} loadItems={async (workspaceId) => (await api.listDingtalkNodes(kbId, workspaceId)).map((node) => ({ id: node.id, name: node.name, url: node.url }))} preview={(_workspaceId, node) => api.previewDingtalkNode(kbId, node.id)} meta={(workspaceId, node) => ({ source: "dingtalk", workspaceId, nodeName: node.name })} />;
}

function UnsupportedDataset({ kind }: { kind?: string }) {
  const label = kind === "yuque" ? "语雀" : kind === "dingtalk" ? "钉钉" : "API 数据集";
  return <Box maxW="640px" color="myGray.600" fontSize="sm">{label}连接器尚未接入。请先使用本地文件、网页链接或飞书文档导入。</Box>;
}
