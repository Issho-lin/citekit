from __future__ import annotations

from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, FieldCondition, Filter, FilterSelector, MatchAny, MatchValue, PointStruct, VectorParams

from citekit_server.config import settings

_client: QdrantClient | None = None


def client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.qdrant_url, timeout=20)
    return _client


def collection_name(kb_id: str) -> str:
    return kb_id


def ensure_collection(kb_id: str, dim: int) -> None:
    name = collection_name(kb_id)
    q = client()
    if q.collection_exists(name):
        info = q.get_collection(name)
        current = info.config.params.vectors
        size = getattr(current, "size", None)
        if size == dim:
            return
        q.delete_collection(name)
    q.create_collection(name, vectors_config=VectorParams(size=dim, distance=Distance.COSINE))


UPSERT_BATCH = 64


def upsert_points(kb_id: str, dim: int, points: list[PointStruct]) -> None:
    if not points:
        return
    ensure_collection(kb_id, dim)
    q = client()
    name = collection_name(kb_id)
    for i in range(0, len(points), UPSERT_BATCH):
        q.upsert(collection_name=name, points=points[i : i + UPSERT_BATCH])


def delete_source_points(kb_id: str, source_id: str) -> None:
    name = collection_name(kb_id)
    q = client()
    if not q.collection_exists(name):
        return
    q.delete(
        collection_name=name,
        points_selector=FilterSelector(
            filter=Filter(must=[FieldCondition(key="source_id", match=MatchValue(value=source_id))])
        ),
    )


def delete_chunk_points(kb_id: str, chunk_id: str) -> None:
    name = collection_name(kb_id)
    q = client()
    if not q.collection_exists(name):
        return
    q.delete(
        collection_name=name,
        points_selector=FilterSelector(
            filter=Filter(must=[FieldCondition(key="chunk_id", match=MatchValue(value=chunk_id))])
        ),
    )


def delete_points(kb_id: str, ids: list[str]) -> None:
    if not ids:
        return
    name = collection_name(kb_id)
    q = client()
    if not q.collection_exists(name):
        return
    q.delete(collection_name=name, points_selector=ids)


def drop_kb(kb_id: str) -> None:
    name = collection_name(kb_id)
    q = client()
    if q.collection_exists(name):
        q.delete_collection(name)


def search(
    kb_id: str,
    vector: list[float],
    limit: int,
    source_ids: list[str] | None = None,
) -> list[Any]:
    name = collection_name(kb_id)
    q = client()
    if not q.collection_exists(name):
        return []
    query_filter = None
    if source_ids:
        query_filter = Filter(must=[FieldCondition(key="source_id", match=MatchAny(any=source_ids))])
    result = q.query_points(
        collection_name=name,
        query=vector,
        query_filter=query_filter,
        limit=max(limit, 1),
        with_payload=True,
    )
    return list(result.points)
