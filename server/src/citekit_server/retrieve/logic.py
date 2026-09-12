from __future__ import annotations

import math
import re
from collections import Counter

from sqlalchemy.orm import Session

from citekit_server.calls.log import call_scope
from citekit_server.db import AiModelRow, ChunkRow, KnowledgeBaseRow, SourceRow
from citekit_server.kb.ingest import embedding_model, resolve_auth
from citekit_server.schemas import ChunkOut, SearchHit, SearchIn, SearchOut
from citekit_server.serialize import chunk_to_out
from citekit_server.infra.upstream import embed_texts, rerank_texts
from citekit_server.infra.vectors import search as vector_search


_PUNCT = re.compile(r"[\s\u3000，。；、：:！!？?（）()【】\[\]《》<>\"'“”‘’·\-—…]+")
_LATIN = re.compile(r"[a-z0-9]+")
_CJK_RUN = re.compile(r"[\u4e00-\u9fff]+")
BM25_K1 = 1.2
BM25_B = 0.75
RRF_K = 60
RETRIEVE_N = 50


def _blob(row: ChunkRow) -> str:
    bits = [row.title, row.text, row.answer or ""]
    if isinstance(row.indexes, list):
        for item in row.indexes:
            if isinstance(item, dict):
                bits.append(str(item.get("text") or ""))
            else:
                bits.append(str(item))
    return " ".join(bits)


def _analyze(text: str) -> list[str]:
    """Latin tokens + overlapping CJK bigrams (Lucene CJKAnalyzer)."""
    folded = _PUNCT.sub(" ", (text or "").strip().lower())
    terms = _LATIN.findall(folded)
    for run in _CJK_RUN.findall(folded):
        if len(run) == 1:
            terms.append(run)
        else:
            terms.extend(run[i : i + 2] for i in range(len(run) - 1))
    return terms


def _bm25(query: str, docs: dict[str, str]) -> dict[str, float]:
    q_terms = list(dict.fromkeys(_analyze(query)))
    if not q_terms or not docs:
        return {}
    analyzed = {cid: _analyze(text) for cid, text in docs.items()}
    n_docs = len(analyzed)
    avgdl = sum(len(tokens) for tokens in analyzed.values()) / n_docs
    df: dict[str, int] = {}
    for tokens in analyzed.values():
        for term in set(tokens):
            df[term] = df.get(term, 0) + 1
    scores: dict[str, float] = {}
    for cid, tokens in analyzed.items():
        tf_map = Counter(tokens)
        length = len(tokens) or 1
        score = 0.0
        for term in q_terms:
            freq = tf_map.get(term, 0)
            if not freq:
                continue
            n = df.get(term, 0)
            idf = math.log(1.0 + (n_docs - n + 0.5) / (n + 0.5))
            denom = freq + BM25_K1 * (1 - BM25_B + BM25_B * length / avgdl)
            score += idf * (freq * (BM25_K1 + 1) / denom)
        if score > 0:
            scores[cid] = score
    return scores


def _hit_label(kind: str, base: str) -> str:
    extra = {"child": "子块", "auto": "补充索引", "image": "图片", "title": "标题"}.get(kind)
    return f"{base} · {extra}" if extra else base


def _rank_map(scores: dict[str, float]) -> dict[str, int]:
    ordered = sorted(scores, key=lambda cid: scores[cid], reverse=True)
    return {cid: index + 1 for index, cid in enumerate(ordered)}


def _rrf_merge(
    keyword: dict[str, float],
    semantic: dict[str, tuple[float, str]],
    similarity: float,
    k: int = RRF_K,
) -> dict[str, tuple[float, str]]:
    kw_rank = _rank_map({cid: score for cid, score in keyword.items() if score > 0})
    sem_rank = _rank_map({cid: score for cid, (score, _) in semantic.items() if score >= similarity})
    if not kw_rank and not sem_rank:
        return {}
    scored: dict[str, tuple[float, str]] = {}
    for cid in set(kw_rank) | set(sem_rank):
        rrf = 0.0
        in_kw = cid in kw_rank
        in_sem = cid in sem_rank
        if in_kw:
            rrf += 1.0 / (k + kw_rank[cid])
        if in_sem:
            rrf += 1.0 / (k + sem_rank[cid])
        kind = semantic[cid][1] if in_sem else ""
        if in_kw and in_sem:
            base = "混合检索"
        elif in_kw:
            base = "全文检索"
        else:
            base = "语义检索"
        scored[cid] = (rrf, _hit_label(kind, base) if in_sem else base)
    return scored


def search_kb(db: Session, kb: KnowledgeBaseRow, body: SearchIn) -> SearchOut:
    query = (body.query or "").strip()
    if not query:
        return SearchOut(hits=[], message="请输入问题")
    source_q = db.query(SourceRow).filter(SourceRow.kb_id == kb.id, SourceRow.type != "folder")
    sources = source_q.all()
    if body.sourceIds is not None:
        wanted = set(body.sourceIds)
        if not wanted:
            return SearchOut(hits=[], message="请至少勾选一个数据集。")
        sources = [row for row in sources if row.id in wanted]
    source_ids = [row.id for row in sources]
    if not source_ids:
        return SearchOut(hits=[], message="该知识库还没有可检索的数据。请先导入集合并等待就绪。")

    chunks = (
        db.query(ChunkRow)
        .filter(ChunkRow.kb_id == kb.id, ChunkRow.source_id.in_(source_ids))
        .order_by(ChunkRow.position)
        .all()
    )
    if not chunks:
        return SearchOut(hits=[], message="该知识库还没有可检索的数据。请先导入集合并等待就绪。")

    warehouse = (body.warehouse or "").strip()
    if warehouse:
        chunks = [row for row in chunks if warehouse.lower() in _blob(row).lower()]
        if not chunks:
            return SearchOut(hits=[], message=f"仓库「{warehouse}」下没有可检索的数据。")

    by_id = {row.id: row for row in chunks}
    keyword: dict[str, float] = {}
    semantic: dict[str, tuple[float, str]] = {}
    mode = body.searchMode or "mix"
    pool_n = max(body.limit, RETRIEVE_N)

    if mode in {"fullText", "mix"}:
        scored_kw = _bm25(query, {row.id: _blob(row) for row in chunks})
        keyword = dict(sorted(scored_kw.items(), key=lambda item: item[1], reverse=True)[:pool_n])

    if mode in {"embedding", "mix"}:
        try:
            model = embedding_model(db, kb)
            with call_scope(purpose="retrieve", kb_id=kb.id):
                vector = embed_texts(model, resolve_auth(db, model), [query])[0]
            hits = vector_search(kb.id, vector, limit=pool_n, source_ids=source_ids)
        except Exception as exc:
            if mode == "embedding":
                return SearchOut(hits=[], message=str(exc) or "语义检索失败")
            hits = []
        for hit in hits:
            payload = hit.payload or {}
            cid = str(payload.get("chunk_id") or hit.id)
            if cid not in by_id:
                continue
            score = float(hit.score or 0)
            kind = str(payload.get("index_type") or "")
            prev = semantic.get(cid)
            if prev is None or score > prev[0]:
                semantic[cid] = (score, kind)

    if mode == "mix":
        scored = _rrf_merge(keyword, semantic, body.similarity)
        ranked = [
            (cid, score, note)
            for cid, (score, note) in sorted(scored.items(), key=lambda item: item[1][0], reverse=True)
        ]
    elif mode == "fullText":
        ranked = [(cid, score, "全文检索") for cid, score in keyword.items()]
    else:
        ranked = [
            (cid, score, _hit_label(kind, "语义检索"))
            for cid, (score, kind) in sorted(semantic.items(), key=lambda item: item[1][0], reverse=True)
            if score >= body.similarity
        ]
    if not ranked:
        return SearchOut(hits=[], message=f"低于相似度 {body.similarity}，无召回。可调低阈值再试。")

    if body.usingRerank and kb.rerank_model:
        rerank_row = db.get(AiModelRow, kb.rerank_model)
        if rerank_row and rerank_row.type == "rerank":
            window = ranked[:pool_n]
            docs = [
                f"{by_id[cid].text}\n{by_id[cid].answer}" if by_id[cid].answer else by_id[cid].text
                for cid, _, _ in window
                if cid in by_id
            ]
            window = [(cid, score, note) for cid, score, note in window if cid in by_id]
            try:
                with call_scope(purpose="rerank", kb_id=kb.id):
                    scores = rerank_texts(rerank_row, resolve_auth(db, rerank_row), query, docs)
                ranked = [
                    (window[i][0], float(scores[i]), "混合召回后重排")
                    for i in sorted(range(len(window)), key=lambda i: float(scores[i]), reverse=True)
                ]
            except Exception:
                pass

    ranked = ranked[: body.limit]
    return SearchOut(
        hits=[
            SearchHit(chunk=chunk_to_out(by_id[cid]), score=round(score, 6), note=note)
            for cid, score, note in ranked
            if cid in by_id
        ]
    )
