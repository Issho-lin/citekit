import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Textarea,
} from "@chakra-ui/react";
import { IconPlus, IconTrash } from "./icons";
import { useToast } from "./Toast";
import type { Chunk, ChunkIndex } from "../types";

type Tab = "chunk" | "qa";

function nid() {
  return `idx_${Math.random().toString(36).slice(2, 9)}`;
}

function indexLabel(type: ChunkIndex["type"]) {
  if (type === "default") return "默认索引";
  if (type === "child") return "子块索引";
  if (type === "auto") return "补充索引";
  if (type === "image") return "图片索引";
  return "自定义索引";
}

function RequiredLabel({ children }: { children: string }) {
  return (
    <Flex align="center" h="20px" fontSize="14px" fontWeight={500} color="myGray.900" flexShrink={0}>
      <Box as="span" color="red.500" mr="2px">
        *
      </Box>
      {children}
    </Flex>
  );
}

const textareaProps = {
  resize: "none" as const,
  flex: "1 0 0",
  bg: "white",
  borderRadius: "6px",
  border: "1px solid",
  borderColor: "myGray.200",
  p: "8px 12px",
  color: "myGray.900",
  fontSize: "sm",
  minH: 0,
};

export function InputDataModal({
  sourceTitle,
  chunk,
  onClose,
  onSave,
}: {
  sourceTitle: string;
  chunk?: Chunk;
  onClose: () => void;
  onSave: (data: { q: string; a: string; indexes: ChunkIndex[] }) => void | Promise<void>;
}) {
  const toast = useToast();
  const isInsert = !chunk;
  const [tab, setTab] = useState<Tab>(chunk?.a ? "qa" : "chunk");
  const [q, setQ] = useState(chunk?.text ?? "");
  const [a, setA] = useState(chunk?.a ?? "");
  const [indexes, setIndexes] = useState<ChunkIndex[]>(() => {
    if (!chunk) return [];
    if (chunk.indexes?.length) {
      return chunk.indexes.map((item, i) => ({
        id: item.id || nid(),
        type: item.type || (i === 0 ? "default" : "custom"),
        text: item.text || "",
      }));
    }
    return [{ id: nid(), type: "default", text: chunk.text }];
  });
  const [saving, setSaving] = useState(false);
  const [focusId, setFocusId] = useState<string>();

  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector<HTMLTextAreaElement>(`textarea[data-index-id="${focusId}"]`);
    el?.focus();
  }, [focusId]);

  async function submit() {
    if (!q.trim() || (tab === "qa" && !a.trim())) {
      toast("请填写必填内容");
      return;
    }
    const nextIndexes = indexes
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text);
    const hasSearchIndex = nextIndexes.some((item) => item.type === "default" || item.type === "child");
    if (!hasSearchIndex) {
      const fallback = tab === "qa" ? `${q.trim()}\n${a.trim()}` : q.trim();
      nextIndexes.push({ id: nid(), type: "default", text: fallback });
    }
    setIndexes(nextIndexes);
    setSaving(true);
    try {
      await onSave({ q: q.trim(), a: tab === "qa" ? a.trim() : "", indexes: nextIndexes });
      toast(isInsert ? "导入数据成功" : "已保存");
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "更新失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} isCentered closeOnOverlayClick={false}>
      <ModalOverlay />
      <ModalContent
        w={["calc(100vw - 32px)", "800px"]}
        maxW={["calc(100vw - 32px)", "800px"]}
        h={["auto", "620px"]}
        maxH={["90vh", "calc(100vh - 48px)"]}
        borderRadius="10px"
        overflow="hidden"
      >
        <ModalHeader
          fontSize={["xl", "20px"]}
          lineHeight="26px"
          fontWeight={500}
          letterSpacing="0.15px"
          color="black"
          px={6}
          pt={5}
          pb={0}
          pr={12}
        >
          <Box overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {sourceTitle}
          </Box>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody px={6} pt={6} pb={4} display="flex" flexDir="column" minH={0}>
          <Flex flexDir="column" gap="24px" flex="1" minH={0}>
            <Flex h="32px" gap="16px" borderBottom="1px solid" borderColor="myGray.200" flexShrink={0}>
              {(
                [
                  { label: "常规模式", value: "chunk" as const },
                  { label: "QA 模式", value: "qa" as const },
                ] as const
              ).map((item) => {
                const on = tab === item.value;
                return (
                  <Flex
                    key={item.value}
                    align="center"
                    justify="center"
                    h="32px"
                    px="4px"
                    borderBottom="1.5px solid"
                    borderColor={on ? "primary.600" : "transparent"}
                    color={on ? "primary.700" : "myGray.500"}
                    fontSize="16px"
                    lineHeight="24px"
                    fontWeight={500}
                    cursor="pointer"
                    onClick={() => setTab(item.value)}
                  >
                    {item.label}
                  </Flex>
                );
              })}
            </Flex>

            <Flex flex="1" minH={0} gap="32px" flexDir={["column", "row"]}>
              <Flex flexDir="column" gap="8px" flex="1 0 0" w={["100%", 0]} minH={0}>
                <Flex flexDir="column" flex="1 0 0" minH={0} gap="8px">
                  <RequiredLabel>{tab === "chunk" ? "内容" : "问题"}</RequiredLabel>
                  <Textarea
                    {...textareaProps}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={tab === "chunk" ? "输入数据内容" : "输入问题"}
                  />
                </Flex>
                {tab === "qa" && (
                  <Flex flexDir="column" flex="1 0 0" minH={0} gap="8px">
                    <RequiredLabel>答案</RequiredLabel>
                    <Textarea
                      {...textareaProps}
                      value={a}
                      onChange={(e) => setA(e.target.value)}
                      placeholder="输入答案"
                    />
                  </Flex>
                )}
              </Flex>

              <Flex flexDir="column" flex="1 0 0" w={["100%", 0]} minH={0}>
                <Flex align="center" justify="space-between" h="20px" mb="8px" flexShrink={0}>
                  <Box color="myGray.900" fontSize="14px" lineHeight="20px" fontWeight={500}>
                    数据索引({indexes.length})
                  </Box>
                  <Button
                    variant="whiteBase"
                    h="30px"
                    px="14px"
                    borderRadius="6px"
                    onClick={() => {
                      const id = nid();
                      setIndexes((prev) => [{ id, type: "custom", text: "" }, ...prev]);
                      setFocusId(id);
                    }}
                  >
                    <Flex align="center" fontSize="12px" lineHeight="16px" color="myGray.600">
                      <Box mr="6px" display="inline-flex">
                        <IconPlus size={14} />
                      </Box>
                      新增
                    </Flex>
                  </Button>
                </Flex>

                <Box flex="1 0 0" minH={0} overflow="auto">
                  <Flex flexDir="column" gap="8px">
                    {indexes.map((item) => (
                      <Box
                        key={item.id}
                        p="16px"
                        borderRadius="8px"
                        border="1px solid"
                        borderColor="myGray.200"
                        bg="myGray.50"
                        minH="104px"
                        role="group"
                      >
                        <Flex mb="8px" align="center" h="24px">
                          <Box flex="1" color="myGray.900" fontSize="14px" lineHeight="20px" fontWeight={500}>
                            {indexLabel(item.type)}
                          </Box>
                          {item.type !== "default" && (
                            <Box
                              display="none"
                              _groupHover={{ display: "block" }}
                              cursor="pointer"
                              color="myGray.500"
                              _hover={{ color: "red.500" }}
                              onClick={() => setIndexes((prev) => prev.filter((x) => x.id !== item.id))}
                            >
                              <IconTrash size={14} />
                            </Box>
                          )}
                        </Flex>
                        <Textarea
                          data-index-id={item.id}
                          maxLength={2000}
                          borderColor="transparent"
                          minH="40px"
                          px={0}
                          pt={0}
                          resize="none"
                          fontSize="sm"
                          color="myGray.500"
                          placeholder="输入索引文本内容"
                          value={item.text}
                          onChange={(e) =>
                            setIndexes((prev) =>
                              prev.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x)),
                            )
                          }
                          _focus={{
                            px: 3,
                            py: 1,
                            borderColor: "primary.500",
                            boxShadow: "0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)",
                            bg: "white",
                          }}
                        />
                      </Box>
                    ))}
                  </Flex>
                </Box>
              </Flex>
            </Flex>
          </Flex>
        </ModalBody>
        <ModalFooter px={6} pt={0} pb={5} gap={3}>
          <Box flex="1" fontSize="xs" color="myGray.400" textAlign="left">
            保存会写入正文，并按右侧索引重新向量化
          </Box>
          <Button variant="whiteBase" onClick={onClose} isDisabled={saving}>
            取消
          </Button>
          <Button onClick={() => void submit()} isLoading={saving}>
            保存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
