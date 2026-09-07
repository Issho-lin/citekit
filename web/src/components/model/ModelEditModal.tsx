import {
  Box,
  Button,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Switch,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { api, SECRET_MASK, isPlainSecret } from "../../api";
import { MODEL_TYPE_META, guessFromModelId, guessChatVision, guessMultimodalEmbedding, guessRerankVision } from "../../mock/models";
import { useStore } from "../../mock/store";
import { useToast } from "../Toast";
import { MySelect } from "../MySelect";
import { QuestionTip } from "../QuestionTip";
import type { AiModel, ModelType } from "../../types";
import { ProviderAvatar, pickerProviders, providerBaseUrl, providerOf } from "./shared";

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

export function ModelEditModal({
  model,
  onClose,
  onSave,
}: {
  model: AiModel;
  onClose: () => void;
  onSave: (next: AiModel) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<AiModel>(model);
  const { providers } = useStore();
  const isNew = !model.model;
  const [apiKey, setApiKey] = useState(model.hasRequestAuth ? SECRET_MASK : "");
  const [keyUnlocked, setKeyUnlocked] = useState(false);
  const [remoteIds, setRemoteIds] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const providerHasKey = Boolean(providerOf(providers, form.provider).hasApiKey);
  const savedKey = Boolean(model.hasRequestAuth) || providerHasKey;
  const shownKey = apiKey || (!keyUnlocked && savedKey ? SECRET_MASK : apiKey);
  const modelOptions = useMemo(() => {
    const ids = remoteIds.map((id) => ({ label: id, value: id }));
    if (form.model && !remoteIds.includes(form.model)) {
      return [{ label: form.model, value: form.model }, ...ids];
    }
    return ids;
  }, [form.model, remoteIds]);

  const currentProvider = providerOf(providers, form.provider);
  const urlTip =
    form.provider === "Other"
      ? "填中转站的 Base URL，一般是 OpenAI 兼容接口，注意是否要加 /v1。"
      : form.type === "rerank"
        ? currentProvider.rerankUrlTip || "填 Base URL，不要带 /rerank。"
        : form.type === "embedding"
          ? currentProvider.embeddingUrlTip || "填 Base URL，不要带 /embeddings。注意是否要加 /v1。"
          : "填 Base URL，不要带 /chat/completions。注意是否要加 /v1。";

  function patch(p: Partial<AiModel>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  async function loadRemote() {
    const baseUrl = (form.requestUrl ?? "").trim();
    const apiKeyValue = isPlainSecret(apiKey) ? apiKey.trim() : "";
    const providerHasKey = Boolean(providerOf(providers, form.provider).hasApiKey);
    if (!baseUrl) {
      toast("请先填写接口地址");
      return;
    }
    if (!apiKeyValue && !providerHasKey && (isNew || !model.hasRequestAuth)) {
      toast("请先填写 API 密钥，或在供应商配置里保存密钥");
      return;
    }
    setLoadingList(true);
    try {
      const { ids } = await api.discoverModels({
        baseUrl,
        apiKey: apiKeyValue || undefined,
        modelId: isNew ? undefined : model.model,
        providerId: form.provider,
      });
      setRemoteIds(ids);
      if (ids.length === 0) toast("上游没有返回模型列表，可以手动输入模型 ID");
    } catch (err) {
      toast(err instanceof Error ? err.message : "获取模型列表失败");
    } finally {
      setLoadingList(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} size="3xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxW="560px">
        <ModalHeader px={6} pt={4} pb={2}>
          {isNew ? "新增模型" : "编辑模型"}
        </ModalHeader>
        <ModalBody px={6} pt={0} pb={4} as="form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          <Box
            aria-hidden
            position="absolute"
            w="1px"
            h="1px"
            overflow="hidden"
            opacity={0}
            pointerEvents="none"
          >
            <input type="text" name="citekit-username" autoComplete="username" tabIndex={-1} readOnly />
            <input type="password" name="citekit-password-trap" autoComplete="new-password" tabIndex={-1} readOnly />
          </Box>
          <Flex direction="column" gap={4} py={2}>
            <Field label="模型提供商" tip="用来预填接口地址和图标。「其他」用于第三方中转站，接口地址和密钥都要自己填。">
              <MySelect
                h={fieldH}
                value={form.provider}
                onChange={(provider) => {
                  const prevDefault = providerBaseUrl(providers, form.provider);
                  const nextDefault = providerBaseUrl(providers, provider);
                  const url =
                    !form.requestUrl || form.requestUrl === prevDefault ? nextDefault : form.requestUrl;
                  patch({ provider, requestUrl: url });
                }}
                list={pickerProviders(providers, form.provider).map((p) => ({
                  label: p.name,
                  value: p.id,
                  icon: <ProviderAvatar provider={p.id} size={16} />,
                }))}
              />
            </Field>
            <Field
              label="API 密钥"
              tip={
                form.provider === "Other"
                  ? "自定义供应商没有统一密钥，请在这里填写中转站的 API Key。"
                  : providerOf(providers, form.provider).hasApiKey
                    ? "该供应商已配置密钥，这里可留空。填写后只对这个模型生效。"
                    : "也可到「供应商」页统一配置，之后新建模型不必再填。"
              }
            >
              <Input
                h={fieldH}
                minH={fieldH}
                fontSize="sm"
                type={shownKey === SECRET_MASK ? "text" : "password"}
                name="citekit-model-api-key"
                autoComplete="new-password"
                data-1p-ignore=""
                data-lpignore="true"
                readOnly={!keyUnlocked}
                onFocus={() => {
                  setKeyUnlocked(true);
                  if (!isPlainSecret(apiKey)) setApiKey("");
                }}
                onBlur={() => {
                  if (!apiKey.trim()) setKeyUnlocked(false);
                }}
                value={shownKey}
                placeholder="sk-..."
                onChange={(e) => setApiKey(e.target.value)}
              />
            </Field>
            <Field label="接口地址" tip={urlTip}>
              <Input
                h={fieldH}
                minH={fieldH}
                fontSize="sm"
                value={form.requestUrl ?? ""}
                placeholder={providerBaseUrl(providers, form.provider) || "https://..."}
                onChange={(e) => patch({ requestUrl: e.target.value })}
              />
            </Field>
            <Field
              label="模型 ID"
              tip="点开下拉选择。可先点「获取列表」从上游拉取；列表没有的可以在下拉里搜索后选「使用」。"
            >
              <Flex gap={2} align="center">
                <Box flex={1} minW={0}>
                  <MySelect
                    h={fieldH}
                    value={form.model}
                    onChange={(id) => patch({ model: id, ...guessFromModelId(id, form.type) })}
                    placeholder={remoteIds.length ? "选择模型 ID" : "请先获取模型列表"}
                    searchable
                    allowCustom
                    list={modelOptions}
                  />
                </Box>
                <Button
                  size="sm"
                  variant="whiteBase"
                  h={fieldH}
                  minW="88px"
                  isLoading={loadingList}
                  onClick={() => void loadRemote()}
                >
                  获取列表
                </Button>
              </Flex>
            </Field>
            <Field
              label="模型映射"
              tip="本系统模型 ID 和上游不一致时填写。留空则请求时使用上面的模型 ID。"
            >
              <Input
                h={fieldH}
                minH={fieldH}
                fontSize="sm"
                value={form.mappedModel ?? ""}
                placeholder="上游真实模型 ID，可留空"
                onChange={(e) => patch({ mappedModel: e.target.value })}
              />
            </Field>
            <Field
              label="类型"
              tip="决定它出现在语言模型、索引还是重排下拉里。图片理解不是单独类型，勾选语言模型的视觉能力即可。"
            >
              <MySelect
                h={fieldH}
                value={form.type}
                onChange={(type) => {
                  const next = type as ModelType;
                  if (next === "llm") {
                    patch({
                      type: next,
                      vision: guessChatVision(form.model),
                      multimodal: false,
                    });
                    return;
                  }
                  if (next === "embedding") {
                    patch({
                      type: next,
                      vision: false,
                      multimodal: guessMultimodalEmbedding(form.model),
                    });
                    return;
                  }
                  if (next === "rerank") {
                    patch({
                      type: next,
                      vision: guessRerankVision(form.model),
                      multimodal: false,
                    });
                    return;
                  }
                  patch({ type: next, vision: false, multimodal: false });
                }}
                list={MODEL_TYPE_META.map((t) => ({ label: t.label, value: t.id }))}
              />
            </Field>
            {form.type === "llm" ? (
              <Field
                label="视觉能力"
                tip="能看图。勾选后会出现在知识库「图片理解」下拉里，用来给文档插图写描述。"
              >
                <Switch
                  isChecked={Boolean(form.vision)}
                  onChange={(e) => patch({ vision: e.target.checked })}
                />
              </Field>
            ) : null}
            {form.type === "embedding" ? (
              <Field
                label="多模态向量"
                tip="能把图片或视频编进向量。连通测试仍用文本 ping，具体路径按供应商协议走。"
              >
                <Switch
                  isChecked={Boolean(form.multimodal)}
                  onChange={(e) => patch({ multimodal: e.target.checked })}
                />
              </Field>
            ) : null}
            {form.type === "rerank" ? (
              <Field
                label="多模态排序"
                tip="能对图片或视频一起排序，例如 qwen3-vl-rerank。连通测试仍用文本 ping。"
              >
                <Switch
                  isChecked={Boolean(form.vision)}
                  onChange={(e) => patch({ vision: e.target.checked })}
                />
              </Field>
            ) : null}
          </Flex>
        </ModalBody>
        <ModalFooter px={6} pt={2} pb={4}>
          <Button variant="whiteBase" onClick={onClose}>
            取消
          </Button>
          <Button
            ml={3}
            onClick={() => {
              const id = form.model.trim();
              onSave({
                ...form,
                model: id,
                name: id,
                vision: form.type === "llm" || form.type === "rerank" ? Boolean(form.vision) : false,
                multimodal: form.type === "embedding" ? Boolean(form.multimodal) : false,
                requestAuth: isPlainSecret(apiKey) ? apiKey.trim() : undefined,
                mappedModel: (form.mappedModel ?? "").trim() || undefined,
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
