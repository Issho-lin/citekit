import {
  Box,
  Button,
  Flex,
  IconButton,
  Table,
  TableContainer,
  Tag,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useStore } from "../mock/store";
import { useDatasetImport } from "./Context";

export function UploadStep() {
  const toast = useToast();
  const nav = useNavigate();
  const { addSource, knowledgeBases, refreshKnowledgeBases } = useStore();
  const { importSource, parentId, sources, setSources, process, kbId, folderToken } = useDatasetImport();
  const kbKind = knowledgeBases.find((k) => k.id === kbId)?.kind;
  const [isLoading, setIsLoading] = useState(false);

  const { totalFilesCount, hasCreatingFiles, buttonText } = useMemo(() => {
    const totalFilesCount = sources.length;
    const waitingFilesCount = sources.filter((f) => f.createStatus === "waiting").length;
    const hasCreatingFiles = sources.some((f) => f.createStatus === "creating");
    const allFinished = sources.every((f) => f.createStatus === "finish");
    let buttonText = "开始上传";
    if (waitingFilesCount !== totalFilesCount) {
      buttonText = allFinished ? "完成上传" : "继续上传";
    }
    return { totalFilesCount, hasCreatingFiles, buttonText };
  }, [sources]);

  async function startUpload() {
    if (sources.length === 0) return;
    setIsLoading(true);
    try {
      if (importSource === "websiteDataset") {
        const urls = sources.map((item) => item.link).filter((item): item is string => Boolean(item));
        const config = JSON.parse(sources[0]?.rawText || "{}") as { root?: string; linkSelector?: string };
        const result = await api.importWebsitePages(kbId, { url: config.root || urls[0] || "", selector: process.webSelector, linkSelector: config.linkSelector, urls, process });
        await refreshKnowledgeBases();
        toast({ title: `已开始导入 ${result.imported} 个网页`, status: "success" });
        nav(`/kb/${kbId}${parentId ? `?parent=${parentId}` : ""}`);
        return;
      }
      if (importSource === "apiDataset" && kbKind === "yuque") {
        const meta = sources[0]?.connectorMeta;
        if (!meta?.repoId) throw new Error("缺少语雀知识库信息，请返回第一步重新选择");
        const result = await api.importYuqueDocs(kbId, { repoId: meta.repoId, docIds: sources.map((item) => item.id), process, parentId });
        await refreshKnowledgeBases();
        toast({ title: `已开始导入 ${result.imported} 篇语雀文档`, status: "success" });
        nav(`/kb/${kbId}${parentId ? `?parent=${parentId}` : ""}`);
        return;
      }
      if (importSource === "apiDataset" && kbKind === "feishu") {
        const wiki = sources[0]?.connectorMeta;
        if (wiki?.source === "feishu-wiki" && wiki.spaceId) {
          const result = await api.importFeishuWikiFiles(kbId, { spaceId: wiki.spaceId, tokens: sources.map((item) => item.id), process, parentId });
          await refreshKnowledgeBases();
          toast({ title: `已开始导入 ${result.imported} 篇飞书 Wiki 文档`, status: "success" });
          nav(`/kb/${kbId}${parentId ? `?parent=${parentId}` : ""}`);
          return;
        }
        if (!folderToken) throw new Error("缺少 Folder Token，请返回第一步重新读取目录");
        const result = await api.importFeishuFiles(kbId, { folderToken, tokens: sources.map((item) => item.id), process, parentId });
        await refreshKnowledgeBases();
        toast({ title: `已开始导入 ${result.imported} 篇飞书文档`, status: "success" });
        nav(`/kb/${kbId}${parentId ? `?parent=${parentId}` : ""}`);
        return;
      }
      const waiting = sources.filter((item) => item.createStatus === "waiting");
      for (const item of waiting) {
        setSources((state) =>
          state.map((source) => (source.id === item.id ? { ...source, createStatus: "creating" } : source)),
        );
        await new Promise((r) => setTimeout(r, 200));
        const type =
          importSource === "fileLink"
            ? "web"
            : importSource === "fileCustom"
              ? "manual"
              : importSource === "apiDataset"
                ? kbKind === "feishu" || kbKind === "yuque" || kbKind === "dingtalk"
                  ? kbKind
                  : "api"
              : importSource === "imageDataset"
                ? "image"
                : "upload";
        await addSource(
          kbId,
          type,
          item.sourceName,
          item.link || item.dbFileId || `uploads/${item.sourceName}`,
          importSource === "imageDataset" ? { ...process, imageIndex: true } : process,
          parentId,
          { fileId: item.dbFileId, rawText: item.rawText },
        );
        setSources((state) =>
          state.map((source) => (source.id === item.id ? { ...source, createStatus: "finish" } : source)),
        );
      }
      toast({ title: "导入成功，请等待训练", status: "success" });
      nav(`/kb/${kbId}${parentId ? `?parent=${parentId}` : ""}`);
    } catch (error) {
      setSources((state) =>
        state.map((source) =>
          source.createStatus === "creating"
            ? { ...source, createStatus: "waiting", errorMsg: "上传异常" }
            : source,
        ),
      );
      toast({ title: "上传异常", status: "error" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Box h="100%" overflow="auto">
      <TableContainer>
        <Table variant="simple" fontSize="sm">
          <Thead>
            <Tr bg="myGray.100">
              <Th borderLeftRadius="md" borderBottom="none" py={4}>
                来源名
              </Th>
              <Th borderBottom="none" py={4}>
                状态
              </Th>
              <Th borderRightRadius="md" borderBottom="none" py={4}>
                操作
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {sources.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <Box whiteSpace="normal" maxW="30vw">
                    {item.sourceName}
                  </Box>
                </Td>
                <Td>
                  {item.errorMsg ? (
                    <Tag colorScheme="red">错误</Tag>
                  ) : item.createStatus === "waiting" ? (
                    <Tag colorScheme="gray">等待中</Tag>
                  ) : item.createStatus === "creating" ? (
                    <Tag colorScheme="blue">创建中</Tag>
                  ) : (
                    <Tag colorScheme="green">完成</Tag>
                  )}
                </Td>
                <Td>
                  {!hasCreatingFiles && item.createStatus !== "finish" && (
                    <IconButton
                      variant="grayDanger"
                      size="sm"
                      icon={<span>×</span>}
                      aria-label="删除"
                      onClick={() => setSources((prev) => prev.filter((file) => file.id !== item.id))}
                    />
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <Flex justifyContent="flex-end" mt={4}>
        <Button isLoading={isLoading} onClick={startUpload}>
          {totalFilesCount > 0 ? `共 ${totalFilesCount} 个文件 | ` : ""}
          {buttonText}
        </Button>
      </Flex>
    </Box>
  );
}
