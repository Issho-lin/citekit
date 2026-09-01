import { Box, Button, Flex, Input, Textarea } from "@chakra-ui/react";
import { useState } from "react";
import { useDatasetImport } from "./Context";
import { DataProcess } from "./DataProcess";
import { getNanoid } from "./fileTools";
import { PreviewData } from "./PreviewData";
import { UploadStep } from "./Upload";

export function FileLink() {
  const { activeStep } = useDatasetImport();
  return (
    <>
      {activeStep === 0 && <CustomLinkImport />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <UploadStep />}
    </>
  );
}

function CustomLinkImport() {
  const { goToNext, setSources, process, setProcess } = useDatasetImport();
  const [link, setLink] = useState("");
  const linkList = link.split("\n").filter((item) => item);

  return (
    <Box maxW={["100%", "800px"]}>
      <Box display={["block", "flex"]} alignItems="flex-start" mt={1}>
        <Box flex="0 0 100px" fontSize="sm">
          网络链接
        </Box>
        <Textarea
          flex="1 0 0"
          w="100%"
          rows={10}
          placeholder={"仅支持静态链接，如果上传后数据为空，可能该链接无法被读取\n每行一个，每次最多 10 个链接"}
          bg="myGray.50"
          overflowX="auto"
          whiteSpace="nowrap"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </Box>
      <Box display={["block", "flex"]} alignItems="center" mt={4}>
        <Box flex="0 0 100px" fontSize="sm">
          选择器
        </Box>
        <Input
          flex="1 0 0"
          maxW={["100%", "350px"]}
          placeholder="body .content #document"
          bg="myGray.50"
          value={process.webSelector}
          onChange={(e) => setProcess({ ...process, webSelector: e.target.value })}
        />
      </Box>
      <Flex my={4} flexWrap="wrap" gap={4} alignItems="center" pl={[0, "100px"]}>
        {linkList.map((item, i) => (
          <Flex key={`${item}-${i}`} alignItems="center" px={4} py={2} borderRadius="md" bg="myGray.100">
            <Box ml={1} mr={3} wordBreak="break-all">
              {item}
            </Box>
            <Box
              as="button"
              color="myGray.500"
              cursor="pointer"
              onClick={() => {
                setLink(linkList.filter((_, index) => index !== i).join("\n"));
              }}
            >
              ×
            </Box>
          </Flex>
        ))}
      </Flex>
      <Flex mt={5} justifyContent="flex-end">
        <Button
          isDisabled={linkList.length === 0}
          onClick={() => {
            setSources(
              linkList.slice(0, 10).map((url) => ({
                id: getNanoid(),
                createStatus: "waiting",
                link: url,
                sourceName: url,
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
