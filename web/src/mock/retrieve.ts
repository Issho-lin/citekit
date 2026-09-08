import type { Chunk, RetrievalProfile, SearchConfig } from "../types";

export interface RetrieveInput {
  sliceId?: string;
  sliceIds?: string[];
  sourceIds?: string[];
  query: string;
  profile?: RetrievalProfile;
  search?: SearchConfig;
  warehouse?: string;
}

export interface Hit {
  chunk: Chunk;
  score: number;
  note: string;
}

function scoreText(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  let s = 0;
  for (const token of q.split(/\s+/)) {
    if (token.length < 1) continue;
    if (t.includes(token)) s += 0.28;
  }
  if (t.includes(q)) s += 0.35;
  return Math.min(1, s);
}

export function retrieve(
  input: RetrieveInput,
  allChunks: Chunk[],
): { hits: Hit[]; message?: string } {
  if (input.sourceIds && input.sourceIds.length === 0) {
    return { hits: [], message: "请至少勾选一个数据集。" };
  }

  let pool = allChunks;
  if (input.sourceIds) {
    pool = pool.filter((c) => c.sourceId && input.sourceIds!.includes(c.sourceId));
  } else if (input.sliceIds?.length) {
    pool = pool.filter((c) => input.sliceIds!.includes(c.sliceId));
  } else if (input.sliceId) {
    pool = pool.filter((c) => c.sliceId === input.sliceId);
  }
  if (pool.length === 0) {
    return { hits: [], message: "该知识库还没有可检索的数据。请先导入集合并等待就绪。" };
  }

  if (input.profile === "filter_first") {
    const wh = input.warehouse?.trim();
    if (!wh) {
      return {
        hits: [],
        message: "empty_after_filter：filter_first 要求提供 warehouse，未静默全表检索。",
      };
    }
    pool = pool.filter((c) => c.warehouse === wh);
    if (pool.length === 0) {
      return { hits: [], message: "empty_after_filter：该仓库下没有匹配行。" };
    }
  }

  const search = input.search;
  const mode = search?.searchMode;
  let ranked: Hit[] = pool
    .map((chunk) => {
      const base = scoreText(input.query, `${chunk.title} ${chunk.text} ${chunk.a ?? ""} ${chunk.sku ?? ""}`);
      const semantic = Math.min(1, base + 0.08);
      const score = mode === "embedding" ? semantic : mode === "fullText" ? base : (base + semantic) / 2;
      const note =
        mode === "embedding"
          ? "语义检索（原型模拟）"
          : mode === "fullText"
            ? "全文检索（原型模拟）"
            : "混合检索（原型模拟）";
      return { chunk, score, note };
    })
    .sort((a, b) => b.score - a.score);

  if (search) {
    ranked = ranked.filter((h) => h.score >= search.similarity);
    if (ranked.length === 0) {
      return { hits: [], message: `低于相似度 ${search.similarity}，无召回。可调低阈值再试。` };
    }
    if (search.usingRerank) {
      ranked = ranked.slice(0, Math.max(search.limit, 8)).map((h, i) => ({
        ...h,
        score: Math.min(1, h.score + 0.12 - i * 0.015),
        note: "混合召回后重排（原型模拟）",
      }));
    }
    ranked = ranked.slice(0, search.limit);
    return { hits: ranked };
  }

  ranked = ranked.filter((h) => h.score > 0);
  if (ranked.length === 0) {
    ranked = pool.map((chunk) => ({
      chunk,
      score: 0.12,
      note: "无关键词命中，返回片内兜底低分块",
    }));
  }

  if (input.profile === "hybrid_rerank_strict") {
    ranked = ranked.slice(0, 8).map((h, i) => ({
      ...h,
      score: Math.min(1, h.score + 0.15 - i * 0.02),
      note: "交叉编码器重排（原型模拟）",
    }));
    ranked = ranked.slice(0, 3);
  } else if (input.profile === "hybrid_rerank_cutoff") {
    ranked = ranked
      .map((h) => ({ ...h, note: "重排后按阈值丢弃（模拟 cutoff=0.45）" }))
      .filter((h) => h.score >= 0.45);
  } else if (input.profile === "keyword_precise") {
    ranked = ranked.filter((h) => h.score >= 0.4).slice(0, 5);
  } else {
    ranked = ranked.slice(0, 5);
  }

  return { hits: ranked };
}
