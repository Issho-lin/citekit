import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Checkbox, Input } from "@chakra-ui/react";
import { Crumb, Empty, PageHero } from "../components/chrome";
import { MySelect } from "../components/MySelect";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";

export function NewMcpPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const preset = params.get("tool");
  const { tools, addEndpoint, kbsReady } = useStore();
  const [name, setName] = useState("");
  const [env, setEnv] = useState<"dev" | "prod">("dev");
  const [toolIds, setToolIds] = useState<string[]>(preset ? [preset] : []);

  function toggle(id: string) {
    setToolIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || toolIds.length === 0) {
      toast("请填写名称并至少勾选一把工具");
      return;
    }
    try {
      const id = await addEndpoint({ name: name.trim(), env, toolIds });
      toast("端点已创建，可复制 URL 给 Agent");
      nav(`/mcp/${id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "创建失败");
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <Crumb
          items={[
            { label: "MCP 端点", href: "/mcp" },
            { label: "新建" },
          ]}
        />
        <PageHero title="新建 MCP 端点" desc="白名单即 Agent 能调用的检索工具。默认不提供搜全部。" />
        {kbsReady === false ? (
          <div aria-busy="true" />
        ) : tools.length === 0 ? (
          <Empty text="还没有检索工具。" to="/tools/new" cta="先做成工具" />
        ) : (
          <form className="form-stack" onSubmit={onSubmit}>
            <label>
              名称
              <Input
                placeholder="如 客服 Agent · prod"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              环境
              <MySelect
                value={env}
                onChange={(next) => setEnv(next as "dev" | "prod")}
                list={[
                  { value: "dev", label: "dev" },
                  { value: "prod", label: "prod" },
                ]}
              />
            </label>
            <div className="field">
              <span>工具白名单</span>
              {tools.map((t) => (
                <label key={t.id} className="source-check">
                  <Checkbox
                    isChecked={toolIds.includes(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                  <span>
                    {t.title}
                    <div className="mono">{t.name}</div>
                  </span>
                </label>
              ))}
            </div>
            <div>
              <Button type="submit">创建端点</Button>
              <Button as={Link} to="/mcp" variant="outline" colorScheme="gray" ml={2}>
                取消
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
