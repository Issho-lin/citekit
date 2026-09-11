import type { KnowledgeBase, McpEndpoint, RetrievalTool, Source } from "../types";

export interface NextStep {
  text: string;
  to: string;
  cta: string;
  done?: boolean;
}

export function kbNext(
  kb: KnowledgeBase,
  sources: Source[],
  tools: RetrievalTool[],
  endpoints: McpEndpoint[],
): NextStep {
  const src = sources.filter((s) => s.kbId === kb.id);
  const tl = tools.filter((t) => t.kbId === kb.id);
  const published = endpoints.filter((e) => e.toolIds.some((id) => tl.some((t) => t.id === id)));

  if (src.length === 0) {
    return { text: "还没有集合，搜索测试和工具都没有内容。", to: `/kb/${kb.id}/import`, cta: "去导入" };
  }
  if (tl.length === 0) {
    return { text: "把这个库的集合做成检索工具。同一库可以拆多把。", to: `/tools/new?kb=${kb.id}`, cta: "做成工具" };
  }
  if (published.length === 0 && tl[0]) {
    return { text: "工具还没挂到 MCP，Agent 接不上。", to: `/mcp/new?tool=${tl[0].id}`, cta: "发布端点" };
  }
  const covered = new Set(tl.flatMap((t) => t.sourceIds));
  const uncovered = src.filter((s) => s.type !== "folder" && !covered.has(s.id));
  if (uncovered.length > 0) {
    return {
      text: `已发布。还有 ${uncovered.length} 个集合未进入任何工具，可再拆一把。`,
      to: `/tools/new?kb=${kb.id}`,
      cta: "再拆一把",
    };
  }
  return {
    text: `已发布到「${published[0].name}」。`,
    to: `/mcp/${published[0].id}`,
    cta: "查看端点",
    done: true,
  };
}

export function toolNext(tool: RetrievalTool, endpoints: McpEndpoint[]): NextStep {
  const published = endpoints.filter((e) => e.toolIds.includes(tool.id));
  if (!tool.eval?.cases) {
    return { text: "先加评测用例并跑通，才能把 MCP 标成 prod。", to: `/eval?tool=${tool.id}`, cta: "去评测" };
  }
  if (tool.eval.ok !== true) {
    return { text: "最近一次评测未通过，生产端点不会收这把工具。", to: `/eval?tool=${tool.id}`, cta: "去评测" };
  }
  if (published.length === 0) {
    return { text: "评测已通过。还没有 MCP 端点挂上这把工具。", to: `/mcp/new?tool=${tool.id}`, cta: "发布端点" };
  }
  return {
    text: `已在 ${published.map((e) => e.name).join("、")} 白名单中。改契约后点「保存并重新发布」。`,
    to: `/mcp/${published[0].id}`,
    cta: "查看端点",
    done: true,
  };
}
