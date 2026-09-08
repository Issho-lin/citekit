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
_SENTENCE_END = re.compile(r"[。；;！？!?：:]$")


def process_size(cfg: ProcessConfigIn | None = None) -> tuple[int, int]:
    data = cfg or ProcessConfigIn()
    size = max(int(data.chunkSize or 1000), 64)
    overlap = min(max(int(data.chunkOverlap or 0), 0), size // 2)
    return size, overlap


def index_size_of(cfg: ProcessConfigIn | None = None) -> int:
    data = cfg or ProcessConfigIn()
    size, _ = process_size(data)
    if data.chunkSettingMode != "custom" or data.trainingType != "chunk":
        return size
    return max(64, min(int(data.indexSize or size), size))


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
        return 1
    if _CN_ITEM.match(text) and len(text) <= 30 and not _SENTENCE_END.search(text):
        return 1
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
    body = (text or "").strip()
    if not body:
        return []
    cfg = process or ProcessConfigIn()
    size, overlap = process_size(cfg)
    if not should_split(body, cfg, llm_max_context):
        return [body]
    if cfg.trainingType == "qa" or cfg.qaEnhance:
        return _window(body, size, min(overlap or 200, size // 4))
    if ai_parts:
        packed = _pack(ai_parts, size, overlap)
        return packed or [body]
    if cfg.chunkSettingMode == "custom" and cfg.chunkSplitMode == "char":
        parts = _split_by_signs(body, cfg.chunkSplitter or cfg.customSplit or "\n")
        return _pack(parts, size, overlap) or [body]
    if cfg.chunkSettingMode == "custom" and cfg.chunkSplitMode == "size":
        return _window(body, size, overlap)
    deep = int(cfg.paragraphChunkDeep or 5) if cfg.chunkSettingMode == "custom" else 5
    if has_heading(body, deep):
        parts = split_heading_sections(body, deep)
        return _pack(parts, size, overlap) or [body]
    parts = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in body.split("\n") if p.strip()]
    return _pack(parts or [body], size, overlap)


def child_indexes(parent: str, cfg: ProcessConfigIn | None = None) -> list[str]:
    data = cfg or ProcessConfigIn()
    if data.trainingType == "qa" or data.qaEnhance:
        return []
    if data.chunkSettingMode != "custom":
        return []
    size, overlap = process_size(data)
    child = index_size_of(data)
    if child >= size or len(parent) <= child:
        return []
    child_overlap = min(overlap, child // 4)
    packed = _pack(_split_for_index(parent, child), child, child_overlap)
    if len(packed) <= 1:
        return []
    return packed


def split_heading_sections(text: str, deep: int) -> list[str]:
    depth = max(1, min(int(deep or 5), 8))
    buckets: list[list[str]] = [[]]
    for line in (text or "").splitlines():
        level = heading_level(line)
        if level is not None and level <= depth and buckets[-1]:
            buckets.append([line])
        else:
            buckets[-1].append(line)
    parts = ["\n".join(bucket).strip() for bucket in buckets]
    return [part for part in parts if part]


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
        bits.append(f"问答对提取（窗口 {size} 字）")
        return "；".join(bits)
    if data.chunkSettingMode == "custom" and data.chunkSplitMode == "char":
        sep = data.chunkSplitter or data.customSplit or "\\n"
        bits.append(f"按分隔符切开后打包到 {size} 字{extra}（{sep}）")
    elif data.chunkSettingMode == "custom" and data.chunkSplitMode == "size":
        bits.append(f"按固定长度 {size} 字切块{extra}")
    elif data.chunkSettingMode == "custom":
        ai = {
            "auto": "无标题时模型识别段落",
            "force": "强制模型识别段落",
            "forbid": "不用模型识别段落",
        }.get(data.paragraphChunkAIMode, "")
        extra_ai = f"，{ai}" if ai else ""
        bits.append(f"按段落（深度 {data.paragraphChunkDeep}）打包到 {size} 字{extra}{extra_ai}")
    else:
        bits.append(f"默认：标题/空行打包，超过 {size} 字再切{extra}")
    if data.chunkSettingMode == "custom" and data.trainingType == "chunk":
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
            (data.indexPrefixTitle, "标题加入索引"),
            (data.autoIndexes, "补充索引"),
            (data.imageIndex, "图片索引"),
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


def _window(text: str, size: int, overlap: int) -> list[str]:
    if len(text) <= size:
        return [text]
    step = max(size - overlap, 1)
    out: list[str] = []
    i = 0
    while i < len(text):
        out.append(text[i : i + size].strip())
        i += step
    return [item for item in out if item]


def _pack(parts: list[str], size: int, overlap: int) -> list[str]:
    chunks: list[str] = []
    buf = ""
    for part in parts:
        if len(part) > size:
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.extend(_window(part, size, overlap))
            continue
        nxt = f"{buf}\n{part}".strip() if buf else part
        if buf and len(nxt) > size:
            chunks.append(buf)
            if overlap and len(buf) > overlap:
                buf = f"{buf[-overlap:]}\n{part}".strip()
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
