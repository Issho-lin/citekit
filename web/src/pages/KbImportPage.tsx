import { Box, Flex } from "@chakra-ui/react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DatasetImportContextProvider } from "../import/Context";
import { FileApiDataset } from "../import/FileApiDataset";
import { FileCustomText } from "../import/FileCustomText";
import { FileImageDataset } from "../import/FileImageDataset";
import { FileLink } from "../import/FileLink";
import { FileLocal } from "../import/FileLocal";
import type { ImportSourceKind } from "../import/types";
import { useStore } from "../mock/store";

function kindFromQuery(source: string | null): ImportSourceKind {
  if (source === "web" || source === "fileLink") return "fileLink";
  if (source === "manual" || source === "fileCustom") return "fileCustom";
  if (source === "api" || source === "apiDataset") return "apiDataset";
  if (source === "image" || source === "imageDataset") return "imageDataset";
  return "fileLocal";
}

export function KbImportPage() {
  const { kbId } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { knowledgeBases, kbsReady } = useStore();
  const kb = knowledgeBases.find((k) => k.id === kbId);
  const importSource = kindFromQuery(params.get("source"));
  const parentId = params.get("parent") || undefined;

  if (!kbsReady) {
    return (
      <div className="page">
        <p>加载中…</p>
      </div>
    );
  }

  if (!kb || !kbId) {
    return (
      <div className="page">
        <p>未找到知识库</p>
      </div>
    );
  }

  const Body =
    importSource === "fileLink"
      ? FileLink
      : importSource === "fileCustom"
        ? FileCustomText
        : importSource === "apiDataset"
          ? FileApiDataset
          : importSource === "imageDataset"
            ? FileImageDataset
            : FileLocal;

  return (
    <div className="kb-page">
      <Flex
        flexDirection="column"
        bg="white"
        h="100%"
        minH={0}
        flex="1"
        m="12px"
        px={[2, 9]}
        py={[2, 5]}
        borderRadius="md"
      >
        <DatasetImportContextProvider
          kbId={kbId}
          parentId={parentId}
          importSource={importSource}
          onExit={() => nav(`/kb/${kbId}${parentId ? `?parent=${parentId}` : ""}`)}
        >
          <Box flex="1 0 0" overflow="auto">
            <Body />
          </Box>
        </DatasetImportContextProvider>
      </Flex>
    </div>
  );
}
