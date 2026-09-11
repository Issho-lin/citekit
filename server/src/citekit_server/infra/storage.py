from __future__ import annotations

import os
import tempfile
import time
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path

from minio import Minio
from minio.deleteobjects import DeleteObject
from minio.error import S3Error

from citekit_server.config import settings

_client: Minio | None = None


def client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _client


def object_key(kb_id: str, file_id: str, name: str) -> str:
    return f"{kb_id}/{file_id}/{Path(name).name}"


def ensure_bucket() -> None:
    minio = client()
    bucket = settings.minio_bucket
    last_error: Exception | None = None
    for attempt in range(8):
        try:
            if not minio.bucket_exists(bucket):
                minio.make_bucket(bucket)
            return
        except Exception as exc:
            last_error = exc
            time.sleep(0.4 * (attempt + 1))
    raise RuntimeError("无法连接 MinIO，请先执行 pnpm dev:db") from last_error


def object_stat(key: str):
    return client().stat_object(settings.minio_bucket, key)


def open_object(key: str):
    return client().get_object(settings.minio_bucket, key)


def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    ensure_bucket()
    client().put_object(
        settings.minio_bucket,
        key,
        BytesIO(data),
        length=len(data),
        content_type=content_type or "application/octet-stream",
    )


def delete_object(key: str) -> None:
    if not key:
        return
    local = Path(key)
    if local.is_file():
        import shutil

        shutil.rmtree(local.parent, ignore_errors=True)
        return
    try:
        client().remove_object(settings.minio_bucket, key)
    except S3Error:
        pass


def delete_prefix(prefix: str) -> None:
    if not prefix:
        return
    minio = client()
    bucket = settings.minio_bucket
    try:
        if not minio.bucket_exists(bucket):
            return
        objects = [
            DeleteObject(obj.object_name)
            for obj in minio.list_objects(bucket, prefix=prefix, recursive=True)
            if obj.object_name
        ]
        if not objects:
            return
        for _err in minio.remove_objects(bucket, objects):
            pass
    except S3Error:
        pass


@contextmanager
def as_local_path(stored: str | None, filename: str = ""):
    if not stored:
        yield None
        return
    local = Path(stored)
    if local.is_file():
        yield stored
        return
    suffix = Path(filename or stored).suffix
    fd, tmp = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        client().fget_object(settings.minio_bucket, stored, tmp)
        yield tmp
    except S3Error as exc:
        raise RuntimeError("原文件不存在或对象存储不可用") from exc
    finally:
        Path(tmp).unlink(missing_ok=True)


def migrate_local_uploads(rows: list) -> int:
    moved = 0
    for row in rows:
        local = Path(row.path)
        if not local.is_file():
            continue
        key = object_key(row.kb_id, row.id, row.name)
        put_bytes(key, local.read_bytes(), row.mime)
        import shutil

        shutil.rmtree(local.parent, ignore_errors=True)
        row.path = key
        moved += 1
    return moved
