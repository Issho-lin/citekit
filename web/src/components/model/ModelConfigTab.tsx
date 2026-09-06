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
import { IconEdit, IconPlus, IconSearch, IconSend, IconTrash } from "../icons";
import { MODEL_TYPE_META, blankModel } from "../../mock/models";
import { useStore } from "../../mock/store";
import { useToast } from "../Toast";
import type { AiModel, ModelType } from "../../types";
import { ModelEditModal } from "./ModelEditModal";
import { DefaultModelsModal } from "./DefaultModelsModal";
import { ModelTypeTag, ProviderAvatar, providerOf } from "./shared";

export function ModelConfigTab() {
  const toast = useToast();
  const { aiModels, providers, updateAiModel, addAiModel, removeAiModel, testAiModel } = useStore();
  const [provider, setProvider] = useState("");
  const [modelType, setModelType] = useState<ModelType | "">("");
  const [search, setSearch] = useState("");
  const [showActive, setShowActive] = useState(false);
  const [edit, setEdit] = useState<AiModel | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const providerOptions = useMemo(() => {
    const used = new Set(aiModels.map((m) => m.provider));
    return providers.filter((p) => p.isVisible || used.has(p.id));
  }, [aiModels, providers]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return aiModels.filter((m) => {
      if (provider && m.provider !== provider) return false;
      if (modelType && m.type !== modelType) return false;
      if (showActive && !m.isActive) return false;
      if (q && !m.model.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [aiModels, provider, modelType, search, showActive]);

  const activeCount = aiModels.filter((m) => m.isActive).length;

  async function onSave(next: AiModel) {
    if (!next.model) {
      toast("请填写模型 ID");
      return;
    }
    try {
      if (edit && !edit.model) {
        await addAiModel(next);
        toast("已新增");
      } else if (edit) {
        const taken = aiModels.some((m) => m.model === next.model && m.model !== edit.model);
        if (taken) {
          toast("模型 ID 已存在");
          return;
        }
        await updateAiModel(edit.model, next);
        toast("已保存");
      } else {
        toast("模型不存在");
        return;
      }
      setEdit(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存失败");
    }
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
            list={[
              { label: "全部", value: "" },
              ...providerOptions.map((p) => ({
                label: p.name,
                value: p.id,
                icon: <ProviderAvatar provider={p.id} size={16} />,
              })),
            ]}
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
            type="search"
            name="citekit-model-filter"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore=""
            data-lpignore="true"
            value={search}
            placeholder="搜索模型 ID"
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
              <th>模型 ID</th>
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
                        <Box fontWeight={500} className="mono">
                          {m.model}
                        </Box>
                        <Box className="model-caps">
                          <span>{providerOf(providers, m.provider).name}</span>
                          {m.mappedModel ? <span>映射 {m.mappedModel}</span> : null}
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
                      <Tooltip label="测试连接">
                        <IconButton
                          aria-label="测试连接"
                          size="xsSquare"
                          variant="ghost"
                          isLoading={testing === m.model}
                          icon={<IconSend size={14} />}
                          onClick={async () => {
                            setTesting(m.model);
                            try {
                              const res = await testAiModel(m.model);
                              toast(res.ok ? `连接正常（${(res.ms / 1000).toFixed(2)}s）` : res.message);
                            } finally {
                              setTesting(null);
                            }
                          }}
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
        title="删除这个模型？"
        onConfirm={async () => {
          if (!delId) return;
          try {
            await removeAiModel(delId);
            toast("已删除");
          } catch (err) {
            toast(err instanceof Error ? err.message : "删除失败");
            throw err;
          }
        }}
      >
        删除后会从工作空间默认模型和知识库下拉里拿掉。重启服务不会自动加回来（除非库被清空后重新 seed）。
      </ConfirmDialog>
    </>
  );
}
