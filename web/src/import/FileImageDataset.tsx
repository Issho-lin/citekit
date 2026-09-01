import { Box, Button, Flex, Input } from "@chakra-ui/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../mock/store";
import { useDatasetImport } from "./Context";
import { FileSelector, type SelectFileItemType } from "./FileSelector";
import type { ImportSourceItemType } from "./types";

const FILE_TYPE = ".jpg, .jpeg, .png";

export function FileImageDataset() {
  const nav = useNavigate();
  const { addSource } = useStore();
  const { kbId, parentId } = useDatasetImport();
  const [name, setName] = useState("");
  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>([]);
  const [creating, setCreating] = useState(false);

  function onSelectFiles(files: SelectFileItemType[]) {
    setSelectFiles((prev) => [
      ...prev,
      ...files.map((item) => ({
        id: item.fileId,
        createStatus: "waiting" as const,
        file: item.file,
        sourceName: item.file.name,
        icon: URL.createObjectURL(item.file),
      })),
    ]);
  }

  async function onCreate() {
    if (!name.trim() || selectFiles.length === 0) return;
    setCreating(true);
    await new Promise((r) => setTimeout(r, 400));
    addSource(kbId, "image", name.trim(), `images/${name.trim()}`, undefined, parentId);
    nav(`/kb/${kbId}${parentId ? `?parent=${parentId}` : ""}`);
  }

  return (
    <Flex flexDirection="column" maxW="850px" mx="auto" mt={7}>
      <Flex alignItems="center" width="100%">
        <Box width="140px" fontWeight={500} fontSize="sm">
          数据集名称
        </Box>
        <Input
          flex="0 0 400px"
          bg="myGray.50"
          placeholder="数据集名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Flex>

      <Flex mt={7} alignItems="flex-start" width="100%">
        <Box width="140px" fontWeight={500} fontSize="sm">
          数据集内容
        </Box>
        <Box flex="1 0 0">
          <FileSelector fileType={FILE_TYPE} selectFiles={selectFiles} onSelectFiles={onSelectFiles} />
          {selectFiles.length > 0 && (
            <Flex flexWrap="wrap" gap={4} mt={3} width="100%">
              {selectFiles.map((file, index) => (
                <Box
                  key={file.id}
                  w="100px"
                  h="100px"
                  position="relative"
                  bg="myGray.50"
                  borderRadius="md"
                  border="1px dashed"
                  borderColor="myGray.200"
                  p={1}
                >
                  <Box as="img" src={file.icon} w="100%" h="100%" objectFit="contain" alt={file.sourceName} />
                  <Box
                    as="button"
                    type="button"
                    position="absolute"
                    right="-8px"
                    top="-2px"
                    w="16px"
                    h="16px"
                    borderRadius="full"
                    bg="white"
                    fontSize="12px"
                    lineHeight="16px"
                    onClick={() => setSelectFiles((prev) => prev.filter((_, i) => i !== index))}
                  >
                    ×
                  </Box>
                </Box>
              ))}
            </Flex>
          )}
        </Box>
      </Flex>

      <Flex width="100%" justifyContent="flex-end" mt={9}>
        <Button isDisabled={!name.trim() || selectFiles.length === 0 || creating} onClick={onCreate}>
          {selectFiles.length > 0 ? `共 ${selectFiles.length} 张图片 | 确认创建` : "确认创建"}
        </Button>
      </Flex>
    </Flex>
  );
}
