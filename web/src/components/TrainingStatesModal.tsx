import { useMemo, useState } from "react";
import {
  Box,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import { IconCheckSmall, IconRunning } from "./icons";
import type { ProcessConfig, Source } from "../types";

type StepStatus = "ready" | "running" | "queued" | "idle";

function TrainingStep({
  label,
  status,
  statusText,
  last,
}: {
  label: string;
  status: StepStatus;
  statusText?: string;
  last?: boolean;
}) {
  const highlighted = status !== "idle";
  const active = status === "running" || status === "queued";

  return (
    <Flex alignItems="center" pl={4}>
      <Box
        w="14px"
        h="14px"
        borderWidth="2px"
        borderRadius="50%"
        position="relative"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg={highlighted ? "primary.600" : "transparent"}
        borderColor={highlighted ? "primary.600" : "myGray.250"}
        boxShadow={active ? "0 0 0 4px #E1EAFF" : undefined}
        _after={
          last
            ? undefined
            : {
                content: '""',
                height: "59px",
                width: "2px",
                bg: "myGray.250",
                position: "absolute",
                top: "14px",
                left: "4px",
              }
        }
      >
        {status === "ready" ? (
          <Box color="white" display="flex">
            <IconCheckSmall size={10} />
          </Box>
        ) : null}
      </Box>
      <Flex
        alignItems="center"
        w="full"
        bg={highlighted ? "primary.50" : "myGray.50"}
        py={2.5}
        px={3}
        ml={5}
        borderRadius="8px"
        flex={1}
        h="53px"
      >
        <Box fontSize="14px" fontWeight="medium" color={highlighted ? "myGray.900" : "myGray.400"} mr={2}>
          {label}
        </Box>
        <Box flex={1} />
        {statusText ? (
          <Box fontSize="sm" color="myGray.600">
            {statusText}
          </Box>
        ) : null}
      </Flex>
    </Flex>
  );
}

export function TrainingStatesModal({
  source,
  process,
  dataAmount,
  onClose,
}: {
  source: Source;
  process: ProcessConfig;
  dataAmount: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"states" | "errors">("states");
  const ready = source.status === "synced";
  const running = source.status === "syncing";

  const steps = useMemo(() => {
    const allReady = (label: string, extra?: string) => ({
      label,
      status: (ready ? "ready" : "idle") as StepStatus,
      statusText: extra,
    });
    const list: { label: string; status: StepStatus; statusText?: string }[] = [
      {
        label: "内容解析中",
        status: ready ? "ready" : running ? "running" : "idle",
        statusText: running ? "1 组训练中" : undefined,
      },
    ];
    if (process.trainingType === "qa") {
      list.push(allReady("问答对提取"));
    }
    if (process.imageIndex) {
      list.push(allReady("图片索引生成"));
    }
    if (process.autoIndexes) {
      list.push(allReady("自动索引生成"));
    }
    list.push({
      label: "索引向量化",
      status: ready ? "ready" : "idle",
    });
    list.push({
      label: "已就绪",
      status: ready ? "ready" : "idle",
      statusText: ready ? undefined : `${dataAmount} 组`,
    });
    return list;
  }, [process, ready, running, dataAmount]);

  return (
    <Modal isOpen onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent minW={["90vw", "712px"]} maxW="712px">
        <ModalHeader display="flex" alignItems="center" gap={2} fontWeight={500}>
          <Box color="primary.600">
            <IconRunning size={20} />
          </Box>
          训练状态
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody px={9} minH={["auto", "500px"]} pb={8}>
          <Flex
            display="inline-flex"
            mb={6}
            p="3px"
            borderRadius="4px"
            border="1px solid"
            borderColor="myGray.200"
            bg="myGray.50"
            gap="4px"
            fontSize="sm"
            fontWeight={500}
          >
            {(
              [
                { label: "训练状态", value: "states" as const },
                { label: "异常 (0)", value: "errors" as const },
              ] as const
            ).map((item) => {
              const on = tab === item.value;
              return (
                <Box
                  key={item.value}
                  px={4}
                  py={1}
                  borderRadius="2px"
                  cursor="pointer"
                  bg={on ? "white" : "transparent"}
                  boxShadow={on ? "0 1px 2px rgba(19, 51, 107, 0.08)" : "none"}
                  color={on ? "primary.600" : "myGray.500"}
                  onClick={() => setTab(item.value)}
                >
                  {item.label}
                </Box>
              );
            })}
          </Flex>

          {tab === "states" ? (
            <Flex flexDirection="column" gap={6}>
              {steps.map((item, index) => (
                <TrainingStep
                  key={item.label}
                  label={item.label}
                  status={item.status}
                  statusText={item.statusText}
                  last={index === steps.length - 1}
                />
              ))}
            </Flex>
          ) : (
            <Box color="myGray.500" fontSize="sm" py={10} textAlign="center">
              暂无异常
            </Box>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
