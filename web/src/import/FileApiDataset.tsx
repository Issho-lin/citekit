import { Box, Button, Checkbox, Flex, Input, Spinner, Stack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { api } from "../api";
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
  if (kb?.kind !== "feishu") return <UnsupportedDataset kind={kb?.kind} />;
  if (activeStep === 0) return <FeishuFilePicker />;
  if (activeStep === 1) return <DataProcess />;
  if (activeStep === 2) return <PreviewData />;
  return <UploadStep />;
}

type FeishuFile = { token: string; name: string; type: string; url: string };

function FeishuFilePicker() {
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
    <Box className="feishu-import-panel">
      <Flex className="feishu-import-heading" align="flex-start" justify="space-between">
        <Box>
          <Box className="feishu-import-title">选择飞书文档</Box>
          <Box className="feishu-import-desc">输入一个飞书文件夹 Token，读取后选择要导入的新版文档。</Box>
        </Box>
        {files.length > 0 && <Box className="feishu-import-count">已选 {selected.length} / {files.length}</Box>}
      </Flex>
      <Flex className="feishu-folder-input" gap={3}>
        <Input value={folderToken} onChange={(event) => setFolderToken(event.target.value)} placeholder="输入 Folder Token" onKeyDown={(event) => { if (event.key === "Enter") void loadFiles(); }} />
        <Button variant="whiteBase" onClick={() => void loadFiles()} isLoading={loading}>读取目录</Button>
      </Flex>
      {loading ? <Flex minH="150px" align="center" justify="center"><Spinner /></Flex> : files.length ? (
        <Stack className="feishu-file-list" spacing={0}>
          {files.map((file) => (
            <Checkbox key={file.token} className="feishu-file-row" isChecked={selected.includes(file.token)} onChange={() => toggle(file.token)}>
              <Box className="feishu-file-name">{file.name}</Box>
              <Box className="feishu-file-kind">飞书文档</Box>
            </Checkbox>
          ))}
        </Stack>
      ) : <Box className="feishu-import-empty">输入 Folder Token 后，点击“读取目录”选择要导入的文档。</Box>}
      <Flex className="feishu-import-footer" align="center" justify="space-between">
        <Box color="myGray.600" fontSize="sm">导入后将按当前处理配置自动切块和索引。</Box>
        <Button onClick={() => void chooseSelected()} isDisabled={!selected.length} isLoading={importing}>下一步</Button>
      </Flex>
    </Box>
  );
}

function UnsupportedDataset({ kind }: { kind?: string }) {
  const label = kind === "yuque" ? "语雀" : kind === "dingtalk" ? "钉钉" : "API 数据集";
  return <Box maxW="640px" color="myGray.600" fontSize="sm">{label}连接器尚未接入。请先使用本地文件、网页链接或飞书文档导入。</Box>;
}
