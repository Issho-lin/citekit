import { Box } from "@chakra-ui/react";
import { providerOf, typeMeta } from "../../mock/models";
import type { ModelType } from "../../types";

export function ProviderAvatar({ provider, size = 20 }: { provider: string; size?: number }) {
  const p = providerOf(provider);
  return (
    <Box
      w={`${size}px`}
      h={`${size}px`}
      minW={`${size}px`}
      borderRadius="full"
      bg={p.color}
      color="white"
      fontSize={`${Math.max(9, size * 0.42)}px`}
      fontWeight={700}
      display="grid"
      placeItems="center"
      lineHeight={1}
    >
      {p.name.slice(0, 1)}
    </Box>
  );
}

export function ModelTypeTag({ type }: { type: ModelType }) {
  const meta = typeMeta(type);
  return <span className={`tag ${meta.tag}`}>{meta.label}</span>;
}
