from __future__ import annotations

import httpx
from bs4 import BeautifulSoup

from citekit_server.kb.parse import html_to_text


def fetch_web(url: str, selector: str = "") -> str:
    target = (url or "").strip()
    if not target.startswith(("http://", "https://")):
        raise RuntimeError("网页链接无效")
    try:
        response = httpx.get(
            target,
            follow_redirects=True,
            timeout=25,
            headers={"User-Agent": "CitekitBot/0.1 (+https://citekit.local)"},
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"无法读取网页：{exc}") from exc
    return html_from(response.text, selector)


def html_from(raw: str, selector: str = "") -> str:
    soup = BeautifulSoup(raw or "", "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    query = (selector or "").strip()
    markup = str(soup)
    if query:
        found = soup.select(query)
        if not found:
            raise RuntimeError(f"选择器「{query}」没有匹配到内容")
        markup = "\n".join(str(node) for node in found)
    text = html_to_text(markup)
    if not text.strip():
        raise RuntimeError("网页没有可抽取的正文")
    return text
