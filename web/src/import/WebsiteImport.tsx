import { Box, Button, Checkbox, Flex, Input, Spinner, Stack } from "@chakra-ui/react";
import { useState } from "react";
import { api } from "../api";
import { useToast } from "../components/Toast";
import { useDatasetImport } from "./Context";
import { DataProcess } from "./DataProcess";
import { PreviewData } from "./PreviewData";
import { UploadStep } from "./Upload";

type Page = { url: string; title: string; chars: number };

export function WebsiteImport() {
  const { activeStep } = useDatasetImport();
  if (activeStep === 0) return <WebsiteDiscover />;
  if (activeStep === 1) return <DataProcess />;
  if (activeStep === 2) return <PreviewData />;
  return <UploadStep />;
}

function WebsiteDiscover() {
  const toast = useToast();
  const { kbId, goToNext, setSources, process, setProcess } = useDatasetImport();
  const [url, setUrl] = useState("");
  const [selector, setSelector] = useState("");
  const [linkSelector, setLinkSelector] = useState("");
  const [pages, setPages] = useState<Page[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function discover() {
    if (!/^https?:\/\//i.test(url.trim())) { toast("请填写有效的网站地址"); return; }
    setLoading(true);
    try {
      const result = await api.discoverWebsitePages(kbId, { url: url.trim(), selector: selector.trim(), linkSelector: linkSelector.trim() });
      setPages(result);
      setSelected(result.map((page) => page.url));
      setProcess({ ...process, webSelector: selector.trim() });
    } catch (err) { toast(err instanceof Error ? err.message : "发现页面失败"); } finally { setLoading(false); }
  }

  return <Box className="feishu-import-panel">
    <Flex className="feishu-import-heading" align="flex-start" justify="space-between"><Box><Box className="feishu-import-title">发现网站页面</Box><Box className="feishu-import-desc">扫描同站、同路径范围内的静态页面，再选择要导入的内容。</Box></Box></Flex>
    <Stack p={5} spacing={3} borderBottomWidth="1px" borderColor="myGray.200">
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.example.com/guide" />
      <Input value={linkSelector} onChange={(e) => setLinkSelector(e.target.value)} placeholder="链接发现选择器（选填）" />
      <Input value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="正文选择器（选填）" />
      <Flex justify="flex-end"><Button onClick={() => void discover()} isLoading={loading}>发现页面</Button></Flex>
    </Stack>
    {loading ? <Flex minH="150px" align="center" justify="center"><Spinner /></Flex> : pages.length ? <Stack className="feishu-file-list" spacing={0}>{pages.map((page) => <Checkbox key={page.url} className="feishu-file-row" isChecked={selected.includes(page.url)} onChange={() => setSelected((items) => items.includes(page.url) ? items.filter((item) => item !== page.url) : [...items, page.url])}><Box className="feishu-file-name">{page.title}</Box><Box className="feishu-file-kind">{page.chars.toLocaleString()} 字</Box></Checkbox>)}</Stack> : null}
    <Flex className="feishu-import-footer" align="center" justify="space-between"><Box color="myGray.600" fontSize="sm">发现后可排除不需要的导航、登录或无关页面。</Box><Button isDisabled={!selected.length} onClick={() => { setSources(pages.filter((page) => selected.includes(page.url)).map((page) => ({ id: page.url, createStatus: "waiting", sourceName: page.title, link: page.url, rawText: JSON.stringify({ root: url.trim(), linkSelector: linkSelector.trim() }) }))); goToNext(); }}>下一步</Button></Flex>
  </Box>;
}
