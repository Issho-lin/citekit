import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useDisclosure,
} from "@chakra-ui/react";
import { ColorIcon } from "../components/ColorIcon";
import { Empty } from "../components/chrome";
import {
  IconFileCollection,
  IconFolderImport,
  IconImageCollection,
  IconList,
  IconManualCollection,
  IconSearch,
} from "../components/icons";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { KbInfoPanel } from "../components/KbInfoPanel";
import { RetrievePlay } from "../components/RetrievePlay";
import { WebsiteConfigModal } from "../components/WebsiteConfigModal";
import { FileSourceSelector } from "../import/FileSourceSelector";
import type { ImportSourceKind } from "../import/types";
import { SOURCE_LABEL, searchFromKb } from "../constants";
import { api } from "../api";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";
import type { KbKind, SourceType } from "../types";

function sourceIcon(t: SourceType) {
  if (t === "web") return "website" as const;
  if (t === "feishu") return "feishu" as const;
  if (t === "yuque") return "yuque" as const;
  if (t === "dingtalk") return "dingtalk" as const;
  if (t === "api") return "api" as const;
  if (t === "image") return "image" as const;
  if (t === "folder") return "folder" as const;
  return "dataset" as const;
}

function isThirdPartyKind(kind: KbKind) {
  return kind === "api" || kind === "feishu" || kind === "yuque" || kind === "dingtalk";
}

function ImportActionFace({ label }: { label: string }) {
  return (
    <Flex
      px={3.5}
      py={2}
      borderRadius="sm"
      cursor="pointer"
      bg="primary.500"
      overflow="hidden"
      color="white"
      alignItems="center"
    >
      <Flex h="20px" alignItems="center">
        <IconFolderImport />
      </Flex>
      <Box h="20px" ml={2} fontSize="sm" fontWeight={500} lineHeight="20px">
        {label}
      </Box>
    </Flex>
  );
}

const menuItemStyle = {
  borderRadius: "sm" as const,
  py: 2,
  px: 3,
  fontSize: "sm",
  color: "myGray.600",
  mb: 0.5,
  _last: { mb: 0 },
  _hover: { bg: "primary.50", color: "primary.600" },
  _focus: { bg: "primary.50", color: "primary.600" },
  _active: { bg: "primary.50", color: "primary.600" },
};

export function KbDetailPage() {
  const { kbId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "test" ? "test" : "collection";
  const colParent = params.get("parent") || undefined;
  const { knowledgeBases, kbsReady, sources, chunks, removeSource, addSource } = useStore();
  const kb = knowledgeBases.find((k) => k.id === kbId);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<{ name: string } | null>(null);
  const [websiteOpen, setWebsiteOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const batchDel = useDisclosure();

  const kbSources = sources.filter((s) => s.kbId === kbId && (s.parentId || undefined) === colParent);
  const shown = kbSources.filter((s) => !q.trim() || s.title.toLowerCase().includes(q.trim().toLowerCase()));

  const parentFolder = sources.find((s) => s.id === colParent);

  const paths = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    let cur = parentFolder;
    while (cur) {
      out.unshift({ id: cur.id, name: cur.title });
      cur = sources.find((s) => s.id === cur?.parentId);
    }
    return out;
  }, [parentFolder, sources]);

  if (!kbsReady) {
    return (
      <div className="page">
        <p className="page-desc">加载中…</p>
      </div>
    );
  }

  if (!kb) {
    return (
      <div className="page">
        <Empty text="未找到知识库。" to="/kb" cta="返回列表" />
      </div>
    );
  }

  function setTab(next: "collection" | "test") {
    setParams(next === "test" ? { tab: "test" } : {}, { replace: true });
    setPicked([]);
  }

  function goImport(source: ImportSourceKind) {
    if (!kbId) return;
    nav(`/kb/${kbId}/import?source=${source}${colParent ? `&parent=${colParent}` : ""}`);
  }

  const allIds = shown.map((s) => s.id);
  const allOn = allIds.length > 0 && allIds.every((id) => picked.includes(id));

  return (
    <div className="kb-page">
      <div className="kb-navbar">
        <button type="button" className="kb-back-round" onClick={() => nav("/kb")} aria-label="返回">
          ←
        </button>
        <div className="kb-navbar-name">{kb.name}</div>
        <div className="kb-tabs">
          <button type="button" className={tab === "collection" ? "on" : ""} onClick={() => setTab("collection")}>
            数据集
          </button>
          <button type="button" className={tab === "test" ? "on" : ""} onClick={() => setTab("test")}>
            搜索测试
          </button>
        </div>
      </div>

      <div className="kb-split">
        <div className="kb-main-card">
          {tab === "collection" && (
            <>
              <div className="col-head">
                <div className="col-head-title">
                  <IconList />
                  <span>
                    {parentFolder ? parentFolder.title : "数据集"}({shown.length})
                  </span>
                  {paths.length > 0 && (
                    <span className="folder-path" style={{ marginLeft: 8 }}>
                      <button type="button" className="linkish" onClick={() => nav(`/kb/${kb.id}`)}>
                        根
                      </button>
                      {paths.map((p) => (
                        <span key={p.id}>
                          <span className="folder-sep">/</span>
                          <button
                            type="button"
                            className="linkish"
                            onClick={() => nav(`/kb/${kb.id}?parent=${p.id}`)}
                          >
                            {p.name}
                          </button>
                        </span>
                      ))}
                    </span>
                  )}
                  {kb.websiteUrl && (
                    <a className="mono" href={kb.websiteUrl} target="_blank" rel="noreferrer">
                      {kb.websiteUrl}
                    </a>
                  )}
                </div>
                <label className="ds-search col-search">
                  <IconSearch />
                  <input value={q} placeholder="搜索" onChange={(e) => setQ(e.target.value)} />
                </label>
                {kb.kind === "website" ? (
                  <Button onClick={() => setWebsiteOpen(true)}>
                    {kb.websiteUrl ? "配置" : "开始配置"}
                  </Button>
                ) : isThirdPartyKind(kb.kind) ? (
                  <Box as="button" type="button" onClick={() => goImport("apiDataset")}>
                    <ImportActionFace label="添加文件" />
                  </Box>
                ) : (
                  <Menu placement="bottom-end" offset={[0, 5]} autoSelect={false}>
                    <MenuButton
                      variant="unstyled"
                      display="block"
                      h="auto"
                      minW={0}
                      lineHeight="normal"
                    >
                      <ImportActionFace label="新建/导入" />
                    </MenuButton>
                    <MenuList minW="auto" maxW="300px" p="6px" border="1px solid #fff" boxShadow="3">
                      <MenuItem {...menuItemStyle} onClick={() => setSourceOpen(true)}>
                        <IconFileCollection />
                        <Box ml={2}>文本数据集</Box>
                      </MenuItem>
                      <MenuItem {...menuItemStyle} onClick={() => goImport("imageDataset")}>
                        <IconImageCollection />
                        <Box ml={2}>图片数据集</Box>
                      </MenuItem>
                      <MenuItem {...menuItemStyle} onClick={() => setPrompt({ name: "" })}>
                        <IconManualCollection />
                        <Box ml={2}>空白数据集</Box>
                      </MenuItem>
                    </MenuList>
                  </Menu>
                )}
              </div>

              {picked.length > 0 && (
                <div className="col-batch">
                  已选 {picked.length} 项
                  <Button size="sm" colorScheme="red" variant="outline" onClick={batchDel.onOpen}>
                    批量删除
                  </Button>
                </div>
              )}

              {shown.length === 0 ? (
                kb.kind === "website" && !kb.websiteUrl ? (
                  <Empty
                    text={
                      <>
                        还没有关联网站，{" "}
                        <button type="button" className="linkish" onClick={() => setWebsiteOpen(true)}>
                          点击配置网站
                        </button>
                      </>
                    }
                  />
                ) : kb.kind === "website" ? (
                  <Empty text="您的站点可能非静态站点，无法同步" />
                ) : (
                  <Empty text="数据集空空如也" />
                )
              ) : (
                <table className="data-table col-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <Checkbox
                          isChecked={allOn}
                          onChange={(e) => setPicked(e.target.checked ? allIds : [])}
                        />
                      </th>
                      <th>名称</th>
                      <th>更新时间</th>
                      <th>状态</th>
                      <th>数据量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((s) => {
                      const n = s.chunkCount ?? chunks.filter((c) => c.sourceId === s.id).length;
                      return (
                        <tr
                          key={s.id}
                          className="clickable"
                          onClick={() =>
                            s.type === "folder"
                              ? nav(`/kb/${kb.id}?parent=${s.id}`)
                              : nav(`/kb/${kb.id}/data/${s.id}`)
                          }
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              isChecked={picked.includes(s.id)}
                              onChange={(e) =>
                                setPicked((prev) =>
                                  e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                                )
                              }
                            />
                          </td>
                          <td>
                            <div className="name-cell">
                              <ColorIcon name={sourceIcon(s.type)} size={28} />
                              <div>
                                <div>{s.title}</div>
                                <div className="mono">{SOURCE_LABEL[s.type]}</div>
                              </div>
                            </div>
                          </td>
                          <td className="mono">{s.updatedAt}</td>
                          <td>
                            <span
                              className={
                                s.status === "syncing"
                                  ? "tag tag-warn"
                                  : s.status === "error"
                                    ? "tag tag-red"
                                    : "tag tag-ok"
                              }
                              title={s.errorMessage || undefined}
                            >
                              {s.status === "synced"
                                ? "已就绪"
                                : s.status === "syncing"
                                  ? "训练中"
                                  : s.status === "error"
                                    ? "失败"
                                    : s.status}
                            </span>
                          </td>
                          <td>{s.type === "folder" ? "—" : n}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
          {tab === "test" && (
            <KbSearchTest kbId={kb.id} />
          )}
        </div>
        <KbInfoPanel kb={kb} />
      </div>

      {websiteOpen && <WebsiteConfigModal kb={kb} onClose={() => setWebsiteOpen(false)} />}

      {sourceOpen && (
        <FileSourceSelector
          onClose={() => setSourceOpen(false)}
          onConfirm={(source) => {
            setSourceOpen(false);
            goImport(source);
          }}
        />
      )}

      {prompt && (
        <div className="fg-modal-root">
          <button type="button" className="create-mask" onClick={() => setPrompt(null)} aria-label="关闭" />
          <div className="fg-modal">
            <h3>创建手动数据集</h3>
            <p className="page-desc">手动数据集允许创建一个空的容器装入数据</p>
            <Input
              value={prompt.name}
              onChange={(e) => setPrompt({ ...prompt, name: e.target.value })}
              placeholder="名称"
            />
            <div className="modal-actions">
              <Button variant="outline" colorScheme="gray" onClick={() => setPrompt(null)}>
                关闭
              </Button>
              <Button
                onClick={() => {
                  if (!prompt.name.trim() || !kbId) {
                    toast("请填写名称");
                    return;
                  }
                  void addSource(
                    kbId,
                    "manual",
                    prompt.name.trim(),
                    `manual/${prompt.name.trim()}`,
                    undefined,
                    colParent,
                  ).then(
                    () => {
                      toast("创建成功");
                      setPrompt(null);
                    },
                    (err: unknown) => toast(err instanceof Error ? err.message : "创建失败"),
                  );
                }}
              >
                创建
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={batchDel.isOpen}
        onClose={batchDel.onClose}
        title="确认删除所选文件？"
        onConfirm={() => {
          picked.forEach((id) => removeSource(id));
          setPicked([]);
          toast("已删除");
        }}
      >
        删除后无法恢复，请确认你已经备份了相关数据。
      </ConfirmDialog>
    </div>
  );
}

function KbSearchTest({ kbId }: { kbId: string }) {
  const { knowledgeBases, sources, chunks, updateKnowledgeBase } = useStore();
  const kb = knowledgeBases.find((k) => k.id === kbId);
  const collections = useMemo(
    () => sources.filter((s) => s.kbId === kbId && s.type !== "folder"),
    [sources, kbId],
  );
  const allIds = collections.map((s) => s.id);
  const [picked, setPicked] = useState<string[]>(allIds);

  useEffect(() => {
    const ids = collections.map((s) => s.id);
    setPicked((prev) => {
      const keep = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !prev.includes(id));
      return [...keep, ...added];
    });
  }, [collections]);

  if (!kb) return null;

  const allOn = allIds.length > 0 && allIds.every((id) => picked.includes(id));

  return (
    <>
      <p className="page-desc" style={{ marginBottom: 12 }}>
        这里只试搜语料，不决定 Agent 怎么搜。做成工具时会拷一份当时的参数。勾选只用于本次测试，不会保存。
      </p>
      <div className="field" style={{ marginBottom: 16 }}>
        <span>数据集（默认全选）</span>
        {collections.length === 0 ? (
          <p className="page-desc">还没有数据集。</p>
        ) : (
          <>
            <label className="source-check">
              <Checkbox
                isChecked={allOn}
                onChange={(e) => setPicked(e.target.checked ? allIds : [])}
              />
              <span>全部</span>
            </label>
            {collections.map((s) => (
              <label key={s.id} className="source-check">
                <Checkbox
                  isChecked={picked.includes(s.id)}
                  onChange={(e) =>
                    setPicked((prev) =>
                      e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                    )
                  }
                />
                <span>{s.title}</span>
              </label>
            ))}
          </>
        )}
      </div>
      <RetrievePlay
        sourceIds={picked}
        search={searchFromKb(kb)}
        onSearchChange={(next) =>
          void updateKnowledgeBase(kb.id, {
            searchMode: next.searchMode,
            similarity: next.similarity,
            limit: next.limit,
            usingRerank: next.usingRerank,
          })
        }
        chunks={chunks}
        defaultQuery=""
        placeholder="输入问题，测试当前知识库的语料"
        onRetrieve={async ({ query, sourceIds, search }) => {
          const result = await api.searchKb(kb.id, {
            query,
            sourceIds,
            searchMode: search?.searchMode,
            similarity: search?.similarity,
            limit: search?.limit,
            usingRerank: search?.usingRerank,
          });
          return { hits: result.hits, message: result.message ?? undefined };
        }}
      />
    </>
  );
}
