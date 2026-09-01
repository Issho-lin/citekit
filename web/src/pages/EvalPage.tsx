import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Input } from "@chakra-ui/react";
import { DataTable, Empty, PageHero, Panel } from "../components/chrome";
import { MySelect } from "../components/MySelect";
import { retrieve } from "../mock/retrieve";
import { searchFromKb } from "../constants";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";

export function EvalPage() {
  const { evalCases, tools, knowledgeBases, chunks, addEvalCase } = useStore();
  const toast = useToast();
  const [rows, setRows] = useState<{ id: string; pass: boolean | null; detail: string }[]>(
    () => evalCases.map((c) => ({ id: c.id, pass: null, detail: "未跑" })),
  );
  const [query, setQuery] = useState("");
  const [toolId, setToolId] = useState(tools[0]?.id ?? "");
  const [expect, setExpect] = useState("");

  function runAll() {
    const next = evalCases.map((c) => {
      const tool = tools.find((t) => t.id === c.toolId);
      if (!tool) return { id: c.id, pass: false, detail: "工具不存在" };
      const kb = knowledgeBases.find((k) => k.id === tool.kbId);
      const result = retrieve(
        {
          sliceId: tool.sliceId,
          sourceIds: tool.sourceIds,
          query: c.query,
          profile: tool.profile,
          search: kb ? searchFromKb(kb) : undefined,
          warehouse: c.warehouse,
        },
        chunks,
      );
      const hit = result.hits.some(
        (h) => h.chunk.locator.includes(c.expect) || h.chunk.locator === c.expect,
      );
      if (result.message && result.hits.length === 0) {
        return { id: c.id, pass: false, detail: result.message };
      }
      return {
        id: c.id,
        pass: hit,
        detail: hit ? `命中 ${c.expect}` : `未命中，返回 ${result.hits.length} 条`,
      };
    });
    setRows(next);
    const failed = next.filter((r) => r.pass === false).length;
    toast(failed === 0 ? "全部通过" : `${failed} 条未过，勿标 prod`);
  }

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!query.trim() || !toolId || !expect.trim()) {
      toast("请填写问句、工具和应命中定位");
      return;
    }
    addEvalCase({ query: query.trim(), toolId, expect: expect.trim() });
    setQuery("");
    setExpect("");
    toast("用例已添加，请再跑一遍");
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHero
          title="评测"
          desc="金标问句绑定工具。策略或切片变更后应回归；未达门禁不要把 MCP 标成 prod。"
          action={<Button onClick={runAll}>跑一遍</Button>}
        />
        <Panel title="添加用例">
          <form onSubmit={onAdd} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Input
              placeholder="问句"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <MySelect
              w="220px"
              value={toolId}
              onChange={setToolId}
              list={tools.map((t) => ({ label: t.name, value: t.id }))}
            />
            <Input
              placeholder="应命中 locator"
              value={expect}
              onChange={(e) => setExpect(e.target.value)}
            />
            <Button type="submit">添加</Button>
          </form>
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
                  <td>{c.query}</td>
                  <td>
                    {tool ? <Link to={`/tools/${tool.id}`}>{tool.name}</Link> : c.toolId}
                  </td>
                  <td className="mono">{c.expect}</td>
                  <td>
                    {r?.pass === null ? "未跑" : r?.pass ? "通过" : "未过"}
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
