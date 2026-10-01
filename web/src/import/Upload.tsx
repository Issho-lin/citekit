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
  const { refreshKnowledgeBases } = useStore();
  const { parentId, sources, setSources, kbId } = useDatasetImport();
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
      const waiting = sources.filter((item) => item.createStatus === "waiting");
      const draftIds = waiting.map((item) => item.processingDraft?.id).filter((id): id is string => Boolean(id));
      if (draftIds.length !== waiting.length) {
        throw new Error("存在未完成处理的数据，请返回“数据预览”等待全部文件处理完成");
      }
      setSources((state) => state.map((source) => source.createStatus === "waiting" ? { ...source, createStatus: "creating" } : source));
      const result = await api.commitProcessingDrafts(kbId, draftIds);
      setSources((state) => state.map((source) => source.createStatus === "creating" ? { ...source, createStatus: "finish" } : source));
      await refreshKnowledgeBases();
      toast({ title: `已入库 ${result.imported} 个文件`, status: "success" });
      nav(`/kb/${kbId}${parentId ? `?parent=${parentId}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传异常";
      setSources((state) =>
        state.map((source) =>
          source.createStatus === "creating"
            ? { ...source, createStatus: "waiting", errorMsg: message }
            : source,
        ),
      );
      toast({ title: message, status: "error" });
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
