import { Box, Button, Flex, Input, Textarea } from "@chakra-ui/react";
import { useState } from "react";
import { useDatasetImport } from "./Context";
import { DataProcess } from "./DataProcess";
import { getNanoid } from "./fileTools";
import { PreviewData } from "./PreviewData";
import { UploadStep } from "./Upload";

export function FileCustomText() {
  const { activeStep } = useDatasetImport();
  return (
    <>
      {activeStep === 0 && <CustomTextInput />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <UploadStep />}
    </>
  );
}

function CustomTextInput() {
  const { goToNext, setSources } = useDatasetImport();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");

  return (
    <Box maxW={["100%", "800px"]}>
      <Box display={["block", "flex"]} alignItems="center">
        <Box flex="0 0 120px" fontSize="sm">
          集合名称
        </Box>
        <Input
          flex="1 0 0"
          maxW={["100%", "350px"]}
          placeholder="集合名称"
          bg="myGray.50"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Box>
      <Box display={["block", "flex"]} alignItems="flex-start" mt={5}>
        <Box flex="0 0 120px" fontSize="sm">
          集合原文
        </Box>
        <Textarea
          flex="1 0 0"
          w="100%"
          rows={15}
          placeholder="集合原文"
          bg="myGray.50"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Box>
      <Flex mt={5} justifyContent="flex-end">
        <Button
          isDisabled={!name.trim() || !value.trim()}
          onClick={() => {
            setSources([
              {
                id: getNanoid(),
                createStatus: "waiting",
                rawText: value,
                sourceName: name.trim(),
              },
            ]);
            goToNext();
          }}
        >
          下一步
        </Button>
      </Flex>
    </Box>
  );
}
