import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { KB_KINDS } from "../constants";
import type { KnowledgeBase } from "../types";
import { CreateKbForm } from "./CreateKbForm";

export function CreateKbModal({
  kind,
  parentId,
  onClose,
}: {
  kind: KnowledgeBase["kind"];
  parentId?: string;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const meta = KB_KINDS.find((k) => k.id === kind);

  return (
    <Modal isOpen onClose={onClose} size="md" isCentered>
      <ModalOverlay />
      <ModalContent minW="520px" borderRadius="10px">
        <ModalHeader>创建{meta?.title ?? "知识库"}</ModalHeader>
        <ModalBody pb={6}>
          <CreateKbForm
            kind={kind}
            parentId={parentId}
            onCancel={onClose}
            onCreated={(id) => {
              onClose();
              nav(`/kb/${id}`);
            }}
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
