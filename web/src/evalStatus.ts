import type { ToolEval } from "./types";

export function evalStatus(item?: ToolEval | null) {
  if (!item || item.cases === 0) return "无评测";
  if (!item.lastRunAt) return `${item.cases} 题未跑`;
  return item.ok ? `通过 ${item.passed}/${item.total}` : `未过 ${item.failed}/${item.total}`;
}
