import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Flex,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, Empty, PageHero, PageLoading, Panel } from "../components/chrome";
import { MySelect } from "../components/MySelect";
import { ProviderAvatar } from "../components/model/shared";
import { useToast } from "../components/Toast";
import { MODEL_TYPE_META } from "../mock/models";
import type { ModelCall, ModelCallSummary } from "../types";

const PURPOSE_LABEL: Record<string, string> = {
  test: "连通测试",
  discover: "拉取模型",
  ingest: "入库向量化",
  retrieve: "检索向量化",
  rerank: "重排",
  chat: "对话",
  embed: "向量化",
  qa: "问答提取",
  paragraph: "识别段落",
  pdf_enhance: "PDF 增强",
  image_index: "图片索引",
  auto_index: "补充索引",
  call: "其它",
};

const PAGE_SIZE = 50;

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

export function CallLogsPage() {
  const toast = useToast();
  const [type, setType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState("");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [items, setItems] = useState<ModelCallSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ModelCall | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const query = useMemo(
    () => ({
      type: type || undefined,
      purpose: purpose || undefined,
      ok: result === "ok" ? true : result === "fail" ? false : undefined,
      q: q.trim() || undefined,
      limit: PAGE_SIZE,
    }),
    [type, purpose, result, q],
  );

  const load = useCallback(async (offset = 0, append = false) => {
    setLoading(true);
    try {
      const data = await api.listModelCalls({ ...query, offset });
      setTotal(data.total);
      setItems((prev) => (append ? [...prev, ...data.items] : data.items));
    } catch (err) {
      toast(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load(0, false);
  }, [load]);

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
          desc="所有实际上游模型请求都会记在这里：连通测试、入库向量化、检索、重排、拉取模型列表。点一行看请求和响应。"
          action={
            <HStack spacing={2}>
              <Button size="sm" variant="whiteBase" onClick={() => void load(0, false)} isLoading={loading}>
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
              ...Object.entries(PURPOSE_LABEL).map(([value, label]) => ({ value, label })),
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
          <Input
            size="sm"
            h="32px"
            maxW="280px"
            bg="white"
            placeholder="搜模型 ID、摘要、错误…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQ(qDraft);
            }}
            onBlur={() => setQ(qDraft)}
          />
        </div>

        {loading && items.length === 0 ? (
          <PageLoading compact label="正在拉取调用记录" />
        ) : items.length === 0 ? (
          <Empty
            text={
              <>
                还没有调用记录。去 <Link to="/settings">设置</Link> 测一下模型，或入库 / 试搜后会显示在这里。
              </>
            }
          />
        ) : (
          <Panel title={`共 ${total} 条`}>
            <DataTable headers={["时间", "模型", "用途", "结果", "耗时", "摘要"]}>
              {items.map((row) => (
                <tr key={row.id} className="clickable" onClick={() => void openDetail(row.id)}>
                  <td className="mono">{formatTime(row.createdAt)}</td>
                  <td>
                    <Flex align="center" gap={2}>
                      {row.provider ? <ProviderAvatar provider={row.provider} /> : null}
                      <div>
                        <div>{row.modelName || row.modelId || "—"}</div>
                        <div className="mono">
                          {typeLabel(row.type)}
                          {row.mappedModel && row.mappedModel !== row.modelId ? ` · ${row.mappedModel}` : ""}
                        </div>
                      </div>
                    </Flex>
                  </td>
                  <td>{PURPOSE_LABEL[row.purpose] || row.purpose || "—"}</td>
                  <td>
                    <span className={row.ok ? "call-ok" : "call-fail"}>
                      {row.ok ? "成功" : "失败"}
                      {row.httpStatus ? ` ${row.httpStatus}` : ""}
                    </span>
                  </td>
                  <td className="mono">{row.latencyMs} ms</td>
                  <td className="call-summary">{row.summary || row.error || "—"}</td>
                </tr>
              ))}
            </DataTable>
            {items.length < total ? (
              <div className="call-more">
                <Button size="sm" variant="whiteBase" onClick={() => void load(items.length, true)} isLoading={loading}>
                  加载更多
                </Button>
              </div>
            ) : null}
          </Panel>
        )}
      </div>

      <Modal isOpen={Boolean(detail) || detailLoading} onClose={() => setDetail(null)} size="4xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent maxW="880px">
          <ModalHeader fontSize="16px">调用详情</ModalHeader>
          <ModalBody pb={6}>
            {detail ? <CallDetail call={detail} onCopy={copy} /> : <PageLoading compact label="正在打开详情" />}
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
        {call.totalTokens != null ? (
          <div>
            <span>用量</span>
            {call.promptTokens ?? "—"} / {call.completionTokens ?? "—"} / {call.totalTokens} tokens
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