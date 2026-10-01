# 文档处理与切块架构

> 本文是 Citekit 文档处理链路的**设计基线与变更记录**。任何解析器、切块规则、索引文本、格式支持范围或已知问题发生变化时，必须同步更新本文和对应测试。它的目标是让维护者能回答：平台如何处理一种文件、为什么这么处理、内容在何处可能降级、以及问题如何被验证和修复。

## 1. 架构决策

### 目标

Citekit 是通用知识库平台，不能假设输入是干净的纯文本，也不能假设所有带 `#` 的文本都是 Markdown 标题。文档处理必须同时满足：

1. **语义完整性优先**：代码、流程图、公式、表格等结构内容不能被任意字符或标题规则从中间截断。
2. **原文可展示、可引用**：入库父块保留可读的原始/规范化内容；索引清理不得回写正文。
3. **格式感知而非领域特例**：按内容格式和结构处理，不针对某份语料、标题名称、领域词或具体问句写分支。
4. **可降级、可观测**：无法获得可靠结构时退回纯文本策略，并在处理结果中留下原因；不因解析失败静默丢失正文。
5. **预算可控**：普通内容遵守 chunk 大小；不可切分的原子内容允许超限并被明确标记，而不是悄悄破坏内容。

### 最终目标架构

```text
文件 / 网页 / 外部连接器原文
  → 格式识别与格式专用解析器
  → 统一结构块（ContentBlock）
  → 标题上下文补全
  → 通用块打包器（Chunker）
  → 父块、子索引、向量 / 全文索引、引用元数据
```

核心边界是：**解析器负责识别结构；通用切块器只消费结构块，不猜测 Markdown、HTML、PDF 或代码语法。**

规划中的内部结构块模型（字段名称可因实现调整，但语义不能削弱）：

```python
@dataclass
class ContentBlock:
    kind: str                 # heading / paragraph / list / table / code / diagram / math / html / quote / image
    text: str                 # 保留展示所需的原文或最小规范化文本
    atomic: bool              # True 时通用切块器绝不从内部截断
    heading_path: list[str]   # 当前标题层级；用于索引上下文与引用
    source_format: str        # markdown / html / docx / pdf / csv / text ...
    metadata: dict            # 页码、行范围、sheet、URL、节点 ID、语言等来源信息
```

`atomic=True` 的默认对象：fenced code、Mermaid/PlantUML/Graphviz（属于 fenced code）、数学块、HTML `pre`/`table`、小表格、不可拆图片说明。超长表格可按“重复表头 + 行组”专用规则拆分；超长代码的语言 AST 拆函数/类属于后续可选增强，默认不硬切。

### 已确定的取舍

- **完整优先**：一个代码块、流程图或公式本身超过 `chunkSize` 时，单独生成 `oversized` 父块，允许超限；不按字符硬切。
- **标题上下文进入索引**：`heading_path` 可作为嵌入前缀或 metadata；展示正文不重复注入标题，避免污染原文和引用。
- **保守识别**：文件扩展名、连接器类型或 MIME 能确定格式时显式指定；缺失时只做保守检测，不能仅因出现 `#` 就把文本认作 Markdown。
- **纯文本永远可用**：未知格式、低质量 OCR、历史数据和解析失败内容都可以走 plain-text fallback。

---

## 2. 当前线上实现（截至 2026-09-22）

当前实现是“解析为单个字符串 → 文本切块器”的第一代管线，尚未实现上节的 `ContentBlock` 接口。

```text
SourceRow.raw_text / 上传文件
  → kb.parse.parse_file / 网页抽取 / connector 导出
  → ParseOut.text（单一字符串）
  → kb.process.run_process
  → kb.chunking.split_parents
  → Unit / 父块 + 可选子索引
```

### 支持的输入与当前解析方式

| 来源 / 格式 | 当前入口 | 当前保留的结构 | 已知限制 |
| --- | --- | --- | --- |
| `.txt`、未知外部连接器正文 | 原样读为 `ParseOut.text` 或 `raw_text` | 仅换行 | 无格式语义，只能走文本规则 |
| `.md` / `.markdown` | 原样读文本 | 原始 Markdown 字符串 | 当前切块器会把代码围栏内的 `#` 误判为标题；预处理可能合并代码/表格换行 |
| `.html` / 网页 | `_strip_html` / 网页抽取 | `h1`–`h6` 转 `#` 标题，链接改写为 Markdown 链接 | 表格、列表、`pre`、`code` 等 DOM 结构目前被扁平化 |
| `.docx` | `python-docx` | Heading/标题样式转 Markdown `#` | 表格未提取；代码样式、列表和段落属性未建模 |
| `.pdf` | PyMuPDF / pypdf 抽文字；可选 VLM 页转 Markdown | 页间空行；增强模式尝试生成标题、列表、表格 Markdown | 本地抽取无可靠阅读顺序/表格结构；VLM 输出可能不稳定 |
| `.csv` | 原样读文本 | 行文本 | 未作为表格模型处理 |
| 图片 | VLM 生成 Markdown 描述后拼接正文 | 模型生成的标题/段落/表格 | 原图与描述没有结构化绑定；模型输出质量依赖 VLM |

### 当前切块规则

实现：`server/src/citekit_server/kb/chunking.py`；调用：`server/src/citekit_server/kb/process.py`。

文档中的“大小”目前一律是 **Python 字符数**，不是 token。已入库数据不会因规则更新自动重切，需重新处理/训练。

#### 进入切块前

`run_process()` 获取 `ParseOut.text`，可追加图片描述；随后调用 `split_parents()`。

当前 `split_parents()` 对所有内容统一执行 `_prepare_text()`：将看起来像 PDF 视觉折行的换行拼接，并识别行内标题。此行为适用于 plain text/PDF，但会破坏原生 Markdown 的代码缩进、围栏、表格及 diagram DSL；这是本次架构升级要优先消除的问题。

#### 是否切块：`should_split`

- 问答对模式：总是切为窗口后抽取 QA。
- `forceChunk`：总是切。
- `maxSize`：正文长度超过模型上下文的 70% 才切。
- `minSize`：正文长度超过 `chunkTriggerMinSize`（默认 100）才切。

#### 父块：`split_parents`

| 模式 | 现有行为 |
| --- | --- |
| 按段落（默认） | 标题处切开；无标题时按空行，再退回按换行。标题含 Markdown `#`、章/节/条、短编号等。标题段不为凑满 `chunkSize` 合并；超长段按句界、子句、最后字符切。 |
| 按长度 | 优先句界后按长度装块，无法满足时硬切；仅此模式支持 `chunkOverlap`。 |
| 按分隔符 | 先按用户分隔符分段，超长段再按句界/字符切。 |

#### 父块 / 子块索引

| 层 | 存储与职责 |
| --- | --- |
| 父块 | MySQL `kb_chunks` 中的全文；检索命中后交给模型与用户展示。 |
| 子块 | 仅进入 Qdrant 向量，payload 指回父块 `chunk_id`；用于提高长父块召回精度。 |

自动模式默认不切子块。自定义模式由 `useChildIndex` 控制；问答对没有父子块。子块在 `child_indexes()` 中基于 `index_text()` 的可见文本按句界切，原父块仍保留带链接的正文。

`index_text()` 只在索引前把 Markdown 链接、图片收为可见文字、去掉 URL；不会修改 MySQL 中的父块正文。

---

## 3. 目标实现方案与阶段

### Phase 0：先锁定行为与样本（实施前）

**目的**：避免以某一个业务问句或一份文件为特例修切块。

- 建立格式 fixture：Markdown（Python/JSON/SQL/Mermaid/未闭合围栏/嵌套反引号）、GFM 表格、HTML `pre/table`、DOCX 标题/表格、PDF 文本页、CSV、OCR 噪声文本。
- 为每类 fixture 定义通用不变量：不丢文本、原子块不被截断、代码中的 `#` 不形成标题、标题路径正确、未知格式可降级。
- 保留现有纯文本切块测试，确保升级不会改变没有结构语义的文本行为。

**状态：待实施。**

### Phase 1：引入 Markdown 安全路径（第一批交付）

**目的**：立即解决 Markdown 代码块 / 流程图被误切，且不扰动 plain-text/PDF 旧路径。

1. 在解析结果或 `run_process` 入参中传递 `source_format`，`.md`/`.markdown` 与明确输出 Markdown 的连接器显式走 Markdown 路径。
2. Markdown 路径禁止 `_join_wrapped_lines()`；普通文本/PDF 继续保留既有修复视觉折行的逻辑。
3. 以 CommonMark 兼容规则扫描 fenced code：支持反引号或波浪线、最多三个前导空格、闭围栏字符一致且长度不小于开围栏、未闭合围栏延续至文档末尾。
4. fenced block 为原子块；内部不识别标题、不按空行/句界/长度切分。Mermaid、PlantUML、Graphviz 等天然随 fenced block 获得保护。
5. 原子块超过 `chunkSize` 时独立输出；预览和处理 notes 标记为超限，绝不硬切。
6. 将标准标题层级保存为 `heading_path`，供后续 `Unit`/索引使用；此阶段可先不改数据库 schema。

**状态：第一批已完成（2026-09-22）。**

已实现范围：`.md` / `.markdown` 上传文件显式走 Markdown 安全路径；任意来源中检测到 fenced code 时也自动启用该路径，避免连接器原文漏标格式。实现位于 `kb.chunking.markdown_blocks()` 与 `split_markdown_parents()`。当前 `ContentBlock` 已作为 Markdown 解析与打包的内部模型引入；HTML/DOCX/PDF/CSV 尚未接入此模型。

兼容性：问答对提取暂仍按窗口处理，以避免改变其输入契约；普通纯文本、PDF 和现有 HTML/DOCX 降级文本继续使用原切块路径。

### Phase 2：统一 `ContentBlock` 与通用打包器

**目的**：让格式专用解析与通用切块解耦，避免每增加一种格式都在 `split_parents(str)` 叠正则。

1. 新增结构块模型和 `parse_to_blocks()` 协议；`split_parents()` 保留为 plain-text 兼容入口。
2. 新增 block packer：标题更新路径；普通段落/列表可继续细分；原子块不可切；普通 block 以目标大小贪心打包。
3. `Unit` 扩展可选 metadata（标题路径、源格式、超限标志、行/页范围）；入库、预览、序列化和索引透传这些字段。
4. 子索引只对可安全抽取的普通文本生成；代码、diagram、公式默认以完整父块参与检索，避免脱离上下文的碎片向量。

**状态：待实施。**

### Phase 3：格式专用结构解析器

| 优先级 | 格式 | 方案 |
| --- | --- | --- |
| P0 | Markdown / 连接器 Markdown | CommonMark/GFM token 或 AST + 原文区间映射；代码、表格、列表、引用、HTML、数学产生 block。 |
| P1 | HTML / 网页 | DOM 解析：heading、paragraph、list、`pre`、`table`、`figure` 等映射为 block；链接保留可引用 URL。 |
| P1 | CSV / Excel | sheet + 表头 + 行组；拆分时每组重复表头，绝不按字符切行。 |
| P2 | DOCX | 提取段落、标题、列表、表格、图片锚点；不再只拼为 Markdown 字符串。 |
| P2 | PDF | 保留页码与布局/阅读顺序元数据；可从本地解析、版面模型或 VLM 解析器择优降级。 |

**状态：待实施。**

### Phase 2.5：可确认的处理草稿（Preview Draft）

**目的**：让“数据预览”成为用户将要入库内容的唯一事实来源，消除预览与入库阶段重复调用 LLM/VLM、结果不一致及重复费用的问题。

```text
选择来源 + 全部处理参数
  → 创建或命中服务端处理草稿
  → 解析 / VLM 增强 / 结构切块 / 子索引 / 补充索引 / QA 全部完成
  → 用户在数据预览页审阅草稿
  → 预览页下一步补齐所有未处理来源的草稿
  → 确认上传只使用 draftId：写 Source/Chunk、embedding、Qdrant、OpenSearch
```

#### 草稿缓存与失效契约

- 草稿由服务端持久化，不能只保存在浏览器 React state；刷新页面、切换文件、网络重试都必须能够复用同一处理结果。
- 缓存键至少由以下内容组成：知识库 ID、来源内容 hash（上传文件 ID/内容 hash，或 connector/raw text hash）、标题/locator、完整处理配置 hash、参与处理的 LLM/VLM 模型 ID 与版本。任一项变化都生成新草稿。
- 用户在左侧文件列表来回切换时：先按缓存键查草稿，命中即直接读取，不重复解析、不重复调用 LLM/VLM。
- 用户在参数设置页修改任意影响处理结果的选项后：已有草稿标记为过期；回到预览页按新参数重新处理。仅展示参数不改变结果的 UI 状态不应使草稿失效。
- 草稿有 TTL，并记录创建时间、处理状态、错误、输入 fingerprint 和模型 fingerprint；过期或来源不可再验证时不能提交。

#### 预览页与确认页的行为

| 操作 | 必须做 | 禁止做 |
| --- | --- | --- |
| 首次点开左侧文件 | 创建/读取该文件的草稿，完成全部内容变换和模型增强 | 只展示本地部分结果后在上传时重新计算 |
| 切换回已处理文件 | 命中草稿并立即展示 | 重复调用解析器、LLM、VLM |
| 点击“下一步” | 自动串行/受控并发处理所有尚无有效草稿的文件；全部成功后才进入确认页 | 跳过未处理文件，或在确认页才开始内容解析 |
| 确认上传 | 校验 draftId 仍有效，创建/更新 Source、Chunk，调用 embedding 并写 Qdrant/OpenSearch | 重新调用内容解析、VLM、补充索引或 QA 模型 |
| embedding/索引失败重试 | 使用同一草稿的最终待向量化文本重试 | 重新生成随机的补充索引、图片描述或 QA |

预览 UI 的标签统一使用“待向量化文本 / 待向量化子块 / 待向量化补充索引”，不得声称预览时已写入向量库。只有确认上传成功后，才可称为“已建立向量索引”。

**状态：第一批已完成（2026-09-22）。**

已实现：服务端 `kb_processing_drafts` 持久化处理结果，`POST /processing-drafts` 按输入/参数/模型 fingerprint 复用有效草稿；预览页切换文件优先读取 React state 中的同 fingerprint 草稿，服务端也能跨刷新命中缓存；点击预览页下一步会依次补齐未处理文件；确认页仅提交 `draftIds` 到 commit API，由草稿产物执行 embedding 和入库。草稿有效期当前为 2 小时。尚未实现：草稿列表恢复 UI、后台清理过期草稿、向量化异步队列与逐文件提交进度。

### Phase 4：可选的专用大块拆分

默认完整优先不变；仅在用户明确启用时，才对超长原子块做语义拆分：

- 代码：按语言 AST 的函数、类、方法；每块保留必要 import/标题上下文。
- 表格：按行组并重复表头。
- PDF/网页：按页或 DOM section，不按裸字符。

**状态：未排期。**

---

## 4. 关键难点与处理原则

| 难点 | 错误做法 | 采用的处理原则 | 验证方式 |
| --- | --- | --- | --- |
| 代码里的 `#` | 任意逐行正则识别 `#` 标题 | 标题只能由 Markdown 结构解析器在代码围栏外产生 | 代码块含 `#`/`##`/条款/编号不产生额外父块 |
| Mermaid / PlantUML | 把图当普通多行文本按长度切 | 作为 fenced-code 原子块；超长仍整体保留 | diagram 原文在单一 chunk 中完整出现 |
| 表格 | 先扁平化或按字符切 | 结构化表格；超长时表头 + 行组 | 每个表格 chunk 都有表头，行不被截断 |
| PDF 视觉折行 | 对 Markdown 也统一粘行 | 仅 plain-text/PDF fallback 修复折行；Markdown 保留原样 | 围栏缩进、表格行、列表层级保持不变 |
| 未闭合围栏/脏数据 | 继续把后文当普通标题 | 从开围栏到 EOF 均保守视作代码，产生处理 note | 不崩溃、不将后续 `#` 误切 |
| 原文展示与检索清理 | 用清理后的文本覆盖正文 | 正文与索引文本分离；索引可移 URL，正文保留引用 | UI/检索结果保留 Markdown 与 locator |
| 超长特殊块 | 为遵守大小静默硬切 | 独立 oversized chunk，记录 metadata/note | `oversize` 统计可见，内容未丢失 |
| OCR/未知格式 | 假装是 Markdown | plain-text fallback，并记录解析来源和降级原因 | 同一输入稳定、可重试、无格式误判 |

---

## 5. 变更记录与复盘模板

每次变更必须追加一节，至少包含：日期、变更范围、动机、设计取舍、兼容性、测试、观察到的问题和后续动作。禁止只记录“已优化”。

### 2026-09-22 — 结构化文档处理架构立项

- **背景**：现有 `split_parents(str)` 将所有输入视为文本；Markdown fenced code 内的 `#` 会被 `heading_level()` 识别为标题，`_prepare_text()` 还可能改变代码、表格和流程图的换行。
- **决策**：采用“格式感知解析 → 统一 `ContentBlock` → 通用打包器”的目标架构。默认完整优先：代码、diagram、公式等原子块超出 `chunkSize` 仍整体保留。
- **参考实现审阅**：本地 `FastGPT/packages/service/common/string/textSplitter.ts` 使用正则优先级切分、代码围栏换行占位保护、表格重复表头。其代码块超过约 `4 × chunkSize` 会硬切，不满足 Citekit 的完整优先决策；可借鉴其标题上下文与表格行组思想，不能照搬超长代码策略。
- **当前状态**：已完成架构决策与文档基线；后续实际实施见下一条记录。

### 2026-09-22 — Phase 1：Markdown fenced block 安全切块

- **改动范围**：`server/src/citekit_server/kb/chunking.py`、`kb/parse.py`、`kb/process.py`、`server/tests/test_chunking.py`、`server/tests/test_parse.py`。
- **实现**：新增 `ContentBlock`、`markdown_blocks()` 和 `split_markdown_parents()`。解析器按 CommonMark 围栏规则识别反引号/波浪线围栏：最多三个前导空格；闭围栏需使用相同字符且长度不小于开围栏；未闭合围栏从开围栏一直保守延续到 EOF。代码和 Mermaid/PlantUML/Graphviz 产出 `atomic=True` block，保留所有内部换行与缩进。
- **完整优先**：atomic block 会独立成为父块，超过 `chunkSize` 仍不切；预览现有的 `oversize` 统计会将其计入超限块。atomic 父块不生成子索引，防止代码片段脱离围栏和上下文单独向量化。
- **格式路由**：`ParseOut` 新增 `source_format`；`.md`/`.markdown` 标记为 `markdown`，由 `run_process()` 显式选择 Markdown 安全路径。PDF VLM 增强输出同样标记为 Markdown。为兼容飞书、语雀、钉钉等当前以 `raw_text` 传入的连接器，`split_parents()` 发现 fenced code 也会自动切换到安全路径；仅出现 `#` 不会误判为 Markdown。
- **尚未实现**：HTML、DOCX、PDF、CSV 仍是当前的字符串降级路径；`heading_path` 已被 Markdown block 保存，但尚未写进 `Unit`、数据库和向量 payload。表格、HTML block、数学块的 AST/结构化解析属于后续 Phase 2/3。
- **验证**：`cd server && PYTHONPATH=src .venv/bin/python -m unittest tests/test_chunking.py tests/test_parse.py`，27 项通过。覆盖代码中的 `#`、保留缩进、超长 Mermaid、未闭合围栏、波浪线围栏，以及 atomic block 不切子索引。
- **下一步**：先扩展 Markdown 表格/数学/HTML block fixture，再将 `ContentBlock` 和 metadata 接入统一 `Unit` 与其他格式解析器。

### 2026-09-22 — 连接器 URL 缺失的入库兼容

- **问题**：钉钉/语雀等连接器返回的部分节点没有浏览器 URL。导入页将空 `link` 直接发送为 `documents[].locator=""`，而请求 schema 要求 locator 至少一个字符，导致在业务逻辑执行前返回 422：`string_too_short`。
- **处理**：前端优先发送真实 URL；缺失时生成稳定 locator `<provider>:<document-id>`，用于 Source 去重、更新和引用。服务端 `PreviewedDocumentIn` 也允许旧客户端省略/传空 locator，并回退为 `connector:<id>`，避免 API 升级期间重新出现校验阻断。
- **边界**：fallback locator 是内部稳定标识，不假装是可点击网页链接；真实 provider URL 仍优先保留。
- **验证**：`cd server && PYTHONPATH=src .venv/bin/python -m unittest tests/test_connector_common.py tests/test_dingtalk_connector.py tests/test_yuque_connector.py tests/test_feishu_connector.py`，16 项通过；`pnpm check:web` 通过。


### 2026-09-22 — 预览即处理草稿的交互契约

- **问题**：现有 `/preview` 会生成分块与部分模型增强（补充索引、图片索引、PDF 增强、QA），但没有落草稿；正式上传又重新运行 `run_process()`。这会造成预览结果与最终入库结果不一致、重复模型费用，并让“向量索引”文案误导为已入库。
- **决策**：将预览阶段升级为服务端持久化的 Preview Draft。预览中完整生成所有会改变最终文本的产物；左侧切换按输入与配置 fingerprint 命中缓存；进入确认页前自动补齐尚未处理的文件；确认上传只提交 draftId 并做持久化、embedding 和索引写入。
- **失败策略**：某个文件草稿失败时，留在数据预览页展示该文件错误并允许重试；不得在其余文件未全部有有效草稿时进入确认页。embedding 失败只重试 embedding/索引，不重新调用内容生成模型。
- **实现**：新增 `ProcessingDraftRow` 与迁移 `0012_processing_drafts`。创建草稿时执行完整 `run_process(preview=False)`，冻结 `Unit`、子/补充索引及预览结果；`commit` 只从冻结 Unit 生成 embedding、MySQL Chunk、Qdrant 与 OpenSearch，不再重新调用 LLM/VLM。前端在每个 source 上缓存 `processingDraft`，其 key 包含来源、参数和导入类型；切换已处理文件不重复请求，预览页下一步顺序补齐所有文件。
- **已知限制**：当前 commit 请求同步执行 embedding 和索引写入，长文件批量提交会等待；草稿 2 小时后要求重新处理；服务端可复用草稿但前端刷新后没有草稿列表恢复展示，首次点开仍会请求服务端以命中缓存。
- **验证**：完整服务端测试 98 项通过；前端 TypeScript 检查通过。
- **文案**：无子块/补充索引的 chunk 在预览中标注为“待向量化文本”（原“向量索引”），表示确认上传时将用于 embedding 的文本，而非已入库的索引。

### 2026-10-01 — 草稿表迁移导致 API 无法启动

- **现象**：重启开发环境后页面加载不出来，API 日志停在 `Running upgrade 0011_feishu_folders -> 0012_processing_drafts`，Vite 代理所有 `/api/*` 请求 `ETIMEDOUT`；MySQL 中无锁等待，`alembic_version` 仍为 0011。
- **根因**：迁移给 `locator TEXT` 设置了 `server_default=""`，MySQL 拒绝（`1101 BLOB, TEXT, GEOMETRY or JSON column can't have a default value`）；SQLite 测试不会暴露该问题。同时 `alembic/env.py` 的 `fileConfig()` 默认 `disable_existing_loggers=True`，把 uvicorn 的 logger 禁用，导致 lifespan 异常被静默吞掉，worker 退出而 reloader 仍占用 8000 端口，表现为“卡住”而不是报错。
- **修复**：`TEXT/JSON` 列不使用数据库级默认值，空值由 ORM `default=""` 提供（与 `sources.locator` 一致）；`fileConfig(..., disable_existing_loggers=False)`，后续迁移失败会在 API 日志中输出完整堆栈。
- **连带问题**：迁移修好后，预览接口 `POST /processing-drafts` 返回 500（`NameError: chat_model`），原因是 `kb/api.py` 未导入 `chat_model`/`vision_model`；单测未覆盖该接口。已补导入，并用 `ruff --select F821` 扫描全包确认无其他未定义名称。
- **约定**：新增迁移必须在 MySQL 上实际执行一次（启动 API 或直接调用 `apply_migrations()`），不能只依赖 SQLite 单测。

### 2026-10-01 — 草稿提交补齐连接器与网站导入的副作用

- **问题**：改为“确认上传只提交 draftId”时，删除了前端按导入方式分流的旧接口调用（飞书/语雀/钉钉导入、网站 `import_pages`），但旧接口除入库外还有三项副作用未迁移：
  1. 来源类型：预览页 `kbKind` 写死为 `undefined`，且误把 `connectorMeta.source`（如 `feishu-wiki`）当成知识库类型，导致连接器文档全部存成 `upload`。
  2. 网站配置：旧接口会把根地址、正文选择器、链接选择器写入 `knowledge_bases.website_*`，定时同步依赖它；新流程未写入，新建网站库首次导入后自动同步会被跳过。
  3. 内容指纹：网站页面未写 `sources.content_hash`，下次同步会把所有页面视作已变化并全部重新向量化。
- **修复**：
  - 前端从知识库列表取真实 `kind` 推导来源类型（连接器库为 `feishu/yuque/dingtalk`，其他 API 导入为 `api`），并纳入草稿缓存 key。
  - 草稿请求新增显式字段 `site: {root, linkSelector}`，不再依赖把爬取配置塞在 `rawText` 里的 JSON；网站导入不再上传该 `rawText`（服务端始终按 URL 抓取并冻结正文）。服务端仅在 `type=web` 且知识库为网站库时接受 `site`，规范化根地址后与正文选择器一起写入草稿 `result.site`，并计入 fingerprint。
  - `ingest_draft` 提交时：`web` 来源写 `content_hash`（与同步使用同一 `html_from` 抽取结果和同一哈希函数，保证同步时判定一致）；草稿带 `site` 且为网站库时回写 `website_url/selector/link_selector`。
- **验证**：新增 `tests/test_ingest_draft.py`（SQLite 内存库 + 屏蔽 embedding/向量/全文索引），覆盖网站草稿写指纹与站点配置、非网站草稿不改动二者；服务端 100 项测试通过；接口实测非网站库传 `site` 返回 400。

### 2026-10-01 — 网站增量同步“每次只更新第一个”

- **现象**：网站库点同步后，只有入口页（第一条）的更新时间变化，其余页面看起来从未被同步。
- **根因**：
  1. `POST /website-sync` 每次都把入口页对应来源强制置为 `syncing` 并把处理参数重置为默认；同步判定 `status != "synced"` 即视为变化，于是入口页每次都被误判为变化、重新处理和向量化。其余页面内容未变被正确跳过，但列表只展示“更新时间”，用户无法区分“检查过且未变化”和“根本没检查”。
  2. 页面有变化时，同步用 `ProcessConfigIn(webSelector=...)` 默认参数覆盖来源的处理参数，导入时选择的分块大小、问答模式、补充索引等全部丢失。
  3. 后续同步仍从入口页按链接爬取（最多 50 页、3 层）再过滤出已选页面：未选页面占用页数预算；依赖链接发现选择器（如前端框架生成的 `#radix-…` 随机 id，站点重新部署即失效）；未爬到的页面只有 404/410 才处理，其余静默跳过，同步“成功”但页面实际未检查。
- **修复**：
  - 同步接口只在入口页尚不存在时插入占位来源，不再改动已有来源的状态和参数。
  - 已有来源时，按已存 URL 逐个直接抓取（`fetch_page`，复用同一 HTTP 客户端），不再依赖链接选择器和页数预算；重定向时仍以已存 locator 为键，避免一页分裂成两个来源。首次同步（尚无来源）才从入口页发现页面。
  - 404/410 删除来源及其向量/全文索引；其他抓取失败标记 `error` 并记录原因，已有分块保留可检索，下次抓取成功会重新入库。全部失败才判定同步失败。
  - 页面变化时沿用来源自身的处理参数，仅把 `webSelector` 更新为站点配置；新页面才用默认参数。
  - `SourceOut` 新增 `lastSeenAt`；集合元数据展示“最近检查”，列表更新时间悬停显示最近检查时间；同步弹窗说明改为与实际行为一致。
- **仍保留的设计**：后续同步不会自动导入站点新增页面（保持用户导入时的精选范围），新页面需重新扫描后导入。
- **验证**：新增 `tests/test_website_sync.py` 覆盖未变化不重复入库且刷新检查时间、变化页保留导入参数、重定向不分裂、404 删除与 503 标错、全部失败报错、首次同步按入口发现；服务端 106 项测试通过。对真实网站库触发同步：7 个页面全部刷新“最近检查”，无一被重新处理。

---

## 6. 当前代码入口

| 代码位置 | 职责 |
| --- | --- |
| `server/src/citekit_server/kb/parse.py` | 文件读取、PDF/DOCX/HTML 当前解析，产出 `ParseOut` |
| `server/src/citekit_server/kb/process.py` | 解析调度、PDF/VLM 增强、图片描述、切块与索引生成 |
| `server/src/citekit_server/kb/chunking.py` | 当前纯文本父块/子块切分、标题与索引文本规则 |
| `server/src/citekit_server/kb/ingest.py` | 预览、训练入库、向量化与 chunk 统计 |
| `server/src/citekit_server/kb/web.py` | 网页正文抽取（如适用） |
| `server/tests/test_chunking.py` | 当前切块回归测试 |
| `server/tests/test_parse.py` | 文件解析与处理流程回归测试 |

## 7. 维护约定

- 新增格式前，先定义它产生的 block 类型、原子性、来源 metadata 和 fallback；再写解析器。
- 新增切分规则前，先补充抽象 fixture 和不变量测试；不得用某个业务文档标题、条文或问句作为条件。
- 改动解析/切块后，至少运行相关 `unittest`，并在本文变更记录中写明命令和结果。
- 改动影响既有数据时，明确是否需要重新处理/训练；不会自动重切历史 chunk。
- 文档中的“当前实现”必须与代码同步；未实现的设计只能写在“目标方案/待实施”，不能表述为已上线能力。
