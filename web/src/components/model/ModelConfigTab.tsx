import { useMemo, useState } from "react";
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
  Switch,
  Tooltip,
} from "@chakra-ui/react";
import { ConfirmDialog } from "../ConfirmDialog";
import { MySelect } from "../MySelect";
import { IconEdit, IconPlus, IconSearch, IconSend, IconSwap, IconTrash } from "../icons";
import { MODEL_TYPE_META, PROVIDERS, blankModel, providerOf } from "../../mock/models";
import { useStore } from "../../mock/store";
import { useToast } from "../Toast";
import type { AiModel, ModelType } from "../../types";
import { ModelEditModal } from "./ModelEditModal";
import { DefaultModelsModal } from "./DefaultModelsModal";
import { ModelTypeTag, ProviderAvatar } from "./shared";

export function ModelConfigTab() {
  const toast = useToast();
  const { aiModels, updateAiModel, addAiModel, removeAiModel, testAiModel } = useStore();
  const [provider, setProvider] = useState("");
  const [modelType, setModelType] = useState<ModelType | "">("");
  const [search, setSearch] = useState("");
  const [showActive, setShowActive] = useState(false);
  const [showModelId, setShowModelId] = useState(true);
  const [edit, setEdit] = useState<AiModel | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return aiModels.filter((m) => {
      if (provider && m.provider !== provider) return false;
      if (modelType && m.type !== modelType) return false;
      if (showActive && !m.isActive) return false;
      if (q && !`${m.model} ${m.name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [aiModels, provider, modelType, search, showActive]);

  const activeCount = aiModels.filter((m) => m.isActive).length;

  async function onTest(model: string) {
    setTesting(model);
    const res = await testAiModel(model);
    setTesting(null);
    toast(res.ok ? `${model} · ${res.ms}ms · ${res.message}` : `${model} 失败：${res.message}`);
  }

  function onSave(next: AiModel) {
    if (!next.model) {
      toast("请填写模型 ID");
      return;
    }
    const exists = aiModels.some((m) => m.model === next.model);
    if (edit && !edit.model) {
      const id = addAiModel(next);
      if (!id) {
        toast("模型 ID 已存在");
        return;
      }
      toast("已新增");
    } else if (exists) {
      updateAiModel(next.model, next);
      toast("已保存");
    } else {
      toast("模型不存在");
      return;
    }
    setEdit(null);
  }

  return (
    <>
      <Flex mb={4} gap={3} align="center" wrap="wrap">
        <HStack spacing={2} minW="160px">
          <Box fontSize="sm" color="myGray.600" whiteSpace="nowrap">
            提供商
          </Box>
          <MySelect
            w="150px"
            h="32px"
            value={provider}
            onChange={setProvider}
            list={[{ label: "全部", value: "" }, ...PROVIDERS.map((p) => ({ label: p.name, value: p.id }))]}
          />
        </HStack>
        <HStack spacing={2} minW="160px">
          <Box fontSize="sm" color="myGray.600" whiteSpace="nowrap">
            类型
          </Box>
          <MySelect
            w="150px"
            h="32px"
            value={modelType}
            onChange={(v) => setModelType(v as ModelType | "")}
            list={[{ label: "全部", value: "" }, ...MODEL_TYPE_META.map((t) => ({ label: t.label, value: t.id }))]}
          />
        </HStack>
        <label className="ds-search" style={{ width: 220, height: 32, marginLeft: "auto" }}>
          <IconSearch size={14} />
          <input
            value={search}
            placeholder="搜索模型名 / ID"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Button variant="whiteBase" onClick={() => setDefaultOpen(true)}>
          默认模型
        </Button>
        <Menu>
          <MenuButton as={Button} leftIcon={<IconPlus size={14} />}>
            新增模型
          </MenuButton>
          <MenuList>
            {MODEL_TYPE_META.map((t) => (
              <MenuItem key={t.id} onClick={() => setEdit(blankModel(t.id))}>
                {t.label}
              </MenuItem>
            ))}
          </MenuList>
        </Menu>
      </Flex>

      <div className="data-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="th-swap" onClick={() => setShowModelId((v) => !v)}>
                  {showModelId ? "模型 ID" : "模型名"}
                  <IconSwap />
                </button>
              </th>
              <th>类型</th>
              <th>
                <button
                  type="button"
                  className={showActive ? "th-swap on" : "th-swap"}
                  onClick={() => setShowActive((v) => !v)}
                >
                  启用（{activeCount}）
                </button>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ color: "#86909c" }}>
                  没有匹配的模型
                </td>
              </tr>
            ) : (
              list.map((m) => (
                <tr key={m.model}>
                  <td>
                    <Flex align="center" gap={2}>
                      <ProviderAvatar provider={m.provider} />
                      <Box>
                        <Box fontWeight={500}>{showModelId ? m.model : m.name}</Box>
                        <Box className="model-caps">
                          <span>{providerOf(m.provider).name}</span>
                          {m.vision ? <span>视觉</span> : null}
                          {m.toolChoice ? <span>工具调用</span> : null}
                          {m.maxContext ? <span>{Math.round(m.maxContext / 1000)}k 上下文</span> : null}
                          {m.maxToken && m.type !== "llm" ? <span>{m.maxToken} token</span> : null}
                          {m.isCustom ? <span>自定义</span> : null}
                        </Box>
                      </Box>
                    </Flex>
                  </td>
                  <td>
                    <ModelTypeTag type={m.type} />
                  </td>
                  <td>
                    <Switch
                      size="sm"
                      isChecked={m.isActive}
                      onChange={(e) => updateAiModel(m.model, { isActive: e.target.checked })}
                    />
                  </td>
                  <td>
                    <HStack spacing={1} justify="flex-end">
                      <Tooltip label="测试模型">
                        <IconButton
                          aria-label="测试"
                          size="xsSquare"
                          variant="ghost"
                          isLoading={testing === m.model}
                          icon={<IconSend size={14} />}
                          onClick={() => onTest(m.model)}
                        />
                      </Tooltip>
                      <Tooltip label="编辑">
                        <IconButton
                          aria-label="编辑"
                          size="xsSquare"
                          variant="ghost"
                          icon={<IconEdit />}
                          onClick={() => setEdit(m)}
                        />
                      </Tooltip>
                      {m.isCustom ? (
                        <Tooltip label="删除">
                          <IconButton
                            aria-label="删除"
                            size="xsSquare"
                            variant="ghost"
                            color="red.500"
                            icon={<IconTrash />}
                            onClick={() => setDelId(m.model)}
                          />
                        </Tooltip>
                      ) : null}
                    </HStack>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {edit ? (
        <ModelEditModal model={edit} onClose={() => setEdit(null)} onSave={onSave} />
      ) : null}
      {defaultOpen ? <DefaultModelsModal onClose={() => setDefaultOpen(false)} /> : null}
      <ConfirmDialog
        isOpen={!!delId}
        onClose={() => setDelId(null)}
        title="删除这个自定义模型？"
        onConfirm={() => {
          if (delId) removeAiModel(delId);
          toast("已删除");
        }}
      >
        删除后，知识库和渠道里如果还引用它，需要重新选择模型。
      </ConfirmDialog>
    </>
  );
}
