import { Tooltip } from "@chakra-ui/react";
import { IconQuestion } from "./icons";

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
      <span className="q-tip" aria-label="说明">
        <IconQuestion />
      </span>
    </Tooltip>
  );
}
