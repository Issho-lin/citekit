import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

function safeHttpUrl(href?: string | null): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const url = safeHttpUrl(href);
  if (!url) return <>{children}</>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="chat-md-link" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
}

export function MarkdownPreview({ text, empty }: { text: string; empty?: string }) {
  const body = text.trim();
  if (!body) {
    return <div className="md-preview md-preview-empty">{empty || "暂无内容"}</div>;
  }
  return (
    <div className="md-preview">
      <ReactMarkdown components={{ a: MarkdownLink }}>{text}</ReactMarkdown>
    </div>
  );
}
