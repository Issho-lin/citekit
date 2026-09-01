import {
  Box,
  Button,
  Flex,
  Grid,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  Switch,
} from "@chakra-ui/react";
import { useState } from "react";
import { MySelect } from "../MySelect";
import { QuestionTip } from "../QuestionTip";
import { PROVIDERS } from "../../mock/models";
import type { AiModel, ModelType } from "../../types";

const fieldH = "32px";

function Field({
  label,
  tip,
  children,
}: {
  label: string;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Flex align="center" gap={1} mb={2}>
        <Box fontSize="12px" fontWeight={500} color="myGray.900">
          {label}
        </Box>
        {tip ? <QuestionTip label={tip} /> : null}
      </Flex>
      {children}
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Grid templateColumns={["1fr", "140px minmax(0, 1fr)"]} columnGap="32px" rowGap={4} py={5} borderBottom="1px solid" borderColor="myGray.200">
      <Box fontSize="14px" fontWeight={600} color="myGray.900">
        {title}
      </Box>
      <Box>{children}</Box>
    </Grid>
  );
}

export function ModelEditModal({
  model,
  onClose,
  onSave,
}: {
  model: AiModel;
  onClose: () => void;
  onSave: (next: AiModel) => void;
}) {
  const [form, setForm] = useState<AiModel>(model);
  const isCustom = model.isCustom;
  const type: ModelType = form.type;

  function patch(p: Partial<AiModel>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  return (
    <Modal isOpen onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxW="800px">
        <ModalHeader>{isCustom && !model.model ? "新增模型" : "编辑模型"}</ModalHeader>
        <ModalBody>
          <Section title="基础配置">
            <Grid templateColumns={["1fr", "1fr 1fr"]} gap={4}>
              <Field label="模型 ID" tip="请求 Body 里 model 字段的值，全局唯一。">
                <Input
                  h={fieldH}
                  minH={fieldH}
                  fontSize="sm"
                  value={form.model}
                  isReadOnly={Boolean(model.model)}
                  onChange={(e) => patch({ model: e.target.value })}
                />
              </Field>
              <Field label="模型名" tip="页面上展示的名称，可自定义。">
                <Input
                  h={fieldH}
                  minH={fieldH}
                  fontSize="sm"
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </Field>
              <Field label="模型提供商">
                <MySelect
                  h={fieldH}
                  value={form.provider}
                  onChange={(provider) => patch({ provider })}
                  list={PROVIDERS.map((p) => ({ label: p.name, value: p.id }))}
                />
              </Field>
            </Grid>
          </Section>

          {(type === "llm" || type === "vlm") && (
            <Section title="参数配置">
              <Grid templateColumns={["1fr", "1fr 1fr"]} gap={4}>
                <Field label="最大上下文">
                  <NumberInput
                    value={form.maxContext ?? 16000}
                    min={1000}
                    onChange={(_, n) => patch({ maxContext: Number.isFinite(n) ? n : 16000 })}
                  >
                    <NumberInputField h={fieldH} fontSize="sm" />
                  </NumberInput>
                </Field>
                {type === "llm" && (
                  <Field label="最大回复 Token" tip="单次生成的上限。">
                    <NumberInput
                      value={form.maxResponse ?? 4000}
                      min={256}
                      onChange={(_, n) => patch({ maxResponse: Number.isFinite(n) ? n : 4000 })}
                    >
                      <NumberInputField h={fieldH} fontSize="sm" />
                    </NumberInput>
                  </Field>
                )}
              </Grid>
            </Section>
          )}

          {type === "embedding" && (
            <Section title="参数配置">
              <Grid templateColumns={["1fr", "1fr 1fr"]} gap={4}>
                <Field label="默认索引长度" tip="导入时默认切成多长再向量化。">
                  <NumberInput
                    value={form.defaultToken ?? 512}
                    min={128}
                    onChange={(_, n) => patch({ defaultToken: Number.isFinite(n) ? n : 512 })}
                  >
                    <NumberInputField h={fieldH} fontSize="sm" />
                  </NumberInput>
                </Field>
                <Field label="最大 Token">
                  <NumberInput
                    value={form.maxToken ?? 8192}
                    min={256}
                    onChange={(_, n) => patch({ maxToken: Number.isFinite(n) ? n : 8192 })}
                  >
                    <NumberInputField h={fieldH} fontSize="sm" />
                  </NumberInput>
                </Field>
                <Field label="Batch Size">
                  <NumberInput
                    value={form.batchSize ?? 100}
                    min={1}
                    onChange={(_, n) => patch({ batchSize: Number.isFinite(n) ? n : 100 })}
                  >
                    <NumberInputField h={fieldH} fontSize="sm" />
                  </NumberInput>
                </Field>
                <Field label="归一化" tip="向量是否做 L2 归一化。">
                  <Switch
                    isChecked={!!form.normalization}
                    onChange={(e) => patch({ normalization: e.target.checked })}
                  />
                </Field>
              </Grid>
            </Section>
          )}

          {type === "rerank" && (
            <Section title="参数配置">
              <Field label="最大 Token" tip="单次重排请求能吃下的文本长度。">
                <NumberInput
                  maxW="240px"
                  value={form.maxToken ?? 8192}
                  min={1000}
                  onChange={(_, n) => patch({ maxToken: Number.isFinite(n) ? n : 8192 })}
                >
                  <NumberInputField h={fieldH} fontSize="sm" />
                </NumberInput>
              </Field>
            </Section>
          )}

          {(type === "llm" || type === "vlm" || type === "embedding") && (
            <Section title="功能配置">
              <Grid templateColumns={["1fr", "1fr 1fr"]} gap={4}>
                {type === "llm" && (
                  <Field label="工具调用" tip="分类、抽取、Agent 工具调用会用到。">
                    <Switch
                      isChecked={!!form.toolChoice}
                      onChange={(e) => patch({ toolChoice: e.target.checked })}
                    />
                  </Field>
                )}
                <Field
                  label="支持图片识别"
                  tip={type === "embedding" ? "打开后可用于图片向量索引。" : "打开后可在知识库里选为图片理解模型。"}
                >
                  <Switch isChecked={!!form.vision} onChange={(e) => patch({ vision: e.target.checked })} />
                </Field>
              </Grid>
            </Section>
          )}

          <Section title="其他">
            <Grid gap={4}>
              <Field
                label="自定义请求地址"
                tip="填写完整地址则绕过模型渠道，直接请求。语言模型填 /v1/chat/completions，索引填 /v1/embeddings，重排填 /v1/rerank。"
              >
                <Input
                  h={fieldH}
                  minH={fieldH}
                  fontSize="sm"
                  placeholder="一般留空，走模型渠道"
                  value={form.requestUrl ?? ""}
                  onChange={(e) => patch({ requestUrl: e.target.value })}
                />
              </Field>
              <Field label="自定义请求 Key" tip="自定义地址时携带 Authorization: Bearer xxx。">
                <Input
                  h={fieldH}
                  minH={fieldH}
                  fontSize="sm"
                  type="password"
                  value={form.requestAuth ?? ""}
                  onChange={(e) => patch({ requestAuth: e.target.value })}
                />
              </Field>
            </Grid>
          </Section>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" onClick={onClose}>
            取消
          </Button>
          <Button
            ml={3}
            onClick={() => {
              onSave({
                ...form,
                model: form.model.trim(),
                name: form.name.trim() || form.model.trim(),
              });
            }}
          >
            确认
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
