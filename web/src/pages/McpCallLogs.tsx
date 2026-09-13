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
} from "@chakra-ui/react";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, Empty } from "../components/chrome";
import { IconChevron } from "../components/icons";
import { MyDatePicker } from "../components/MyDatePicker";
import { MySelect } from "../components/MySelect";
import { useToast } from "../components/Toast";
import { useStore } from "../mock/store";
import { usePageProgress } from "../progress";
import type { McpCall, McpCallSummary } from "../types";

const METHOD_LABEL: Record<string, string> = {
  initialize: "握手",
  "tools/list": "列出工具",
  "tools/call": "调用工具",
  auth: "鉴权",
};

const PAGE_SIZES = [10, 20, 50];

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
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

function pageItems(page: number, pageCount: number) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: Array<number | "…"> = [];
  const push = (n: number) => {
    if (!out.includes(n)) out.push(n);
  };
  push(1);
  for (let n = page - 1; n <= page + 1; n++) {
    if (n > 1 && n < pageCount) push(n);
  }
  push(pageCount);
  const merged: Array<number | "…"> = [];
  for (const n of out) {
    const prev = merged[merged.length - 1];
    if (typeof prev === "number" && typeof n === "number" && n - prev > 1) merged.push("…");
    merged.push(n);
  }
  return merged;
}

export function McpCallLogs() {
  const toast = useToast();
  const { endpoints, addEvalCaseFromMcp } = useStore();
  const [endpointId, setEndpointId] = useState("");
  const [method, setMethod] = useState("");
  const [result, setResult] = useState("");
  const [day, setDay] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [items, setItems] = useState<McpCallSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<McpCall | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [making, setMaking] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const filterKey = `${endpointId}|${method}|${result}|${day}|${pageSize}`;
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
      endpointId: endpointId || undefined,
      method: method || undefined,
      ok: result === "ok" ? true : result === "fail" ? false : undefined,
      ...dayRange(day),
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
    }),
    [endpointId, method, result, day, pageSize, currentPage],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listMcpCalls(query);
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
      setDetail(await api.getMcpCall(id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "无法打开详情");
    } finally {
      setDetailLoading(false);
    }
  }

  async function makeEval(id: string) {
    setMaking(id);
    try {
      const created = await addEvalCaseFromMcp(id);
      toast(`已写入考卷（应召回 ${created.expect}）`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "无法出题");
    } finally {
      setMaking(null);
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

  const filtered = Boolean(endpointId || method || result || day);

  return (
    <>
      <HStack spacing={2} mb={3} justify="flex-end">
        <Button size="sm" variant="whiteBase" onClick={() => void load()} isLoading={loading}>
          刷新
        </Button>
        <Button size="sm" variant="whiteBase" onClick={() => setClearOpen(true)} isDisabled={total === 0}>
          清空
        </Button>
      </HStack>

      <div className="call-filters">
        <MySelect
          h="32px"
          w="180px"
          value={endpointId}
          placeholder="全部端点"
          onChange={setEndpointId}
          list={[
            { value: "", label: "全部端点" },
            ...endpoints.map((ep) => ({ value: ep.id, label: ep.name })),
          ]}
        />
        <MySelect
          h="32px"
          w="140px"
          value={method}
          placeholder="全部方法"
          onChange={setMethod}
          list={[
            { value: "", label: "全部方法" },
            { value: "tools/call", label: METHOD_LABEL["tools/call"] },
            { value: "tools/list", label: METHOD_LABEL["tools/list"] },
            { value: "initialize", label: METHOD_LABEL.initialize },
            { value: "auth", label: METHOD_LABEL.auth },
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
            filtered ? (
              "没有符合筛选条件的 MCP 调用。"
            ) : (
              <>
                还没有 MCP 调用。Cursor 或其它客户端连上端点后会出现在这里。成功的 tools/call 可点「加入考卷」。
              </>
            )
          }
        />
      ) : (
        <DataTable
          className="call-table"
          headers={["时间", "端点", "调用方", "方法", "工具 / 问句", "状态", "耗时", "摘要", ""]}
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
                <div className="call-model-name">
                  {row.endpointId ? (
                    <Link to={`/mcp/${row.endpointId}`} onClick={(e) => e.stopPropagation()}>
                      {row.endpointName || row.endpointId}
                    </Link>
                  ) : (
                    row.endpointName || "—"
                  )}
                </div>
                <div className="call-model-sub">{row.env || "—"}</div>
              </td>
              <td>
                <div className="call-model-name">{row.clientIp || "—"}</div>
                <div className="call-model-sub">{row.clientRegion || "—"}</div>
              </td>
              <td className="call-purpose">{METHOD_LABEL[row.method] || row.method || "—"}</td>
              <td>
                <div className="call-model-name">{row.toolName || "—"}</div>
                <div className="call-model-sub">{row.query || (row.hitCount != null ? `${row.hitCount} 条` : "")}</div>
              </td>
              <td>
                <span className={row.ok ? "call-status ok" : "call-status fail"}>
                  <span className="call-status-dot" />
                  {row.ok ? "成功" : "失败"}
                  {row.httpStatus && row.httpStatus !== 200 ? ` ${row.httpStatus}` : ""}
                </span>
              </td>
              <td className="call-latency">{row.latencyMs.toLocaleString("zh-CN")} ms</td>
              <td className="call-summary">{row.summary || row.error || "—"}</td>
              <td>
                {row.method === "tools/call" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    isLoading={making === row.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void makeEval(row.id);
                    }}
                  >
                    加入考卷
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal isOpen={Boolean(detail) || detailLoading} onClose={() => setDetail(null)} size="4xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent maxW="880px">
          <ModalHeader fontSize="16px">MCP 调用详情</ModalHeader>
          <ModalBody pb={6}>
            {detail ? (
              <McpCallDetail
                call={detail}
                onCopy={copy}
                making={making === detail.id}
                onMakeEval={() => void makeEval(detail.id)}
              />
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={clearOpen}
        onClose={() => setClearOpen(false)}
        title="清空 MCP 调用记录"
        confirmText="清空"
        onConfirm={async () => {
          const res = await api.clearMcpCalls();
          setItems([]);
          setTotal(0);
          setPage(1);
          toast(`已删除 ${res.deleted} 条`);
        }}
      >
        会删除当前保存的全部 MCP 入站记录，不影响模型调用记录。
      </ConfirmDialog>
    </>
  );
}

function McpCallDetail({
  call,
  onCopy,
  making,
  onMakeEval,
}: {
  call: McpCall;
  onCopy: (text: string, label: string) => void;
  making: boolean;
  onMakeEval: () => void;
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
          <span>方法</span>
          {METHOD_LABEL[call.method] || call.method || "—"}
        </div>
        <div>
          <span>端点</span>
          {call.endpointId ? <Link to={`/mcp/${call.endpointId}`}>{call.endpointName || call.endpointId}</Link> : "—"}
          {call.env ? ` · ${call.env}` : ""}
        </div>
        <div>
          <span>调用方</span>
          {call.clientIp || "—"}
          {call.clientRegion ? ` · ${call.clientRegion}` : ""}
        </div>
        <div>
          <span>工具</span>
          {call.toolId ? <Link to={`/tools/${call.toolId}`}>{call.toolName || call.toolId}</Link> : call.toolName || "—"}
        </div>
        {call.query ? (
          <div>
            <span>问句</span>
            {call.query}
          </div>
        ) : null}
        {call.hitCount != null ? (
          <div>
            <span>命中</span>
            {call.hitCount} 条
          </div>
        ) : null}
      </div>
      {call.method === "tools/call" ? (
        <Button size="sm" mb={4} onClick={onMakeEval} isLoading={making}>
          做成评测题并加入考卷
        </Button>
      ) : null}
      {call.error ? <div className="call-error">{call.error}</div> : null}
      <div className="call-json-wrap">
        <div className="call-json-head">
          <span>请求</span>
          <button type="button" onClick={() => onCopy(requestText, "请求")}>
            复制
          </button>
        </div>
        <pre className="call-json">{requestText}</pre>
      </div>
      <div className="call-json-wrap">
        <div className="call-json-head">
          <span>响应</span>
          <button type="button" onClick={() => onCopy(responseText, "响应")}>
            复制
          </button>
        </div>
        <pre className="call-json">{responseText}</pre>
      </div>
    </div>
  );
}
