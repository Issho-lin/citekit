import type { KnowledgeBase } from "../types";
import datasetIcon from "../assets/dataset-icons/commonDatasetColor.svg";
import websiteIcon from "../assets/dataset-icons/websiteDatasetColor.svg";
import thirdIcon from "../assets/dataset-icons/otherDataset.svg";
import apiIcon from "../assets/dataset-icons/externalDatasetColor.svg";
import feishuIcon from "../assets/dataset-icons/feishuDatasetColor.svg";
import yuqueIcon from "../assets/dataset-icons/yuqueDatasetColor.svg";
import dingtalkIcon from "../assets/dataset-icons/dingtalkDatasetColor.svg";

export type IconName =
  | "dataset"
  | "website"
  | "third"
  | "feishu"
  | "yuque"
  | "folder"
  | "tool"
  | "mcp"
  | "api"
  | "dingtalk"
  | "image";

const ASSET: Partial<Record<IconName, string>> = {
  dataset: datasetIcon,
  website: websiteIcon,
  third: thirdIcon,
  api: apiIcon,
  feishu: feishuIcon,
  yuque: yuqueIcon,
  dingtalk: dingtalkIcon,
};

const TILE: Partial<Record<IconName, string>> = {
  folder: "transparent",
  tool: "#f6ad55",
  mcp: "#38b2ac",
  image: "#ed8936",
};

export function kbIcon(kind: KnowledgeBase["kind"]): IconName {
  if (kind === "website") return "website";
  if (kind === "feishu") return "feishu";
  if (kind === "yuque") return "yuque";
  if (kind === "api") return "api";
  if (kind === "dingtalk") return "dingtalk";
  if (kind === "folder") return "folder";
  return "dataset";
}

function Glyph({ name }: { name: IconName }) {
  const stroke = name === "folder" ? "#ed8936" : "#fff";
  if (name === "folder") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#ed8936">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      </svg>
    );
  }
  if (name === "image") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="M21 16l-5-5-7 7" />
      </svg>
    );
  }
  if (name === "tool") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8">
        <path d="M13 3l8 8-9 9H4v-8l9-9z" />
      </svg>
    );
  }
  if (name === "mcp") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8">
        <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8">
      <rect x="4" y="4" width="7" height="7" rx="1.2" />
      <rect x="13" y="4" width="7" height="7" rx="1.2" />
      <rect x="4" y="13" width="7" height="7" rx="1.2" />
      <rect x="13" y="13" width="7" height="7" rx="1.2" />
    </svg>
  );
}

export function ColorIcon({
  name,
  size = 36,
}: {
  name: IconName;
  size?: number;
}) {
  const src = ASSET[name];
  if (src) {
    return (
      <img
        className="color-icon color-icon-img"
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="color-icon"
      style={{
        width: size,
        height: size,
        background: TILE[name],
        borderRadius: name === "folder" ? 0 : 8,
      }}
    >
      <Glyph name={name} />
    </span>
  );
}

export function EmptyKbArt() {
  return (
    <svg className="empty-art" width="88" height="72" viewBox="0 0 88 72" fill="none">
      <rect x="18" y="28" width="52" height="32" rx="4" stroke="#d0d5dd" strokeWidth="1.6" />
      <path d="M18 36h52" stroke="#d0d5dd" strokeWidth="1.6" />
      <path d="M30 22l6-8h16l6 8" stroke="#d0d5dd" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="62" cy="18" r="2" fill="#c5cdd8" />
      <circle cx="70" cy="14" r="1.4" fill="#c5cdd8" />
      <path d="M58 12l2 4" stroke="#c5cdd8" strokeWidth="1.2" />
    </svg>
  );
}

/** 空列表插画：叠放的空白文档 + 轻强调色 */
export function EmptyTipArt() {
  return (
    <svg className="empty-tip-art" width="140" height="112" viewBox="0 0 140 112" fill="none" aria-hidden>
      <ellipse cx="70" cy="98" rx="42" ry="7" fill="#EEF1F6" />
      <g transform="rotate(-8 48 64)">
        <rect x="24" y="28" width="52" height="66" rx="10" fill="#F4F4F7" stroke="#E8EBF0" />
        <rect x="34" y="42" width="28" height="4" rx="2" fill="#E2E3EA" />
        <rect x="34" y="52" width="20" height="4" rx="2" fill="#E8EBF0" />
      </g>
      <g transform="rotate(7 92 66)">
        <rect x="66" y="24" width="52" height="66" rx="10" fill="#F7F8FA" stroke="#E8EBF0" />
        <rect x="76" y="38" width="28" height="4" rx="2" fill="#E2E3EA" />
        <rect x="76" y="48" width="22" height="4" rx="2" fill="#E8EBF0" />
      </g>
      <rect x="42" y="18" width="56" height="72" rx="12" fill="#fff" stroke="#E2E3EA" />
      <rect x="42" y="18" width="56" height="18" rx="12" fill="#F0F4FF" />
      <rect x="42" y="28" width="56" height="8" fill="#F0F4FF" />
      <rect x="54" y="48" width="32" height="5" rx="2.5" fill="#E8EBF0" />
      <rect x="54" y="60" width="24" height="5" rx="2.5" fill="#F0F1F6" />
      <rect x="54" y="72" width="28" height="5" rx="2.5" fill="#F0F1F6" />
      <circle cx="106" cy="30" r="14" fill="#fff" stroke="#C9DCFF" />
      <path d="M106 24v12M100 30h12" stroke="#3370FF" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
