from __future__ import annotations

from sqlalchemy.orm import Session

from citekit_server.calls.log import call_scope
from citekit_server.db import AiModelRow, ChunkRow, KnowledgeBaseRow, SourceRow
from citekit_server.kb.ingest import embedding_model, resolve_auth
from citekit_server.schemas import HitTrace, SearchDebug, SearchDropped, SearchHit, SearchIn, SearchOut
from citekit_server.serialize import chunk_to_out
from citekit_server.infra.search_index import search as lexical_search
from citekit_server.infra.upstream import embed_texts, rerank_texts
from citekit_server.infra.vectors import search as vector_search


RRF_K = 60
RETRIEVE_N = 50

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


def _trace_maps(
    keyword: dict[str, float],
    semantic: dict[str, tuple[float, str]],
    similarity: float,
    fused: list[tuple[str, float, str]],
) -> tuple[dict[str, int], dict[str, int], dict[str, int], set[str]]:
    lex_rank = _rank_map(keyword)
    vec_rank = _rank_map({cid: score for cid, (score, _) in semantic.items()})
    fused_rank = {cid: index + 1 for index, (cid, _, _) in enumerate(fused)}
    dropped_vec = {cid for cid, (score, _) in semantic.items() if score < similarity}
    return lex_rank, vec_rank, fused_rank, dropped_vec


def _hit_trace(
    cid: str,
    *,
    keyword: dict[str, float],
    semantic: dict[str, tuple[float, str]],
    lex_rank: dict[str, int],
    vec_rank: dict[str, int],
    fused_rank: dict[str, int],
    dropped_vec: set[str],
    fused_scores: dict[str, float],
    rerank_scores: dict[str, float],
) -> HitTrace:
    vec_score, vec_kind = semantic.get(cid, (None, ""))
    return HitTrace(
        lexicalRank=lex_rank.get(cid),
        lexicalScore=round(keyword[cid], 6) if cid in keyword else None,
        vectorRank=vec_rank.get(cid),
        vectorScore=round(vec_score, 6) if vec_score is not None else None,
        vectorKind=vec_kind or "",
        vectorDropped=cid in dropped_vec,
        fusedRank=fused_rank.get(cid),
        fusedScore=round(fused_scores[cid], 6) if cid in fused_scores else None,
        rerankScore=round(rerank_scores[cid], 6) if cid in rerank_scores else None,
    )


def _search_debug(
    by_id: dict[str, ChunkRow],
    keyword: dict[str, float],
    semantic: dict[str, tuple[float, str]],
    similarity: float,
    fused: list[tuple[str, float, str]],
    final_ids: set[str],
    reranked: bool,
    vector_error: str | None = None,
) -> SearchDebug:
    lex_rank, vec_rank, fused_rank, dropped_vec = _trace_maps(keyword, semantic, similarity, fused)
    dropped: list[SearchDropped] = []
    seen: set[str] = set()

    def add(cid: str, reason: str) -> None:
        if cid in seen or cid in final_ids or cid not in by_id or len(dropped) >= 8:
            return
        seen.add(cid)
        row = by_id[cid]
        vec = semantic.get(cid)
        dropped.append(
            SearchDropped(
                title=(row.title or "")[:80],
                locator=row.locator or "",
                reason=reason,
                lexicalRank=lex_rank.get(cid),
                vectorRank=vec_rank.get(cid),
                vectorScore=round(vec[0], 6) if vec else None,
            )
        )

    for cid in sorted(dropped_vec, key=lambda item: semantic[item][0], reverse=True):
        add(cid, f"向量 {semantic[cid][0]:.4f} 低于阈值 {similarity:g}")
    for cid, _, _ in fused:
        if fused_rank.get(cid, 0) > 0 and cid not in final_ids:
            add(cid, f"融合第 {fused_rank[cid]}，未进入本次返回")
    return SearchDebug(
        lexicalCount=len(keyword),
        vectorCount=len(semantic),
        vectorDroppedCount=len(dropped_vec),
        fusedCount=len(fused),
        reranked=reranked,
        vectorError=vector_error,
        dropped=dropped,
    )


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
    if not db.query(ChunkRow.id).filter(ChunkRow.kb_id == kb.id, ChunkRow.source_id.in_(source_ids)).first():
        return SearchOut(hits=[], message="该知识库还没有可检索的数据。请先导入集合并等待就绪。")

    keyword: dict[str, float] = {}
    semantic: dict[str, tuple[float, str]] = {}
    vector_error: str | None = None
    mode = body.searchMode or "mix"
    pool_n = max(body.limit, RETRIEVE_N)
    warehouse = (body.warehouse or "").strip()

    if mode in {"fullText", "mix"}:
        # OpenSearch is the sole lexical backend. There is intentionally no
        # Python/MySQL scan fallback: a failed search backend is a visible error.
        try:
            keyword = lexical_search(
                kb_id=kb.id,
                query=query,
                limit=pool_n,
                source_ids=source_ids,
                warehouse=warehouse or None,
            )
        except RuntimeError as exc:
            return SearchOut(hits=[], message=str(exc))

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
            vector_error = str(exc) or "语义检索失败"
        for hit in hits:
            payload = hit.payload or {}
            cid = str(payload.get("chunk_id") or hit.id)
            score = float(hit.score or 0)
            kind = str(payload.get("index_type") or "")
            prev = semantic.get(cid)
            if prev is None or score > prev[0]:
                semantic[cid] = (score, kind)

    candidate_ids = set(keyword) | set(semantic)
    by_id = {
        row.id: row
        for row in db.query(ChunkRow)
        .filter(ChunkRow.kb_id == kb.id, ChunkRow.source_id.in_(source_ids), ChunkRow.id.in_(candidate_ids or {""}))
        .all()
    }
    # Vector search uses Qdrant filters; preserve the existing warehouse behavior
    # by applying its text predicate to vector candidates before fusion.
    if warehouse:
        lowered = warehouse.lower()
        semantic = {
            cid: item
            for cid, item in semantic.items()
            if cid in by_id and lowered in " ".join(
                [by_id[cid].title, by_id[cid].text, by_id[cid].answer or "", str(by_id[cid].indexes or "")]
            ).lower()
        }
    keyword = {cid: score for cid, score in keyword.items() if cid in by_id}

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
    fused = list(ranked)
    if not ranked:
        debug = (
            _search_debug(by_id, keyword, semantic, body.similarity, fused, set(), False, vector_error)
            if body.debug
            else None
        )
        if mode == "fullText":
            empty_msg = "没有匹配的全文结果。"
        else:
            empty_msg = (
                f"向量检索失败：{vector_error}"
                if vector_error
                else f"低于相似度 {body.similarity}，无召回。可调低阈值再试。"
            )
        return SearchOut(
            hits=[],
            message=empty_msg,
            debug=debug,
        )

    reranked = False
    rerank_scores: dict[str, float] = {}
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
                rerank_scores = {window[i][0]: float(scores[i]) for i in range(len(window))}
                ranked = [
                    (window[i][0], float(scores[i]), "混合召回后重排")
                    for i in sorted(range(len(window)), key=lambda i: float(scores[i]), reverse=True)
                ]
                reranked = True
            except Exception:
                pass

    final = ranked[: body.limit]
    traces: dict[str, HitTrace] = {}
    debug = None
    if body.debug:
        lex_rank, vec_rank, fused_rank, dropped_vec = _trace_maps(
            keyword, semantic, body.similarity, fused
        )
        fused_scores = {cid: score for cid, score, _ in fused}
        traces = {
            cid: _hit_trace(
                cid,
                keyword=keyword,
                semantic=semantic,
                lex_rank=lex_rank,
                vec_rank=vec_rank,
                fused_rank=fused_rank,
                dropped_vec=dropped_vec,
                fused_scores=fused_scores,
                rerank_scores=rerank_scores,
            )
            for cid, _, _ in final
        }
        debug = _search_debug(
            by_id,
            keyword,
            semantic,
            body.similarity,
            fused,
            {cid for cid, _, _ in final},
            reranked,
            vector_error,
        )
    return SearchOut(
        hits=[
            SearchHit(
                chunk=chunk_to_out(by_id[cid]),
                score=round(score, 6),
                note=note,
                trace=traces.get(cid),
            )
            for cid, score, note in final
            if cid in by_id
        ],
        debug=debug,
    )
