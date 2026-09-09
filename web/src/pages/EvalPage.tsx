import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input } from "@chakra-ui/react";
import { DataTable, Empty, PageHero, Panel } from "../components/chrome";
import { MySelect } from "../components/MySelect";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";

export function EvalPage() {
  const { evalCases, tools, kbsReady, addEvalCase, runEvalCases } = useStore();
  const toast = useToast();
  const [rows, setRows] = useState<{ id: string; pass: boolean | null; detail: string }[]>([]);
  const [query, setQuery] = useState("");
  const [toolId, setToolId] = useState("");
  const [expect, setExpect] = useState("");
  const [running, setRunning] = useState(false);
  const selected = tools.find((t) => t.id === toolId) ?? tools[0];
  const activeToolId = selected?.id ?? "";

  useEffect(() => {
    if (!toolId && tools[0]) setToolId(tools[0].id);
  }, [tools, toolId]);

  useEffect(() => {
    setRows(evalCases.map((c) => ({ id: c.id, pass: null, detail: "未跑" })));
  }, [evalCases]);

  if (!kbsReady) {
    return <div className="page" aria-busy="true" />;
  }

  async function runAll() {
    setRunning(true);
    try {
      const next = await runEvalCases();
      setRows(next);
      const failed = next.filter((r) => r.pass === false).length;
      toast(failed === 0 ? "全部通过" : `${failed} 条未过，勿标 prod`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "评测失败");
    } finally {
      setRunning(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!query.trim() || !activeToolId || !expect.trim()) {
      toast("请填写问句、工具和应命中定位");
      return;
    }
    try {
      await addEvalCase({
        query: query.trim(),
        toolId: activeToolId,
        expect: expect.trim(),
      });
      setQuery("");
      setExpect("");
      toast("用例已添加，请再跑一遍");
    } catch (err) {
      toast(err instanceof Error ? err.message : "添加失败");
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHero
          title="评测"
          desc="金标问句绑定工具，按该工具自己的范围和策略跑。未达门禁不要把 MCP 标成 prod。"
          action={
            <Button onClick={() => void runAll()} isLoading={running} isDisabled={evalCases.length === 0}>
              跑一遍
            </Button>
          }
        />
        <Panel title="添加用例">
          {tools.length === 0 ? (
            <Empty text="还没有检索工具。" to="/tools/new" cta="先做成工具" />
          ) : (
            <form onSubmit={(e) => void onAdd(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Input
                placeholder="问句"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <MySelect
                w="220px"
                value={activeToolId}
                onChange={setToolId}
                list={tools.map((t) => ({ label: t.name, value: t.id }))}
              />
              <Input
                placeholder="应命中 locator 或标题"
                value={expect}
                onChange={(e) => setExpect(e.target.value)}
              />
              <Button type="submit">添加</Button>
            </form>
          )}
        </Panel>
        {evalCases.length === 0 ? (
          <Empty text="没有评测用例。" />
        ) : (
          <DataTable headers={["问句", "工具", "应命中", "结果"]}>
            {evalCases.map((c) => {
              const r = rows.find((x) => x.id === c.id);
              const tool = tools.find((t) => t.id === c.toolId);
              return (
                <tr key={c.id}>
                  <td>
                    {c.query}
                  </td>
                  <td>
                    {tool ? <Link to={`/tools/${tool.id}`}>{tool.name}</Link> : c.toolId}
                  </td>
                  <td className="mono">{c.expect}</td>
                  <td>
                    {r?.pass === null || r === undefined ? "未跑" : r.pass ? "通过" : "未过"}
                    <div className="mono">{r?.detail}</div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </div>
    </div>
  );
}
