import { useNavigate, useSearchParams } from "react-router-dom";
import { CreateKbForm } from "../components/CreateKbForm";
import { Crumb } from "../components/chrome";
import { KB_KINDS } from "../constants";
import type { KnowledgeBase } from "../types";

export function NewKbPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const kind = (params.get("kind") as KnowledgeBase["kind"]) || "dataset";
  const parentId = params.get("parent") || undefined;
  const meta = KB_KINDS.find((k) => k.id === kind);

  return (
    <div className="page">
      <div className="page-inner">
        <Crumb items={[{ label: "知识库", href: "/kb" }, { label: "新建" }]} />
        <h1 className="page-title">创建{meta?.title ?? "知识库"}</h1>
        <div className="fg-create-card">
          <CreateKbForm
            kind={kind}
            parentId={parentId}
            onCancel={() => nav("/kb")}
            onCreated={(id) => nav(`/kb/${id}`)}
          />
        </div>
      </div>
    </div>
  );
}
