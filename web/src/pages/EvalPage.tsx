import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Box, Button, IconButton, Input } from "@chakra-ui/react";
import { DataTable, Empty, PageHero, Panel } from "../components/chrome";
import { MySelect } from "../components/MySelect";
import { IconTrash } from "../components/icons";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";
import { api } from "../api";
import type { EvalRun, SearchConfig } from "../types";
import { evalStatus } from "../evalStatus";

function searchLabel(search?: SearchConfig | null) {
  if (!search) return "";
  const mode = search.searchMode === "embedding" ? "语义" : search.searchMode === "fullText" ? "全文" : "混合";
  const bits = [`${mode}检索`, `召回 ${search.limit} 条`];
  if (search.usingRerank) bits.push("重排");
  return bits.join(" · ");
}

function retrieveKey(search?: SearchConfig | null) {
  if (!search) return "";
  return `${search.searchMode}|${search.limit}|${search.usingRerank ? 1 : 0}|${search.similarity}`;
}

function ResultBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="eval-badge wait">未跑</span>;
  return <span className={`eval-badge ${ok ? "pass" : "fail"}`}>{ok ? "PASS" : "FAIL"}</span>;
}

export function EvalPage() {
  const { evalCases, tools, kbsReady, addEvalCase, removeEvalCase, runEvalCases } = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const toolFilter = params.get("tool") || "";
  const [query, setQuery] = useState("");
  const [expect, setExpect] = useState("");
  const [draftToolId, setDraftToolId] = useState("");
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const formToolId = draftToolId || toolFilter || tools[0]?.id || "";
  const activeTool = tools.find((t) => t.id === (toolFilter || formToolId));
  const visible = toolFilter ? evalCases.filter((c) => c.toolId === toolFilter) : evalCases;
  const latestByTool = useMemo(() => {
    const map = new Map<string, EvalRun>();
    for (const run of runs) {
      if (!map.has(run.toolId)) map.set(run.toolId, run);
    }
    return map;
  }, [runs]);
  const byCase = useMemo(() => {
    const map = new Map<string, EvalRun["items"][number]>();
    for (const run of latestByTool.values()) {
      for (const item of run.items) {
        if (item.caseId) map.set(item.caseId, item);
      }
    }
    return map;
  }, [latestByTool]);

  const board = useMemo(() => {
    const scoped = toolFilter
      ? [latestByTool.get(toolFilter)].filter((item): item is EvalRun => Boolean(item))
      : [...latestByTool.values()];
    const passed = scoped.reduce((sum, run) => sum + run.passed, 0);
    const total = scoped.reduce((sum, run) => sum + run.total, 0);
    const at = scoped[0]?.createdAt;
    const failed = scoped.reduce((sum, run) => sum + run.failed, 0);
    const latest = toolFilter ? latestByTool.get(toolFilter) : scoped[0];
    const retrieve = latest?.retrieve;
    const k = retrieve?.limit ?? (toolFilter ? activeTool?.search.limit : undefined);
    return {
      passed,
      failed,
      total,
      at,
      k,
      retrieve,
      ran: scoped.length > 0,
      ok: scoped.length > 0 && scoped.every((run) => run.ok) && total > 0,
    };
  }, [activeTool, latestByTool, toolFilter]);

  useEffect(() => {
    if (toolFilter) setDraftToolId(toolFilter);
  }, [toolFilter]);

  useEffect(() => {
    let cancelled = false;
    void api.listEvalRuns(toolFilter || undefined, 8).then((items) => {
      if (!cancelled) setRuns(items);
    });
    return () => {
      cancelled = true;
    };
  }, [toolFilter, tools]);

  if (!kbsReady) {
    return <div className="page" aria-busy="true" />;
  }

  function setTool(next: string) {
    const nextParams = new URLSearchParams(params);
    if (next) nextParams.set("tool", next);
    else nextParams.delete("tool");
    setParams(nextParams, { replace: true });
  }

  async function runAll() {
    setRunning(true);
    try {
      const result = await runEvalCases(toolFilter || undefined);
      const items = await api.listEvalRuns(toolFilter || undefined, 8);
      setRuns(items);
      toast(result.failed === 0 ? "本轮考卷已通过" : `${result.failed} 题未召回，相关工具不能标 prod`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "评测失败");
    } finally {
      setRunning(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!query.trim() || !formToolId || !expect.trim()) {
      toast("请填写问句、工具和应召回的文字");
      return;
    }
    try {
      await addEvalCase({
        query: query.trim(),
        toolId: formToolId,
        expect: expect.trim(),
      });
      setQuery("");
      setExpect("");
      toast("已写入考卷，请再跑一遍");
    } catch (err) {
      toast(err instanceof Error ? err.message : "添加失败");
    }
  }

  return (
    <div className="page">
      <div className="page-inner">
        <PageHero
          title="评测考卷"
          desc="固定考卷测检索有没有找对材料。每题写清「用户怎么问、top-k 里必须出现什么」；改切块或策略后用同一套题回归。最近一次未通过的工具，MCP 不能标 prod。"
          action={
            <Button onClick={() => void runAll()} isLoading={running} isDisabled={visible.length === 0}>
              {toolFilter ? "跑这套题" : "全量回归"}
            </Button>
          }
        />

        <div className="eval-toolbar">
          <MySelect
            w="280px"
            value={toolFilter}
            onChange={setTool}
            list={[
              { label: "全部工具", value: "" },
              ...tools.map((t) => ({
                label: `${t.title} · ${evalStatus(t.eval)}`,
                value: t.id,
              })),
            ]}
          />
          {activeTool && toolFilter ? (
            <p className="page-desc" style={{ margin: 0 }}>
              {searchLabel(activeTool.search)}
              {" · "}
              <Link to={`/tools/${activeTool.id}`}>工具配置</Link>
            </p>
          ) : (
            <p className="page-desc" style={{ margin: 0 }}>
              只评「找没找到」，不评大模型怎么写答案。
            </p>
          )}
        </div>

        <div className="eval-scoreboard">
          <div className="eval-metric">
            <div className="k">通过率</div>
            <div className="v">
              {board.ran && board.total ? `${Math.round((board.passed / board.total) * 100)}%` : "—"}
            </div>
            <div className="s">
              {board.ran && board.total
                ? `${board.passed}/${board.total} · ${board.ok ? "可以标 prod" : "未过门禁"}`
                : "还没跑过"}
            </div>
          </div>
          <div className="eval-metric">
            <div className="k">召回{board.k ? `@${board.k}` : "@k"}</div>
            <div className="v">{board.ran && board.total ? `${board.passed}/${board.total}` : "—"}</div>
            <div className="s">
              {board.failed ? `${board.failed} 题缺应召回文字` : "top-k 是否包含应出现的文字"}
            </div>
          </div>
          <div className="eval-metric">
            <div className="k">本轮配置</div>
            <div className="v" style={{ fontSize: 15, lineHeight: 1.35 }}>
              {toolFilter
                ? searchLabel(board.retrieve) || searchLabel(activeTool?.search) || "—"
                : "各工具当时配置见历史"}
            </div>
            <div className="s">对照时看历史里配置是否一致</div>
          </div>
          <div className="eval-metric">
            <div className="k">最近一次</div>
            <div className="v" style={{ fontSize: 16 }}>
              {board.at || "—"}
            </div>
            <div className="s">{visible.length} 题 · {toolFilter ? "当前工具" : "全部工具"}</div>
          </div>
        </div>

        <Box mb={4}>
          <Panel title={`考卷 · ${visible.length} 题`}>
            {visible.length === 0 ? (
              <Empty text="还没有题。先加几道手测确认过的问法。" />
            ) : (
              <DataTable headers={["", "问句", "应召回", "实际召回", ""]}>
                {visible.map((c) => {
                  const r = byCase.get(c.id);
                  const tool = tools.find((t) => t.id === c.toolId);
                  const retrieved = (r?.hits || []).map((h) => h.title || h.locator).filter(Boolean);
                  const ok = r ? r.ok : null;
                  return (
                    <tr key={c.id} className={ok === false ? "eval-row-fail" : undefined}>
                      <td>
                        <ResultBadge ok={ok} />
                        {!toolFilter && tool ? <div className="eval-sub">{tool.title}</div> : null}
                      </td>
                      <td>{c.query}</td>
                      <td>{c.expect}</td>
                      <td>
                        {r ? (
                          <div className="eval-hits">
                            {retrieved.length ? retrieved.join("；") : "没有召回"}
                            {ok === false ? <div className="eval-sub">缺：{c.expect}</div> : null}
                          </div>
                        ) : (
                          <span className="eval-sub">跑一遍后对照期望和实际召回</span>
                        )}
                      </td>
                      <td>
                        <IconButton
                          aria-label="从考卷删除"
                          icon={<IconTrash />}
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void removeEvalCase(c.id).catch((err: unknown) =>
                              toast(err instanceof Error ? err.message : "删除失败"),
                            );
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </Panel>
        </Box>

        <Box mb={4}>
          <Panel title="加入题目">
            {tools.length === 0 ? (
              <Empty text="还没有检索工具。" to="/tools/new" cta="先做成工具" />
            ) : (
              <form className="eval-form" onSubmit={(e) => void onAdd(e)}>
                <label>
                  用户会怎么问
                  <Input placeholder="业主在物业管理活动中有哪些义务？" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
                <label>
                  用哪把工具搜
                  <MySelect
                    value={formToolId}
                    onChange={setDraftToolId}
                    list={tools.map((t) => ({ label: t.title, value: t.id }))}
                  />
                </label>
                <label>
                  结果里必须出现
                  <Input placeholder="例如 第七条" value={expect} onChange={(e) => setExpect(e.target.value)} />
                </label>
                <Button type="submit">加入考卷</Button>
                <p className="page-desc hint">
                  应召回写标题或正文里的原话（条文号、文件名、关键句）。这是检索断言，不是标准答案全文。
                </p>
              </form>
            )}
          </Panel>
        </Box>

        {runs.length > 0 ? (
          <Panel title="历史对照">
            <p className="page-desc" style={{ marginBottom: 12 }}>
              改切块或策略前后各跑一轮。配置不同的两轮不宜直接比通过率；掉分先翻考卷里 FAIL 题。
            </p>
            <DataTable headers={["时间", "工具", "通过", "召回@k", "配置"]}>
              {runs.map((run, index) => {
                const tool = tools.find((t) => t.id === run.toolId);
                const retrieve = run.retrieve;
                const k = retrieve?.limit;
                const prev = runs.slice(index + 1).find((item) => item.toolId === run.toolId);
                const drifted =
                  retrieve && prev?.retrieve && retrieveKey(retrieve) !== retrieveKey(prev.retrieve);
                return (
                  <tr key={run.id}>
                    <td className="mono">{run.createdAt}</td>
                    <td>{tool?.title || run.toolId}</td>
                    <td>
                      <ResultBadge ok={run.ok} /> {run.passed}/{run.total}
                    </td>
                    <td>
                      {run.passed}/{run.total}
                      {k ? ` @${k}` : ""}
                    </td>
                    <td>
                      {searchLabel(retrieve) || "当时未记配置"}
                      {drifted ? <div className="eval-sub">与上一轮配置不同</div> : null}
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
