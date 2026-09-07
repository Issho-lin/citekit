import { useMemo, useState } from "react";
import { Box, Button, Flex, Input } from "@chakra-ui/react";
import { IconSearch } from "../icons";
import { SECRET_MASK, isPlainSecret } from "../../api";
import { useStore } from "../../mock/store";
import { useToast } from "../Toast";
import { ProviderAvatar, configProviders } from "./shared";

const fieldH = "32px";

export function ProviderConfigTab() {
  const toast = useToast();
  const { providers, updateProvider } = useStore();
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return configProviders(providers).filter((p) => {
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    });
  }, [providers, search]);

  async function save(id: string, clear = false) {
    const value = (drafts[id] ?? "").trim();
    const current = providers.find((p) => p.id === id);
    if (!clear && !isPlainSecret(value)) {
      toast(current?.hasApiKey ? "密钥未修改" : "请填写 API 密钥");
      return;
    }
    setSaving(id);
    try {
      await updateProvider(id, clear ? { clearApiKey: true } : { apiKey: value });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast(clear ? "已清除密钥" : "已保存");
    } catch (err) {
      toast(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Flex mb={4} gap={3} align="center" wrap="wrap">
        <Box fontSize="sm" color="myGray.600">
          在这里保存的密钥，该供应商下的模型可以留空，调用时会自动使用。模型里单独填的密钥优先。
        </Box>
        <label className="ds-search" style={{ width: 220, height: 32, marginLeft: "auto" }}>
          <IconSearch size={14} />
          <input
            type="search"
            name="citekit-provider-filter"
            autoComplete="off"
            value={search}
            placeholder="搜索供应商"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </Flex>
      <div className="data-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>供应商</th>
              <th>接口地址</th>
              <th>API 密钥</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ color: "#86909c" }}>
                  没有匹配的供应商
                </td>
              </tr>
            ) : (
              list.map((p) => {
                const shown = drafts[p.id] ?? (p.hasApiKey ? SECRET_MASK : "");
                return (
                <tr key={p.id}>
                  <td>
                    <Flex align="center" gap={2}>
                      <ProviderAvatar provider={p.id} />
                      <Box fontWeight={500}>{p.name}</Box>
                    </Flex>
                  </td>
                  <td>
                    <Box className="mono" fontSize="12px" color="myGray.600">
                      {p.defaultBaseUrl || "需自行填写"}
                    </Box>
                  </td>
                  <td>
                    <Input
                      h={fieldH}
                      minH={fieldH}
                      maxW="280px"
                      fontSize="sm"
                      type={shown === SECRET_MASK ? "text" : "password"}
                      name={`citekit-provider-key-${p.id}`}
                      autoComplete="new-password"
                      data-1p-ignore=""
                      data-lpignore="true"
                      value={shown}
                      placeholder="sk-..."
                      onFocus={() => {
                        if (drafts[p.id] === undefined && p.hasApiKey) {
                          setDrafts((prev) => ({ ...prev, [p.id]: "" }));
                        }
                      }}
                      onBlur={() => {
                        if (!(drafts[p.id] ?? "").trim() && p.hasApiKey) {
                          setDrafts((prev) => {
                            const next = { ...prev };
                            delete next[p.id];
                            return next;
                          });
                        }
                      }}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <Flex justify="flex-end" gap={2}>
                      {p.hasApiKey ? (
                        <Button
                          size="sm"
                          variant="whiteBase"
                          h={fieldH}
                          isDisabled={saving === p.id}
                          onClick={() => void save(p.id, true)}
                        >
                          清除
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        h={fieldH}
                        isLoading={saving === p.id}
                        onClick={() => void save(p.id)}
                      >
                        保存
                      </Button>
                    </Flex>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
