import { useEffect, useRef, useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import { api } from "../api";
import type { Source } from "../types";
import { IconDownload } from "./icons";
import { useToast } from "./Toast";
import { usePageProgress } from "../progress";

type FileKind = "pdf" | "image" | "docx" | "html" | "text" | "binary";

function guessName(source: Source) {
  const title = source.title || "";
  const loc = source.locator || "";
  if (/\.[a-z0-9]+$/i.test(title)) return title;
  if (/\.[a-z0-9]+$/i.test(loc)) return loc;
  return title || loc || "原文件";
}

function parseFilename(disposition: string | null, fallback: string) {
  if (!disposition) return fallback;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1]);
    } catch {
      /* keep fallback */
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(disposition);
  if (quoted?.[1] && quoted[1] !== "file") return quoted[1];
  return fallback;
}

function fileKind(name: string, mime = ""): FileKind {
  const lower = name.toLowerCase();
  const type = mime.toLowerCase();
  if (lower.endsWith(".pdf") || type.includes("pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/.test(lower) || type.startsWith("image/")) return "image";
  if (lower.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
  if (/\.(html|htm)$/.test(lower) || type.includes("text/html")) return "html";
  if (/\.(txt|md|markdown|csv|json|xml|log)$/.test(lower) || type.startsWith("text/")) return "text";
  return "binary";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocxPreview({ blob }: { blob: Blob }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren();
    setFailed(false);
    let cancelled = false;
    void import("docx-preview")
      .then(({ renderAsync }) => {
        if (cancelled || !el.isConnected) return;
        return renderAsync(blob, el, undefined, {
          className: "docx",
          inWrapper: true,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      el.replaceChildren();
    };
  }, [blob]);

  if (failed) {
    return (
      <div className="file-reader-empty">
        <p>无法按 Word 版式预览，请下载后用本地应用打开。</p>
      </div>
    );
  }
  return <div className="file-reader file-reader-docx" ref={ref} />;
}

export function OriginalFileModal({
  source,
  isOpen,
  onClose,
}: {
  source: Source;
  isOpen: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const downloadUrl = api.sourceFileUrl(source.id, true);
  const toastRef = useRef(toast);
  const closeRef = useRef(onClose);
  toastRef.current = toast;
  closeRef.current = onClose;

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(guessName(source));
  const [mime, setMime] = useState("");
  const [size, setSize] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [objectUrl, setObjectUrl] = useState("");
  const [text, setText] = useState("");
  usePageProgress(isOpen && loading);

  const kind = fileKind(name, mime);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let createdUrl = "";
    setLoading(true);
    setBlob(null);
    setObjectUrl("");
    setText("");
    void (async () => {
      const res = await fetch(api.sourceFileUrl(source.id));
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = (await res.json()) as { detail?: unknown };
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          /* ignore */
        }
        throw new Error(detail || "无法打开原文件");
      }
      const nextBlob = await res.blob();
      const nextName = parseFilename(res.headers.get("content-disposition"), guessName(source));
      const nextMime = res.headers.get("content-type") || nextBlob.type;
      if (cancelled) return;
      createdUrl = URL.createObjectURL(nextBlob);
      setName(nextName);
      setMime(nextMime);
      setSize(nextBlob.size);
      setBlob(nextBlob);
      setObjectUrl(createdUrl);
      const nextKind = fileKind(nextName, nextMime);
      if (nextKind === "text" || nextKind === "html") {
        setText(await nextBlob.text());
      }
    })()
      .catch((err: unknown) => {
        if (cancelled) return;
        toastRef.current(err instanceof Error ? err.message : "无法打开原文件");
        closeRef.current();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [isOpen, source.id, source.title, source.locator]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="5xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxW="960px" mx={4}>
        <ModalHeader
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={3}
          fontSize="16px"
          fontWeight={600}
          pr={12}
        >
          <div className="file-reader-head">
            <div className="file-reader-name">{name}</div>
            {size > 0 ? <div className="file-reader-meta">{formatSize(size)}</div> : null}
          </div>
          <Button as="a" href={downloadUrl} size="sm" variant="whiteBase" leftIcon={<IconDownload />} flexShrink={0}>
            下载
          </Button>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {loading ? (
            <div className="file-reader-wait" aria-busy="true" />
          ) : kind === "pdf" && objectUrl ? (
            <iframe className="file-reader-frame" title={name} src={objectUrl} />
          ) : kind === "image" && objectUrl ? (
            <div className="file-reader-media">
              <img src={objectUrl} alt={name} />
            </div>
          ) : kind === "docx" && blob ? (
            <DocxPreview blob={blob} />
          ) : kind === "html" ? (
            <iframe className="file-reader-frame file-reader-html" title={name} srcDoc={text} />
          ) : kind === "text" ? (
            <div className="file-reader">
              <article className="file-reader-sheet">{text}</article>
            </div>
          ) : (
            <div className="file-reader-empty">
              <p>浏览器无法直接预览该格式，请下载后用本地应用打开。</p>
              <Button as="a" href={downloadUrl} variant="whitePrimary" leftIcon={<IconDownload />}>
                下载原文件
              </Button>
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
