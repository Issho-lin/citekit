from __future__ import annotations

import ipaddress
from functools import lru_cache

import httpx
from fastapi import Request

_HEADERS = ("cf-connecting-ip", "x-real-ip", "x-forwarded-for")


def ip_of(request: Request) -> str:
    for name in _HEADERS:
        raw = (request.headers.get(name) or "").strip()
        if not raw:
            continue
        candidate = raw.split(",")[0].strip()
        parsed = _parse_ip(candidate)
        if parsed:
            return parsed
    host = request.client.host if request.client else ""
    return _parse_ip(host) or (host or "")


def region_of(ip: str) -> str:
    text = (ip or "").strip()
    if not text:
        return ""
    local = _local_label(text)
    if local:
        return local
    return _lookup_region(text)


def caller_of(request: Request) -> tuple[str, str]:
    ip = ip_of(request)
    return ip, region_of(ip)


def _parse_ip(raw: str) -> str:
    text = (raw or "").strip().strip("[]")
    if text.lower().startswith("::ffff:"):
        text = text[7:]
    try:
        return str(ipaddress.ip_address(text))
    except ValueError:
        return ""


def _local_label(ip: str) -> str:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ""
    if addr.is_loopback:
        return "本机"
    if addr.is_private or addr.is_link_local or addr.is_reserved:
        return "内网"
    return ""


@lru_cache(maxsize=2048)
def _lookup_region(ip: str) -> str:
    try:
        response = httpx.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,country,regionName,city", "lang": "zh-CN"},
            timeout=1.2,
        )
        data = response.json()
    except Exception:
        return ""
    if not isinstance(data, dict) or data.get("status") != "success":
        return ""
    parts = [str(data.get(key) or "").strip() for key in ("country", "regionName", "city")]
    seen: list[str] = []
    for part in parts:
        if part and part not in seen:
            seen.append(part)
    return " · ".join(seen)
