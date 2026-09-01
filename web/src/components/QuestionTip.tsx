import type { ReactNode } from "react";
import { Tooltip } from "@chakra-ui/react";
import { IconQuestion } from "./icons";

export function FieldHead({
  title,
  tip,
  extra,
}: {
  title: string;
  tip?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="field-head">
      <span className="field-head-title">
        {title}
        {tip ? <QuestionTip label={tip} maxW="360px" /> : null}
      </span>
      {extra}
    </div>
  );
}

export function QuestionTip({ label, maxW = "320px" }: { label: string; maxW?: string }) {
  return (
    <Tooltip
      label={label}
      placement="top"
      hasArrow
      openDelay={200}
      maxW={maxW}
      whiteSpace="pre-line"
    >
      <span
        className="q-tip"
        aria-label="说明"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <IconQuestion />
      </span>
    </Tooltip>
  );
}
