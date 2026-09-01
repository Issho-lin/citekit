import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Flex,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  useDisclosure,
} from "@chakra-ui/react";
import { InputDataModal } from "../components/InputDataModal";
import { CollectionMetaCard } from "../components/CollectionMetaCard";
import { ColorIcon } from "../components/ColorIcon";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Empty } from "../components/chrome";
import { IconList, IconMaximize, IconSearch, IconTextT, IconTrash } from "../components/icons";
import { TrainingStatesModal } from "../components/TrainingStatesModal";
import { DataProcess } from "../import/DataProcess";
import { fillProcess } from "../constants";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";
import type { Chunk, ProcessConfig, SourceType } from "../types";

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

function csvCell(v: string) {
  return `"${v.replaceAll('"', '""')}"`;
}

function exportChunks(filename: string, rows: Chunk[]) {
  const header = "index,id,title,locator,text";
  const body = rows
    .map((c, i) => [i + 1, c.id, c.title, c.locator, c.text].map((v) => csvCell(String(v))).join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/\.[^.]+$/, "") || "chunks"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function statusLabel(status: string) {
  if (status === "synced") return "已就绪";
  if (status === "syncing") return "训练中";
  return "异常";
}

export function KbDataPage() {
  const { kbId, sourceId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const delChunk = useDisclosure();
  const retrain = useDisclosure();
  const editor = useDisclosure();
  const training = useDisclosure();
  const {
    knowledgeBases,
    sources,
    chunks,
    updateSource,
    retrainSource,
    updateChunk,
    insertChunk,
    removeChunk,
  } = useStore();
  const kb = knowledgeBases.find((k) => k.id === kbId);
  const source = sources.find((s) => s.id === sourceId);
  const rows = chunks.filter((c) => c.sourceId === sourceId);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draftProcess, setDraftProcess] = useState<ProcessConfig | null>(null);

  const process = fillProcess(source);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) => c.title.toLowerCase().includes(q) || c.text.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const indexAmount = rows.length * (process.autoIndexes ? 2 : 1);

  if (!kb || !source) {
    return (
      <div className="page">
        <Empty text="未找到集合。" to="/kb" cta="返回知识库" />
      </div>
    );
  }

  function openEditor(chunk?: Chunk) {
    setEditingId(chunk?.id ?? "new");
    editor.onOpen();
  }

  return (
    <div className="kb-page">
      <div className="kb-split data-split">
        <div className="kb-main-card data-card-wrap">
          <Flex align="center" px={4} pt={3} pb={2}>
            <Flex
              align="center"
              cursor="pointer"
              py="0.38rem"
              px={2}
              borderRadius="md"
              fontSize="sm"
              fontWeight={500}
              _hover={{ bg: "myGray.50" }}
              onClick={() => nav(`/kb/${kb.id}`)}
            >
              <button type="button" className="kb-back-round" aria-label="返回">
                ←
              </button>
              <Box ml={2} color="myGray.600">
                返回
              </Box>
            </Flex>
          </Flex>

          <Flex align="center" px={6} gap={2} flexWrap="wrap">
            <Flex align="center" gap={2} minW={0} flex="1">
              <ColorIcon name={sourceIcon(source.type)} size={22} />
              <Box className="text-ellipsis" fontSize="md" color="black" fontWeight={500}>
                {source.title}
              </Box>
            </Flex>
            <Button variant="whitePrimary" onClick={() => exportChunks(source.title, rows)}>
              导出分块
            </Button>
            <Button
              variant="whitePrimary"
              onClick={() => {
                setDraftProcess(fillProcess(source));
                retrain.onOpen();
              }}
            >
              调整训练参数
            </Button>
            <Button variant="whitePrimary" onClick={() => openEditor()}>
              插入
            </Button>
          </Flex>

          <Box px={6}>
            <div className="data-divider" />
          </Box>

          <Flex align="center" px={6} pb={4} gap={3}>
            <Flex align="center" color="myGray.500" minW={0}>
              <IconList />
              <Box as="span" ml={2} fontSize="14px" fontWeight={500}>
                {rows.length} 组数据, {indexAmount} 组索引
              </Box>
              <button
                type="button"
                className={source.status === "syncing" ? "data-status data-status-warn" : "data-status"}
                onClick={training.onOpen}
              >
                {statusLabel(source.status)}
                <IconMaximize />
              </button>
            </Flex>
            <Box flex="1" />
            <div className="data-search">
              <IconSearch size={14} />
              <Input
                variant="unstyled"
                h="32px"
                fontSize="13px"
                placeholder="搜索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </Flex>

          <div className="data-card-body">
            {shown.length === 0 ? (
              <Empty text="这个集合还没有数据。" to={`/kb/${kb.id}/import`} cta="去导入" />
            ) : (
              <div className="data-chunk-list">
                {shown.map((c, index) => (
                  <div
                    key={c.id}
                    className={index % 2 === 1 ? "data-chunk data-chunk-odd" : "data-chunk"}
                    onClick={() => openEditor(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openEditor(c);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="data-chunk-tag">
                      <span className="data-chunk-index">#{index + 1}</span>
                      <span className="data-chunk-id">ID:{c.id}</span>
                    </div>
                    <p>{c.text}</p>
                    <div className="data-chunk-foot">
                      <span className="data-chunk-len">
                        <IconTextT />
                        {(c.text + (c.a || "")).length}
                      </span>
                      <IconButton
                        aria-label="删除"
                        size="xsSquare"
                        variant="whiteDanger"
                        boxShadow="0px 1px 2px rgba(19, 51, 107, 0.08)"
                        icon={<IconTrash />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(c.id);
                          delChunk.onOpen();
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <CollectionMetaCard source={source} process={process} />
      </div>

      <ConfirmDialog
        isOpen={delChunk.isOpen}
        onClose={() => {
          delChunk.onClose();
          setPendingDelete(null);
        }}
        title="确认删除该数据？"
        onConfirm={() => {
          if (pendingDelete) {
            removeChunk(pendingDelete);
            toast("已删除");
          }
        }}
      >
        删除后无法恢复。确认删除该条数据？
      </ConfirmDialog>

      {training.isOpen && (
        <TrainingStatesModal
          source={source}
          process={process}
          dataAmount={rows.length}
          onClose={training.onClose}
        />
      )}

      {editor.isOpen && source && (
        <InputDataModal
          key={editingId}
          sourceTitle={source.title}
          chunk={editingId && editingId !== "new" ? rows.find((c) => c.id === editingId) : undefined}
          onClose={() => {
            editor.onClose();
            setEditingId(null);
          }}
          onSave={({ q, a, indexes }) => {
            if (editingId === "new") {
              const id = insertChunk(source.id, {
                title: q.slice(0, 24) || "手动插入",
                text: q,
                a,
                indexes,
              });
              setEditingId(id);
              return;
            }
            if (editingId) {
              updateChunk(editingId, { text: q, a, indexes, title: q.slice(0, 24) || "手动插入" });
            }
          }}
        />
      )}

      <Modal isOpen={retrain.isOpen} onClose={retrain.onClose} size="xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent maxH="90vh">
          <ModalHeader>调整训练参数</ModalHeader>
          <ModalBody>
            {draftProcess ? (
              <DataProcess process={draftProcess} onChange={setDraftProcess} />
            ) : null}
            <p className="page-desc">确认后会按新参数重新切片，已手工改过的块会被新切片替换。</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="whiteBase" mr={3} onClick={retrain.onClose}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (draftProcess) updateSource(source.id, draftProcess);
                retrainSource(source.id);
                retrain.onClose();
                toast("已按当前参数重新训练");
              }}
            >
              确认并重新训练
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
