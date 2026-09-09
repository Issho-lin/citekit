import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Box,
  Button,
  Flex,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
} from "@chakra-ui/react";
import { api, type AgentCitation, type AgentStep, type AgentStreamEvent } from "../api";
import { ProviderAvatar } from "../components/model/shared";
import { IconChat, IconCheckSmall, IconChevronDown, IconLink, IconSend, IconSpark, IconStop } from "../components/icons";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";
import type { McpEndpoint } from "../types";

type LiveStep = AgentStep & { id: string; pending?: boolean };

type Turn = {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  steps?: LiveStep[];
  citations?: AgentCitation[];
  status?: string;
  streaming?: boolean;
};

const MODEL_KEY = "citekit.chat.modelId";
const ENDPOINTS_KEY = "citekit.chat.endpointIds";

const SUGGESTIONS = [
  "不满八周岁的未成年人实施民事法律行为，效力怎么认定？",
  "向人民法院请求保护民事权利的诉讼时效期间是多久？",
  "物业服务合同到期后，业主委员会可以做什么？",
  "专项维修资金归谁所有，用在什么地方？",
];

function loadEndpointIds(fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(ENDPOINTS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    /* ignore */
  }
  return fallback;
}

function AnswerBody({
  text,
  citations,
  streaming,
  activeCite,
  onCite,
}: {
  text: string;
  citations: AgentCitation[];
  streaming?: boolean;
  activeCite?: number | null;
  onCite: (id: number) => void;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <div className={`chat-answer${streaming ? " is-streaming" : ""}`}>
      {parts.map((part, index) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) {
          return (
            <span key={index} className="chat-answer-text">
              {part}
            </span>
          );
        }
        const id = Number(match[1]);
        const exists = citations.some((item) => item.id === id);
        if (!exists) return <span key={index}>{part}</span>;
        return (
          <button
            key={index}
            type="button"
            className={`chat-cite-chip${activeCite === id ? " is-on" : ""}`}
            onClick={() => onCite(id)}
            aria-label={`查看引用 ${id}`}
          >
            {id}
          </button>
        );
      })}
      {streaming ? <span className="chat-caret" aria-hidden /> : null}
    </div>
  );
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

const ghostTriggerSx = {
  type: "button" as const,
  size: "sm" as const,
  variant: "ghost" as const,
  h: "28px",
  minH: "28px",
  px: 2,
  fontSize: "12px",
  fontWeight: 500,
  color: "myGray.600",
  borderRadius: "6px",
  maxW: "280px",
  _hover: { bg: "myGray.100", color: "myGray.800" },
  _active: { bg: "myGray.150" },
  _expanded: { bg: "myGray.100", color: "myGray.800" },
  _disabled: { opacity: 0.5, cursor: "not-allowed" },
};

function ModelSelect({
  value,
  options,
  onChange,
  isDisabled,
}: {
  value: string;
  options: { model: string; name: string; provider: string; mappedModel?: string }[];
  onChange: (id: string) => void;
  isDisabled?: boolean;
}) {
  const selected = options.find((m) => m.model === value);
  const label = selected?.name || selected?.model || "选择模型";

  return (
    <Menu autoSelect={false} strategy="fixed" placement="top-start" isLazy>
      {({ onClose }) => (
        <>
          <MenuButton
            as={Button}
            {...ghostTriggerSx}
            isDisabled={isDisabled || options.length === 0}
            rightIcon={
              <Box color="myGray.400">
                <IconChevronDown size={12} />
              </Box>
            }
            title="切换模型"
          >
            <Flex align="center" gap={1.5} minW={0}>
              {selected ? <ProviderAvatar provider={selected.provider} size={14} /> : null}
              <Box as="span" noOfLines={1}>
                {label}
              </Box>
            </Flex>
          </MenuButton>
          <MenuList
            minW="260px"
            maxW="90vw"
            maxH="45vh"
            overflowY="auto"
            px="6px"
            py="6px"
            bg="white"
            border="1px solid #fff"
            borderRadius="md"
            boxShadow="0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25)"
            zIndex={1800}
          >
            {options.length === 0 ? (
              <Box px={3} py={3} fontSize="13px" color="myGray.500">
                请先在设置中配置模型
              </Box>
            ) : (
              options.map((m) => {
                const active = m.model === value;
                return (
                  <MenuItem
                    key={m.model}
                    borderRadius="sm"
                    py={2}
                    px={2}
                    mb={0.5}
                    bg={active ? "myGray.100" : "transparent"}
                    color={active ? "primary.700" : "myGray.900"}
                    _hover={{ bg: "myGray.100" }}
                    onClick={() => {
                      if (!active) onChange(m.model);
                      onClose();
                    }}
                  >
                    <Flex align="center" gap={2} minW={0}>
                      <ProviderAvatar provider={m.provider} size={16} />
                      <Box minW={0}>
                        <Box fontSize="13px" noOfLines={1}>
                          {m.name || m.model}
                        </Box>
                        {m.mappedModel || m.provider ? (
                          <Box fontSize="11px" color="myGray.500" noOfLines={1}>
                            {m.mappedModel || m.provider}
                          </Box>
                        ) : null}
                      </Box>
                    </Flex>
                  </MenuItem>
                );
              })
            )}
          </MenuList>
        </>
      )}
    </Menu>
  );
}

function McpMultiSelect({
  options,
  value,
  onChange,
  isDisabled,
}: {
  options: McpEndpoint[];
  value: string[];
  onChange: (ids: string[]) => void;
  isDisabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const selected = useMemo(() => options.filter((ep) => value.includes(ep.id)), [options, value]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((ep) => ep.name.toLowerCase().includes(s) || ep.id.toLowerCase().includes(s));
  }, [options, q]);

  const label =
    selected.length === 0
      ? "选择 MCP"
      : selected.length === 1
        ? selected[0].name
        : `${selected.length} 个 MCP`;

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  }

  return (
    <Menu
      autoSelect={false}
      closeOnSelect={false}
      strategy="fixed"
      placement="top-start"
      isLazy
      onClose={() => setQ("")}
    >
      <MenuButton
        as={Button}
        {...ghostTriggerSx}
        isDisabled={isDisabled}
        rightIcon={
          <Box color="myGray.400">
            <IconChevronDown size={12} />
          </Box>
        }
        title="配置 MCP 端点"
      >
        <Flex align="center" gap={1.5} minW={0}>
          <Box color="myGray.500" display="grid" placeItems="center" flexShrink={0}>
            <IconLink size={14} />
          </Box>
          <Box as="span" noOfLines={1}>
            {label}
          </Box>
        </Flex>
      </MenuButton>
      <MenuList
        minW="280px"
        maxW="90vw"
        maxH="min(52vh, 360px)"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        px="6px"
        py="6px"
        bg="white"
        border="1px solid #fff"
        borderRadius="md"
        boxShadow="0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25)"
        zIndex={1800}
      >
        {options.length > 6 ? (
          <Box px={1} pb={2}>
            <Input
              size="sm"
              h="32px"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索端点"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </Box>
        ) : null}
        <Box overflowY="auto" flex="1" minH={0}>
          {filtered.length === 0 ? (
            <Box px={3} py={4} fontSize="13px" color="myGray.500" textAlign="center">
              没有匹配的端点
            </Box>
          ) : (
            filtered.map((ep) => {
              const on = value.includes(ep.id);
              return (
                <MenuItem
                  key={ep.id}
                  borderRadius="sm"
                  py={2}
                  px={2}
                  mb={0.5}
                  bg={on ? "myGray.100" : "transparent"}
                  _hover={{ bg: "myGray.100" }}
                  onClick={() => toggle(ep.id)}
                >
                  <Flex align="center" gap={2} w="100%" minW={0}>
                    <Box
                      w="16px"
                      h="16px"
                      borderRadius="4px"
                      border="1px solid"
                      borderColor={on ? "primary.500" : "myGray.300"}
                      bg={on ? "primary.500" : "white"}
                      color="white"
                      display="grid"
                      placeItems="center"
                      flexShrink={0}
                    >
                      {on ? <IconCheckSmall size={10} /> : null}
                    </Box>
                    <Box minW={0} flex="1">
                      <Box fontSize="13px" color={on ? "primary.700" : "myGray.900"} noOfLines={1}>
                        {ep.name}
                      </Box>
                      <Box fontSize="11px" color="myGray.500">
                        {ep.toolIds.length} 把工具 · {ep.env}
                      </Box>
                    </Box>
                  </Flex>
                </MenuItem>
              );
            })
          )}
        </Box>
        <Flex
          align="center"
          justify="space-between"
          gap={2}
          px={2}
          pt={2}
          mt={1}
          borderTop="1px solid"
          borderColor="myGray.100"
        >
          <Box fontSize="12px" color="myGray.500">
            已选 {selected.length}/{options.length}
          </Box>
          <Flex gap={1}>
            <Button type="button" size="xs" variant="ghost" onClick={() => onChange(options.map((ep) => ep.id))}>
              全选
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => onChange([])}>
              清空
            </Button>
          </Flex>
        </Flex>
      </MenuList>
    </Menu>
  );
}

export function AgentPage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const { endpoints, aiModels, llmModel, kbsReady } = useStore();
  const ready = useMemo(() => endpoints.filter((e) => e.toolIds.length > 0), [endpoints]);
  const readyIds = useMemo(() => ready.map((e) => e.id).join("|"), [ready]);
  const llmModels = useMemo(() => aiModels.filter((m) => m.isActive && m.type === "llm"), [aiModels]);
  const preset = params.get("endpoint") ?? "";

  const [modelId, setModelId] = useState(() => localStorage.getItem(MODEL_KEY) || "");
  const [endpointIds, setEndpointIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!ready.length) {
      setEndpointIds((prev) => (prev.length ? [] : prev));
      return;
    }
    setEndpointIds((prev) => {
      let next = prev.filter((id) => ready.some((e) => e.id === id));
      if (preset && ready.some((e) => e.id === preset) && !next.includes(preset)) {
        next = [...next, preset];
      }
      if (!next.length) {
        const stored = loadEndpointIds([ready[0].id]).filter((id) => ready.some((e) => e.id === id));
        next = stored.length ? stored : [ready[0].id];
      }
      return sameIds(prev, next) ? prev : next;
    });
  }, [ready, readyIds, preset]);

  useEffect(() => {
    if (!llmModels.length) return;
    setModelId((prev) => {
      if (prev && llmModels.some((m) => m.model === prev)) return prev;
      if (llmModel && llmModels.some((m) => m.model === llmModel)) return llmModel;
      return llmModels[0].model;
    });
  }, [llmModels, llmModel]);

  useEffect(() => {
    if (modelId) localStorage.setItem(MODEL_KEY, modelId);
  }, [modelId]);

  useEffect(() => {
    if (endpointIds.length) localStorage.setItem(ENDPOINTS_KEY, JSON.stringify(endpointIds));
  }, [endpointIds]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setTurns((prev) =>
      prev.map((turn, index) =>
        index === prev.length - 1 && turn.role === "assistant"
          ? { ...turn, streaming: false, status: turn.content ? undefined : "已停止" }
          : turn,
      ),
    );
  }

  function applyEvent(event: AgentStreamEvent) {
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last || last.role !== "assistant") return prev;
      const draft: Turn = { ...last, steps: [...(last.steps ?? [])], citations: [...(last.citations ?? [])] };

      if (event.type === "status") {
        draft.status = event.message;
      } else if (event.type === "thinking") {
        draft.thinking = [draft.thinking, event.text].filter(Boolean).join("\n\n");
      } else if (event.type === "tool_start") {
        draft.steps = [
          ...(draft.steps ?? []).filter((s) => s.id !== event.id),
          {
            id: event.id,
            tool: event.tool,
            query: event.query,
            ok: true,
            preview: "",
            endpointId: event.endpointId,
            endpointName: event.endpointName,
            pending: true,
          },
        ];
        draft.status = `调用 ${event.tool}…`;
      } else if (event.type === "tool_result") {
        draft.steps = (draft.steps ?? []).map((step) =>
          step.id === event.id
            ? {
                ...step,
                ok: event.ok,
                preview: event.preview,
                pending: false,
                citations: event.citations,
              }
            : step,
        );
        if (!draft.steps?.some((s) => s.id === event.id)) {
          draft.steps = [
            ...(draft.steps ?? []),
            {
              id: event.id,
              tool: event.tool,
              query: event.query,
              ok: event.ok,
              preview: event.preview,
              endpointId: event.endpointId,
              endpointName: event.endpointName,
              citations: event.citations,
              pending: false,
            },
          ];
        }
        if (event.citations?.length) {
          const map = new Map((draft.citations ?? []).map((c) => [c.id, c]));
          for (const cite of event.citations) map.set(cite.id, cite);
          draft.citations = [...map.values()].sort((a, b) => a.id - b.id);
        }
      } else if (event.type === "token") {
        draft.content += event.text;
        draft.status = undefined;
      } else if (event.type === "done") {
        draft.content = event.answer || draft.content;
        draft.thinking = event.thinking || draft.thinking;
        draft.citations = event.citations?.length ? event.citations : draft.citations;
        draft.steps = (event.steps || []).map((step, index) => ({
          ...step,
          id: `done-${index}`,
          pending: false,
        }));
        draft.streaming = false;
        draft.status = undefined;
      } else if (event.type === "error") {
        draft.content = draft.content || event.message;
        draft.streaming = false;
        draft.status = undefined;
      }
      next[next.length - 1] = draft;
      return next;
    });
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content) {
      toast("请输入问题");
      return;
    }
    if (!endpointIds.length) {
      toast("请至少选择一个 MCP 端点");
      return;
    }
    if (!modelId) {
      toast("请选择模型");
      return;
    }
    const history = [
      ...turns.filter((t) => t.content.trim()).map((t) => ({ role: t.role, content: t.content })),
      { role: "user" as const, content },
    ];
    setTurns((prev) => [
      ...prev,
      { role: "user", content },
      { role: "assistant", content: "", steps: [], citations: [], streaming: true, status: "正在连接…" },
    ]);
    setQuery("");
    setLoading(true);
    setActiveCite(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.agentChatStream(
        { messages: history, endpointIds, modelId },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "error") toast(event.message);
            applyEvent(event);
          },
        },
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message = err instanceof Error ? err.message : "对话失败";
      toast(message);
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content) {
          next[next.length - 1] = { ...last, content: message, streaming: false, status: undefined };
        } else if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, streaming: false };
        }
        return next;
      });
    } finally {
      abortRef.current = null;
      setLoading(false);
      setTurns((prev) =>
        prev.map((turn, index) =>
          index === prev.length - 1 && turn.role === "assistant" ? { ...turn, streaming: false } : turn,
        ),
      );
      composerRef.current?.focus();
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    await send(query);
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) void send(query);
    }
  }

  function clearChat() {
    if (loading) stop();
    setTurns([]);
    setActiveCite(null);
  }

  if (!kbsReady) {
    return <div className="page chat-page" aria-busy="true" />;
  }

  return (
    <div className="page chat-page">
      <div className="chat-root">
        <header className="chat-top">
          <div className="chat-top-main">
            <div className="chat-brand">
              <span className="chat-brand-icon" aria-hidden>
                <IconChat size={18} />
              </span>
              <div>
                <h1>对话</h1>
                <p>思考与工具轨迹 · 引用溯源</p>
              </div>
            </div>
            <div className="chat-top-actions">
              {turns.length > 0 ? (
                <button type="button" className="chat-ghost-btn" onClick={clearChat}>
                  新对话
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="chat-thread" ref={threadRef}>
          {turns.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-mark" aria-hidden>
                <IconSpark size={22} />
              </div>
              <h2>从一句真实业务问题开始</h2>
              <p>在下方选择模型与 MCP，Agent 会按白名单检索，回答里可点开编号查看原文定位。</p>
              <div className="chat-suggestions">
                {SUGGESTIONS.map((item) => (
                  <button key={item} type="button" className="chat-suggestion" onClick={() => void send(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn, index) => (
              <article key={`${turn.role}-${index}`} className={`chat-msg ${turn.role}`}>
                {turn.role === "user" ? (
                  <div className="chat-user-bubble">{turn.content}</div>
                ) : (
                  <div className="chat-assistant">
                    {turn.thinking ? (
                      <details className="chat-thinking" open={Boolean(turn.streaming && !turn.content)}>
                        <summary>思考过程</summary>
                        <pre>{turn.thinking}</pre>
                      </details>
                    ) : null}

                    {turn.steps && turn.steps.length > 0 ? (
                      <div className="chat-trace" aria-label="工具调用">
                        {turn.steps.map((step) => (
                          <details
                            key={step.id}
                            className={`chat-trace-item${step.ok ? "" : " is-miss"}${step.pending ? " is-pending" : ""}`}
                          >
                            <summary>
                              <span className="chat-trace-tool">{step.tool}</span>
                              {step.endpointName ? <span className="chat-trace-ep">{step.endpointName}</span> : null}
                              {step.query ? <span className="chat-trace-q">{step.query}</span> : null}
                              <span className="chat-trace-tag">
                                {step.pending ? "检索中" : step.ok ? "命中" : "未命中"}
                              </span>
                            </summary>
                            {step.preview ? <pre>{step.preview}</pre> : null}
                          </details>
                        ))}
                      </div>
                    ) : null}

                    {turn.status && turn.streaming ? <div className="chat-status">{turn.status}</div> : null}

                    {turn.content ? (
                      <AnswerBody
                        text={turn.content}
                        citations={turn.citations ?? []}
                        streaming={turn.streaming}
                        activeCite={activeCite}
                        onCite={setActiveCite}
                      />
                    ) : turn.streaming ? null : (
                      <div className="chat-answer is-empty">没有生成回答</div>
                    )}

                    {turn.citations && turn.citations.length > 0 && !turn.streaming ? (
                      <div className="chat-cites">
                        <div className="chat-cites-title">引用</div>
                        {turn.citations.map((cite) => (
                          <button
                            key={cite.id}
                            type="button"
                            className={`chat-cite-card${activeCite === cite.id ? " is-on" : ""}`}
                            onClick={() => setActiveCite(cite.id === activeCite ? null : cite.id)}
                          >
                            <span className="chat-cite-index">{cite.id}</span>
                            <span className="chat-cite-body">
                              <strong>{cite.title}</strong>
                              {cite.locator ? <em>{cite.locator}</em> : null}
                              <span>{cite.text}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        <form className="chat-composer" onSubmit={(e) => void onSubmit(e)}>
          <textarea
            ref={composerRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onComposerKey}
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            rows={1}
            disabled={ready.length === 0 || llmModels.length === 0}
          />
          <div className="chat-composer-bar">
            <div className="chat-composer-tools">
              <ModelSelect
                value={modelId}
                options={llmModels}
                onChange={setModelId}
                isDisabled={loading}
              />
              <span className="chat-composer-dot" aria-hidden />
              {ready.length === 0 ? (
                <p className="chat-hint">
                  还没有挂工具的端点，<Link to="/mcp/new">去发布</Link>
                </p>
              ) : (
                <McpMultiSelect
                  options={ready}
                  value={endpointIds}
                  onChange={setEndpointIds}
                  isDisabled={loading}
                />
              )}
            </div>
            {loading ? (
              <Button type="button" variant="outline" size="sm" onClick={stop} leftIcon={<IconStop size={14} />}>
                停止
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                isDisabled={!query.trim() || !endpointIds.length || !modelId}
                leftIcon={<IconSend size={14} />}
              >
                发送
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
