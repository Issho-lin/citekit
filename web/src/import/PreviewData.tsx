import { Box, Button, Flex, HStack, useToast } from "@chakra-ui/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { indexText } from "../indexText";
import type { ProcessConfig } from "../types";
import { useStore } from "../mock/store";
import { useDatasetImport } from "./Context";
import type { ImportSourceItemType } from "./types";

type PreviewResult = Awaited<ReturnType<typeof api.createProcessingDraft>>;
type Tab = "chunks" | "parsed";

function sourceType(importSource: ReturnType<typeof useDatasetImport>["importSource"], kbKind?: string) {
  if (importSource === "fileLink") return "web";
  if (importSource === "fileCustom") return "manual";
  if (importSource === "imageDataset") return "image";
  if (importSource === "websiteDataset") return "web";
  if (importSource === "apiDataset") {
    return kbKind === "feishu" || kbKind === "yuque" || kbKind === "dingtalk" ? kbKind : "api";
  }
  return "upload";
}

function websiteSite(source: ImportSourceItemType) {
  try {
    const config = JSON.parse(source.rawText || "{}") as { root?: string; linkSelector?: string };
    const root = config.root?.trim() || "";
    return root ? { root, linkSelector: config.linkSelector?.trim() || "" } : undefined;
  } catch {
    return undefined;
  }
}

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
  const toast = useToast();
  const { goToNext, sources, setSources, process, kbId, importSource, parentId } = useDatasetImport();
  const { knowledgeBases } = useStore();
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

  const processKey = JSON.stringify(importSource === "imageDataset" ? { ...process, imageIndex: true } : process);
  const kbKind = knowledgeBases.find((kb) => kb.id === kbId)?.kind;
  const draftKey = (source: ImportSourceItemType) => `${source.id}:${source.dbFileId ?? ""}:${source.rawText ?? ""}:${source.link ?? ""}:${processKey}:${importSource}:${kbKind ?? ""}`;
  const createDraft = async (source: ImportSourceItemType): Promise<PreviewResult> => {
    const key = draftKey(source);
    const cached = source.processingDraft;
    if (cached?.key === key) return cached.result as PreviewResult;
    const website = importSource === "websiteDataset";
    const next = await api.createProcessingDraft(kbId, {
      title: source.sourceName,
      type: sourceType(importSource, kbKind),
      locator: source.link?.trim() || `${source.connectorMeta?.source || importSource}:${source.id}`,
      parentId,
      fileId: source.dbFileId,
      // Website rawText carries crawl settings, not page content.
      rawText: website ? undefined : source.rawText,
      process: importSource === "imageDataset" ? { ...process, imageIndex: true } : process,
      site: website ? websiteSite(source) : undefined,
    });
    setSources((items) => items.map((item) => item.id === source.id ? { ...item, processingDraft: { key, id: next.draftId, result: next } } : item));
    return next;
  };

  useEffect(() => {
    if (!previewFile) { setResult(null); setError(""); return; }
    let cancelled = false;
    setResult(null); setLoading(true); setError("");
    void createDraft(previewFile)
      .then((next) => { if (!cancelled) setResult(next); })
      .catch((err: unknown) => { if (!cancelled) { setResult(null); setError(err instanceof Error ? err.message : "处理草稿生成失败"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // createDraft intentionally depends on the source/config fingerprint above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFile?.id, previewFile?.dbFileId, previewFile?.rawText, previewFile?.link, kbId, processKey, importSource, parentId]);

  async function prepareAllAndContinue() {
    setLoading(true); setError("");
    try {
      for (const source of sources) await createDraft(source);
      goToNext();
    } catch (err) {
      const message = err instanceof Error ? err.message : "存在文件处理失败";
      setError(message); toast({ title: message, status: "error" });
    } finally { setLoading(false); }
  }

  const total = result?.total ?? 0;
  const shown = result?.shown ?? result?.chunks.length ?? 0;

  return (
    <Flex flexDirection="column" h="100%">
      <Box fontSize="sm" color="myGray.500" mb={3} lineHeight={1.6}>
        此处生成可确认的处理草稿：解析、切块及模型增强结果都会缓存。切换文件不会重复处理；进入下一步时会自动补齐未处理文件，确认上传只进行向量化和入库。
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
                    <StatChip>未限制分块大小</StatChip>
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
                        bg="white"
                        borderWidth="1px"
                        borderColor={
                          result.chunkSize > 0 && item.chars > result.chunkSize ? "orange.200" : "myGray.200"
                        }
                        borderRadius="md"
                        overflow="hidden"
                        boxShadow="0 1px 2px rgba(19, 51, 107, 0.05)"
                      >
                        <Flex
                          fontSize="xs"
                          color="myGray.500"
                          px={3}
                          py={1.5}
                          gap={2}
                          align="center"
                          bg="myGray.100"
                          borderBottomWidth="1px"
                          borderColor="myGray.150"
                        >
                          <Box
                            color="white"
                            bg="primary.500"
                            borderRadius="sm"
                            px={1.5}
                            fontWeight={600}
                            flexShrink={0}
                          >
                            #{index + 1}
                          </Box>
                          {item.title ? (
                            <Box color="myGray.700" fontWeight={500} noOfLines={1} minW={0}>
                              {item.title}
                            </Box>
                          ) : null}
                          <Box
                            ml="auto"
                            flexShrink={0}
                            color={
                              result.chunkSize > 0 && item.chars > result.chunkSize
                                ? "orange.600"
                                : "myGray.500"
                            }
                          >
                            {item.chars} 字
                          </Box>
                        </Flex>
                        <Box
                          px={3}
                          py={2.5}
                          fontSize="sm"
                          color="myGray.700"
                          lineHeight={1.7}
                          whiteSpace="pre-wrap"
                          wordBreak="break-word"
                        >
                          {item.text}
                        </Box>
                        {item.answer ? (
                          <Box px={3} pb={2.5} fontSize="xs" color="myGray.500" whiteSpace="pre-wrap">
                            答：{item.answer}
                          </Box>
                        ) : null}
                        <Box
                          px={3}
                          py={2}
                          fontSize="xs"
                          bg="myGray.50"
                          borderTopWidth="1px"
                          borderColor="myGray.150"
                        >
                          {((item.indexes || []).length > 0
                            ? (item.indexes || []).map((idx) => ({
                                kind:
                                  idx.type === "child"
                                    ? "子块"
                                    : idx.type === "auto"
                                      ? "补充"
                                      : idx.type === "image"
                                        ? "图片"
                                        : "索引",
                                text: indexText(idx.text),
                              }))
                            : [{ kind: "待向量化文本", text: indexText(item.text) }]
                          ).map((row, i) => (
                            <Flex key={i} align="center" gap={2} minW={0} _notFirst={{ mt: 1 }}>
                              <Box
                                flexShrink={0}
                                px={1.5}
                                lineHeight="18px"
                                borderRadius="sm"
                                bg="primary.50"
                                color="primary.600"
                                fontWeight={500}
                              >
                                {row.kind}
                              </Box>
                              <Box flex={1} minW={0} color="myGray.500" noOfLines={1} title={row.text}>
                                {row.text}
                              </Box>
                            </Flex>
                          ))}
                        </Box>
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
        <Button isLoading={loading} loadingText="正在处理全部文件" onClick={() => void prepareAllAndContinue()}>
          下一步
        </Button>
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

function StatChip({ children, warn }: { children: ReactNode; warn?: boolean }) {
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
