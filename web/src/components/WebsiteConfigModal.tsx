import { useState } from "react";
import {
  Box,
  Button,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import { DEFAULT_PROCESS } from "../constants";
import { useStore } from "../mock/store";
import { useToast } from "./Toast";
import type { KnowledgeBase } from "../types";

export function WebsiteConfigModal({
  kb,
  onClose,
}: {
  kb: KnowledgeBase;
  onClose: () => void;
}) {
  const toast = useToast();
  const { updateKnowledgeBase, addSource } = useStore();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState(kb.websiteUrl || "");
  const [selector, setSelector] = useState(kb.websiteSelector || "");
  const isEdit = !!kb.websiteUrl;

  function startSync() {
    if (!url.trim() || !/^https?:\/\//i.test(url.trim())) {
      toast("请填写有效的网站地址");
      return;
    }
    updateKnowledgeBase(kb.id, {
      websiteUrl: url.trim(),
      websiteSelector: selector.trim(),
    });
    addSource(kb.id, "web", url.trim(), url.trim(), {
      ...DEFAULT_PROCESS,
      webSelector: selector.trim(),
    });
    toast("同步任务将随后开启");
    onClose();
  }

  return (
    <Modal isOpen onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent maxW="550px">
        <ModalHeader>Web 站点配置</ModalHeader>
        <ModalBody>
          {step === 0 ? (
            <>
              <Box fontSize="xs" color="myGray.900" bg="blue.50" p={4} borderRadius="8px">
                Web 站点同步功能允许你填写一个网站的根地址，系统会自动深度抓取相关的网页进行知识库训练。仅会抓取静态的网站，以项目文档、博客为主。{" "}
                <Link
                  href="https://doc.fastgpt.io/docs/introduction/guide/knowledge_base/websync"
                  isExternal
                  textDecoration="underline"
                  color="blue.700"
                >
                  查看教程
                </Link>
              </Box>
              <Box mt={3}>
                <Box mb={1}>根地址</Box>
                <Input
                  placeholder="Web 站点地址"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </Box>
              <Box mt={3}>
                <Box mb={1}>选择器（选填）</Box>
                <Input
                  placeholder="body .content #document"
                  value={selector}
                  onChange={(e) => setSelector(e.target.value)}
                />
              </Box>
            </>
          ) : (
            <Box fontSize="sm" color="myGray.600">
              将按当前知识库的默认数据处理参数开始同步站点内容。确认后会创建网页集合并开始抓取。
            </Box>
          )}
        </ModalBody>
        <ModalFooter>
          {step === 0 ? (
            <>
              <Button variant="whiteBase" onClick={onClose}>
                关闭
              </Button>
              <Button
                ml={2}
                onClick={() => {
                  if (!url.trim() || !/^https?:\/\//i.test(url.trim())) {
                    toast("请填写有效的网站地址");
                    return;
                  }
                  setStep(1);
                }}
              >
                下一步
              </Button>
            </>
          ) : (
            <>
              <Button variant="whiteBase" onClick={() => setStep(0)}>
                上一步
              </Button>
              <Button ml={2} onClick={startSync}>
                {isEdit ? "更新并同步" : "开始同步"}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
