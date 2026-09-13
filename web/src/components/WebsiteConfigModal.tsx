import { useState } from "react";
import {
  Box,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
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
  const { syncWebsite } = useStore();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState(kb.websiteUrl || "");
  const [selector, setSelector] = useState(kb.websiteSelector || "");
  const [busy, setBusy] = useState(false);
  const isEdit = !!kb.websiteUrl;

  async function startSync() {
    if (!url.trim() || !/^https?:\/\//i.test(url.trim())) {
      toast("请填写有效的网站地址");
      return;
    }
    setBusy(true);
    try {
      const result = await syncWebsite(kb.id, { url: url.trim(), selector: selector.trim() });
      toast(`已开始抓取同站静态页（最多 ${result.maxPages} 页、深度 ${result.maxDepth}）`);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "同步失败");
    } finally {
      setBusy(false);
    }
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
                从根地址开始抓取同站、同路径前缀下的静态 HTML，写成独立数据集再训练。动态站点、需要登录的页面抓不到。每次最多
                50 页、深度 3 层。
              </Box>
              <Box mt={3}>
                <Box mb={1}>根地址</Box>
                <Input
                  placeholder="https://docs.example.com/guide"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </Box>
              <Box mt={3}>
                <Box mb={1}>选择器（选填）</Box>
                <Input
                  placeholder="article .markdown-body"
                  value={selector}
                  onChange={(e) => setSelector(e.target.value)}
                />
              </Box>
            </>
          ) : (
            <Box fontSize="sm" color="myGray.600">
              将按知识库默认切块参数抓取并训练。已存在的同一网址会覆盖正文后重新入库。
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
              <Button variant="whiteBase" onClick={() => setStep(0)} isDisabled={busy}>
                上一步
              </Button>
              <Button ml={2} onClick={() => void startSync()} isLoading={busy}>
                {isEdit ? "更新并同步" : "开始同步"}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
