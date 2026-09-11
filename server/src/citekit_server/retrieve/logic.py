from __future__ import annotations

import re

from sqlalchemy.orm import Session

from citekit_server.calls.log import call_scope
from citekit_server.db import AiModelRow, ChunkRow, KnowledgeBaseRow, SourceRow
from citekit_server.kb.ingest import embedding_model, resolve_auth
from citekit_server.schemas import ChunkOut, SearchHit, SearchIn, SearchOut
from citekit_server.serialize import chunk_to_out
from citekit_server.infra.upstream import embed_texts, rerank_texts
from citekit_server.infra.vectors import search as vector_search


def _blob(row: ChunkRow) -> str:
    bits = [row.title, row.text, row.answer or ""]
    if isinstance(row.indexes, list):
        for item in row.indexes:
            if isinstance(item, dict):
                bits.append(str(item.get("text") or ""))
            else:
                bits.append(str(item))
    return " ".join(bits)


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


def _hit_label(kind: str, base: str) -> str:
    extra = {"child": "子块", "auto": "补充索引", "image": "图片"}.get(kind)
    return f"{base} · {extra}" if extra else base


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

    if mode in {"fullText", "mix"}:
        for row in chunks:
            score = _keyword_score(query, _blob(row))
            if score > 0:
                keyword[row.id] = score

    if mode in {"embedding", "mix"}:
        try:
            model = embedding_model(db, kb)
            with call_scope(purpose="retrieve", kb_id=kb.id):
                vector = embed_texts(model, resolve_auth(db, model), [query])[0]
            hits = vector_search(kb.id, vector, limit=max(body.limit * 8, 48), source_ids=source_ids)
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

    scored: dict[str, tuple[float, str]] = {cid: (score, "全文检索") for cid, score in keyword.items()}
    for cid, (score, kind) in semantic.items():
        prev = scored.get(cid)
        if prev:
            scored[cid] = (max(prev[0], score), _hit_label(kind, "混合检索"))
        else:
            scored[cid] = (score, _hit_label(kind, "语义检索"))

    ranked = sorted(scored.items(), key=lambda item: item[1][0], reverse=True)
    ranked = [(cid, score, note) for cid, (score, note) in ranked if score >= body.similarity]
    if not ranked:
        return SearchOut(hits=[], message=f"低于相似度 {body.similarity}，无召回。可调低阈值再试。")

    lexical = [
        cid
        for cid, score in sorted(keyword.items(), key=lambda item: item[1], reverse=True)
        if score >= body.similarity
    ][: max(body.limit, 5)]

    if body.usingRerank and kb.rerank_model:
        rerank_row = db.get(AiModelRow, kb.rerank_model)
        if rerank_row and rerank_row.type == "rerank":
            pool: list[tuple[str, float, str]] = []
            seen: set[str] = set()
            for cid, score, note in ranked[: max(body.limit * 2, 8)]:
                if cid in seen:
                    continue
                pool.append((cid, score, note))
                seen.add(cid)
            for cid in lexical:
                if cid in seen:
                    continue
                pool.append((cid, keyword[cid], "全文检索"))
                seen.add(cid)
            docs = [
                f"{by_id[cid].text}\n{by_id[cid].answer}" if by_id[cid].answer else by_id[cid].text
                for cid, _, _ in pool
            ]
            try:
                with call_scope(purpose="rerank", kb_id=kb.id):
                    scores = rerank_texts(rerank_row, resolve_auth(db, rerank_row), query, docs)
                ranked = [
                    (pool[i][0], pool[i][1], "混合召回后重排")
                    for i in sorted(
                        range(len(pool)),
                        key=lambda i: float(scores[i]),
                        reverse=True,
                    )
                ]
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
