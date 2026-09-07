from __future__ import annotations

import html
import re
from pathlib import Path


SUPPORTED = {".txt", ".md", ".markdown", ".html", ".htm", ".csv", ".pdf", ".docx"}


def extract_text(path: str, name: str = "") -> str:
    suffix = Path(name or path).suffix.lower()
    file = Path(path)
    if suffix not in SUPPORTED:
        raise ValueError(f"暂不支持 {suffix or '该格式'}，请上传 PDF、Markdown、纯文本、HTML、CSV 或 Word")
    if suffix == ".pdf":
        return _pdf(file)
    if suffix == ".docx":
        return _docx(file)
    if suffix in {".html", ".htm"}:
        return _strip_html(_read_text(file))
    return _read_text(file)


def _read_text(file: Path) -> str:
    data = file.read_bytes()
    for enc in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _pdf(file: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(file))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    return "\n\n".join(part for part in pages if part)


def _docx(file: Path) -> str:
    from docx import Document

    doc = Document(str(file))
    return "\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip())


def _strip_html(raw: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p>", "\n\n", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"\n{3,}", "\n\n", text)).strip()
