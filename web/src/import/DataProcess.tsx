import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Checkbox,
  Flex,
  Grid,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  Textarea,
  useDisclosure,
} from "@chakra-ui/react";
import { useEffect, useState, type ReactNode } from "react";
import { MySelect } from "../components/MySelect";
import { QuestionTip } from "../components/QuestionTip";
import { DEFAULT_QA_PROMPT, INDEX_SIZES, SPLIT_SIGNS } from "../constants";
import type { ProcessConfig } from "../types";
import { useDatasetImportOptional } from "./Context";

const PARENT_CHUNK_TIP =
  "父块：原文按规则切开后存入知识库的完整段落，检索命中后交给模型阅读。建议大于「索引大小」。";
const PARENT_CHUNK_MAX_TIP =
  "父块上限：优先按标题切段，某一段仍超过该长度时再切开。切开后的每块完整入库，命中后给模型阅读。建议大于「索引大小」。";
const CHILD_INDEX_TIP =
  "子块：把每个父块再按该长度切开并向量化，用来检索。搜中子块后返回对应的整段父块。一般应小于或等于分块大小。";

export function DataProcess({
  process: processProp,
  onChange,
  onNext,
}: {
  process?: ProcessConfig;
  onChange?: (next: ProcessConfig) => void;
  onNext?: () => void;
} = {}) {
  const ctx = useDatasetImportOptional();
  const process = processProp ?? ctx?.process;
  const setProcess = onChange ?? ctx?.setProcess;
  const goToNext = onNext ?? ctx?.goToNext;

  if (!process || !setProcess) {
    throw new Error("DataProcess needs process state");
  }

  return (
    <Box flex="1 0 0" maxW={["90vw", "640px"]} m="auto" overflow="auto">
      <Accordion allowMultiple reduceMotion defaultIndex={[0, 1, 2]}>
        <AccordionItem border="none" borderBottom="1px solid" borderColor="myGray.200" pb={4}>
          <AccordionButton bg="none !important" p={2}>
            <Box w="3px" h="16px" bg="primary.600" borderRadius="2px" mr={2} />
            <Box color="myGray.900" flex="1 0 0" textAlign="left">
              文件解析设置
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel p={2}>
            <Flex
              flexDirection="column"
              gap={3}
              border="1px solid"
              borderColor="primary.400"
              borderRadius="md"
              p={4}
            >
              <HStack spacing={1}>
                <Checkbox
                  isChecked={process.pdfEnhance}
                  onChange={(e) => setProcess({ ...process, pdfEnhance: e.target.checked })}
                >
                  <CheckLabel>PDF增强解析</CheckLabel>
                </Checkbox>
                <QuestionTip label="调用 PDF 识别模型进行解析，可以将其转换成 Markdown 并保留文档中的图片，同时也可以对扫描件进行识别，识别时间较长。" />
              </HStack>
            </Flex>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem mt={4} border="none">
          <AccordionButton bg="none !important" p={2}>
            <Box w="3px" h="16px" bg="primary.600" borderRadius="2px" mr={2} />
            <Box color="myGray.900" flex="1 0 0" textAlign="left">
              数据处理方式设置
            </Box>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel p={2}>
            <ChunkSettings value={process} onChange={setProcess} />
          </AccordionPanel>
        </AccordionItem>

        {goToNext ? (
          <Flex mt={5} gap={3} justifyContent="flex-end">
            <Button onClick={goToNext}>下一步</Button>
          </Flex>
        ) : null}
      </Accordion>
    </Box>
  );
}

function FieldLabel({ children, tip }: { children: ReactNode; tip?: string }) {
  return (
    <Flex alignItems="center" mb={1}>
      <Box>{children}</Box>
      {tip ? <QuestionTip label={tip} maxW="360px" /> : null}
    </Flex>
  );
}

function RadioDot({ on }: { on: boolean }) {
  return (
    <Box
      w="18px"
      h="18px"
      mr={3}
      flexShrink={0}
      borderWidth="2.4px"
      borderColor={on ? "rgba(51, 112, 255, 0.15)" : "transparent"}
      borderRadius="50%"
    >
      <Flex
        w="100%"
        h="100%"
        borderWidth="1px"
        borderRadius="50%"
        alignItems="center"
        justifyContent="center"
        borderColor={on ? "primary.600" : "myGray.300"}
        bg={on ? "primary.50" : "transparent"}
      >
        <Box w="5px" h="5px" borderRadius="50%" bg={on ? "primary.600" : "transparent"} />
      </Flex>
    </Box>
  );
}

function LeftRadioCard({
  selected,
  title,
  desc,
  tooltip,
  onSelect,
  children,
  px = 3.5,
  py = 2.5,
}: {
  selected: boolean;
  title: string;
  desc?: string;
  tooltip?: string;
  onSelect: () => void;
  children?: ReactNode;
  px?: number;
  py?: number;
}) {
  return (
    <Box
      position="relative"
      userSelect="none"
      px={px}
      py={py}
      border="1px solid"
      borderColor={selected ? "primary.400" : "myGray.200"}
      borderRadius="md"
      bg="white"
      boxShadow={selected ? "0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)" : undefined}
      cursor="pointer"
      _hover={selected ? undefined : { borderColor: "primary.300" }}
      onClick={onSelect}
    >
      <Flex alignItems="center">
        <RadioDot on={selected} />
        <Box flex="1 0 0">
          <HStack spacing={1} fontWeight={desc ? 500 : 400} fontSize="sm" color="myGray.900" lineHeight={1}>
            <Box mb={desc ? 1 : 0}>{title}</Box>
            {tooltip ? <QuestionTip label={tooltip} /> : null}
          </HStack>
          {desc ? (
            <Box fontSize="xs" mt={1.5} lineHeight={1.2} color="myGray.500">
              {desc}
            </Box>
          ) : null}
        </Box>
      </Flex>
      {children ? (
        <Box
          mt={4}
          pt={4}
          borderTop="1px solid"
          borderColor="myGray.200"
          cursor="default"
          userSelect="text"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </Box>
      ) : null}
    </Box>
  );
}

function SplitModeGroup({
  value,
  onChange,
}: {
  value: ProcessConfig["chunkSplitMode"];
  onChange: (v: ProcessConfig["chunkSplitMode"]) => void;
}) {
  const list: { title: string; value: ProcessConfig["chunkSplitMode"]; tooltip?: string }[] = [
    {
      title: "按段落分块",
      value: "paragraph",
      tooltip: "优先按 Markdown 标题段落进行分块，如果分块过长，再按长度进行二次分块",
    },
    { title: "按长度分块", value: "size" },
    {
      title: "按指定分割符分块",
      value: "char",
      tooltip:
        "允许根据自定义分隔符分块，通常用于已处理好的数据。可用 | 表示多个分隔符，例如 “。|.” 表示中英文句号。尽量避免使用正则特殊符号，例如 * () [] {}。",
    },
  ];

  return (
    <Flex
      role="tablist"
      display="inline-flex"
      maxW="100%"
      flexWrap="wrap"
      border="1px solid"
      borderColor="myGray.200"
      borderRadius="md"
      bg="myGray.50"
      p="3px"
      gap="2px"
    >
      {list.map((item) => {
        const on = value === item.value;
        return (
          <Flex
            key={item.value}
            role="tab"
            aria-selected={on}
            alignItems="center"
            justifyContent="center"
            gap={0.5}
            px={2.5}
            h="28px"
            borderRadius="sm"
            cursor="pointer"
            userSelect="none"
            bg={on ? "white" : "transparent"}
            color={on ? "primary.600" : "myGray.600"}
            fontWeight={on ? 500 : 400}
            fontSize="sm"
            boxShadow={on ? "0 1px 2px rgba(19, 51, 107, 0.08)" : "none"}
            _hover={on ? undefined : { color: "myGray.900" }}
            onClick={() => onChange(item.value)}
          >
            <Box whiteSpace="nowrap">{item.title}</Box>
            {item.tooltip ? <QuestionTip label={item.tooltip} /> : null}
          </Flex>
        );
      })}
    </Flex>
  );
}

function IntInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  h = "32px",
  bg,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  h?: string;
  bg?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, n));
    setText(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <NumberInput
      min={min}
      max={max}
      step={step}
      size="sm"
      value={text}
      keepWithinRange={false}
      clampValueOnBlur={false}
      onChange={(raw) => {
        setText(raw);
        const n = Number(raw);
        if (raw.trim() !== "" && Number.isFinite(n) && n >= min && n <= max && n !== value) {
          onChange(n);
        }
      }}
      onBlur={() => commit(text)}
    >
      <NumberInputField h={h} bg={bg} />
    </NumberInput>
  );
}

function CheckLabel({ children }: { children: ReactNode }) {
  return (
    <Box as="span" color="myGray.900" fontWeight="medium" fontSize="sm" lineHeight="20px">
      {children}
    </Box>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Box fontSize="sm" mb={2} color="myGray.600">
      {children}
    </Box>
  );
}

function ChunkSettings({
  value,
  onChange,
}: {
  value: ProcessConfig;
  onChange: (next: ProcessConfig) => void;
}) {
  const prompt = useDisclosure();
  const [draftPrompt, setDraftPrompt] = useState(value.qaPrompt);
  const knownSign = SPLIT_SIGNS.some((s) => s.value === value.chunkSplitter && s.value !== "Other");
  const [signPick, setSignPick] = useState(knownSign ? value.chunkSplitter : "Other");

  function patch(next: Partial<ProcessConfig>) {
    const merged = { ...value, ...next };
    merged.qaEnhance = merged.trainingType === "qa";
    merged.customSplit = merged.chunkSplitter;
    onChange(merged);
  }

  return (
    <Box>
      <Box>
        <SectionLabel>处理方式</SectionLabel>
        <Grid gridTemplateColumns="repeat(2, 1fr)" gap={3}>
          <LeftRadioCard
            selected={value.trainingType === "chunk"}
            title="分块存储"
            tooltip="将文本按一定的规则进行分段处理后，转成可进行语义搜索的格式，适合绝大多数场景。不需要调用模型额外处理，成本低。"
            onSelect={() => patch({ trainingType: "chunk", chunkSize: 1000 })}
          />
          <LeftRadioCard
            selected={value.trainingType === "qa"}
            title="问答对提取"
            tooltip="通过文本理解模型，为文件内容生成问答对。有较高的检索精度，但是会丢失很多内容细节。"
            onSelect={() => patch({ trainingType: "qa", chunkSize: 8000 })}
          />
        </Grid>
      </Box>

      {value.trainingType === "chunk" && (
        <Box mt={6}>
          <HStack fontSize="sm" mb={2} color="myGray.600" spacing={1}>
            <Box>分块条件</Box>
            <QuestionTip label="当满足一定条件时才触发分块存储，否则会直接完整存储原文" />
          </HStack>
          <HStack>
            <Box flex="1 0 0">
              <MySelect
                h="34px"
                value={value.chunkTriggerType}
                onChange={(next) =>
                  patch({ chunkTriggerType: next as ProcessConfig["chunkTriggerType"] })
                }
                list={[
                  { value: "minSize", label: "原文长度大于" },
                  { value: "maxSize", label: "原文长度大于文件处理模型最大上下文70%" },
                  { value: "forceChunk", label: "强制分块" },
                ]}
              />
            </Box>
            {value.chunkTriggerType === "minSize" && (
              <Box flex="1 0 0">
                <IntInput
                  min={100}
                  max={100000}
                  step={100}
                  h="34px"
                  bg="white"
                  value={value.chunkTriggerMinSize}
                  onChange={(n) => patch({ chunkTriggerMinSize: n })}
                />
              </Box>
            )}
          </HStack>
        </Box>
      )}

      <Box mt={6}>
        <SectionLabel>索引增强</SectionLabel>
        <Grid gridTemplateColumns="1fr 1fr" rowGap={[2, 4]} columnGap={[3, 7]}>
          <HStack spacing={1}>
            <Checkbox
              size="sm"
              isChecked={value.indexPrefixTitle}
              onChange={(e) => patch({ indexPrefixTitle: e.target.checked })}
            >
              <CheckLabel>将标题加入索引</CheckLabel>
            </Checkbox>
            <QuestionTip label="自动给所有索引加上标题名" />
          </HStack>
          {value.trainingType === "chunk" && (
            <>
              <HStack spacing={1}>
                <Checkbox
                  size="sm"
                  isChecked={value.autoIndexes}
                  onChange={(e) => patch({ autoIndexes: e.target.checked })}
                >
                  <CheckLabel>自动生成补充索引</CheckLabel>
                </Checkbox>
                <QuestionTip label="通过文本理解模型，进行额外索引生成，提高语义丰富度，可提高检索的精度。" />
              </HStack>
              <HStack spacing={1}>
                <Checkbox
                  size="sm"
                  isChecked={value.imageIndex}
                  onChange={(e) => patch({ imageIndex: e.target.checked })}
                >
                  <CheckLabel>图片自动索引</CheckLabel>
                </Checkbox>
                <QuestionTip label="使用视觉模型解析图片并写入索引。" />
              </HStack>
            </>
          )}
        </Grid>
      </Box>

      <Box mt={6}>
        <SectionLabel>分块处理参数</SectionLabel>
        <Flex flexDirection="column" gap={3}>
          <LeftRadioCard
            selected={value.chunkSettingMode === "auto"}
            title="默认"
            desc="使用系统默认的参数和规则"
            py={3}
            onSelect={() => patch({ chunkSettingMode: "auto" })}
          />
          <LeftRadioCard
            selected={value.chunkSettingMode === "custom"}
            title="自定义"
            desc="自定义设置数据处理规则"
            py={3}
            onSelect={() => patch({ chunkSettingMode: "custom" })}
          >
            {value.chunkSettingMode === "custom" ? (
              <Box>
                <SplitModeGroup
                  value={value.chunkSplitMode}
                  onChange={(chunkSplitMode) => patch({ chunkSplitMode })}
                />

                {value.chunkSplitMode === "paragraph" && (
                  <>
                    <Box mt={3} fontSize="sm">
                      <Box mb={1}>模型识别段落</Box>
                      <MySelect
                        h="32px"
                        value={value.paragraphChunkAIMode}
                        onChange={(next) =>
                          patch({
                            paragraphChunkAIMode: next as ProcessConfig["paragraphChunkAIMode"],
                          })
                        }
                        list={[
                          {
                            value: "auto",
                            label: "自动",
                            description: "当文本内容不含 Markdown 标题时，启用模型识别。",
                          },
                          {
                            value: "forbid",
                            label: "禁用",
                            description: "强制禁用模型自动识别段落",
                          },
                          {
                            value: "force",
                            label: "强制处理",
                            description: "强制使用模型自动识别段落，并忽略原文本的段落（如有）",
                          },
                        ]}
                      />
                    </Box>
                    <Box mt={2} fontSize="sm">
                      <Box mb={1}>最大段落深度</Box>
                      <IntInput
                        min={1}
                        max={8}
                        value={value.paragraphChunkDeep}
                        bg="white"
                        onChange={(n) => patch({ paragraphChunkDeep: n })}
                      />
                    </Box>
                    <Box mt={2} fontSize="sm">
                      <FieldLabel tip={PARENT_CHUNK_MAX_TIP}>最大分块大小（父块）</FieldLabel>
                      <IntInput
                        min={100}
                        max={3000}
                        step={100}
                        value={value.chunkSize}
                        onChange={(n) => patch({ chunkSize: n })}
                      />
                    </Box>
                  </>
                )}

                {value.chunkSplitMode === "size" && (
                  <Box mt={3} fontSize="sm">
                    <FieldLabel tip={PARENT_CHUNK_TIP}>分块大小（父块）</FieldLabel>
                    <IntInput
                      min={100}
                      max={3000}
                      step={100}
                      value={value.chunkSize}
                      onChange={(n) => patch({ chunkSize: n })}
                    />
                  </Box>
                )}

                {value.chunkSplitMode === "char" && (
                  <Box mt={3} fontSize="sm">
                    <Box mb={1}>分隔符</Box>
                    <HStack>
                      <Box flex="1 0 0">
                        <MySelect
                          h="32px"
                          value={signPick}
                          onChange={(v) => {
                            setSignPick(v);
                            patch({ chunkSplitter: v === "Other" ? "" : v });
                          }}
                          list={SPLIT_SIGNS}
                        />
                      </Box>
                      {signPick === "Other" && (
                        <Input
                          flex="1 0 0"
                          h="32px"
                          size="sm"
                          bg="myGray.50"
                          placeholder="\n;======;==SPLIT=="
                          value={value.chunkSplitter}
                          onChange={(e) => patch({ chunkSplitter: e.target.value })}
                        />
                      )}
                    </HStack>
                  </Box>
                )}

                {value.trainingType === "chunk" && (
                  <Box fontSize="sm" mt={2}>
                    <FieldLabel tip={CHILD_INDEX_TIP}>索引大小（子块）</FieldLabel>
                    <Box color="myGray.500" fontSize="xs" lineHeight="1.5" mb={1.5}>
                      父子文档：父块完整入库给模型读，子块用来检索；命中子块后返回对应父块。
                    </Box>
                    <MySelect
                      h="32px"
                      value={String(value.indexSize)}
                      onChange={(next) => patch({ indexSize: Number(next) })}
                      list={INDEX_SIZES.map((n) => ({ label: String(n), value: String(n) }))}
                    />
                  </Box>
                )}

                {value.trainingType === "qa" && (
                  <Box mt={2}>
                    <Box mb={1} fontSize="sm">
                      QA 拆分引导
                    </Box>
                    <Box
                      position="relative"
                      py={2}
                      px={3}
                      bg="myGray.50"
                      fontSize="xs"
                      whiteSpace="pre-wrap"
                      border="1px solid"
                      borderColor="myGray.200"
                      borderRadius="md"
                      maxH="140px"
                      overflow="auto"
                    >
                      {value.qaPrompt}
                      <Button
                        size="xs"
                        variant="whiteBase"
                        color="black"
                        position="absolute"
                        right={2}
                        bottom={2}
                        onClick={() => {
                          setDraftPrompt(value.qaPrompt);
                          prompt.onOpen();
                        }}
                      >
                        自定义提示词
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            ) : null}
          </LeftRadioCard>
        </Flex>
      </Box>

      <Modal isOpen={prompt.isOpen} onClose={prompt.onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>自定义提示词</ModalHeader>
          <ModalBody>
            <Textarea
              minH="180px"
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
            />
            <Box mt={2} fontSize="sm" color="myGray.500">
              答案必须来自原文，不要杜撰。
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button
              onClick={() => {
                patch({ qaPrompt: draftPrompt.trim() || DEFAULT_QA_PROMPT });
                prompt.onClose();
              }}
            >
              确认
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
