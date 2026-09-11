import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Tooltip,
} from "@chakra-ui/react";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, Empty, PageHero } from "../components/chrome";
import { IconChevron, IconInfo, IconTokenIn, IconTokenOut } from "../components/icons";
import { MyDatePicker } from "../components/MyDatePicker";
import { MySelect } from "../components/MySelect";
import { ProviderAvatar } from "../components/model/shared";
import { useToast } from "../components/Toast";
import { MODEL_TYPE_META } from "../mock/models";
import { usePageProgress } from "../progress";
import type { ModelCall, ModelCallSummary } from "../types";

const PURPOSE_LABEL: Record<string, string> = {
  test: "连通测试",
  discover: "拉取模型",
  ingest: "入库向量化",
  retrieve: "检索向量化",
  rerank: "重排",
  agent: "对话",
  suggest_tool_meta: "生成工具契约",
  suggest_tool_name: "生成调用名",
  suggest_tool_description: "生成工具描述",
  qa: "问答提取",
  paragraph: "识别段落",
  pdf_enhance: "PDF 增强",
  image_index: "图片索引",
  auto_index: "补充索引",
  embed: "向量化",
  chat: "对话补全",
  call: "其它",
};

const PURPOSE_FILTER = [
  "test",
  "ingest",
  "retrieve",
  "rerank",
  "agent",
  "suggest_tool_meta",
  "suggest_tool_name",
  "suggest_tool_description",
  "qa",
  "paragraph",
  "pdf_enhance",
  "image_index",
  "auto_index",
] as const;

const PAGE_SIZES = [10, 20, 50];

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function typeLabel(type: string) {
  return MODEL_TYPE_META.find((t) => t.id === type)?.label || type || "—";
}

function pretty(value: unknown) {
  if (value == null) return "无";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function dayRange(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return {};
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const start = new Date(year, month, day);
  const end = new Date(year, month, day + 1);
  if (start.getFullYear() !== year || start.getMonth() !== month || start.getDate() !== day) return {};
  return { from: start.toISOString(), to: end.toISOString() };
}

function formatCount(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function TokenUsage({ row }: { row: ModelCallSummary }) {
  if (row.promptTokens == null && row.completionTokens == null && row.totalTokens == null) {
    return <span className="call-tokens-empty">—</span>;
  }
  const total = row.totalTokens ?? (row.promptTokens ?? 0) + (row.completionTokens ?? 0);
  return (
    <div className="token-cell">
      <div className="token-line">
        <span className="token-metric in">
          <IconTokenIn size={18} />
          {formatCount(row.promptTokens)}
        </span>
        <span className="token-metric out">
          <IconTokenOut size={18} />
          {formatCount(row.completionTokens)}
        </span>
      </div>
      <Tooltip
        placement="top"
        hasArrow
        openDelay={150}
        gutter={10}
        bg="#2b303b"
        color="white"
        px={0}
        py={0}
        borderRadius="8px"
        label={
          <div className="token-detail">
            <div className="token-detail-title">Token 明细</div>
            <div className="token-detail-row">
              <span>输入 Token</span>
              <b>{formatCount(row.promptTokens)}</b>
            </div>
            <div className="token-detail-row">
              <span>输出 Token</span>
              <b>{formatCount(row.completionTokens)}</b>
            </div>
            <div className="token-detail-hr" />
            <div className="token-detail-row total">
              <span>总 Token</span>
              <b>{formatCount(total)}</b>
            </div>
          </div>
        }
      >
        <span
          className="token-info"
          aria-label="Token 明细"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <IconInfo size={14} />
        </span>
      </Tooltip>
    </div>
  );
}

function pageItems(page: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const keep = [...new Set([1, pageCount, page - 1, page, page + 1])]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  for (const n of keep) {
    if (out.length) {
      const prev = out[out.length - 1];
      if (typeof prev === "number" && n - prev > 1) out.push("…");
    }
    out.push(n);
  }
  return out;
}

export function CallLogsPage() {
  const toast = useToast();
  const [type, setType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState("");
  const [day, setDay] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [items, setItems] = useState<ModelCallSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ModelCall | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const filterKey = `${type}|${purpose}|${result}|${day}|${pageSize}`;
  const filterRef = useRef(filterKey);
  let nextPage = page;
  if (filterRef.current !== filterKey) {
    filterRef.current = filterKey;
    nextPage = 1;
    if (page !== 1) setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(nextPage, pageCount);
  usePageProgress(loading || (detailLoading && !detail));

  const query = useMemo(
    () => ({
      type: type || undefined,
      purpose: purpose || undefined,
      ok: result === "ok" ? true : result === "fail" ? false : undefined,
      ...dayRange(day),
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
    }),
    [type, purpose, result, day, pageSize, currentPage],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listModelCalls(query);
      setTotal(data.total);
      setItems(data.items);
    } catch (err) {
      toast(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      setDetail(await api.getModelCall(id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "无法打开详情");
    } finally {
      setDetailLoading(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`已复制${label}`);
    } catch {
      toast("复制失败");
    }
  }

  return (
    <div className="page">
      <div className="page-inner-wide">
        <PageHero
          title="调用记录"
          desc="实际上游推理会记在这里，只留最近 7 天、最多 2000 条。点一行看请求和响应；成功的向量化只保留摘要和 Token，不存向量原文。"
          action={
            <HStack spacing={2}>
              <Button size="sm" variant="whiteBase" onClick={() => void load()} isLoading={loading}>
                刷新
              </Button>
              <Button size="sm" variant="whiteBase" onClick={() => setClearOpen(true)} isDisabled={total === 0}>
                清空
              </Button>
            </HStack>
          }
        />

        <div className="call-filters">
          <MySelect
            h="32px"
            w="140px"
            value={type}
            placeholder="全部类型"
            onChange={setType}
            list={[
              { value: "", label: "全部类型" },
              ...MODEL_TYPE_META.map((t) => ({ value: t.id, label: t.label })),
            ]}
          />
          <MySelect
            h="32px"
            w="160px"
            value={purpose}
            placeholder="全部用途"
            onChange={setPurpose}
            list={[
              { value: "", label: "全部用途" },
              ...PURPOSE_FILTER.map((value) => ({ value, label: PURPOSE_LABEL[value] })),
            ]}
          />
          <MySelect
            h="32px"
            w="120px"
            value={result}
            placeholder="全部结果"
            onChange={setResult}
            list={[
              { value: "", label: "全部结果" },
              { value: "ok", label: "成功" },
              { value: "fail", label: "失败" },
            ]}
          />
          <MyDatePicker value={day} onChange={setDay} w="160px" h="32px" />
        </div>

        {loading && items.length === 0 ? null : items.length === 0 ? (
          <Empty
            text={
              type || purpose || result || day ? (
                "没有符合筛选条件的调用记录。"
              ) : (
                <>
                  还没有调用记录。去 <Link to="/settings">设置</Link> 测一下模型，或入库 / 试搜后会显示在这里。
                </>
              )
            }
          />
        ) : (
          <DataTable
            className="call-table"
            headers={[
              "时间",
              "模型",
              "用途",
              "状态",
              "耗时",
              "TOKEN",
              "摘要",
            ]}
            footer={
              <div className="table-pager">
                <button
                  type="button"
                  className="pager-btn"
                  aria-label="上一页"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <span className="pager-chevron prev">
                    <IconChevron size={14} />
                  </span>
                </button>
                {pageItems(currentPage, pageCount).map((item, i) =>
                  item === "…" ? (
                    <span key={`e-${i}`} className="pager-ellipsis">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className={item === currentPage ? "pager-btn active" : "pager-btn"}
                      aria-current={item === currentPage ? "page" : undefined}
                      disabled={loading}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="pager-btn"
                  aria-label="下一页"
                  disabled={currentPage >= pageCount || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <span className="pager-chevron">
                    <IconChevron size={14} />
                  </span>
                </button>
                <MySelect
                  h="32px"
                  w="108px"
                  value={String(pageSize)}
                  onChange={(next) => setPageSize(Number(next) || 10)}
                  list={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} 条/页` }))}
                />
              </div>
            }
          >
            {items.map((row) => (
              <tr key={row.id} className="clickable" onClick={() => void openDetail(row.id)}>
                <td className="call-time">{formatTime(row.createdAt)}</td>
                <td>
                  <div className="call-model">
                    {row.provider ? <ProviderAvatar provider={row.provider} size={28} /> : null}
                    <div>
                      <div className="call-model-name">{row.modelName || row.modelId || "—"}</div>
                      <div className="call-model-sub">
                        {typeLabel(row.type)}
                        {row.mappedModel && row.mappedModel !== row.modelId ? ` · ${row.mappedModel}` : ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="call-purpose">{PURPOSE_LABEL[row.purpose] || row.purpose || "—"}</td>
                <td>
                  <span className={row.ok ? "call-status ok" : "call-status fail"}>
                    <span className="call-status-dot" />
                    {row.ok ? "成功" : "失败"}
                    {row.httpStatus ? ` ${row.httpStatus}` : ""}
                  </span>
                </td>
                <td className="call-latency">{row.latencyMs.toLocaleString("zh-CN")} ms</td>
                <td>
                  <TokenUsage row={row} />
                </td>
                <td className="call-summary">{row.summary || row.error || "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>

      <Modal isOpen={Boolean(detail) || detailLoading} onClose={() => setDetail(null)} size="4xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent maxW="880px">
          <ModalHeader fontSize="16px">调用详情</ModalHeader>
          <ModalBody pb={6}>
            {detail ? <CallDetail call={detail} onCopy={copy} /> : null}
          </ModalBody>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={clearOpen}
        onClose={() => setClearOpen(false)}
        title="清空调用记录"
        confirmText="清空"
        onConfirm={async () => {
          const res = await api.clearModelCalls();
          setItems([]);
          setTotal(0);
          setPage(1);
          toast(`已删除 ${res.deleted} 条`);
        }}
      >
        会删除当前保存的全部模型调用记录，无法恢复。
      </ConfirmDialog>
    </div>
  );
}

function CallDetail({
  call,
  onCopy,
}: {
  call: ModelCall;
  onCopy: (text: string, label: string) => void;
}) {
  const requestText = pretty(call.request);
  const responseText = pretty(call.response);
  return (
    <div className="call-detail">
      <div className="call-kv">
        <div>
          <span>时间</span>
          {formatTime(call.createdAt)}
        </div>
        <div>
          <span>耗时</span>
          {call.latencyMs} ms
        </div>
        <div>
          <span>结果</span>
          <b className={call.ok ? "call-ok" : "call-fail"}>{call.ok ? "成功" : "失败"}</b>
          {call.httpStatus ? ` · HTTP ${call.httpStatus}` : ""}
        </div>
        <div>
          <span>用途</span>
          {PURPOSE_LABEL[call.purpose] || call.purpose}
        </div>
        <div>
          <span>模型</span>
          {call.modelName || call.modelId || "—"}
          {call.mappedModel ? `（${call.mappedModel}）` : ""}
        </div>
        <div>
          <span>类型</span>
          {typeLabel(call.type)}
          {call.provider ? ` · ${call.provider}` : ""}
        </div>
        {(call.promptTokens != null || call.completionTokens != null || call.totalTokens != null) ? (
          <div>
            <span>用量</span>
            输入 {formatCount(call.promptTokens)} · 输出 {formatCount(call.completionTokens)}
            {call.totalTokens != null ? ` · 合计 ${formatCount(call.totalTokens)}` : ""}
          </div>
        ) : null}
        {call.kbId ? (
          <div>
            <span>知识库</span>
            <Link to={`/kb/${call.kbId}`}>{call.kbId}</Link>
            {call.sourceId ? ` · ${call.sourceId}` : ""}
          </div>
        ) : null}
      </div>
      <div className="call-url">
        <span>
          {call.method} {call.url}
        </span>
        <button type="button" onClick={() => onCopy(`${call.method} ${call.url}`, "URL")}>
          复制
        </button>
      </div>
      {call.error ? <div className="call-error">{call.error}</div> : null}
      <JsonBlock title="请求" text={requestText} onCopy={() => onCopy(requestText, "请求")} />
      <JsonBlock title="响应" text={responseText} onCopy={() => onCopy(responseText, "响应")} />
    </div>
  );
}

function JsonBlock({ title, text, onCopy }: { title: string; text: string; onCopy: () => void }) {
  return (
    <div className="call-json-wrap">
      <div className="call-json-head">
        <span>{title}</span>
        <button type="button" onClick={onCopy}>
          复制
        </button>
      </div>
      <pre className="call-json">{text}</pre>
    </div>
  );
}