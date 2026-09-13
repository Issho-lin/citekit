from __future__ import annotations

from collections import deque
from collections.abc import Iterator
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse, urlunparse
import re

import httpx
from bs4 import BeautifulSoup

from citekit_server.kb.parse import html_to_text

USER_AGENT = "CitekitBot/0.1 (+https://citekit.local)"
MAX_PAGES = 50
MAX_DEPTH = 3
MAX_HTML_CHARS = 1_200_000
MAX_LINKS_PER_PAGE = 80
_SKIN_RE = re.compile(r"(?is)<(script|style|noscript)\b[^>]*>.*?</\1>")
SKIP_EXT = {
    ".7z",
    ".avi",
    ".bmp",
    ".css",
    ".csv",
    ".doc",
    ".docx",
    ".gif",
    ".gz",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".json",
    ".mp3",
    ".mp4",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".rss",
    ".svg",
    ".tar",
    ".tgz",
    ".ttf",
    ".webp",
    ".woff",
    ".woff2",
    ".xls",
    ".xlsx",
    ".xml",
    ".zip",
}


@dataclass(frozen=True)
class CrawledPage:
    url: str
    title: str
    text: str


def fetch_web(url: str, selector: str = "") -> str:
    target = normalize_url(url)
    if not target:
        raise RuntimeError("网页链接无效")
    html = _get_html(target)
    return html_from(html, selector, base_url=target)


def html_from(raw: str, selector: str = "", base_url: str = "") -> str:
    soup = BeautifulSoup(slim_html(raw), "html.parser")
    query = (selector or "").strip()
    markup = str(soup)
    if query:
        found = soup.select(query)
        if not found:
            raise RuntimeError(f"选择器「{query}」没有匹配到内容")
        markup = "\n".join(str(node) for node in found)
    text = html_to_text(markup, base_url)
    if not text.strip():
        raise RuntimeError("网页没有可抽取的正文")
    return text


def slim_html(raw: str) -> str:
    text = _SKIN_RE.sub(" ", raw or "")
    if len(text) > MAX_HTML_CHARS:
        return text[:MAX_HTML_CHARS]
    return text


def normalize_url(url: str, base: str = "") -> str | None:
    raw = (url or "").strip()
    if not raw or raw.startswith(("#", "mailto:", "javascript:", "tel:", "data:")):
        return None
    joined = urljoin(base or raw, raw)
    parsed = urlparse(joined)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    last = path.rsplit("/", 1)[-1]
    if "." in last:
        ext = "." + last.rsplit(".", 1)[-1].lower()
        if ext in SKIP_EXT:
            return None
    return urlunparse((parsed.scheme, parsed.netloc.lower(), path, "", parsed.query, ""))


def scope_prefix(root: str) -> tuple[str, str]:
    parsed = urlparse(root)
    host = parsed.netloc.lower()
    path = parsed.path or "/"
    last = path.rstrip("/").rsplit("/", 1)[-1] if path not in ("", "/") else ""
    if last and "." in last:
        parent = path[: path.rfind("/")] or "/"
        prefix = "/" if parent in ("", "/") else parent.rstrip("/") + "/"
        return host, prefix
    if path in ("", "/"):
        return host, "/"
    prefix = path if path.endswith("/") else path + "/"
    return host, prefix


def in_scope(root: str, url: str) -> bool:
    origin = urlparse(root)
    target = urlparse(url)
    if target.scheme not in ("http", "https"):
        return False
    if target.netloc.lower() != origin.netloc.lower():
        return False
    _, prefix = scope_prefix(root)
    path = target.path or "/"
    if prefix == "/":
        return True
    stem = prefix.rstrip("/")
    return path == stem or path.startswith(prefix) or path.startswith(stem + "/")


def links_from(html: str, base: str) -> list[str]:
    soup = BeautifulSoup(slim_html(html), "html.parser")
    found: list[str] = []
    seen: set[str] = set()
    for tag in soup.find_all("a", href=True):
        href = str(tag.get("href") or "")
        url = normalize_url(href, base)
        if not url or url in seen:
            continue
        seen.add(url)
        found.append(url)
    return found


def page_title(html: str, url: str) -> str:
    soup = BeautifulSoup(slim_html(html), "html.parser")
    if soup.title and soup.title.string:
        title = " ".join(soup.title.string.split())
        if title:
            return title[:255]
    heading = soup.find("h1")
    if heading:
        title = " ".join(heading.get_text(" ").split())
        if title:
            return title[:255]
    path = urlparse(url).path.rstrip("/").split("/")[-1]
    return (path or urlparse(url).netloc)[:255]


def crawl_site(
    root: str,
    selector: str = "",
    max_pages: int = MAX_PAGES,
    max_depth: int = MAX_DEPTH,
) -> list[CrawledPage]:
    return list(iter_site_pages(root, selector=selector, max_pages=max_pages, max_depth=max_depth))


def iter_site_pages(
    root: str,
    selector: str = "",
    max_pages: int = MAX_PAGES,
    max_depth: int = MAX_DEPTH,
) -> Iterator[CrawledPage]:
    start = normalize_url(root)
    if not start:
        raise RuntimeError("网页链接无效")
    queue: deque[tuple[str, int]] = deque([(start, 0)])
    seen: set[str] = set()
    yielded = 0
    with httpx.Client(follow_redirects=True, timeout=15, headers={"User-Agent": USER_AGENT}) as client:
        while queue and yielded < max_pages:
            url, depth = queue.popleft()
            if url in seen:
                continue
            seen.add(url)
            try:
                final, html = _get_html_with(client, url)
            except (httpx.HTTPError, RuntimeError):
                continue
            final_url = normalize_url(final, start) or url
            if not in_scope(start, final_url):
                continue
            try:
                text = html_from(html, selector, base_url=final_url)
            except RuntimeError:
                _enqueue_links(queue, seen, html, final_url, start, depth, max_depth)
                continue
            yielded += 1
            yield CrawledPage(url=final_url, title=page_title(html, final_url), text=text)
            _enqueue_links(queue, seen, html, final_url, start, depth, max_depth)


def _enqueue_links(
    queue: deque[tuple[str, int]],
    seen: set[str],
    html: str,
    final_url: str,
    start: str,
    depth: int,
    max_depth: int,
) -> None:
    if depth >= max_depth:
        return
    added = 0
    for link in links_from(html, final_url):
        if added >= MAX_LINKS_PER_PAGE:
            break
        if link in seen or not in_scope(start, link):
            continue
        queue.append((link, depth + 1))
        added += 1


def _get_html(url: str) -> str:
    with httpx.Client(follow_redirects=True, timeout=25, headers={"User-Agent": USER_AGENT}) as client:
        _, html = _get_html_with(client, url)
        return html


def _get_html_with(client: httpx.Client, url: str) -> tuple[str, str]:
    response = client.get(url)
    response.raise_for_status()
    ctype = (response.headers.get("content-type") or "").lower()
    body = response.text or ""
    sniff = body[:2000].lower()
    if "html" not in ctype and "<html" not in sniff and "<body" not in sniff:
        raise RuntimeError("不是 HTML 页面")
    return str(response.url), body
