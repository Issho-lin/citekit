from __future__ import annotations

import re

from citekit_server.schemas import ProcessConfigIn


def process_size(cfg: ProcessConfigIn | None = None) -> tuple[int, int]:
    data = cfg or ProcessConfigIn()
    size = max(int(data.chunkSize or 1000), 64)
    overlap = min(max(int(data.chunkOverlap or 0), 0), size // 2)
    return size, overlap


def describe_process(cfg: ProcessConfigIn | None = None) -> str:
    data = cfg or ProcessConfigIn()
    size, overlap = process_size(data)
    extra = f"，重叠 {overlap} 字" if overlap else ""
    if data.chunkSettingMode == "custom" and data.chunkSplitMode == "char":
        sep = data.chunkSplitter or data.customSplit or "\\n"
        return f"按分隔符切开后打包到 {size} 字{extra}（分隔符：{sep}）"
    if data.chunkSettingMode == "custom" and data.chunkSplitMode == "size":
        return f"按固定长度 {size} 字切块{extra}"
    mode = "默认规则" if data.chunkSettingMode != "custom" else "按段落"
    return f"{mode}：先按空行再按换行打包，超过 {size} 字再切{extra}"


def unused_notes(
    cfg: ProcessConfigIn | None = None,
    *,
    filename: str = "",
    parsed_chars: int = 0,
) -> list[str]:
    data = cfg or ProcessConfigIn()
    notes: list[str] = []
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if parsed_chars == 0:
        notes.append("没有解析出文字。检查文件是否为空，或格式是否支持。")
    elif suffix == "pdf" and parsed_chars < 200:
        notes.append("PDF 抽出的文字很少。扫描件或图片型 PDF 目前抽不出内容。")
    if data.trainingType == "qa" or data.qaEnhance:
        notes.append("问答对提取尚未实现，预览和入库都按原文分块。")
    if data.pdfEnhance:
        notes.append("PDF 增强解析尚未接入，目前只用本地抽取文字。")
    if data.autoIndexes:
        notes.append("自动生成补充索引尚未实现。")
    if data.imageIndex:
        notes.append("图片自动索引尚未实现。")
    if data.indexPrefixTitle:
        notes.append("将标题加入索引尚未实现。")
    if data.chunkSettingMode == "custom" and data.chunkSplitMode == "paragraph":
        notes.append("尚未按 Markdown 标题或模型识别段落，当前仍按空行/换行切。")
    if data.chunkSettingMode == "custom" and data.trainingType == "chunk":
        notes.append(f"父子文档尚未实现，索引大小 {data.indexSize} 不会单独切子块。")
    if data.chunkTriggerType not in {"minSize", "forceChunk"}:
        notes.append("分块条件尚未生效，短文本也会按规则切。")
    return notes


def split_text(text: str, process: ProcessConfigIn | None = None) -> list[str]:
    body = (text or "").strip()
    if not body:
        return []
    cfg = process or ProcessConfigIn()
    size, overlap = process_size(cfg)
    if cfg.chunkSettingMode == "custom" and cfg.chunkSplitMode == "char":
        sep = (cfg.chunkSplitter or cfg.customSplit or "\n").replace("\\n", "\n")
        parts = [p.strip() for p in body.split(sep) if p.strip()]
        return _pack(parts, size, overlap)
    if cfg.chunkSettingMode == "custom" and cfg.chunkSplitMode == "size":
        return _window(body, size, overlap)
    parts = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in body.split("\n") if p.strip()]
    return _pack(parts or [body], size, overlap)


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
