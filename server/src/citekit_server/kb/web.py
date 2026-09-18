from __future__ import annotations

from collections import deque
from collections.abc import Iterator
from dataclasses import dataclass
import hashlib
import re
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup

from citekit_server.kb.parse import html_to_text

USER_AGENT = "CitekitBot/0.1 (+https://citekit.local)"
MAX_PAGES = 50
MAX_DEPTH = 3
MAX_HTML_CHARS = 1_200_000
MAX_LINKS_PER_PAGE = 80
_SKIN_RE = re.compile(r"(?is)<(script|style|noscript)\b[^>]*>.*?</\1>")
_TRAILING_SPACE_RE = re.compile(r"[ \t]+\n")
_MANY_NEWLINES_RE = re.compile(r"\n{3,}")
SKIP_EXT = {
    ".7z", ".avi", ".bmp", ".css", ".csv", ".doc", ".docx", ".gif", ".gz", ".ico", ".jpeg", ".jpg",
    ".js", ".json", ".mp3", ".mp4", ".pdf", ".png", ".ppt", ".pptx", ".rss", ".svg", ".tar", ".tgz",
    ".ttf", ".webp", ".woff", ".woff2", ".xls", ".xlsx", ".xml", ".zip",
}


@dataclass(frozen=True)
class CrawledPage:
    url: str
    title: str
    text: str
    etag: str = ""
    last_modified: str = ""


def canonical_text(text: str) -> str:
    """Make harmless rendering whitespace changes invisible to page versioning."""
    value = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    value = _TRAILING_SPACE_RE.sub("\n", value)
    return _MANY_NEWLINES_RE.sub("\n\n", value).strip()


def content_hash(text: str) -> str:
    return hashlib.sha256(canonical_text(text).encode("utf-8")).hexdigest()


def fetch_web(url: str, selector: str = "") -> str:
    target = normalize_url(url)
    if not target:
        raise RuntimeError("网页链接无效")
    _, html, _ = _get_html(target)
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
    return text[:MAX_HTML_CHARS] if len(text) > MAX_HTML_CHARS else text


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
    if "." in last and "." + last.rsplit(".", 1)[-1].lower() in SKIP_EXT:
        return None
    return urlunparse((parsed.scheme, parsed.netloc.lower(), path, "", parsed.query, ""))


def scope_prefix(root: str) -> tuple[str, str]:
    """Derive a document section boundary from an entry page.

    Documentation sites commonly use extension-less leaf routes.  For nested
    entries, crawl the containing directory so the entry page's sidebar can
    discover its sibling pages.  A one-segment path (``/guide``) is treated as
    an explicit section root; file-like URLs also use their parent directory.
    """
    parsed = urlparse(root)
    host, path = parsed.netloc.lower(), parsed.path or "/"
    if path in ("", "/"):
        return host, "/"
    if path.endswith("/"):
        return host, path
    segments = [part for part in path.split("/") if part]
    last = segments[-1]
    if len(segments) <= 1:
        return host, path + "/"
    parent = path[: path.rfind("/")] or "/"
    return host, "/" if parent == "/" else parent.rstrip("/") + "/"


def in_scope(root: str, url: str) -> bool:
    origin, target = urlparse(root), urlparse(url)
    if target.scheme not in ("http", "https") or target.netloc.lower() != origin.netloc.lower():
        return False
    _, prefix = scope_prefix(root)
    path = target.path or "/"
    if prefix == "/":
        return True
    stem = prefix.rstrip("/")
    return path == stem or path.startswith(prefix) or path.startswith(stem + "/")


def links_from(html: str, base: str, selector: str = "") -> list[str]:
    soup = BeautifulSoup(slim_html(html), "html.parser")
    query = (selector or "").strip()
    if query:
        containers = soup.select(query)
        if not containers:
            raise RuntimeError(f"链接选择器「{query}」没有匹配到内容")
        tags = [link for container in containers for link in container.find_all("a", href=True)]
    else:
        tags = soup.find_all("a", href=True)
    found: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        url = normalize_url(str(tag.get("href") or ""), base)
        if url and url not in seen:
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
    return (urlparse(url).path.rstrip("/").split("/")[-1] or urlparse(url).netloc)[:255]


def iter_site_pages(root: str, selector: str = "", link_selector: str = "", max_pages: int = MAX_PAGES, max_depth: int = MAX_DEPTH) -> Iterator[CrawledPage]:
    start = normalize_url(root)
    if not start:
        raise RuntimeError("网页链接无效")
    scope_root = (root or "").strip()
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
                final, html, headers = _get_html(url, client)
            except (httpx.HTTPError, RuntimeError):
                continue
            final_url = normalize_url(final, start) or url
            if not in_scope(scope_root, final_url):
                continue
            try:
                text = html_from(html, selector, base_url=final_url)
            except RuntimeError:
                _enqueue_links(queue, seen, html, final_url, scope_root, depth, max_depth, link_selector)
                continue
            yielded += 1
            yield CrawledPage(final_url, page_title(html, final_url), text, headers.get("etag", ""), headers.get("last-modified", ""))
            _enqueue_links(queue, seen, html, final_url, scope_root, depth, max_depth, link_selector)


def _enqueue_links(queue: deque[tuple[str, int]], seen: set[str], html: str, final_url: str, start: str, depth: int, max_depth: int, link_selector: str) -> None:
    if depth >= max_depth:
        return
    added = 0
    for link in links_from(html, final_url, link_selector):
        if added >= MAX_LINKS_PER_PAGE:
            break
        if link not in seen and in_scope(start, link):
            queue.append((link, depth + 1))
            added += 1


def http_status(url: str) -> int | None:
    """Return a definitive status only; transport failures remain unknown."""
    try:
        with httpx.Client(follow_redirects=True, timeout=15, headers={"User-Agent": USER_AGENT}) as client:
            response = client.get(url)
            return response.status_code
    except httpx.HTTPError:
        return None


def _get_html(url: str, client: httpx.Client | None = None) -> tuple[str, str, httpx.Headers]:
    if client is None:
        with httpx.Client(follow_redirects=True, timeout=25, headers={"User-Agent": USER_AGENT}) as own:
            return _get_html(url, own)
    response = client.get(url)
    response.raise_for_status()
    body = response.text or ""
    ctype, sniff = (response.headers.get("content-type") or "").lower(), body[:2000].lower()
    if "html" not in ctype and "<html" not in sniff and "<body" not in sniff:
        raise RuntimeError("不是 HTML 页面")
    return str(response.url), body, response.headers
