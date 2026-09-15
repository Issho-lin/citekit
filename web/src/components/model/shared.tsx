import { Box, Image } from "@chakra-ui/react";
import { modelSelectList, typeMeta } from "../../mock/models";
import { useStore } from "../../mock/store";
import type { AiModel, ModelProvider, ModelSlot, ModelType } from "../../types";
import type { SelectOption } from "../MySelect";

export function providerOf(providers: ModelProvider[], id: string): ModelProvider {
  return (
    providers.find((p) => p.id === id) ?? {
      id,
      name: id,
      avatar: "",
      order: 999,
      isVisible: true,
      defaultBaseUrl: "",
      hasApiKey: false,
    }
  );
}

export function providerBaseUrl(providers: ModelProvider[], id: string) {
  return (providerOf(providers, id).defaultBaseUrl ?? "").trim();
}

export function pickerProviders(providers: ModelProvider[], keepId?: string) {
  return providers.filter((p) => p.isVisible || (keepId != null && p.id === keepId));
}

export function configProviders(providers: ModelProvider[]) {
  return pickerProviders(providers).filter((p) => p.id !== "Other");
}

export function modelSelectOptions(
  models: AiModel[],
  slot: ModelSlot,
  current?: string,
  noneLabel?: string,
): SelectOption[] {
  return modelSelectList(models, slot, current, noneLabel).map((item) => ({
    ...item,
    icon: item.value ? <ProviderAvatar provider={item.description || ""} size={16} /> : undefined,
  }));
}

export function ModelLineIcon({ modelId, size = 16 }: { modelId: string; size?: number }) {
  const { aiModels } = useStore();
  const provider = aiModels.find((m) => m.model === modelId)?.provider;
  if (!modelId || !provider) return null;
  return <ProviderAvatar provider={provider} size={size} />;
}

export function ProviderAvatar({ provider, size = 20 }: { provider: string; size?: number }) {
  const { providers } = useStore();
  const p = providerOf(providers, provider);
  if (p.avatar) {
    return (
      <Image
        src={p.avatar}
        alt={p.name}
        w={`${size}px`}
        h={`${size}px`}
        minW={`${size}px`}
        borderRadius="full"
        objectFit="contain"
        bg="myGray.0"
      />
    );
  }
  return (
    <Box
      w={`${size}px`}
      h={`${size}px`}
      minW={`${size}px`}
      borderRadius="full"
      bg="myGray.200"
      color="myGray.600"
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
