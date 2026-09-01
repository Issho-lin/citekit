import { useState } from "react";
import { Button } from "@chakra-ui/react";
import { ColorIcon } from "./ColorIcon";
import { IconPlus } from "./icons";
import { CreateKbModal } from "./CreateKbModal";
import type { IconName } from "./ColorIcon";
import type { KnowledgeBase } from "../types";

type Item = {
  kind: KnowledgeBase["kind"];
  icon: IconName;
  title: string;
  desc: string;
};

const PRIMARY: Item[] = [
  {
    kind: "dataset",
    icon: "dataset",
    title: "通用知识库",
    desc: "通过导入文件、网页链接或手动录入形式构建知识库",
  },
  {
    kind: "website",
    icon: "website",
    title: "Web 站点同步",
    desc: "通过爬虫，批量爬取网页数据构建知识库",
  },
];

const THIRD: Item[] = [
  {
    kind: "api",
    icon: "api",
    title: "API 文件库",
    desc: "可以通过 API，使用外部文件库构建知识库",
  },
  {
    kind: "feishu",
    icon: "feishu",
    title: "飞书知识库",
    desc: "可通过配置飞书文档权限，使用飞书文档构建知识库，文档不会进行二次存储",
  },
  {
    kind: "yuque",
    icon: "yuque",
    title: "语雀知识库",
    desc: "可通过配置语雀文档权限，使用语雀文档构建知识库，文档不会进行二次存储",
  },
  {
    kind: "dingtalk",
    icon: "dingtalk",
    title: "钉钉知识库",
    desc: "可通过配置钉钉知识库权限，使用钉钉在线文档构建知识库，文档不会进行二次存储",
  },
];

export function CreateKbMenu({ parentId }: { parentId?: string }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(false);
  const [kind, setKind] = useState<KnowledgeBase["kind"] | null>(null);

  function pick(next: KnowledgeBase["kind"]) {
    setOpen(false);
    setSub(false);
    setKind(next);
  }

  return (
    <div className="create-wrap">
      <Button leftIcon={<IconPlus />} onClick={() => setOpen((v) => !v)}>
        新建
      </Button>
      {open && (
        <>
          <button type="button" className="create-mask" aria-label="关闭" onClick={() => setOpen(false)} />
          <div className="create-pop">
            {PRIMARY.map((item) => (
              <button key={item.kind} type="button" className="create-item" onClick={() => pick(item.kind)}>
                <ColorIcon name={item.icon} size={32} />
                <span>
                  <strong>{item.title}</strong>
                  <em>{item.desc}</em>
                </span>
              </button>
            ))}
            <div
              className="create-item create-item-sub"
              onMouseEnter={() => setSub(true)}
              onMouseLeave={() => setSub(false)}
            >
              <ColorIcon name="third" size={32} />
              <span>
                <strong>第三方知识库</strong>
                <em>自定义API、飞书、语雀、钉钉等外部文档作为知识库</em>
              </span>
              {sub && (
                <div className="create-sub">
                  {THIRD.map((item) => (
                    <button key={item.kind} type="button" className="create-item" onClick={() => pick(item.kind)}>
                      <ColorIcon name={item.icon} size={32} />
                      <span>
                        <strong>{item.title}</strong>
                        <em>{item.desc}</em>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {kind && <CreateKbModal kind={kind} parentId={parentId} onClose={() => setKind(null)} />}
    </div>
  );
}
