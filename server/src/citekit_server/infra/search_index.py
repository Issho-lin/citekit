"""OpenSearch-backed lexical index for knowledge-base chunks.

MySQL remains the authoritative source for chunk content.  OpenSearch is the
only lexical retrieval backend; it is synchronously updated on every chunk
lifecycle mutation and reconciled from MySQL at application startup.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from opensearchpy import OpenSearch, helpers

from citekit_server.config import settings
from citekit_server.kb.chunking import index_text

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from citekit_server.kb.tables import ChunkRow

_INDEX = "citekit_chunks_v2"
_BATCH = 500
_client: OpenSearch | None = None


def client() -> OpenSearch:
    global _client
    if _client is None:
        _client = OpenSearch(
            hosts=[settings.opensearch_url],
            timeout=20,
            max_retries=2,
            retry_on_timeout=True,
        )
    return _client


def _document(row: ChunkRow) -> dict[str, str]:
    index_parts = []
    if isinstance(row.indexes, list):
        for item in row.indexes:
            index_parts.append(str(item.get("text") or "") if isinstance(item, dict) else str(item))
    return {
        "chunk_id": row.id,
        "kb_id": row.kb_id,
        "source_id": row.source_id,
        "title": index_text(row.title or ""),
        "text": index_text(row.text or ""),
        "answer": index_text(row.answer or ""),
        "indexes": index_text(" ".join(index_parts)),
        "locator": row.locator or "",
    }


def ensure_index() -> None:
    q = client()
    try:
        if q.indices.exists(index=_INDEX):
            return
        q.indices.create(
            index=_INDEX,
            body={
                "settings": {
                    "number_of_shards": 1,
                    "number_of_replicas": 0,
                },
                "mappings": {
                    "dynamic": "strict",
                    "properties": {
                        "chunk_id": {"type": "keyword"},
                        "kb_id": {"type": "keyword"},
                        "source_id": {"type": "keyword"},
                        "title": {"type": "text", "analyzer": "cjk", "boost": 2.0},
                        "text": {"type": "text", "analyzer": "cjk"},
                        "answer": {"type": "text", "analyzer": "cjk", "boost": 1.2},
                        "indexes": {"type": "text", "analyzer": "cjk", "boost": 1.5},
                        "locator": {"type": "keyword", "index": False},
                    },
                },
            },
        )
    except Exception as exc:
        raise RuntimeError(f"OpenSearch 初始化索引失败：{exc}") from exc


def _require(operation: str, fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except Exception as exc:
        raise RuntimeError(f"OpenSearch {operation}失败：{exc}") from exc


def index_chunks(rows: list[ChunkRow]) -> None:
    if not rows:
        return
    ensure_index()
    actions = [{"_index": _INDEX, "_id": row.id, "_source": _document(row)} for row in rows]
    _require("写入索引", lambda: helpers.bulk(client(), actions, chunk_size=_BATCH, refresh="wait_for"))


def index_chunk(row: ChunkRow) -> None:
    index_chunks([row])


def delete_source(kb_id: str, source_id: str) -> None:
    ensure_index()
    _require(
        "删除索引",
        lambda: client().delete_by_query(
            index=_INDEX,
            body={"query": {"bool": {"filter": [{"term": {"kb_id": kb_id}}, {"term": {"source_id": source_id}}]}}},
            refresh=True,
            conflicts="proceed",
        ),
    )


def delete_kb(kb_id: str) -> None:
    ensure_index()
    _require(
        "删除索引",
        lambda: client().delete_by_query(
            index=_INDEX,
            body={"query": {"term": {"kb_id": kb_id}}},
            refresh=True,
            conflicts="proceed",
        ),
    )


def replace_source(rows: list[ChunkRow], *, kb_id: str, source_id: str) -> None:
    """Atomically from the caller's perspective: old lexical documents are removed,
    then every newly generated chunk is indexed before the source is marked synced.
    """
    delete_source(kb_id, source_id)
    index_chunks(rows)


def search(
    *, kb_id: str, query: str, limit: int, source_ids: list[str] | None = None, warehouse: str | None = None
) -> dict[str, float]:
    ensure_index()
    filters: list[dict[str, Any]] = [{"term": {"kb_id": kb_id}}]
    if source_ids is not None:
        filters.append({"terms": {"source_id": source_ids}})
    must: list[dict[str, Any]] = [
        {
            "multi_match": {
                "query": query,
                "fields": ["title^2", "text", "answer^1.2", "indexes^1.5"],
                "type": "best_fields",
                "operator": "or",
            }
        }
    ]
    if warehouse:
        must.append({"match_phrase": {"text": warehouse}})
    result = _require(
        "查询",
        lambda: client().search(
            index=_INDEX,
            body={
                "size": max(limit, 1),
                "track_total_hits": False,
                "query": {"bool": {"filter": filters, "must": must}},
                "sort": [{"_score": {"order": "desc"}}, {"chunk_id": {"order": "asc"}}],
            },
        ),
    )
    return {str(hit["_id"]): float(hit.get("_score") or 0.0) for hit in result["hits"]["hits"]}


def rebuild_from_mysql(db: Session) -> int:
    """Reconcile the physical index with MySQL on startup and after recovery."""
    from citekit_server.db import ChunkRow

    ensure_index()
    _require(
        "清空索引",
        lambda: client().delete_by_query(
            index=_INDEX, body={"query": {"match_all": {}}}, refresh=True, conflicts="proceed"
        ),
    )
    rows = db.query(ChunkRow).order_by(ChunkRow.id).all()
    index_chunks(rows)
    return len(rows)
