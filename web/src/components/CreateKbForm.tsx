import { FormEvent, useState } from "react";
import { Box, Button, Flex, HStack, Input, Tooltip } from "@chakra-ui/react";
import { ColorIcon, kbIcon } from "./ColorIcon";
import { MySelect } from "./MySelect";
import { QuestionTip } from "./QuestionTip";
import { ApiDatasetForm } from "./ApiDatasetForm";
import { IconBook } from "./icons";
import { KB_KINDS } from "../constants";
import { modelSelectList } from "../mock/models";
import { useStore } from "../mock/store";
import { useToast } from "./Toast";
import type { ApiDatasetServer, KnowledgeBase } from "../types";

const THIRD: KnowledgeBase["kind"][] = ["api", "feishu", "yuque", "dingtalk"];

export function CreateKbForm({
  kind,
  parentId,
  onCreated,
  onCancel,
}: {
  kind: KnowledgeBase["kind"];
  parentId?: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const { addKnowledgeBase, vectorModel, llmModel, vlmModel, aiModels } = useStore();
  const meta = KB_KINDS.find((k) => k.id === kind);
  const [name, setName] = useState("");
  const [vector, setVector] = useState(vectorModel);
  const [agent, setAgent] = useState(llmModel);
  const [vlm, setVlm] = useState(vlmModel);
  const [apiServer, setApiServer] = useState<ApiDatasetServer>({});

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast("请填写名称");
      return;
    }
    if (kind === "api" && !apiServer.apiServer?.baseUrl?.trim()) {
      toast("请填写接口地址");
      return;
    }
    if (kind === "feishu" && (!apiServer.feishuServer?.appId || !apiServer.feishuServer.appSecret || !apiServer.feishuServer.folderToken)) {
      toast("请填写飞书 App ID / App Secret / Folder Token");
      return;
    }
    if (kind === "yuque" && (!apiServer.yuqueServer?.userId || !apiServer.yuqueServer.token)) {
      toast("请填写语雀 User ID / Token");
      return;
    }
    if (kind === "dingtalk" && (!apiServer.dingtalkServer?.appKey || !apiServer.dingtalkServer.appSecret || !apiServer.dingtalkServer.userId)) {
      toast("请填写钉钉 App Key / App Secret / User ID");
      return;
    }
    const id = addKnowledgeBase({
      name: name.trim(),
      domain: meta?.title ?? "未分类",
      description: "",
      kind,
      parentId,
      vectorModel: vector,
      llmModel: agent,
      vlmModel: vlm,
      apiDatasetServer: THIRD.includes(kind) ? apiServer : undefined,
    });
    toast("创建成功");
    onCreated(id);
  }

  return (
    <form onSubmit={onSubmit}>
      <Flex flexDirection="column" gap={4}>
        <Box w="100%">
          <Flex justify="space-between" alignItems="center">
            <Box color="myGray.900" fontWeight={500} fontSize="sm">
              名称
            </Box>
            {meta?.courseUrl && (
              <Flex
                as="span"
                alignItems="center"
                color="primary.600"
                fontSize="sm"
                cursor="pointer"
                onClick={() => window.open(meta.courseUrl, "_blank")}
              >
                <Box mr={0.5} display="flex">
                  <IconBook size={16} />
                </Box>
                使用说明
              </Flex>
            )}
          </Flex>
          <Flex mt="12px" alignItems="center">
            <Tooltip label="点击选择头像">
              <Box flexShrink={0} cursor="default">
                <ColorIcon name={kbIcon(kind)} size={32} />
              </Box>
            </Tooltip>
            <Input
              ml={4}
              flex={1}
              autoFocus
              bg="myGray.50"
              fontSize="14px"
              placeholder="给知识库取一个名字"
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Flex>
        </Box>

        <Flex w="100%" alignItems="center" justify="space-between">
          <HStack spacing={1} flex="0 0 110px" fontSize="sm" color="myGray.900" fontWeight={500}>
            <Box>索引模型</Box>
            <QuestionTip label="索引模型可以将知识库内容转成向量，用于进行语义检索。注意，不同索引模型的知识库无法同时查询，切换索引模型需重建全量向量索引，请慎重选择。" />
          </HStack>
          <Box w="300px">
            <MySelect
              value={vector}
              onChange={setVector}
              list={modelSelectList(aiModels, "embedding", vector)}
            />
          </Box>
        </Flex>

        <Flex w="100%" alignItems="center" justify="space-between">
          <HStack spacing={1} flex="0 0 110px" fontSize="sm" color="myGray.900" fontWeight={500}>
            <Box>文本理解模型</Box>
            <QuestionTip label="用于增强索引和 QA 生成" />
          </HStack>
          <Box w="300px">
            <MySelect
              value={agent}
              onChange={setAgent}
              list={modelSelectList(aiModels, "llm", agent)}
            />
          </Box>
        </Flex>

        <Flex w="100%" alignItems="center" justify="space-between">
          <HStack spacing={1} flex="0 0 110px" fontSize="sm" color="myGray.900" fontWeight={500}>
            <Box>图片理解模型</Box>
            <QuestionTip label="自动标注文档里的图片并生成文本描述，辅助文本检索" />
          </HStack>
          <Box w="300px">
            <MySelect
              value={vlm}
              onChange={setVlm}
              list={modelSelectList(aiModels, "vlm", vlm)}
            />
          </Box>
        </Flex>
      </Flex>

      {THIRD.includes(kind) && (
        <ApiDatasetForm kind={kind} value={apiServer} onChange={setApiServer} />
      )}

      <Flex justifyContent="flex-end" mt={6} gap={3}>
        <Button type="button" variant="whiteBase" fontSize="12px" onClick={onCancel}>
          关闭
        </Button>
        <Button type="submit" fontSize="12px">
          创建
        </Button>
      </Flex>
    </form>
  );
}
