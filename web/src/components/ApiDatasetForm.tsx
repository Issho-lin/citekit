import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import type { ApiDatasetServer, KnowledgeBase } from "../types";

const rowProps = { mt: 4, w: "100%", alignItems: "center" as const, justifyContent: "space-between" as const };
const labelProps = { flex: "0 0 110px", fontSize: "sm", fontWeight: 500, color: "myGray.900" };
const controlW = "300px";

export function ApiDatasetForm({
  kind,
  value,
  onChange,
}: {
  kind: KnowledgeBase["kind"];
  value: ApiDatasetServer;
  onChange: (next: ApiDatasetServer) => void;
}) {
  const [dirOpen, setDirOpen] = useState(false);
  const api = value.apiServer ?? { baseUrl: "", authorization: "", basePath: "" };
  const feishu = value.feishuServer ?? { appId: "", appSecret: "", folderToken: "" };
  const yuque = value.yuqueServer ?? { userId: "", token: "", basePath: "" };
  const dingtalk = value.dingtalkServer ?? { appKey: "", appSecret: "", userId: "" };

  const pathLabel =
    (kind === "yuque" ? yuque.basePath : api.basePath) || "/根目录";

  return (
    <>
      {kind === "api" && (
        <>
          <Flex {...rowProps}>
            <Box {...labelProps}>
              接口地址 <Box as="span" color="red.500">*</Box>
            </Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="接口地址"
              maxLength={200}
              value={api.baseUrl}
              onChange={(e) => onChange({ ...value, apiServer: { ...api, baseUrl: e.target.value } })}
            />
          </Flex>
          <Flex {...rowProps}>
            <Box {...labelProps}>Authorization</Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="请求头参数，会自动补充 Bearer"
              maxLength={2000}
              value={api.authorization}
              onChange={(e) => onChange({ ...value, apiServer: { ...api, authorization: e.target.value } })}
            />
          </Flex>
          <Flex {...rowProps}>
            <Box {...labelProps}>Base URL</Box>
            <Flex w={controlW} alignItems="center">
              <Box flex={1} fontSize="sm" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {pathLabel}
              </Box>
              <Button
                ml={2}
                variant="whiteBase"
                isDisabled={!api.baseUrl}
                onClick={() => setDirOpen(true)}
              >
                选择
              </Button>
            </Flex>
          </Flex>
        </>
      )}
      {kind === "feishu" && (
        <>
          <Flex {...rowProps} alignItems="flex-start">
            <Box {...labelProps} pt={2}>
              App ID <Box as="span" color="red.500">*</Box>
            </Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="App ID"
              maxLength={200}
              value={feishu.appId}
              onChange={(e) => onChange({ ...value, feishuServer: { ...feishu, appId: e.target.value } })}
            />
          </Flex>
          <Flex {...rowProps} alignItems="flex-start">
            <Box {...labelProps} pt={2}>
              App Secret <Box as="span" color="red.500">*</Box>
            </Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="App Secret"
              maxLength={200}
              value={feishu.appSecret}
              onChange={(e) => onChange({ ...value, feishuServer: { ...feishu, appSecret: e.target.value } })}
            />
          </Flex>
          <Flex {...rowProps} alignItems="flex-start">
            <Box {...labelProps} pt={2}>
              Folder Token <Box as="span" color="red.500">*</Box>
            </Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="Folder Token"
              maxLength={200}
              value={feishu.folderToken}
              onChange={(e) => onChange({ ...value, feishuServer: { ...feishu, folderToken: e.target.value } })}
            />
          </Flex>
        </>
      )}
      {kind === "yuque" && (
        <>
          <Flex {...rowProps}>
            <Box {...labelProps}>
              User ID <Box as="span" color="red.500">*</Box>
            </Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="User ID"
              maxLength={200}
              value={yuque.userId}
              onChange={(e) => onChange({ ...value, yuqueServer: { ...yuque, userId: e.target.value } })}
            />
          </Flex>
          <Flex {...rowProps}>
            <Box {...labelProps}>
              Token <Box as="span" color="red.500">*</Box>
            </Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="Token"
              maxLength={200}
              value={yuque.token}
              onChange={(e) => onChange({ ...value, yuqueServer: { ...yuque, token: e.target.value } })}
            />
          </Flex>
          <Flex {...rowProps}>
            <Box {...labelProps}>Base URL</Box>
            <Flex w={controlW} alignItems="center">
              <Box flex={1} fontSize="sm">
                {pathLabel}
              </Box>
              <Button
                ml={2}
                variant="whiteBase"
                isDisabled={!yuque.userId || !yuque.token}
                onClick={() => setDirOpen(true)}
              >
                选择
              </Button>
            </Flex>
          </Flex>
        </>
      )}
      {kind === "dingtalk" && (
        <>
          <Flex {...rowProps}>
            <Box {...labelProps}>
              App Key <Box as="span" color="red.500">*</Box>
            </Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="App Key"
              maxLength={200}
              value={dingtalk.appKey}
              onChange={(e) => onChange({ ...value, dingtalkServer: { ...dingtalk, appKey: e.target.value } })}
            />
          </Flex>
          <Flex {...rowProps}>
            <Box {...labelProps}>
              App Secret <Box as="span" color="red.500">*</Box>
            </Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="App Secret"
              maxLength={200}
              value={dingtalk.appSecret}
              onChange={(e) => onChange({ ...value, dingtalkServer: { ...dingtalk, appSecret: e.target.value } })}
            />
          </Flex>
          <Flex {...rowProps}>
            <Box {...labelProps}>
              User ID <Box as="span" color="red.500">*</Box>
            </Box>
            <Input
              w={controlW}
              bg="myGray.50"
              placeholder="User ID"
              maxLength={200}
              value={dingtalk.userId}
              onChange={(e) => onChange({ ...value, dingtalkServer: { ...dingtalk, userId: e.target.value } })}
            />
          </Flex>
        </>
      )}

      <Modal isOpen={dirOpen} onClose={() => setDirOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>选择目录</ModalHeader>
          <ModalBody minH="200px">
            <Button
              variant="ghost"
              justifyContent="flex-start"
              w="100%"
              bg="primary.50"
              color="primary.700"
              onClick={() => {
                if (kind === "yuque") {
                  onChange({ ...value, yuqueServer: { ...yuque, basePath: "" } });
                } else {
                  onChange({ ...value, apiServer: { ...api, basePath: "" } });
                }
                setDirOpen(false);
              }}
            >
              根目录
            </Button>
          </ModalBody>
          <ModalFooter>
            <Button variant="whiteBase" onClick={() => setDirOpen(false)}>
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
