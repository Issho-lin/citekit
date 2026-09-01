import { Box, Button, Checkbox, Flex } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { useDatasetImport } from "./Context";
import { DataProcess } from "./DataProcess";
import { PreviewData } from "./PreviewData";
import { UploadStep } from "./Upload";
import { useStore } from "../mock/store";

const MOCK: Record<string, { id: string; name: string }[]> = {
  api: [
    { id: "api_1", name: "产品手册.pdf" },
    { id: "api_2", name: "接口说明.md" },
    { id: "api_3", name: "发布纪要.docx" },
  ],
  feishu: [
    { id: "fs_1", name: "客服话术" },
    { id: "fs_2", name: "售后政策" },
    { id: "fs_3", name: "仓配规范" },
  ],
  yuque: [
    { id: "yq_1", name: "研发手册" },
    { id: "yq_2", name: "FAQ 合集" },
  ],
  dingtalk: [
    { id: "dt_1", name: "钉钉知识库首页" },
    { id: "dt_2", name: "制度文档" },
  ],
};

export function FileApiDataset() {
  const { activeStep } = useDatasetImport();
  return (
    <>
      {activeStep === 0 && <SelectApiFiles />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <UploadStep />}
    </>
  );
}

function SelectApiFiles() {
  const { kbId, goToNext, setSources } = useDatasetImport();
  const { knowledgeBases } = useStore();
  const kb = knowledgeBases.find((k) => k.id === kbId);
  const files = MOCK[kb?.kind || "api"] ?? MOCK.api;
  const [picked, setPicked] = useState<string[]>([]);
  const allOn = picked.length === files.length && files.length > 0;

  const selected = useMemo(() => files.filter((f) => picked.includes(f.id)), [files, picked]);

  return (
    <Box>
      <Box color="myGray.600" fontSize="sm" mb={3}>
        从已配置的第三方目录中选择要导入的文件（原型示例数据）。
      </Box>
      <Flex
        alignItems="center"
        py={3}
        px={4}
        bg="myGray.50"
        borderRadius="8px"
        fontSize="sm"
        fontWeight={500}
        mb={2}
      >
        <Checkbox
          isChecked={allOn}
          onChange={(e) => setPicked(e.target.checked ? files.map((f) => f.id) : [])}
          mr={3}
        />
        文件名
      </Flex>
      {files.map((file) => (
        <Flex
          key={file.id}
          alignItems="center"
          py={3}
          px={4}
          borderBottom="1px solid"
          borderColor="myGray.100"
          cursor="pointer"
          onClick={() =>
            setPicked((prev) => (prev.includes(file.id) ? prev.filter((id) => id !== file.id) : [...prev, file.id]))
          }
        >
          <Checkbox isChecked={picked.includes(file.id)} mr={3} pointerEvents="none" />
          <Box fontSize="sm">{file.name}</Box>
        </Flex>
      ))}
      <Flex justify="flex-end" mt={6}>
        <Button
          isDisabled={selected.length === 0}
          onClick={() => {
            setSources(
              selected.map((item) => ({
                id: item.id,
                createStatus: "waiting",
                sourceName: item.name,
                dbFileId: item.id,
              })),
            );
            goToNext();
          }}
        >
          下一步
        </Button>
      </Flex>
    </Box>
  );
}
