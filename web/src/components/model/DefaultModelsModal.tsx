import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import { useState } from "react";
import { MySelect } from "../MySelect";
import { QuestionTip } from "../QuestionTip";
import { modelSelectOptions } from "./shared";
import { useStore } from "../../mock/store";

export function DefaultModelsModal({ onClose }: { onClose: () => void }) {
  const {
    aiModels,
    vectorModel,
    llmModel,
    vlmModel,
    rerankModel,
    setVectorModel,
    setLlmModel,
    setVlmModel,
    setRerankModel,
  } = useStore();
  const [draft, setDraft] = useState({
    vectorModel,
    llmModel,
    vlmModel,
    rerankModel,
  });

  const fields: {
    key: "llmModel" | "vectorModel" | "vlmModel" | "rerankModel";
    label: string;
    tip: string;
    type: "llm" | "embedding" | "vlm" | "rerank";
    none?: string;
  }[] = [
    {
      key: "llmModel" as const,
      label: "语言模型",
      tip: "工作空间默认的文本理解模型，新建知识库会带上。",
      type: "llm" as const,
    },
    {
      key: "vectorModel" as const,
      label: "索引模型",
      tip: "默认向量化模型。已建库不会跟着改，切换后需重建索引。",
      type: "embedding" as const,
    },
    {
      key: "vlmModel" as const,
      label: "图片理解模型",
      tip: "解析文档插图。列表是已启用且打开了视觉能力的语言模型。",
      type: "vlm" as const,
    },
    {
      key: "rerankModel" as const,
      label: "重排模型",
      tip: "可选。没有就不做精排，语义检索仍可用。通义、豆包、DeepSeek、混元、Kimi、MiniMax 的 OpenAI 兼容接口通常不提供重排。",
      type: "rerank" as const,
      none: "不使用",
    },
  ];

  return (
    <Modal isOpen onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>默认模型</ModalHeader>
        <ModalBody>
          <Flex direction="column" gap={4}>
            {fields.map((f) => (
              <Box key={f.key}>
                <Flex align="center" gap={1} mb={2} fontSize="sm" color="myGray.900" fontWeight={500}>
                  {f.label}
                  <QuestionTip label={f.tip} />
                </Flex>
                <MySelect
                  value={draft[f.key]}
                  onChange={(v) => setDraft((s) => ({ ...s, [f.key]: v }))}
                  list={modelSelectOptions(aiModels, f.type, draft[f.key], f.none)}
                  placeholder={f.none ?? "请先启用该类模型"}
                />
              </Box>
            ))}
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" onClick={onClose}>
            取消
          </Button>
          <Button
            ml={3}
            onClick={() => {
              setLlmModel(draft.llmModel);
              setVectorModel(draft.vectorModel);
              setVlmModel(draft.vlmModel);
              setRerankModel(draft.rerankModel);
              onClose();
            }}
          >
            确认
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
