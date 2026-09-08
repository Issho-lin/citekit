from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from pathlib import Path


SUPPORTED = {".txt", ".md", ".markdown", ".html", ".htm", ".csv", ".pdf", ".docx"}


@dataclass
class ParseOut:
    text: str
    images: list[bytes] = field(default_factory=list)
    page_pngs: list[bytes] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def extract_text(path: str, name: str = "") -> str:
    return parse_file(path, name).text


def parse_file(path: str, name: str = "", *, render_pages: bool = False, collect_images: bool = False) -> ParseOut:
    suffix = Path(name or path).suffix.lower()
    file = Path(path)
    if suffix not in SUPPORTED:
        raise ValueError(f"暂不支持 {suffix or '该格式'}，请上传 PDF、Markdown、纯文本、HTML、CSV 或 Word")
    if suffix == ".pdf":
        return _pdf(file, render_pages=render_pages, collect_images=collect_images)
    if suffix == ".docx":
        return _docx(file, collect_images=collect_images)
    if suffix in {".html", ".htm"}:
        return ParseOut(text=_strip_html(_read_text(file)))
    return ParseOut(text=_read_text(file))


def _read_text(file: Path) -> str:
    data = file.read_bytes()
    for enc in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _pdf(file: Path, *, render_pages: bool, collect_images: bool) -> ParseOut:
    images: list[bytes] = []
    page_pngs: list[bytes] = []
    text = ""
    try:
        import fitz

        doc = fitz.open(str(file))
        pages: list[str] = []
        for page in doc:
            pages.append((page.get_text("text") or "").strip())
            if render_pages:
                pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
                page_pngs.append(pix.tobytes("png"))
            if collect_images:
                for item in page.get_images(full=True):
                    xref = int(item[0])
                    try:
                        extracted = doc.extract_image(xref)
                    except Exception:
                        continue
                    blob = extracted.get("image") if isinstance(extracted, dict) else None
                    if isinstance(blob, (bytes, bytearray)) and len(blob) > 400:
                        images.append(bytes(blob))
        doc.close()
        text = "\n\n".join(part for part in pages if part)
    except Exception:
        from pypdf import PdfReader

        reader = PdfReader(str(file))
        text = "\n\n".join((page.extract_text() or "").strip() for page in reader.pages if (page.extract_text() or "").strip())
    return ParseOut(text=text, images=_dedupe_blobs(images), page_pngs=page_pngs)


def _docx(file: Path, *, collect_images: bool) -> ParseOut:
    from docx import Document

    doc = Document(str(file))
    lines: list[str] = []
    for paragraph in doc.paragraphs:
        raw = (paragraph.text or "").strip()
        if not raw:
            continue
        level = _docx_heading_level(paragraph)
        lines.append(f"{'#' * min(level, 6)} {raw}" if level else raw)
    text = "\n".join(lines)
    images: list[bytes] = []
    if collect_images:
        for rel in doc.part.rels.values():
            if "image" not in (rel.reltype or ""):
                continue
            try:
                blob = rel.target_part.blob
            except Exception:
                continue
            if blob and len(blob) > 400:
                images.append(bytes(blob))
    return ParseOut(text=text, images=_dedupe_blobs(images))


def _docx_heading_level(paragraph: object) -> int | None:
    p_pr = getattr(getattr(paragraph, "_p", None), "pPr", None)
    if p_pr is not None:
        from docx.oxml.ns import qn

        outline = p_pr.find(qn("w:outlineLvl"))
        if outline is not None:
            val = outline.get(qn("w:val"))
            if val is not None and str(val).isdigit():
                level = int(val) + 1
                if 1 <= level <= 6:
                    return level
    style = getattr(paragraph, "style", None)
    name = str(getattr(style, "name", "") or "").strip()
    match = re.match(r"(?:Heading|标题)\s*(\d+)\s*$", name, re.I)
    if match:
        return int(match.group(1))
    if re.fullmatch(r"(?:Title|标题)", name, re.I):
        return 1
    return None


def _strip_html(raw: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)

    def heading(match: re.Match[str]) -> str:
        inner = re.sub(r"(?s)<[^>]+>", "", match.group(2))
        inner = html.unescape(inner).strip()
        if not inner:
            return "\n"
        return f"\n{'#' * int(match.group(1))} {inner}\n"

    text = re.sub(r"(?is)<h([1-6])[^>]*>(.*?)</h\1>", heading, text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</p>", "\n\n", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"\n{3,}", "\n\n", text)).strip()


def _dedupe_blobs(items: list[bytes]) -> list[bytes]:
    seen: set[bytes] = set()
    out: list[bytes] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
        if len(out) >= 24:
            break
    return out
