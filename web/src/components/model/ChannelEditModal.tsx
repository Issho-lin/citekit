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
  Textarea,
} from "@chakra-ui/react";
import { useMemo, useRef, useState } from "react";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useDisclosure,
} from "@chakra-ui/react";
import { MySelect } from "../MySelect";
import { QuestionTip } from "../QuestionTip";
import { CHANNEL_PROTOCOLS, providerOf } from "../../mock/models";
import { useStore } from "../../mock/store";
import { useToast } from "../Toast";
import type { ChannelProtocol, ModelChannel } from "../../types";
import { ProviderAvatar } from "./shared";

const emptyChannel: Omit<ModelChannel, "id"> = {
  name: "",
  protocol: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  modelIds: [],
  mapping: {},
  enabled: true,
  priority: 1,
};

export function ChannelEditModal({
  channel,
  onClose,
}: {
  channel: ModelChannel | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const { aiModels, addChannel, updateChannel } = useStore();
  const isEdit = !!channel;
  const [form, setForm] = useState<Omit<ModelChannel, "id">>(
    channel
      ? {
          name: channel.name,
          protocol: channel.protocol,
          baseUrl: channel.baseUrl,
          apiKey: channel.apiKey,
          modelIds: channel.modelIds,
          mapping: channel.mapping,
          enabled: channel.enabled,
          priority: channel.priority,
        }
      : emptyChannel,
  );
  const [mappingText, setMappingText] = useState(() => JSON.stringify(channel?.mapping ?? {}, null, 2));

  const proto = CHANNEL_PROTOCOLS.find((p) => p.id === form.protocol);

  function patch(p: Partial<Omit<ModelChannel, "id">>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function onSubmit() {
    if (!form.name.trim()) {
      toast("请填写渠道名");
      return;
    }
    if (form.modelIds.length === 0) {
      toast("请至少选择一个模型");
      return;
    }
    let mapping: Record<string, string> = {};
    try {
      const parsed = mappingText.trim() ? JSON.parse(mappingText) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) mapping = parsed;
      else throw new Error("not object");
    } catch {
      toast("模型映射需要是 JSON 对象");
      return;
    }
    const payload = { ...form, name: form.name.trim(), mapping };
    if (isEdit && channel) updateChannel(channel.id, payload);
    else addChannel(payload);
    toast(isEdit ? "已更新" : "已新增");
    onClose();
  }

  return (
    <Modal isOpen onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxW="720px">
        <ModalHeader>{isEdit ? "编辑渠道" : "新增渠道"}</ModalHeader>
        <ModalBody>
          <Flex direction="column" gap={4}>
            <label className="fg-field">
              <span>渠道名</span>
              <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="仅作标识" />
            </label>
            <label className="fg-field">
              <span>协议类型</span>
              <MySelect
                value={form.protocol}
                onChange={(protocol) => {
                  const next = protocol as ChannelProtocol;
                  const hit = CHANNEL_PROTOCOLS.find((p) => p.id === next);
                  patch({ protocol: next, baseUrl: form.baseUrl || hit?.defaultBaseUrl || "" });
                }}
                list={CHANNEL_PROTOCOLS.map((p) => ({ label: p.label, value: p.id }))}
              />
            </label>
            <Box>
              <Flex align="center" justify="space-between" mb={2}>
                <Box fontSize="13px">模型（{form.modelIds.length}）</Box>
                <Button size="sm" variant="whiteBase" h="28px" onClick={() => patch({ modelIds: [] })}>
                  清空
                </Button>
              </Flex>
              <ModelMultiSelect
                value={form.modelIds}
                onChange={(modelIds) => patch({ modelIds })}
                options={aiModels.map((m) => ({
                  value: m.model,
                  label: m.model,
                  provider: m.provider,
                }))}
              />
            </Box>
            <label className="fg-field">
              <Flex as="span" align="center" gap={1}>
                模型映射
                <QuestionTip label={'把本系统的模型 ID 映射到上游真实 ID。例如 { "gpt-4o-test": "gpt-4o" }。'} />
              </Flex>
              <Textarea
                minH="90px"
                fontFamily="var(--mono)"
                fontSize="13px"
                value={mappingText}
                onChange={(e) => setMappingText(e.target.value)}
              />
            </label>
            <label className="fg-field">
              <Flex as="span" align="center" gap={1}>
                代理地址
                <QuestionTip label="填 BaseUrl，不要填完整的 chat/completions 路径。注意是否需要 /v1。" />
              </Flex>
              <Input
                value={form.baseUrl}
                placeholder={proto?.defaultBaseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
              />
              {proto ? (
                <Box fontSize="12px" color="myGray.500">
                  默认：{proto.defaultBaseUrl}
                </Box>
              ) : null}
            </label>
            <label className="fg-field">
              <span>API 密钥</span>
              <Input
                type="password"
                value={form.apiKey}
                placeholder="sk-..."
                onChange={(e) => patch({ apiKey: e.target.value })}
              />
            </label>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" onClick={onClose}>
            取消
          </Button>
          <Button ml={3} onClick={onSubmit}>
            {isEdit ? "更新" : "新增"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function ModelMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: { value: string; label: string; provider: string }[];
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const unused = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter((o) => !value.includes(o.value) && (!s || o.label.toLowerCase().includes(s)));
  }, [options, q, value]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
    setQ("");
  }

  return (
    <Box ref={boxRef}>
      <Menu isOpen={isOpen} onClose={onClose} closeOnSelect={false} strategy="fixed" matchWidth>
        <MenuButton
          as={Box}
          minH="40px"
          px={3}
          py={2}
          border="1px solid"
          borderColor={isOpen ? "primary.300" : "myGray.200"}
          borderRadius="md"
          cursor="pointer"
          bg="white"
          onClick={() => (isOpen ? onClose() : onOpen())}
        >
          {value.length === 0 ? (
            <Box color="myGray.400" fontSize="14px">
              选择该渠道可用的模型
            </Box>
          ) : (
            <Flex wrap="wrap" gap={1}>
              {value.map((id) => {
                const opt = options.find((o) => o.value === id);
                return (
                  <span key={id} className="tag">
                    {opt?.label ?? id}
                  </span>
                );
              })}
            </Flex>
          )}
        </MenuButton>
        <MenuList maxH="280px" overflowY="auto">
          <Box px={3} py={2}>
            <Input
              h="32px"
              fontSize="sm"
              placeholder="搜索模型"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </Box>
          {value.map((id) => {
            const opt = options.find((o) => o.value === id);
            return (
              <MenuItem key={`on-${id}`} onClick={() => toggle(id)}>
                <Flex align="center" gap={2} color="primary.600">
                  <ProviderAvatar provider={opt?.provider ?? "Other"} size={16} />
                  {id}
                </Flex>
              </MenuItem>
            );
          })}
          {unused.map((o) => (
            <MenuItem key={o.value} onClick={() => toggle(o.value)}>
              <Flex align="center" gap={2}>
                <ProviderAvatar provider={o.provider} size={16} />
                {o.label}
                <Box ml="auto" fontSize="12px" color="myGray.400">
                  {providerOf(o.provider).name}
                </Box>
              </Flex>
            </MenuItem>
          ))}
          {unused.length === 0 && value.length === 0 ? (
            <Box px={3} py={2} fontSize="13px" color="myGray.500">
              没有可选模型，请先在「模型配置」里新增
            </Box>
          ) : null}
        </MenuList>
      </Menu>
    </Box>
  );
}
