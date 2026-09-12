import { Box, Button } from "@chakra-ui/react";
import { useDatasetImport } from "./Context";
import { DataProcess } from "./DataProcess";
import { PreviewData } from "./PreviewData";
import { UploadStep } from "./Upload";
import { useStore } from "../mock/store";

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
  const { kbId } = useDatasetImport();
  const { knowledgeBases } = useStore();
  const kb = knowledgeBases.find((k) => k.id === kbId);
  const kind =
    kb?.kind === "feishu" ? "飞书" : kb?.kind === "yuque" ? "语雀" : kb?.kind === "dingtalk" ? "钉钉" : "API 数据集";

  return (
    <Box maxW="640px">
      <Box color="myGray.600" fontSize="sm" mb={3}>
        {kind}目录还没有对接真实拉取。现在导入会得到空集合，所以这一步先关掉。本地文件和网页链接可以正常入库。
      </Box>
      <Button isDisabled>下一步</Button>
    </Box>
  );
}
