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
    return { text: "知识库还没有检索工具，Agent 调不到。", to: `/tools/new?kb=${kb.id}`, cta: "做成工具" };
  }
  if (published.length === 0 && tl[0]) {
    return { text: "工具还没挂到 MCP，Agent 接不上。", to: `/mcp/new?tool=${tl[0].id}`, cta: "发布端点" };
  }
  return {
    text: `已发布到「${published[0].name}」。`,
    to: `/mcp/${published[0].id}`,
    cta: "查看端点",
    done: true,
  };
}

export function toolNext(toolId: string, endpoints: McpEndpoint[]): NextStep {
  const published = endpoints.filter((e) => e.toolIds.includes(toolId));
  if (published.length === 0) {
    return { text: "还没有 MCP 端点挂上这把工具。", to: `/mcp/new?tool=${toolId}`, cta: "发布端点" };
  }
  return {
    text: `已在 ${published.map((e) => e.name).join("、")} 白名单中。`,
    to: `/mcp/${published[0].id}`,
    cta: "查看端点",
    done: true,
  };
}
