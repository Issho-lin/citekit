from __future__ import annotations

import re

from sqlalchemy.orm import Session

from citekit_server.call_log import call_scope
from citekit_server.db import AiModelRow, ChunkRow, KnowledgeBaseRow, SourceRow
from citekit_server.ingest import embedding_model, resolve_auth
from citekit_server.schemas import ChunkOut, SearchHit, SearchIn, SearchOut
from citekit_server.serialize import chunk_to_out
from citekit_server.upstream import embed_texts, rerank_texts
from citekit_server.vectors import search as vector_search


def _keyword_score(query: str, text: str) -> float:
    q = query.strip().lower()
    if not q:
        return 0.0
    t = text.lower()
    score = 0.0
    for token in q.split():
        if token and token in t:
            score += 0.28
    if q in t:
        score += 0.35
    compact = "".join(q.split())
    if re.search(r"[\u4e00-\u9fff]", compact):
        hits = sum(1 for i in range(len(compact) - 1) if compact[i : i + 2] in t)
        if hits:
            score += min(0.5, 0.08 * hits)
    return min(1.0, score)


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

    by_id = {row.id: row for row in chunks}
    scored: dict[str, tuple[float, str]] = {}
    mode = body.searchMode or "mix"

    if mode in {"fullText", "mix"}:
        for row in chunks:
            score = _keyword_score(query, f"{row.title} {row.text}")
            if score > 0:
                scored[row.id] = (score, "全文检索")

    if mode in {"embedding", "mix"}:
        try:
            model = embedding_model(db, kb)
            with call_scope(purpose="retrieve", kb_id=kb.id):
                vector = embed_texts(model, resolve_auth(db, model), [query])[0]
            hits = vector_search(kb.id, vector, limit=max(body.limit * 3, 20), source_ids=source_ids)
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
            prev = scored.get(cid)
            if prev:
                scored[cid] = ((prev[0] + score) / 2, "混合检索")
            else:
                scored[cid] = (score, "语义检索")

    ranked = sorted(scored.items(), key=lambda item: item[1][0], reverse=True)
    ranked = [(cid, score, note) for cid, (score, note) in ranked if score >= body.similarity]
    if not ranked:
        return SearchOut(hits=[], message=f"低于相似度 {body.similarity}，无召回。可调低阈值再试。")

    if body.usingRerank and kb.rerank_model:
        rerank_row = db.get(AiModelRow, kb.rerank_model)
        if rerank_row and rerank_row.type == "rerank":
            pool = ranked[: max(body.limit, 8)]
            docs = [by_id[cid].text for cid, _, _ in pool]
            try:
                with call_scope(purpose="rerank", kb_id=kb.id):
                    scores = rerank_texts(rerank_row, resolve_auth(db, rerank_row), query, docs)
                ranked = [
                    (cid, float(scores[i]), "混合召回后重排")
                    for i, (cid, _, _) in enumerate(pool)
                ]
                ranked.sort(key=lambda item: item[1], reverse=True)
            except Exception:
                pass

    ranked = ranked[: body.limit]
    return SearchOut(
        hits=[
            SearchHit(chunk=chunk_to_out(by_id[cid]), score=round(score, 4), note=note)
            for cid, score, note in ranked
            if cid in by_id
        ]
    )
