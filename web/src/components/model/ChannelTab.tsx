import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  Tooltip,
} from "@chakra-ui/react";
import { ConfirmDialog } from "../ConfirmDialog";
import { QuestionTip } from "../QuestionTip";
import { IconMore, IconPlus, IconSend } from "../icons";
import { CHANNEL_PROTOCOLS } from "../../mock/models";
import { useStore } from "../../mock/store";
import { useToast } from "../Toast";
import type { ModelChannel, ModelTestResult } from "../../types";
import { ChannelEditModal } from "./ChannelEditModal";
import { ProviderAvatar } from "./shared";

export function ChannelTab() {
  const toast = useToast();
  const { channels, updateChannel, removeChannel, testAiModel, aiModels } = useStore();
  const [edit, setEdit] = useState<ModelChannel | null | "new">(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [testOf, setTestOf] = useState<ModelChannel | null>(null);

  return (
    <>
      <Flex mb={4} justify="flex-end">
        <Button leftIcon={<IconPlus size={14} />} onClick={() => setEdit("new")}>
          新增渠道
        </Button>
      </Flex>
      <div className="data-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>渠道名</th>
              <th>协议</th>
              <th>状态</th>
              <th>
                <Flex align="center" gap={1}>
                  优先级
                  <QuestionTip label="1～100，数值越大越优先被选中。" />
                </Flex>
              </th>
              <th>模型</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {channels.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "#86909c" }}>
                  还没有渠道。先在「模型配置」里准备模型，再在这里填写 BaseUrl 和密钥。
                </td>
              </tr>
            ) : (
              channels.map((c) => {
                const proto = CHANNEL_PROTOCOLS.find((p) => p.id === c.protocol);
                return (
                  <tr key={c.id}>
                    <td>
                      <Box fontWeight={500}>{c.name}</Box>
                      <Box className="mono" style={{ fontSize: 12 }}>
                        {c.baseUrl || "未填地址"}
                      </Box>
                    </td>
                    <td>
                      <HStack spacing={2}>
                        <ProviderAvatar provider={proto?.label ?? "Other"} />
                        <span>{proto?.label ?? c.protocol}</span>
                      </HStack>
                    </td>
                    <td>
                      <span className={c.enabled ? "tag tag-ok" : "tag tag-warn"}>
                        {c.enabled ? "启用" : "禁用"}
                      </span>
                    </td>
                    <td>
                      <NumberInput
                        size="sm"
                        w="80px"
                        min={1}
                        max={100}
                        value={c.priority}
                        onChange={(_, n) => {
                          if (!Number.isFinite(n)) return;
                          updateChannel(c.id, { priority: Math.min(100, Math.max(1, n)) });
                        }}
                      >
                        <NumberInputField h="32px" />
                      </NumberInput>
                    </td>
                    <td>{c.modelIds.length} 个</td>
                    <td>
                      <Menu>
                        <MenuButton
                          as={IconButton}
                          aria-label="更多"
                          size="xsSquare"
                          variant="ghost"
                          icon={<IconMore />}
                        />
                        <MenuList>
                          <MenuItem onClick={() => setTestOf(c)}>模型测试</MenuItem>
                          <MenuItem onClick={() => setEdit(c)}>编辑</MenuItem>
                          <MenuItem
                            onClick={() => updateChannel(c.id, { enabled: !c.enabled })}
                          >
                            {c.enabled ? "禁用渠道" : "启用渠道"}
                          </MenuItem>
                          <MenuItem color="red.500" onClick={() => setDelId(c.id)}>
                            删除
                          </MenuItem>
                        </MenuList>
                      </Menu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {edit === "new" ? <ChannelEditModal channel={null} onClose={() => setEdit(null)} /> : null}
      {edit && edit !== "new" ? <ChannelEditModal channel={edit} onClose={() => setEdit(null)} /> : null}
      {testOf ? (
        <ChannelTestModal
          channel={testOf}
          models={testOf.modelIds.filter((id) => aiModels.some((m) => m.model === id))}
          testAiModel={testAiModel}
          onClose={() => setTestOf(null)}
          onToast={toast}
        />
      ) : null}
      <ConfirmDialog
        isOpen={!!delId}
        onClose={() => setDelId(null)}
        title="删除这个渠道？"
        onConfirm={() => {
          if (delId) removeChannel(delId);
          toast("已删除");
        }}
      >
        删除后，走该渠道的模型请求会失败，直到配上新的渠道。
      </ConfirmDialog>
    </>
  );
}

type TestStatus = "waiting" | "running" | "success" | "error";

function ChannelTestModal({
  channel,
  models,
  testAiModel,
  onClose,
  onToast,
}: {
  channel: ModelChannel;
  models: string[];
  testAiModel: (model: string, channelId?: string) => Promise<ModelTestResult>;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [rows, setRows] = useState<{ model: string; status: TestStatus; message: string; ms: number }[]>(
    () => models.map((model) => ({ model, status: "waiting" as const, message: "", ms: 0 })),
  );
  const [running, setRunning] = useState(false);

  async function start() {
    if (models.length === 0) {
      onToast("该渠道没有可选模型");
      return;
    }
    setRunning(true);
    setRows(models.map((model) => ({ model, status: "waiting" as const, message: "", ms: 0 })));
    for (const model of models) {
      setRows((prev) => prev.map((r) => (r.model === model ? { ...r, status: "running" } : r)));
      const res = await testAiModel(model, channel.id);
      setRows((prev) =>
        prev.map((r) =>
          r.model === model
            ? { ...r, status: res.ok ? "success" : "error", message: res.message, ms: res.ms }
            : r,
        ),
      );
    }
    setRunning(false);
  }

  const statusLabel = {
    waiting: { text: "待测试", cls: "tag" },
    running: { text: "测试中", cls: "tag tag-blue" },
    success: { text: "成功", cls: "tag tag-ok" },
    error: { text: "失败", cls: "tag tag-red" },
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>模型测试 · {channel.name}</ModalHeader>
        <ModalBody>
          {rows.length === 0 ? (
            <Box color="myGray.500" fontSize="14px">
              没有可测模型。
            </Box>
          ) : (
            <div className="data-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>模型</th>
                    <th>状态</th>
                    <th>耗时</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.model}>
                      <td className="mono">{r.model}</td>
                      <td>
                        <span className={statusLabel[r.status].cls}>{statusLabel[r.status].text}</span>
                        {r.message && r.status !== "waiting" ? (
                          <Box fontSize="12px" color="myGray.500" mt="2px">
                            {r.message}
                          </Box>
                        ) : null}
                      </td>
                      <td>{r.ms ? `${(r.ms / 1000).toFixed(2)}s` : "—"}</td>
                      <td>
                        <Tooltip label="单独测一次">
                          <IconButton
                            aria-label="测试"
                            size="xsSquare"
                            variant="ghost"
                            isDisabled={running}
                            icon={<IconSend size={14} />}
                            onClick={async () => {
                              setRows((prev) =>
                                prev.map((x) => (x.model === r.model ? { ...x, status: "running" } : x)),
                              );
                              const res = await testAiModel(r.model, channel.id);
                              setRows((prev) =>
                                prev.map((x) =>
                                  x.model === r.model
                                    ? {
                                        ...x,
                                        status: res.ok ? "success" : "error",
                                        message: res.message,
                                        ms: res.ms,
                                      }
                                    : x,
                                ),
                              );
                            }}
                          />
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" onClick={onClose}>
            关闭
          </Button>
          <Button ml={3} isLoading={running} onClick={start}>
            开始测试
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
