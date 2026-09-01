import {
  Box,
  Flex,
  IconButton,
  Progress,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import type { ImportSourceItemType } from "./types";

export function RenderUploadFiles({
  files,
  setFiles,
  onCancelUpload,
}: {
  files: ImportSourceItemType[];
  setFiles: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
  onCancelUpload?: (fileId: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <TableContainer mt={5}>
      <Table variant="simple" fontSize="sm">
        <Thead>
          <Tr bg="myGray.100">
            <Th borderLeftRadius="md" borderBottom="none" py={4}>
              文件名
            </Th>
            <Th borderBottom="none" py={4}>
              文件上传进度
            </Th>
            <Th borderBottom="none" py={4}>
              文件大小
            </Th>
            <Th borderRightRadius="md" borderBottom="none" py={4}>
              操作
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {files.map((item) => (
            <Tr key={item.id}>
              <Td>
                <Flex alignItems="center">{item.sourceName}</Flex>
              </Td>
              <Td>
                {item.errorMsg ? (
                  <Box color="red.500" fontSize="sm">
                    错误
                  </Box>
                ) : (
                  <Flex alignItems="center" fontSize="xs">
                    <Progress
                      value={item.uploadedFileRate}
                      h="6px"
                      w="100%"
                      maxW="210px"
                      size="sm"
                      borderRadius="20px"
                      colorScheme={(item.uploadedFileRate || 0) >= 100 ? "green" : "blue"}
                      bg="myGray.200"
                      hasStripe
                      isAnimated
                      mr={2}
                    />
                    {`${item.uploadedFileRate}%`}
                  </Flex>
                )}
              </Td>
              <Td>{item.sourceSize}</Td>
              <Td>
                <IconButton
                  variant="grayDanger"
                  size="sm"
                  icon={<span>×</span>}
                  aria-label={item.isUploading ? "取消" : "删除"}
                  onClick={() => {
                    if (item.isUploading) onCancelUpload?.(item.id);
                    else setFiles((state) => state.filter((file) => file.id !== item.id));
                  }}
                />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}
