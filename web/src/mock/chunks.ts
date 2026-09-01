import type { Chunk, Source } from "../types";
import { fillProcess } from "../constants";

export function chunksFromSources(
  sliceId: string,
  sources: Source[],
  id: () => string,
): Chunk[] {
  const out: Chunk[] = [];
  for (const raw of sources) {
    if (raw.type === "folder") continue;
    const s = { ...raw, ...fillProcess(raw) };
    const table = /\.csv$/i.test(s.title) || s.title.includes("报价");
    if (table) {
      out.push({
        id: id(),
        sliceId,
        title: `${s.title} · 华北`,
        locator: `${s.locator} L12`,
        sourceId: s.id,
        text: `来自「${s.title}」的华北仓样例行。SKU A-9001 单价 128 元，库存 40。`,
        sku: "A-9001",
        warehouse: "华北",
      });
      out.push({
        id: id(),
        sliceId,
        title: `${s.title} · 华南`,
        locator: `${s.locator} L18`,
        sourceId: s.id,
        text: `来自「${s.title}」的华南仓样例行。SKU A-9001 单价 132 元，库存 12。`,
        sku: "A-9001",
        warehouse: "华南",
      });
      continue;
    }

    const size = s.chunkSize || 1000;
    const n =
      s.trainingType === "qa"
        ? 2
        : s.chunkSettingMode === "auto"
          ? 2
          : s.chunkSplitMode === "char"
            ? 3
            : size <= 256
              ? 4
              : size <= 800
                ? 3
                : 2;
    const mode =
      s.trainingType === "qa"
        ? "问答对提取"
        : s.chunkSettingMode === "auto"
          ? "默认分块"
          : s.chunkSplitMode === "paragraph"
            ? `按段落(深度 ${s.paragraphChunkDeep})`
            : s.chunkSplitMode === "char"
              ? `分隔符 ${s.chunkSplitter || "未设置"}`
              : `长度 ${size}`;
    for (let i = 0; i < n; i++) {
      out.push({
        id: id(),
        sliceId,
        title: `${s.title} · 块 ${i + 1}`,
        locator: `${s.locator} #${i + 1}`,
        sourceId: s.id,
        text: `「${s.title}」第 ${i + 1}/${n} 段。处理：${mode}；索引大小 ${s.indexSize}${s.indexPrefixTitle ? "；标题已加入索引" : ""}。定位：${s.locator}。`,
      });
    }
    if (s.trainingType === "qa") {
      out.push({
        id: id(),
        sliceId,
        title: `Q · ${s.title}`,
        locator: `${s.locator} · qa`,
        sourceId: s.id,
        text: `问：这份资料讲了什么？答：由文档理解模型按 QA 提示词从「${s.title}」提取的问答对。`,
      });
    }
  }
  return out;
}
