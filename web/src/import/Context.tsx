import { createContext, useContext, type ReactNode, useMemo, useState } from "react";
import { Box, Button, Flex, IconButton } from "@chakra-ui/react";
import { fillProcess } from "../constants";
import type { ProcessConfig } from "../types";
import type { DatasetImportContextType, ImportSourceItemType, ImportSourceKind } from "./types";
import { useMyStep } from "./useMyStep";

const DatasetImportContext = createContext<DatasetImportContextType | null>(null);

export function useDatasetImport() {
  const ctx = useContext(DatasetImportContext);
  if (!ctx) throw new Error("DatasetImportContext missing");
  return ctx;
}

export function useDatasetImportOptional() {
  return useContext(DatasetImportContext);
}

const STEP_MAP: Record<ImportSourceKind, { title: string }[]> = {
  fileLocal: [
    { title: "选择文件" },
    { title: "参数设置" },
    { title: "数据预览" },
    { title: "确认上传" },
  ],
  fileLink: [
    { title: "输入链接" },
    { title: "参数设置" },
    { title: "数据预览" },
    { title: "确认上传" },
  ],
  fileCustom: [
    { title: "选择文件" },
    { title: "参数设置" },
    { title: "数据预览" },
    { title: "确认上传" },
  ],
  apiDataset: [
    { title: "选择文件" },
    { title: "参数设置" },
    { title: "数据预览" },
    { title: "确认上传" },
  ],
  imageDataset: [
    { title: "选择文件" },
    { title: "参数设置" },
    { title: "数据预览" },
    { title: "确认上传" },
  ],
};

export function DatasetImportContextProvider({
  kbId,
  parentId,
  importSource,
  onExit,
  children,
}: {
  kbId: string;
  parentId?: string;
  importSource: ImportSourceKind;
  onExit: () => void;
  children: ReactNode;
}) {
  const steps = STEP_MAP[importSource];
  const { activeStep, goToNext, goToPrevious, MyStep } = useMyStep({ defaultStep: 0, steps });
  const [process, setProcess] = useState<ProcessConfig>(() =>
    fillProcess(importSource === "imageDataset" ? { imageIndex: true } : {}),
  );
  const [sources, setSources] = useState<ImportSourceItemType[]>([]);

  const value = useMemo(
    () => ({
      importSource,
      parentId,
      kbId,
      activeStep,
      goToNext,
      goToPrevious,
      process,
      setProcess,
      sources,
      setSources,
    }),
    [importSource, parentId, kbId, activeStep, goToNext, goToPrevious, process, sources],
  );

  return (
    <DatasetImportContext.Provider value={value}>
      <Flex>
        {activeStep === 0 ? (
          <Flex alignItems="center">
            <IconButton
              icon={<span>←</span>}
              aria-label="退出"
              size="smSquare"
              borderRadius="50%"
              variant="whiteBase"
              mr={2}
              onClick={onExit}
            />
            退出
          </Flex>
        ) : (
          <Button variant="whiteBase" leftIcon={<span>←</span>} onClick={goToPrevious}>
            上一步
          </Button>
        )}
        <Box flex={1} />
      </Flex>
      <Box
        mt={4}
        mb={5}
        px={3}
        py={[2, 4]}
        bg="myGray.50"
        borderWidth="1px"
        borderColor="myGray.200"
        borderRadius="md"
      >
        <Box maxW={["100%", "900px"]} mx="auto">
          <MyStep />
        </Box>
      </Box>
      {children}
    </DatasetImportContext.Provider>
  );
}
