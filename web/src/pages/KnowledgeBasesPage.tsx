import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Textarea,
  useDisclosure,
} from "@chakra-ui/react";
import { ColorIcon, EmptyKbArt, kbIcon } from "../components/ColorIcon";
import { CreateKbMenu } from "../components/CreateKbMenu";
import { IconMore, IconSearch } from "../components/icons";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useStore } from "../mock/store";
import { useToast } from "../components/Toast";
import type { KnowledgeBase } from "../types";

export function KnowledgeBasesPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const parentId = params.get("parent") || undefined;
  const { knowledgeBases, updateKnowledgeBase, removeKnowledgeBase } = useStore();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<KnowledgeBase | null>(null);
  const [editName, setEditName] = useState("");
  const [editIntro, setEditIntro] = useState("");
  const [delId, setDelId] = useState<string | null>(null);
  const del = useDisclosure();

  const list = useMemo(() => {
    const inFolder = knowledgeBases.filter((k) => (k.parentId || undefined) === parentId);
    const s = q.trim().toLowerCase();
    if (!s) return inFolder;
    return inFolder.filter(
      (k) => k.name.toLowerCase().includes(s) || k.description.toLowerCase().includes(s),
    );
  }, [q, knowledgeBases, parentId]);

  const deleting = knowledgeBases.find((k) => k.id === delId);

  return (
    <div className="page">
      <div className="page-inner">
        <div className="ds-head">
          <div>
            <h1 className="page-title">我的知识库</h1>
          </div>
          <div className="ds-toolbar">
            <label className="ds-search">
              <IconSearch />
              <input
                value={q}
                placeholder="知识库名称"
                maxLength={30}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <CreateKbMenu parentId={parentId} />
          </div>
        </div>
        {list.length === 0 ? (
          <div className="empty-hero">
            <EmptyKbArt />
            <p>还没有知识库，快去创建一个吧！</p>
          </div>
        ) : (
          <div className="ds-grid">
            {list.map((kb) => (
              <div
                key={kb.id}
                className="ds-card"
                role="button"
                tabIndex={0}
                onClick={() =>
                  kb.kind === "folder" ? nav(`/kb?parent=${kb.id}`) : nav(`/kb/${kb.id}`)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    kb.kind === "folder" ? nav(`/kb?parent=${kb.id}`) : nav(`/kb/${kb.id}`);
                  }
                }}
              >
                <div className="ds-card-top">
                  <ColorIcon name={kbIcon(kb.kind)} size={34} />
                  <div className="ds-card-name">{kb.name}</div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Menu>
                      <MenuButton
                        as={Button}
                        variant="ghost"
                        size="sm"
                        minW="28px"
                        h="28px"
                        px={1}
                        aria-label="更多"
                      >
                        <IconMore />
                      </MenuButton>
                      <MenuList minW="140px">
                        <MenuItem
                          onClick={() => {
                            setEdit(kb);
                            setEditName(kb.name);
                            setEditIntro(kb.description);
                          }}
                        >
                          编辑信息
                        </MenuItem>
                        {kb.kind !== "folder" && (
                          <MenuItem
                            onClick={() => {
                              const blob = new Blob([JSON.stringify(kb, null, 2)], {
                                type: "text/csv",
                              });
                              const a = document.createElement("a");
                              a.href = URL.createObjectURL(blob);
                              a.download = `${kb.name}.csv`;
                              a.click();
                              toast("已开始导出");
                            }}
                          >
                            导出
                          </MenuItem>
                        )}
                        <MenuItem
                          color="red.500"
                          onClick={() => {
                            setDelId(kb.id);
                            del.onOpen();
                          }}
                        >
                          删除
                        </MenuItem>
                      </MenuList>
                    </Menu>
                  </div>
                </div>
                <p className="ds-card-intro">
                  {kb.description ||
                    (kb.kind === "folder" ? "这个目录还没设置介绍~" : "这个知识库还没有介绍~")}
                </p>
                {kb.kind !== "folder" && (
                  <div className="ds-card-tags">
                    <span className="tag">{kb.vectorModel}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={!!edit} onClose={() => setEdit(null)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>编辑信息</ModalHeader>
          <ModalBody>
            <label className="fg-field">
              <span>名称</span>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label className="fg-field" style={{ marginTop: 12 }}>
              <span>介绍</span>
              <Textarea value={editIntro} onChange={(e) => setEditIntro(e.target.value)} />
            </label>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" colorScheme="gray" onClick={() => setEdit(null)}>
              关闭
            </Button>
            <Button
              ml={3}
              onClick={() => {
                if (!edit) return;
                updateKnowledgeBase(edit.id, {
                  name: editName.trim() || edit.name,
                  description: editIntro.trim(),
                });
                toast("已保存");
                setEdit(null);
              }}
            >
              确认
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={del.isOpen}
        onClose={del.onClose}
        title={deleting?.kind === "folder" ? "确认删除该文件夹？" : `确认删除 ${deleting?.name}？`}
        onConfirm={() => {
          if (delId) removeKnowledgeBase(delId);
          toast("已删除");
          setDelId(null);
        }}
      >
        {deleting?.kind === "folder"
          ? "将会删除此文件夹与其中所有知识库，该操作无法撤销。"
          : "删除知识库是危险操作，会删掉该知识库及其所有数据集与数据，该操作无法撤销。"}
      </ConfirmDialog>
    </div>
  );
}
