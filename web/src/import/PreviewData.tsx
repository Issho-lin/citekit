import { Box, Button, Flex, HStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { ProcessConfig } from "../types";
import { useDatasetImport } from "./Context";
import type { ImportSourceItemType } from "./types";

type PreviewResult = Awaited<ReturnType<typeof api.previewKb>>;
type Tab = "chunks" | "parsed";

function needsModel(process: ProcessConfig) {
  return (
    process.pdfEnhance ||
    process.trainingType === "qa" ||
    process.autoIndexes ||
    process.imageIndex ||
    (process.chunkSettingMode === "custom" &&
      process.chunkSplitMode === "paragraph" &&
      process.paragraphChunkAIMode !== "forbid")
  );
}

export function PreviewData() {
  const { goToNext, sources, process, kbId } = useDatasetImport();
  const [previewFile, setPreviewFile] = useState<ImportSourceItemType | undefined>(sources[0]);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [tab, setTab] = useState<Tab>("chunks");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!previewFile || !sources.some((item) => item.id === previewFile.id)) {
      setPreviewFile(sources[0]);
    }
  }, [sources, previewFile]);

  const processKey = JSON.stringify(process);
  const fileKey = `${previewFile?.id ?? ""}:${previewFile?.dbFileId ?? ""}:${previewFile?.rawText ?? ""}`;

  useEffect(() => {
    if (!previewFile) {
      setResult(null);
      setError("");
      return;
    }
    let cancelled = false;
    setResult(null);
    setLoading(true);
    setError("");
    void api
      .previewKb(kbId, {
        fileId: previewFile.dbFileId,
        rawText: previewFile.rawText,
        process,
      })
      .then((next) => {
        if (cancelled) return;
        setResult(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult(null);
        setError(err instanceof Error ? err.message : "预览失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileKey, kbId, processKey, process]);

  const total = result?.total ?? 0;
  const shown = result?.shown ?? result?.chunks.length ?? 0;

  return (
    <Flex flexDirection="column" h="100%">
      <Box fontSize="sm" color="myGray.500" mb={3} lineHeight={1.6}>
        对照解析原文和切块结果，确认长度和切点符合预期后再入库。入库后可在数据集页看全部分块，知识库「试搜」验证检索。
      </Box>
      <Flex
        flex="1 0 0"
        minW={0}
        overflow="hidden"
        border="1px solid"
        borderColor="myGray.200"
        borderRadius="md"
      >
        <Flex
          flexDirection="column"
          flex="0 0 240px"
          maxW="240px"
          minW={0}
          borderRight="1px solid"
          borderColor="myGray.200"
        >
          <Box fontWeight={500} py={4} px={5} borderBottom="1px solid" borderColor="myGray.200">
            文件列表
          </Box>
          <Box flex="1 0 0" minW={0} overflowY="auto" px={5} py={3}>
            {sources.map((source) => (
              <HStack
                key={source.id}
                bg="myGray.50"
                p={4}
                borderRadius="md"
                borderWidth="1px"
                borderColor={previewFile?.id === source.id ? "primary.500" : "transparent"}
                cursor="pointer"
                _hover={{ borderColor: "primary.300" }}
                mb={3}
                onClick={() => setPreviewFile(source)}
              >
                <Box flex="1 1 0" minW={0} wordBreak="break-all" fontSize="sm">
                  {source.sourceName}
                </Box>
              </HStack>
            ))}
          </Box>
        </Flex>
        <Flex flexDirection="column" flex="1 1 0" minW={0}>
          <Flex
            py={3}
            px={5}
            borderBottom="1px solid"
            borderColor="myGray.200"
            justifyContent="space-between"
            align="center"
            gap={3}
          >
            <Box fontWeight={500}>处理检查</Box>
            <HStack spacing="3px" bg="myGray.50" p="3px" borderRadius="md" borderWidth="1px" borderColor="myGray.200">
              {(
                [
                  { id: "chunks" as const, label: "分块结果" },
                  { id: "parsed" as const, label: "解析原文" },
                ] as const
              ).map((item) => (
                <Box
                  key={item.id}
                  as="button"
                  type="button"
                  px={3}
                  py={1}
                  fontSize="xs"
                  borderRadius="sm"
                  bg={tab === item.id ? "white" : "transparent"}
                  color={tab === item.id ? "primary.600" : "myGray.600"}
                  fontWeight={tab === item.id ? 500 : 400}
                  boxShadow={tab === item.id ? "0 1px 2px rgba(19, 51, 107, 0.08)" : "none"}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </Box>
              ))}
            </HStack>
          </Flex>
          <Box flex="1 0 0" h={0} minW={0} overflowY="auto" px={5} py={3}>
            {error ? (
              <Box fontSize="sm" color="red.500">
                {error}
              </Box>
            ) : loading ? (
              <PreviewBusy usingModel={needsModel(process)} />
            ) : previewFile && result ? (
              <>
                <Box fontSize="sm" color="myGray.700" mb={2}>
                  {result.applied}
                </Box>
                <HStack spacing={2} flexWrap="wrap" mb={3} fontSize="xs" color="myGray.500">
                  <StatChip>原文 {result.parsedChars} 字</StatChip>
                  <StatChip>共 {total} 块</StatChip>
                  {total > 0 ? (
                    <StatChip>
                      最短 {result.minChars} · 平均 {result.avgChars} · 最长 {result.maxChars}
                    </StatChip>
                  ) : null}
                  {result.indexCount > 0 ? <StatChip>{result.indexCount} 条额外索引</StatChip> : null}
                  {result.chunkSize > 0 ? (
                    <StatChip warn={result.oversize > 0}>
                      {result.oversize > 0
                        ? `${result.oversize} 块超过 ${result.chunkSize} 字`
                        : `均未超过 ${result.chunkSize} 字`}
                    </StatChip>
                  ) : (
                    <StatChip>未限制父块大小</StatChip>
                  )}
                </HStack>
                {result.notes.length > 0 ? (
                  <Box
                    fontSize="xs"
                    color="orange.700"
                    bg="orange.50"
                    borderWidth="1px"
                    borderColor="orange.100"
                    borderRadius="md"
                    px={3}
                    py={2}
                    mb={3}
                    lineHeight={1.7}
                  >
                    {result.notes.map((note) => (
                      <Box key={note}>{note}</Box>
                    ))}
                  </Box>
                ) : null}
                {tab === "parsed" ? (
                  <Box
                    fontSize="sm"
                    color="myGray.600"
                    whiteSpace="pre-wrap"
                    wordBreak="break-word"
                    lineHeight={1.7}
                  >
                    {result.parsedText || "没有解析出文字"}
                    {result.parsedTruncated ? (
                      <Box mt={3} fontSize="xs" color="myGray.400">
                        原文较长，这里只展示前 {result.parsedText.length} 字。
                      </Box>
                    ) : null}
                  </Box>
                ) : total === 0 ? (
                  <Flex h="160px" align="center" justify="center" color="myGray.400" fontSize="sm">
                    没有切出分块
                  </Flex>
                ) : (
                  <>
                    <Box fontSize="xs" color="myGray.400" mb={3}>
                      {shown < total ? `共 ${total} 个分块，最多展示 ${shown} 个` : `共 ${total} 个分块`}
                    </Box>
                    {result.chunks.map((item, index) => (
                      <Box
                        key={index}
                        mb={3}
                        pb={3}
                        borderBottom="1px solid"
                        borderColor="myGray.200"
                      >
                        <Flex fontSize="xs" color="myGray.500" mb={1.5} gap={2}>
                          <Box color="primary.600" fontWeight={500}>
                            #{index + 1}
                          </Box>
                          <Box
                            color={
                              result.chunkSize > 0 && item.chars > result.chunkSize
                                ? "orange.600"
                                : "myGray.500"
                            }
                          >
                            {item.chars} 字
                          </Box>
                        </Flex>
                        <Box fontSize="sm" color="myGray.600" whiteSpace="pre-wrap" wordBreak="break-word">
                          {item.text}
                        </Box>
                        {item.answer ? (
                          <Box mt={2} fontSize="xs" color="myGray.500" whiteSpace="pre-wrap">
                            答：{item.answer}
                          </Box>
                        ) : null}
                        {(item.indexes || []).length > 0 ? (
                          <Box mt={2} fontSize="xs" color="myGray.400" lineHeight={1.7}>
                            {(item.indexes || []).map((idx, i) => (
                              <Box key={i}>
                                {(idx.type === "child"
                                  ? "子块"
                                  : idx.type === "auto"
                                    ? "补充"
                                    : idx.type === "image"
                                      ? "图片"
                                      : "索引") + ` · ${idx.text.slice(0, 80)}${idx.text.length > 80 ? "…" : ""}`}
                              </Box>
                            ))}
                          </Box>
                        ) : null}
                      </Box>
                    ))}
                  </>
                )}
              </>
            ) : (
              <Flex h="100%" align="center" justify="center" color="myGray.400" fontSize="sm">
                点击左侧文件后进行预览
              </Flex>
            )}
          </Box>
        </Flex>
      </Flex>
      <Flex mt={2} justifyContent="flex-end">
        <Button onClick={goToNext}>下一步</Button>
      </Flex>
    </Flex>
  );
}

function PreviewBusy({ usingModel }: { usingModel: boolean }) {
  return (
    <div className="preview-busy" role="status" aria-live="polite">
      <div className="preview-busy-art" aria-hidden="true">
        <div className="preview-busy-sheet">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="preview-busy-scan" />
      </div>
      <div className="preview-busy-slices" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="preview-busy-title">{usingModel ? "正在处理" : "正在解析"}</div>
      <div className="preview-busy-desc">{usingModel ? "可能调用模型，请稍候" : "按当前规则生成分块预览"}</div>
    </div>
  );
}

function StatChip({ children, warn }: { children: string; warn?: boolean }) {
  return (
    <Box
      px={2}
      py={0.5}
      borderRadius="sm"
      borderWidth="1px"
      borderColor={warn ? "orange.200" : "myGray.200"}
      bg={warn ? "orange.50" : "myGray.50"}
      color={warn ? "orange.700" : "myGray.600"}
    >
      {children}
    </Box>
  );
}
