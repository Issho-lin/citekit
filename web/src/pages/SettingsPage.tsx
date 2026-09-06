import { useState } from "react";
import { Box, Button, Flex, Input, Switch, Text } from "@chakra-ui/react";
import { PageHero, Panel } from "../components/chrome";
import { ModelConfigTab } from "../components/model/ModelConfigTab";
import { ProviderConfigTab } from "../components/model/ProviderConfigTab";
import { DefaultModelsModal } from "../components/model/DefaultModelsModal";
import { useStore } from "../mock/store";

type Tab = "models" | "providers" | "workspace";

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("models");
  const {
    vectorModel,
    llmModel,
    vlmModel,
    rerankModel,
    rewriteFallback,
    setRewriteFallback,
  } = useStore();
  const [defaultOpen, setDefaultOpen] = useState(false);

  const nameOf = (id: string) => id;

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
                <Box>语言模型：{nameOf(llmModel)}</Box>
                <Box>索引模型：{nameOf(vectorModel)}</Box>
                <Box>图片理解：{nameOf(vlmModel)}</Box>
                <Box>重排模型：{nameOf(rerankModel)}</Box>
              </Flex>
            </Panel>
            <Panel title="查询策略">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text fontSize="14px">多轮改写兜底</Text>
                <Switch isChecked={rewriteFallback} onChange={(e) => setRewriteFallback(e.target.checked)} />
              </div>
              <Text fontSize="12px" color="myGray.500" mt={2}>
                默认关闭。指代消解由 Agent 完成。
              </Text>
            </Panel>
            <Panel title="MCP 传输">
              <Input defaultValue="Streamable HTTP" isDisabled />
            </Panel>
          </div>
        ) : null}
        {defaultOpen ? <DefaultModelsModal onClose={() => setDefaultOpen(false)} /> : null}
      </div>
    </div>
  );
}
