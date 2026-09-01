import { Button } from "@chakra-ui/react";
import { SOURCE_LABEL } from "../constants";
import type { ProcessConfig, Source } from "../types";
import { useToast } from "./Toast";

function yesNo(v: boolean) {
  return v ? "Yes" : "No";
}

export function CollectionMetaCard({ source, process }: { source: Source; process: ProcessConfig }) {
  const toast = useToast();
  const rows: { label: string; value: string }[] = [
    { label: "集合 ID", value: source.id },
    { label: "来源", value: SOURCE_LABEL[source.type] },
    { label: "集合名称", value: source.title },
    { label: "更新时间", value: source.updatedAt },
    { label: "处理方式", value: process.trainingType === "qa" ? "问答对提取" : "分块存储" },
    { label: "PDF 增强解析", value: yesNo(process.pdfEnhance) },
    { label: "将标题加入索引", value: yesNo(process.indexPrefixTitle) },
    { label: "自动生成补充索引", value: yesNo(process.autoIndexes) },
    { label: "图片自动索引", value: yesNo(process.imageIndex) },
    { label: "分块大小", value: String(process.chunkSize) },
    { label: "索引大小", value: String(process.indexSize) },
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
        onClick={() => toast("演示环境无法打开原文件")}
      >
        阅读原文件
      </Button>
    </aside>
  );
}
