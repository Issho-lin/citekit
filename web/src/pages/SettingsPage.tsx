import { useState } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { PageHero, Panel } from "../components/chrome";
import { ModelConfigTab } from "../components/model/ModelConfigTab";
import { ProviderConfigTab } from "../components/model/ProviderConfigTab";
import { DefaultModelsModal } from "../components/model/DefaultModelsModal";
import { ModelLineIcon } from "../components/model/shared";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";

type Tab = "models" | "providers" | "workspace";

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("models");
  const { vectorModel, llmModel, vlmModel, rerankModel } = useStore();
  const [defaultOpen, setDefaultOpen] = useState(false);
  const toast = useToast();

  const nameOf = (id: string) => id || "未设置";
  const mcpBase = `${window.location.origin}/mcp`;

  return (
    <div className="page">
      <div className="page-inner-wide">
        <PageHero
          title="设置"
          desc="供应商可以统一保存密钥。模型会预填接口地址；已配置供应商密钥时，模型密钥可以留空。"
        />
        <div className="settings-tabs">
          <button type="button" className={tab === "models" ? "on" : ""} onClick={() => setTab("models")}>
            模型配置
          </button>
          <button type="button" className={tab === "providers" ? "on" : ""} onClick={() => setTab("providers")}>
            供应商
          </button>
          <button type="button" className={tab === "workspace" ? "on" : ""} onClick={() => setTab("workspace")}>
            工作空间
          </button>
        </div>

        {tab === "models" ? <ModelConfigTab /> : null}
        {tab === "providers" ? <ProviderConfigTab /> : null}
        {tab === "workspace" ? (
          <div className="panel-grid">
            <Panel title="工作空间">
              <Text fontSize="14px">当前：default（隐式）</Text>
              <Text fontSize="14px" color="myGray.500">
                角色：运营
              </Text>
            </Panel>
            <Panel
              title="默认模型"
              extra={
                <Button size="sm" variant="whiteBase" h="28px" onClick={() => setDefaultOpen(true)}>
                  修改
                </Button>
              }
            >
              <Flex direction="column" gap={2} fontSize="14px">
                {[
                  ["语言模型", llmModel],
                  ["索引模型", vectorModel],
                  ["图片理解", vlmModel],
                  ["重排模型", rerankModel],
                ].map(([label, id]) => (
                  <Flex key={label} align="center" gap={2}>
                    <ModelLineIcon modelId={id} />
                    <Box>
                      {label}：{nameOf(id)}
                    </Box>
                  </Flex>
                ))}
              </Flex>
            </Panel>
            <Panel title="MCP 接入">
              <Flex direction="column" gap={2}>
                <Text fontSize="12px" color="myGray.500">
                  远程端点走 Streamable HTTP（MCP 2025-03-26，兼容 2024-11-05 / 2025-06-18），单一 POST 端点收发
                  JSON-RPC，鉴权用 Bearer 密钥。
                </Text>
                <Flex align="center" gap={2}>
                  <Box flex={1} className="mono" fontSize="13px" color="#1f2329">
                    {mcpBase}
                  </Box>
                  <Button
                    size="sm"
                    variant="whiteBase"
                    h="28px"
                    onClick={() => {
                      void navigator.clipboard.writeText(mcpBase);
                      toast("已复制地址");
                    }}
                  >
                    复制
                  </Button>
                </Flex>
                <Text fontSize="12px" color="myGray.500">
                  完整地址为 <span className="mono">/mcp/&#123;端点 ID&#125;</span>，请求头带{" "}
                  <span className="mono">Authorization: Bearer &#123;端点密钥&#125;</span>。端点密钥在「MCP 端点」页管理。
                </Text>
              </Flex>
            </Panel>
          </div>
        ) : null}
        {defaultOpen ? <DefaultModelsModal onClose={() => setDefaultOpen(false)} /> : null}
      </div>
    </div>
  );
}
