import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Textarea,
  useDisclosure,
} from "@chakra-ui/react";
import { ColorIcon, kbIcon } from "./ColorIcon";
import { ConfirmDialog } from "./ConfirmDialog";
import { MySelect } from "./MySelect";
import { IconEdit } from "./icons";
import { modelSelectList } from "../mock/models";
import { useStore } from "../mock/store";
import { useToast } from "./Toast";
import type { KnowledgeBase } from "../types";

const KIND_TAG: Record<string, string> = {
  dataset: "通用知识库",
  website: "Web 站点同步",
  feishu: "飞书知识库",
  yuque: "语雀知识库",
  api: "API 文件库",
  dingtalk: "钉钉知识库",
};

export function KbInfoPanel({ kb }: { kb: KnowledgeBase }) {
  const nav = useNavigate();
  const toast = useToast();
  const { updateKnowledgeBase, removeKnowledgeBase, aiModels } = useStore();
  const del = useDisclosure();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(kb.name);
  const [editIntro, setEditIntro] = useState(kb.description);

  function openEdit() {
    setEditName(kb.name);
    setEditIntro(kb.description);
    setEditing(true);
  }

  return (
    <aside className="kb-info">
      <div className="kb-info-head">
        <ColorIcon name={kbIcon(kb.kind)} size={20} />
        <div className="kb-info-name">{kb.name}</div>
        <button type="button" className="kb-info-edit" aria-label="编辑信息" onClick={openEdit}>
          <IconEdit />
        </button>
      </div>
      <span className="tag">{KIND_TAG[kb.kind] ?? kb.kind}</span>
      <p className="kb-info-intro">{kb.description || "这个知识库还没有介绍~"}</p>
      <div className="kb-info-div" />
      <div className="form-stack">
        <label>
          知识库 ID
          <div className="mono">{kb.id}</div>
        </label>
        <label>
          索引模型
          <MySelect
            value={kb.vectorModel}
            onChange={(vectorModel) => updateKnowledgeBase(kb.id, { vectorModel })}
            list={modelSelectList(aiModels, "embedding", kb.vectorModel)}
          />
        </label>
        <label>
          文本理解模型
          <MySelect
            value={kb.llmModel}
            onChange={(llmModel) => updateKnowledgeBase(kb.id, { llmModel })}
            list={modelSelectList(aiModels, "llm", kb.llmModel)}
          />
        </label>
        <label>
          图片理解模型
          <MySelect
            value={kb.vlmModel}
            onChange={(vlmModel) => updateKnowledgeBase(kb.id, { vlmModel })}
            list={modelSelectList(aiModels, "vlm", kb.vlmModel)}
          />
        </label>
        <label>
          重排模型
          <MySelect
            value={kb.rerankModel}
            onChange={(rerankModel) => updateKnowledgeBase(kb.id, { rerankModel })}
            list={modelSelectList(aiModels, "rerank", kb.rerankModel, "不使用")}
            placeholder="不使用"
          />
        </label>
        <Button as={Link} to={`/tools/new?kb=${kb.id}`} w="100%">
          新建检索工具
        </Button>
        <Button type="button" variant="whiteDanger" w="100%" onClick={del.onOpen}>
          删除知识库
        </Button>
      </div>

      <Modal isOpen={editing} onClose={() => setEditing(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>编辑信息</ModalHeader>
          <ModalBody>
            <label className="fg-field">
              <span>名称</span>
              <div className="name-with-icon">
                <ColorIcon name={kbIcon(kb.kind)} size={34} />
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={30}
                  autoFocus
                />
              </div>
            </label>
            <label className="fg-field" style={{ marginTop: 16 }}>
              <span>介绍</span>
              <Textarea
                value={editIntro}
                onChange={(e) => setEditIntro(e.target.value)}
                minH="90px"
                maxLength={200}
              />
            </label>
          </ModalBody>
          <ModalFooter>
            <Button variant="whiteBase" onClick={() => setEditing(false)}>
              取消
            </Button>
            <Button
              ml={3}
              onClick={() => {
                updateKnowledgeBase(kb.id, {
                  name: editName.trim() || kb.name,
                  description: editIntro.trim(),
                });
                toast("已保存");
                setEditing(false);
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
        title={`确认删除 ${kb.name}？`}
        onConfirm={() => {
          removeKnowledgeBase(kb.id);
          toast("已删除");
          nav("/kb");
        }}
      >
        删除知识库是危险操作，会删掉该知识库及其所有数据集与数据。
      </ConfirmDialog>
    </aside>
  );
}
