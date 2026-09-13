from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from citekit_server.schemas import ProcessConfigIn

_MD_HEADING = re.compile(r"^(#{1,6})\s+\S")
_CN_NUM = r"[一二三四五六七八九十百千零〇两0-9]+"
_CHAPTER = re.compile(rf"^第{_CN_NUM}(章|编|部分)\b")
_SECTION = re.compile(rf"^第{_CN_NUM}节\b")
_ARTICLE = re.compile(rf"^第{_CN_NUM}条\b")
_DOT_NUM = re.compile(r"^(\d+(?:\.\d+){1,5})\s+\S")
_ITEM_NUM = re.compile(r"^\d+[、.．]\s*\S")
_CN_ITEM = re.compile(rf"^{_CN_NUM}、\S")
_CN_PAREN = re.compile(rf"^[（(]{_CN_NUM}[）)]")
_MD_IMAGE = re.compile(r"!\[([^\]]*?)\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]*?)\]\([^)]*\)")
_ZW = re.compile(r"[\u200b\u200c\u200d\ufeff]")


def index_text(text: str) -> str:
    """Text used for embedding and BM25: unwrap links/images, keep other markdown."""
    out = _MD_IMAGE.sub(lambda match: match.group(1).strip(), text or "")
    return _MD_LINK.sub(lambda match: match.group(1).strip(), out)


def index_label(line: str) -> str:
    text = _ZW.sub("", (line or "").strip())
    text = re.sub(r"^#{1,6}\s+", "", text)
    text = index_text(text)
    return re.sub(r"[ \t]+", " ", text).strip()


_SENTENCE_END = re.compile(r"[。；;！？!?：:]$")
_INLINE_HEADING = re.compile(
    rf"(?<=[。！？；!?;])\s*(?=第{_CN_NUM}(章|编|部分|节|条)\b|#{{1,6}}\s+\S)"
)


def process_size(cfg: ProcessConfigIn | None = None) -> tuple[int, int]:
    data = cfg or ProcessConfigIn()
    raw = int(data.chunkSize if data.chunkSize is not None else 1000)
    if raw <= 0:
        return 0, 0
    size = max(raw, 64)
    overlap = min(max(int(data.chunkOverlap or 0), 0), size // 2)
    return size, overlap


def index_size_of(cfg: ProcessConfigIn | None = None) -> int:
    data = cfg or ProcessConfigIn()
    size, _ = process_size(data)
    if (
        data.trainingType == "qa"
        or data.qaEnhance
        or data.chunkSettingMode != "custom"
        or not data.useChildIndex
    ):
        return size
    child = int(data.indexSize or 512)
    if size <= 0:
        return max(64, child)
    return max(64, min(child, size))


def heading_level(line: str) -> int | None:
    text = (line or "").strip()
    if not text:
        return None
    md = _MD_HEADING.match(text)
    if md:
        return len(md.group(1))
    if _CHAPTER.match(text):
        return 1
    if _SECTION.match(text):
        return 2
    if _ARTICLE.match(text):
        return 3
    dotted = _DOT_NUM.match(text)
    if dotted and len(text) <= 80 and not _SENTENCE_END.search(text):
        return min(1 + dotted.group(1).count("."), 6)
    if _ITEM_NUM.match(text) and len(text) <= 30 and not _SENTENCE_END.search(text):
        return 4
    if _CN_ITEM.match(text) and len(text) <= 30 and not _SENTENCE_END.search(text):
        return 4
    if _CN_PAREN.match(text) and len(text) <= 30 and not _SENTENCE_END.search(text):
        return 2
    return None


def has_heading(text: str, deep: int = 5) -> bool:
    depth = max(1, min(int(deep or 5), 8))
    return any((heading_level(line) or 99) <= depth for line in (text or "").splitlines())


def has_markdown_heading(text: str, deep: int = 5) -> bool:
    return has_heading(text, deep)


def should_split(text: str, cfg: ProcessConfigIn, llm_max_context: int | None = None) -> bool:
    body = (text or "").strip()
    if cfg.trainingType == "qa" or cfg.qaEnhance:
        return True
    if cfg.chunkTriggerType == "forceChunk":
        return True
    if cfg.chunkTriggerType == "maxSize":
        limit = max(int((llm_max_context or 8000) * 0.7), 256)
        return len(body) > limit
    return len(body) > max(int(cfg.chunkTriggerMinSize or 100), 1)


def split_parents(
    text: str,
    process: ProcessConfigIn | None = None,
    *,
    llm_max_context: int | None = None,
    ai_parts: list[str] | None = None,
) -> list[str]:
    """Cut the document into parent chunks.

    Shared: trigger (whether to split at all) and QA windowing.
    Then one of three strategies owns the rest — they do not share a pack/fit pipeline:
    - paragraph: headings / blank lines / model parts, then cap or pack
    - size: sliding windows of chunkSize
    - char: split on delimiters, then cap oversized pieces
    """
    body = (text or "").strip()
    if not body:
        return []
    cfg = process or ProcessConfigIn()
    size, overlap = process_size(cfg)
    body = _prepare_text(body)
    if not should_split(body, cfg, llm_max_context):
        return [body]
    if cfg.trainingType == "qa" or cfg.qaEnhance:
        window = size or 8000
        return _window(body, window, min(overlap or 200, window // 4))
    mode = cfg.chunkSplitMode if cfg.chunkSettingMode == "custom" else "paragraph"
    if mode == "size":
        return _split_by_size(body, size, overlap)
    if mode == "char":
        return _split_by_delimiter(body, cfg, size, overlap=0)
    return _split_by_paragraph(body, cfg, size, 0, ai_parts)


def _split_by_size(body: str, size: int, overlap: int) -> list[str]:
    return _window(body, size or 1000, overlap)


def _split_by_delimiter(body: str, cfg: ProcessConfigIn, size: int, overlap: int) -> list[str]:
    spec = cfg.chunkSplitter or cfg.customSplit or "\n"
    parts = _split_by_signs(body, spec)
    return _fit_parts(parts, size, overlap) or [body]


def _split_by_paragraph(
    body: str,
    cfg: ProcessConfigIn,
    size: int,
    overlap: int,
    ai_parts: list[str] | None,
) -> list[str]:
    parts = _paragraph_parts(body, cfg, ai_parts)
    if size <= 0:
        return parts or [body]
    deep = int(cfg.paragraphChunkDeep or 5) if cfg.chunkSettingMode == "custom" else 5
    if ai_parts or has_heading(body, deep):
        return _fit_parts(parts, size, overlap) or [body]
    return _pack(parts, size, overlap) or [body]


def child_indexes(parent: str, cfg: ProcessConfigIn | None = None) -> list[str]:
    data = cfg or ProcessConfigIn()
    if data.trainingType == "qa" or data.qaEnhance:
        return []
    if data.chunkSettingMode != "custom" or not data.useChildIndex:
        return []
    size, _overlap = process_size(data)
    child = index_size_of(data)
    if child <= 0:
        return []
    if size > 0 and child >= size:
        return []
    plain = index_text(parent)
    if len(plain) <= child:
        return []
    packed = _pack(_split_for_index(plain, child), child, 0)
    if len(packed) <= 1:
        return []
    return packed


def _paragraph_parts(
    body: str,
    cfg: ProcessConfigIn,
    ai_parts: list[str] | None,
) -> list[str]:
    if ai_parts:
        return [part for part in (_prepare_text(item) for item in ai_parts) if part]
    deep = int(cfg.paragraphChunkDeep or 5) if cfg.chunkSettingMode == "custom" else 5
    if has_heading(body, deep):
        return _attach_lonely_headings(split_heading_sections(body, deep))
    parts = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in body.split("\n") if p.strip()]
    return parts or [body]


def split_heading_sections(text: str, deep: int) -> list[str]:
    depth = max(1, min(int(deep or 5), 8))
    buckets: list[list[str]] = [[]]
    for line in _prepare_text(text).splitlines():
        level = heading_level(line)
        if level is not None and level <= depth and buckets[-1]:
            buckets.append([line])
        else:
            buckets[-1].append(line)
    parts = ["\n".join(bucket).strip() for bucket in buckets]
    return [part for part in parts if part]


def _title_only_line(line: str) -> bool:
    text = (line or "").strip()
    if not text or heading_level(text) is None:
        return False
    if any(mark in text for mark in "。！？!?"):
        return False
    label = index_label(text)
    return not label or len(label) <= 80


def _heading_only_part(text: str) -> bool:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    return bool(lines) and all(_title_only_line(line) for line in lines)


def chunk_title(part: str, fallback: str = "") -> str:
    """Prefer 第X条 over a chapter/markdown heading glued onto the same parent."""
    labels = [index_label(line) for line in (part or "").splitlines()]
    labels = [item for item in labels if item]
    if not labels:
        return (fallback or "未命名")[:80]
    for label in labels:
        if _ARTICLE.match(label):
            return label[:80]
    return labels[0][:80]


def _attach_lonely_headings(parts: list[str]) -> list[str]:
    """Fold directory-style title-only sections into the next section that has body."""
    out: list[str] = []
    pending: list[str] = []
    for part in parts:
        if _heading_only_part(part):
            pending.append(part)
            continue
        if pending:
            part = "\n".join([*pending, part])
            pending = []
        out.append(part)
    if pending:
        if out:
            out[-1] = "\n".join([out[-1], *pending])
        else:
            out.extend(pending)
    return out


def split_markdown_sections(text: str, deep: int) -> list[str]:
    return split_heading_sections(text, deep)


def describe_process(cfg: ProcessConfigIn | None = None) -> str:
    data = cfg or ProcessConfigIn()
    size, overlap = process_size(data)
    extra = f"，重叠 {overlap} 字" if overlap else ""
    bits: list[str] = []
    if data.pdfEnhance:
        bits.append("PDF 增强解析")
    if data.trainingType == "qa" or data.qaEnhance:
        bits.append(f"问答对提取（窗口 {size or 8000} 字）")
        return "；".join(bits)
    if data.chunkSettingMode == "custom" and data.chunkSplitMode == "char":
        sep = data.chunkSplitter or data.customSplit or "\\n"
        if size <= 0:
            bits.append(f"按分隔符切开，不限制父块大小（{sep}）")
        else:
            bits.append(f"按分隔符切开，单块超过 {size} 字再切（{sep}）")
    elif data.chunkSettingMode == "custom" and data.chunkSplitMode == "size":
        bits.append(f"按固定长度 {size or 1000} 字切块{extra}")
    elif data.chunkSettingMode == "custom":
        ai = {
            "auto": "无标题时模型识别段落",
            "force": "强制模型识别段落",
            "forbid": "不用模型识别段落",
        }.get(data.paragraphChunkAIMode, "")
        extra_ai = f"，{ai}" if ai else ""
        if size <= 0:
            bits.append(f"按段落（深度 {data.paragraphChunkDeep}）切开，不限制父块大小{extra_ai}")
        else:
            bits.append(f"按段落（深度 {data.paragraphChunkDeep}）切开，单块超过 {size} 字再切{extra_ai}")
    elif size <= 0:
        bits.append("默认：按标题/空行切开，不限制父块大小")
    else:
        bits.append(f"默认：有标题按标题切开，无标题按空行组成不超过 {size} 字的父块；单块超过 {size} 字再按句子切")
    if (
        data.chunkSettingMode == "custom"
        and data.useChildIndex
        and data.trainingType != "qa"
        and not data.qaEnhance
    ):
        bits.append(f"子块索引 {index_size_of(data)} 字")
    if data.chunkTriggerType == "forceChunk":
        bits.append("强制分块")
    elif data.chunkTriggerType == "maxSize":
        bits.append("原文超模型上下文 70% 才分块")
    else:
        bits.append(f"原文大于 {data.chunkTriggerMinSize} 字才分块")
    extras = [
        name
        for flag, name in (
            (data.indexPrefixTitle, "文档标题加入索引"),
            (data.indexChunkTitle, "块标题单独索引"),
            (data.autoIndexes, "补充索引"),
            (
                data.imageIndex,
                {
                    "transcribe": "图片索引（转写文字）",
                    "extract": "图片索引（提取数据）",
                }.get(getattr(data, "imageIndexMode", "auto") or "auto", "图片索引（按图分流）"),
            ),
        )
        if flag
    ]
    if extras:
        bits.append("、".join(extras))
    return "；".join(bits)


def parse_model_json(text: str) -> object:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("empty")
    raw = re.sub(r"<think>[\s\S]*?</think>", "", raw).strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fenced:
        raw = fenced.group(1).strip()
    starts = [i for i in (raw.find("["), raw.find("{")) if i >= 0]
    if not starts:
        raise ValueError("no json")
    raw = raw[min(starts) :]
    try:
        return json.JSONDecoder().raw_decode(raw)[0]
    except json.JSONDecodeError:
        salvaged = _salvage_truncated_json(raw)
        if salvaged is not None:
            return salvaged
        raise ValueError("模型输出被截断，无法解析为 JSON")


def _salvage_truncated_json(raw: str) -> object | None:
    """Recover complete items from a JSON array cut off by max_tokens."""
    text = (raw or "").lstrip()
    if not text.startswith("["):
        return None
    decoder = json.JSONDecoder()
    items: list[object] = []
    i = 1
    n = len(text)
    while i < n:
        while i < n and text[i] in " \t\r\n,":
            i += 1
        if i >= n or text[i] in "]}":
            break
        try:
            value, end = decoder.raw_decode(text, i)
        except json.JSONDecodeError:
            break
        items.append(value)
        i = end
    return items if items else None


def parse_qa_pairs(text: str) -> list[tuple[str, str]]:
    data = parse_model_json(text)
    rows = data if isinstance(data, list) else [data]
    out: list[tuple[str, str]] = []
    for item in rows:
        if isinstance(item, dict):
            question = str(item.get("q") or item.get("question") or item.get("Q") or "").strip()
            answer = str(item.get("a") or item.get("answer") or item.get("A") or "").strip()
            if question and answer:
                out.append((question, answer))
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            question, answer = str(item[0]).strip(), str(item[1]).strip()
            if question and answer:
                out.append((question, answer))
    return out


def parse_string_list(text: str) -> list[str]:
    data = parse_model_json(text)
    if isinstance(data, str):
        return [data.strip()] if data.strip() else []
    if not isinstance(data, list):
        return []
    out: list[str] = []
    for item in data:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
        elif isinstance(item, dict):
            value = str(item.get("text") or item.get("content") or item.get("q") or "").strip()
            if value:
                out.append(value)
    return out


def _split_by_signs(text: str, spec: str) -> list[str]:
    raw = (spec or "\n").replace("\\n", "\n")
    signs = [part for part in raw.split("|") if part]
    if not signs:
        signs = ["\n"]
    pattern = "|".join(re.escape(sign) for sign in signs)
    return [part.strip() for part in re.split(pattern, text) if part.strip()]


_SENTENCE_CUT = re.compile(r"(?<=[。！？；!?\n])")
_CLAUSE_CUT = re.compile(r"(?<=[，,、；;：:])")
_SENTENCE_MARK = set("。！？；!?")


def _cjk_glue(left: str, right: str) -> str:
    if not left or not right:
        return ""
    a, b = left[-1], right[0]
    if a.isspace() or b.isspace():
        return ""
    cjk = "\u4e00" <= a <= "\u9fff" or "\u4e00" <= b <= "\u9fff" or a in "，、：；" or b in "，、：；"
    return "" if cjk else " "


def _prepare_text(text: str) -> str:
    body = _INLINE_HEADING.sub("\n", (text or "").strip())
    return _join_wrapped_lines(body)


def _join_wrapped_lines(text: str) -> str:
    """Merge PDF/word-wrap lines that continue a sentence."""
    out: list[str] = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            if out and out[-1] != "":
                out.append("")
            continue
        if not out or out[-1] == "":
            out.append(line)
            continue
        prev = out[-1]
        if heading_level(line) is None and not _SENTENCE_END.search(prev):
            out[-1] = prev + _cjk_glue(prev, line) + line
        else:
            out.append(line)
    return "\n".join(part for part in out if part)


def _peel_incomplete(text: str) -> tuple[str, str]:
    body = (text or "").rstrip()
    if not body or body[-1] in _SENTENCE_MARK:
        return body, ""
    last = max((body.rfind(mark) for mark in _SENTENCE_MARK), default=-1)
    if last < 0:
        return body, ""
    head = body[: last + 1].strip()
    tail = body[last + 1 :].strip()
    if not head or not tail:
        return body, ""
    return head, tail


def _cut_keep(pattern: re.Pattern[str], text: str) -> list[str]:
    return [part.strip() for part in pattern.split(text) if part.strip()]


def _split_for_index(text: str, size: int) -> list[str]:
    """Split on sentence (then clause) boundaries so index windows stay readable."""
    body = (text or "").strip()
    if not body:
        return []
    parts = _cut_keep(_SENTENCE_CUT, body)
    if len(parts) <= 1:
        parts = [part.strip() for part in re.split(r"\n+", body) if part.strip()] or [body]
    out: list[str] = []
    for part in parts:
        if len(part) <= size:
            out.append(part)
            continue
        clauses = _cut_keep(_CLAUSE_CUT, part)
        out.extend(clauses if len(clauses) > 1 else [part])
    return out or [body]


def _hard_window(text: str, size: int, overlap: int) -> list[str]:
    if len(text) <= size:
        return [text]
    step = max(size - overlap, 1)
    out: list[str] = []
    i = 0
    while i < len(text):
        out.append(text[i : i + size].strip())
        i += step
    return [item for item in out if item]


def _window(text: str, size: int, overlap: int) -> list[str]:
    body = (text or "").strip()
    if not body:
        return []
    if len(body) <= size:
        return [body]
    pieces: list[str] = []
    for part in _split_for_index(body, size):
        if len(part) <= size:
            pieces.append(part)
        else:
            pieces.extend(_hard_window(part, size, overlap))
    packed = _pack(pieces, size, overlap, overflow=False)
    return packed or _hard_window(body, size, overlap)


def _fit_parts(parts: list[str], size: int, overlap: int) -> list[str]:
    """Keep each part as its own parent; size is a ceiling, not a fill target."""
    if size <= 0:
        return [part for part in ((raw or "").strip() for raw in parts) if part]
    out: list[str] = []
    for raw in parts:
        part = (raw or "").strip()
        if not part:
            continue
        if len(part) > size:
            out.extend(_window(part, size, overlap))
        else:
            out.append(part)
    return out


def _pack(parts: list[str], size: int, overlap: int, *, overflow: bool = True) -> list[str]:
    chunks: list[str] = []
    buf = ""
    for raw in parts:
        part = (raw or "").strip()
        if not part:
            continue
        if overflow and len(part) > size:
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.extend(_window(part, size, overlap))
            continue
        nxt = f"{buf}\n{part}".strip() if buf else part
        if buf and len(nxt) > size:
            head, tail = _peel_incomplete(buf)
            moved = f"{tail}\n{part}".strip() if tail else part
            if head and tail and len(moved) <= size:
                chunks.append(head)
                buf = moved
                continue
            chunks.append(buf)
            if overlap and len(buf) > overlap:
                buf = f"{buf[-overlap:]}\n{part}".strip()
                if len(buf) > size:
                    buf = part
            else:
                buf = part
        else:
            buf = nxt
    if buf:
        chunks.append(buf)
    return chunks


@dataclass
class Unit:
    title: str
    text: str
    answer: str = ""
    indexes: list[dict] = field(default_factory=list)

    def add_index(self, kind: str, text: str) -> None:
        body = (text or "").strip()
        if not body:
            return
        self.indexes.append({"id": f"{kind}-{len(self.indexes) + 1}", "type": kind, "text": body})


def split_text(text: str, process: ProcessConfigIn | None = None) -> list[str]:
    return split_parents(text, process)
