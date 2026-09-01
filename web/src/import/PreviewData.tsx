import { Box, Button, Flex, HStack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { chunksFromSources } from "../mock/chunks";
import type { Source } from "../types";
import { useDatasetImport } from "./Context";
import type { ImportSourceItemType } from "./types";
import { getNanoid } from "./fileTools";

export function PreviewData() {
  const { goToNext, sources, process, kbId, importSource } = useDatasetImport();
  const [previewFile, setPreviewFile] = useState<ImportSourceItemType>();

  const data = useMemo(() => {
    if (!previewFile) return { chunks: [] as { q: string; a: string }[], total: 0 };
    const fake: Source = {
      id: previewFile.id,
      kbId,
      type: importSource === "fileLink" ? "web" : importSource === "fileCustom" ? "manual" : "upload",
      title: previewFile.sourceName,
      locator: previewFile.link || previewFile.sourceName,
      acl: "internal",
      status: "synced",
      updatedAt: "",
      ...process,
    };
    const chunks = chunksFromSources("preview", [fake], () => getNanoid()).slice(0, 10);
    return {
      total: chunks.length,
      chunks: chunks.map((c) => ({ q: c.text, a: "" })),
    };
  }, [previewFile, kbId, importSource, process]);

  return (
    <Flex flexDirection="column" h="100%">
      <Flex flex="1 0 0" minW={0} overflow="hidden" border="1px solid" borderColor="myGray.200" borderRadius="md">
        <Flex flexDirection="column" flex="0 0 50%" maxW="50%" minW={0} borderRight="1px solid" borderColor="myGray.200">
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
        <Flex flexDirection="column" flex="0 0 50%" maxW="50%" minW={0}>
          <Flex py={4} px={5} borderBottom="1px solid" borderColor="myGray.200" justifyContent="space-between">
            <Box fontWeight={500}>分块预览</Box>
            <Box fontSize="xs" color="myGray.500">
              共 {data.total} 个分块，最多展示 10 个
            </Box>
          </Flex>
          <Box flex="1 0 0" h={0} minW={0} overflowY="auto" px={5} py={3}>
            {previewFile ? (
              data.chunks.map((item, index) => (
                <Box
                  key={index}
                  fontSize="sm"
                  color="myGray.600"
                  mb={3}
                  pb={3}
                  borderBottom="1px solid"
                  borderColor="myGray.200"
                >
                  {item.q}
                </Box>
              ))
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
