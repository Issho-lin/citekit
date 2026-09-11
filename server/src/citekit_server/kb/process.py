from __future__ import annotations

from dataclasses import dataclass, field

from citekit_server.calls.log import call_scope
from citekit_server.kb.chunking import (
    Unit,
    child_indexes,
    describe_process,
    has_heading,
    parse_qa_pairs,
    parse_string_list,
    split_parents,
)
from citekit_server.db import AiModelRow
from citekit_server.kb.parse import ParseOut, parse_file
from citekit_server.schemas import ProcessConfigIn
from citekit_server.infra.upstream import chat_completion

PDF_PROMPT = (
    "请把这一页文档转成 Markdown。保留标题层级、列表和表格。"
    "如果有图或印章，用一句话描述后写进正文。不要解释，只输出 Markdown。"
)
PARAGRAPH_PROMPT = (
    "能识别到标题就严格按标题切开，不限于 Markdown。"
    "标题包括：Word/HTML 标题、# 标题、「第X章 / 第X节 / 第X条」、短小标题。"
    "同一标题下的正文保持完整；没有标题时再按主题转换处切开。"
    "不要按句子切，也不要把整篇合成一段。单段长短不限，不必凑满或截到固定字数。"
    "只返回 JSON 字符串数组。每一项必须是连续原文，按原文顺序，不要改写、不要编号、不要解释、不要遗漏。\n\n"
)
INDEX_PROMPT = (
    "为下面这段知识生成 3 到 6 条可用于检索的补充问法或关键词，覆盖同义说法和可能的用户问法。"
    "只返回 JSON 字符串数组。\n\n"
)
IMAGE_PROMPT = "用一两句话描述这张图里对检索有用的信息。只输出描述，不要前缀。"
QA_TAIL = "\n\n只返回 JSON 数组，每项包含 q 和 a。答案必须来自原文。"


@dataclass
class ProcessResult:
    parsed_text: str
    units: list[Unit]
    applied: str
    notes: list[str] = field(default_factory=list)
    chunk_total: int = 0
    chunk_lengths: list[int] = field(default_factory=list)


def run_process(
    *,
    cfg: ProcessConfigIn,
    title: str,
    filename: str = "",
    raw_text: str = "",
    file_path: str | None = None,
    preview: bool = False,
    llm: tuple[AiModelRow, str] | None = None,
    vlm: tuple[AiModelRow, str] | None = None,
    llm_max_context: int | None = None,
) -> ProcessResult:
    notes: list[str] = []
    parsed = _load_text(file_path, filename, raw_text, cfg, preview, vlm, notes)
    body = parsed.text.strip()
    if cfg.imageIndex:
        body = _append_image_captions(body, parsed.images, preview, vlm, notes, filename)
    if not body:
        notes.append("没有解析出文字。检查文件是否为空，或格式是否支持。")
        return ProcessResult(
            parsed_text="",
            units=[],
            applied=describe_process(cfg),
            notes=notes,
        )

    if filename.lower().endswith(".pdf") and not cfg.pdfEnhance and len(body) < 200:
        notes.append("PDF 抽出的文字很少。扫描件请打开「PDF 增强解析」。")

    ai_parts = _ai_paragraphs(body, cfg, preview, llm, notes)
    parents = split_parents(body, cfg, llm_max_context=llm_max_context, ai_parts=ai_parts)
    chunk_lengths = [len(part) for part in parents]
    chunk_total = len(parents)
    if preview and chunk_total > 50:
        notes.append(f"共 {chunk_total} 个分块，预览只展示前 50 个。")
        parents = parents[:50]

    units: list[Unit] = []
    if cfg.trainingType == "qa" or cfg.qaEnhance:
        units = _extract_qa(parents, cfg, preview, llm, title, notes)
    else:
        for index, part in enumerate(parents, start=1):
            heading = part.split("\n", 1)[0][:80] or f"{title} · 块 {index}"
            unit = Unit(title=heading, text=part)
            for child in child_indexes(part, cfg):
                unit.add_index("child", child)
            units.append(unit)
        _auto_indexes(units, cfg, preview, llm, notes)

    return ProcessResult(
        parsed_text=body,
        units=units,
        applied=describe_process(cfg),
        notes=notes,
        chunk_total=chunk_total,
        chunk_lengths=chunk_lengths,
    )


def embed_items(unit: Unit, source_title: str, prefix_title: bool) -> list[tuple[str, str]]:
    prefix = (source_title or "").strip() if prefix_title else ""

    def wrap(text: str) -> str:
        if prefix and not text.startswith(prefix):
            return f"{prefix}\n{text}"
        return text

    children = [item["text"] for item in unit.indexes if item.get("type") == "child"]
    extras = [item for item in unit.indexes if item.get("type") != "child"]
    items: list[tuple[str, str]] = []
    if children:
        items.extend(("child", wrap(text)) for text in children)
    elif not any(item.get("type") == "default" for item in extras):
        items.append(("default", wrap(unit.text if not unit.answer else unit.text)))
    for item in extras:
        items.append((str(item.get("type") or "custom"), wrap(str(item.get("text") or ""))))
    if unit.answer and not children:
        items.append(("default", wrap(unit.answer)))
    return [(kind, text) for kind, text in items if text.strip()]


def _load_text(
    file_path: str | None,
    filename: str,
    raw_text: str,
    cfg: ProcessConfigIn,
    preview: bool,
    vlm: tuple[AiModelRow, str] | None,
    notes: list[str],
) -> ParseOut:
    if not file_path:
        return ParseOut(text=(raw_text or "").strip())
    parsed = parse_file(
        file_path,
        filename,
        render_pages=bool(cfg.pdfEnhance),
        collect_images=bool(cfg.imageIndex),
    )
    if not cfg.pdfEnhance:
        return parsed
    suffix = (filename or "").rsplit(".", 1)[-1].lower()
    if suffix != "pdf":
        notes.append("PDF 增强解析只对 PDF 生效。")
        return parsed
    if not parsed.page_pngs:
        notes.append("无法渲染 PDF 页，已回退为本地文字抽取。")
        return parsed
    if not vlm:
        notes.append("未配置图片理解模型，PDF 增强解析已跳过。")
        return parsed
    pages = parsed.page_pngs[:2] if preview else parsed.page_pngs
    if preview and len(parsed.page_pngs) > 2:
        notes.append(f"预览只增强前 2 页，全文共 {len(parsed.page_pngs)} 页。")
    model, auth = vlm
    markdown: list[str] = []
    with call_scope(purpose="pdf_enhance"):
        for index, png in enumerate(pages, start=1):
            try:
                markdown.append(
                    chat_completion(model, auth, PDF_PROMPT, images=[png], max_tokens=2500, timeout=180).strip()
                )
            except Exception as exc:
                notes.append(f"第 {index} 页增强解析失败：{exc}")
                if index <= len(parsed.text.split("\n\n")):
                    pass
    body = "\n\n".join(part for part in markdown if part)
    if body:
        parsed.text = body
    else:
        notes.append("PDF 增强解析没有得到正文，已使用本地抽取结果。")
    return parsed


def _append_image_captions(
    text: str,
    images: list[bytes],
    preview: bool,
    vlm: tuple[AiModelRow, str] | None,
    notes: list[str],
    filename: str = "",
) -> str:
    if not images:
        if filename.lower().endswith((".pdf", ".docx")):
            notes.append("没有提取到可索引的图片。")
        return text
    if not vlm:
        notes.append("未配置图片理解模型，图片索引已跳过。")
        return text
    model, auth = vlm
    batch = images[:2] if preview else images[:12]
    if preview and len(images) > 2:
        notes.append(f"预览只索引前 2 张图，共 {len(images)} 张。")
    captions: list[str] = []
    with call_scope(purpose="image_index"):
        for png in batch:
            try:
                captions.append(chat_completion(model, auth, IMAGE_PROMPT, images=[png], max_tokens=400, timeout=120).strip())
            except Exception as exc:
                notes.append(f"图片描述失败：{exc}")
    captions = [item for item in captions if item]
    if not captions:
        return text
    block = "## 文档图片\n\n" + "\n".join(f"- {item}" for item in captions)
    return f"{text}\n\n{block}" if text else block


def _ai_paragraphs(
    text: str,
    cfg: ProcessConfigIn,
    preview: bool,
    llm: tuple[AiModelRow, str] | None,
    notes: list[str],
) -> list[str] | None:
    if cfg.chunkSettingMode != "custom" or cfg.chunkSplitMode != "paragraph":
        return None
    if cfg.trainingType == "qa" or cfg.qaEnhance:
        return None
    mode = cfg.paragraphChunkAIMode
    if mode == "forbid":
        return None
    if mode == "auto" and has_heading(text, cfg.paragraphChunkDeep):
        notes.append("已识别到标题，已按标题切开，没有调用模型。若要强制用模型，把「模型识别段落」改成「强制处理」。")
        return None
    if not llm:
        notes.append("未配置文本理解模型，模型识别段落已跳过。")
        return None
    model, auth = llm
    sample = text[:8000] if preview else text
    if preview and len(text) > 8000:
        notes.append("预览只对前 8000 字做模型识别段落。")
    prompt = f"{PARAGRAPH_PROMPT}{sample}"
    # Echoing the source as a JSON array needs roughly as many tokens as the input.
    max_tokens = min(16384, max(4096, len(sample) + 512))
    try:
        with call_scope(purpose="paragraph"):
            reply = chat_completion(
                model, auth, prompt, max_tokens=max_tokens, timeout=180, thinking=False
            )
            parts = parse_string_list(reply)
    except Exception as exc:
        notes.append(f"模型识别段落失败，已回退本地切分：{exc}")
        return None
    if not parts:
        notes.append("模型没有返回可用段落，已回退本地切分。")
        return None
    leftover = _uncovered_tail(sample, parts)
    if leftover:
        notes.append("模型输出被截断，未识别完的原文已按本地规则接上。")
        parts.append(leftover)
    if preview and len(text) > len(sample):
        rest = text[len(sample) :].strip()
        if rest:
            parts.append(rest)
    return parts


def _uncovered_tail(source: str, parts: list[str]) -> str:
    if not source or not parts:
        return (source or "").strip()
    last = parts[-1]
    idx = source.rfind(last)
    if idx < 0:
        return ""
    return source[idx + len(last) :].strip()


def _extract_qa(
    windows: list[str],
    cfg: ProcessConfigIn,
    preview: bool,
    llm: tuple[AiModelRow, str] | None,
    title: str,
    notes: list[str],
) -> list[Unit]:
    if not llm:
        raise RuntimeError("问答对提取需要先为知识库选择文本理解模型")
    model, auth = llm
    prompt = (cfg.qaPrompt or "").strip() or "从文本中提取问答对。"
    source = windows[:1] if preview else windows
    if preview and len(windows) > 1:
        notes.append(f"预览只从第 1 个窗口提取问答对，全文将按 {len(windows)} 段处理。")
    units: list[Unit] = []
    with call_scope(purpose="qa"):
        for index, window in enumerate(source, start=1):
            try:
                pairs = parse_qa_pairs(
                    chat_completion(
                        model,
                        auth,
                        f"{prompt}\n\n文本：\n{window}{QA_TAIL}",
                        max_tokens=4096,
                        thinking=False,
                    )
                )
            except Exception as exc:
                notes.append(f"第 {index} 段问答提取失败：{exc}")
                continue
            for question, answer in pairs:
                units.append(Unit(title=question[:80] or f"{title} · QA", text=question, answer=answer))
    if not units:
        raise RuntimeError("没有提取到问答对")
    return units


def _auto_indexes(
    units: list[Unit],
    cfg: ProcessConfigIn,
    preview: bool,
    llm: tuple[AiModelRow, str] | None,
    notes: list[str],
) -> None:
    if not cfg.autoIndexes:
        return
    if not llm:
        notes.append("未配置文本理解模型，自动补充索引已跳过。")
        return
    model, auth = llm
    targets = units[:2] if preview else units
    if preview and len(units) > 2:
        notes.append("预览只给前 2 块生成补充索引。")
    with call_scope(purpose="auto_index"):
        for unit in targets:
            try:
                extra = parse_string_list(
                    chat_completion(
                        model,
                        auth,
                        f"{INDEX_PROMPT}{unit.text[:3000]}",
                        max_tokens=800,
                        thinking=False,
                    )
                )
            except Exception as exc:
                notes.append(f"补充索引失败：{exc}")
                continue
            for item in extra[:8]:
                unit.add_index("auto", item)
