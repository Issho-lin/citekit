import { useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import type { ImportSourceKind } from "../import/types";

const OPTIONS: { value: ImportSourceKind; title: string; desc: string }[] = [
  { value: "fileLocal", title: "本地文件", desc: "上传 PDF、TXT、DOCX 等格式的文件" },
  { value: "fileLink", title: "网页链接", desc: "读取静态网页内容作为数据集" },
  { value: "fileCustom", title: "自定义文本", desc: "手动输入一段文本作为数据集" },
];

export function FileSourceSelector({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (source: ImportSourceKind) => void;
}) {
  const [value, setValue] = useState<ImportSourceKind>("fileLocal");

  return (
    <Modal isOpen onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>选择来源</ModalHeader>
        <ModalBody>
          <div className="left-radio-grid left-radio-col" role="radiogroup" aria-label="选择来源">
            {OPTIONS.map((item) => (
              <div key={item.value} className={value === item.value ? "left-radio on" : "left-radio"}>
                <button
                  type="button"
                  className="left-radio-hit"
                  role="radio"
                  aria-checked={value === item.value}
                  onClick={() => setValue(item.value)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.desc}</span>
                </button>
              </div>
            ))}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" mr={3} onClick={onClose}>
            关闭
          </Button>
          <Button onClick={() => onConfirm(value)}>确认</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
