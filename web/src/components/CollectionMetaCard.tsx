import { Button, useDisclosure } from "@chakra-ui/react";
import { SOURCE_LABEL } from "../constants";
import type { ProcessConfig, Source } from "../types";
import { OriginalFileModal } from "./OriginalFileModal";
import { useToast } from "./Toast";

function yesNo(v: boolean) {
  return v ? "Yes" : "No";
}

export function CollectionMetaCard({ source, process }: { source: Source; process: ProcessConfig }) {
  const toast = useToast();
  const reader = useDisclosure();
  const rows: { label: string; value: string }[] = [
    { label: "集合 ID", value: source.id },
    { label: "来源", value: SOURCE_LABEL[source.type] },
    { label: "集合名称", value: source.title },
    { label: "更新时间", value: source.updatedAt },
    { label: "处理方式", value: process.trainingType === "qa" ? "问答对提取" : "分块存储" },
    { label: "PDF 增强解析", value: yesNo(process.pdfEnhance) },
    { label: "将文档标题加入索引", value: yesNo(process.indexPrefixTitle) },
    { label: "块标题单独索引", value: yesNo(process.indexChunkTitle) },
    { label: "自动生成补充索引", value: yesNo(process.autoIndexes) },
    { label: "图片自动索引", value: yesNo(process.imageIndex) },
    { label: "分块大小", value: process.chunkSize > 0 ? String(process.chunkSize) : "不限制" },
    ...(process.chunkSettingMode === "custom" && process.chunkSplitMode === "size"
      ? [{ label: "分块重叠", value: String(process.chunkOverlap || 0) }]
      : []),
    ...(process.chunkSettingMode === "custom" && process.trainingType === "chunk"
      ? [
          { label: "生成子块索引", value: yesNo(process.useChildIndex) },
          ...(process.useChildIndex ? [{ label: "索引大小", value: String(process.indexSize) }] : []),
        ]
      : []),
  ];

  return (
    <aside className="kb-info collection-meta">
      <div className="collection-meta-title">元数据</div>
      {rows.map((item) => (
        <div key={item.label} className="collection-meta-row">
          <div className="collection-meta-label">{item.label}</div>
          <div className="collection-meta-value">{item.value}</div>
        </div>
      ))}
      <Button
        variant="whitePrimary"
        mt={2}
        onClick={() => {
          if (source.hasOriginal === false) {
            toast("该集合没有原文件");
            return;
          }
          reader.onOpen();
        }}
      >
        阅读原文件
      </Button>
      {reader.isOpen ? (
        <OriginalFileModal source={source} isOpen={reader.isOpen} onClose={reader.onClose} />
      ) : null}
    </aside>
  );
}
