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

  return <Box className="website-discover">
    <Box className="website-discover-hero">
      <Box className="website-discover-title">发现网站页面</Box>
      <Box className="website-discover-desc">扫描同站、同路径下的静态页面，再选择需要导入的内容。</Box>
    </Box>
    <Box className="website-discover-form">
      <Box className="website-field website-field-primary"><Box className="website-field-label">起始地址 <Box as="span">*</Box></Box><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.example.com/guide" onKeyDown={(event) => { if (event.key === "Enter") void discover(); }} /></Box>
      <Flex className="website-field-grid" gap={3}><Box className="website-field"><Box className="website-field-label">链接发现选择器 <em>选填</em></Box><Input value={linkSelector} onChange={(e) => setLinkSelector(e.target.value)} placeholder="例如 main a" /></Box><Box className="website-field"><Box className="website-field-label">正文选择器 <em>选填</em></Box><Input value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="例如 article .content" /></Box></Flex>
      <Flex className="website-discover-form-footer" justify="space-between" align="center"><Box>不填写选择器时，将自动提取页面正文与同路径链接。</Box><Button onClick={() => void discover()} isLoading={loading} loadingText="扫描中">开始扫描</Button></Flex>
    </Box>
    {loading ? <Flex className="website-discover-loading" align="center" justify="center"><Spinner thickness="2px" /><Box>正在发现页面，请稍候…</Box></Flex> : pages.length ? <Box className="website-discover-results"><Flex className="website-discover-results-head" justify="space-between" align="center"><Box><Box fontWeight={600}>发现 {pages.length} 个页面</Box><Box fontSize="xs" color="myGray.500">取消勾选可排除导航、登录或无关页面</Box></Box><Button size="xs" variant="ghost" onClick={() => setSelected(selected.length === pages.length ? [] : pages.map((page) => page.url))}>{selected.length === pages.length ? "取消全选" : "全选"}</Button></Flex><Stack className="website-page-list" spacing={0}>{pages.map((page) => <Checkbox key={page.url} className="website-page-row" isChecked={selected.includes(page.url)} onChange={() => setSelected((items) => items.includes(page.url) ? items.filter((item) => item !== page.url) : [...items, page.url])}><Box className="website-page-title">{page.title || page.url}</Box><Box className="website-page-meta"><Box>{page.url}</Box><Box>{page.chars.toLocaleString()} 字</Box></Box></Checkbox>)}</Stack></Box> : <Box className="website-discover-empty">填写起始地址后开始扫描，结果会显示在这里。</Box>}
    <Flex className="website-discover-footer" align="center" justify="space-between"><Box>{selected.length ? `将导入 ${selected.length} 个页面，并按下一步设置的规则处理。` : "请先扫描并至少选择一个页面。"}</Box><Button isDisabled={!selected.length} onClick={() => { setSources(pages.filter((page) => selected.includes(page.url)).map((page) => ({ id: page.url, createStatus: "waiting", sourceName: page.title, link: page.url, rawText: JSON.stringify({ root: url.trim(), linkSelector: linkSelector.trim() }) }))); goToNext(); }}>下一步</Button></Flex>
  </Box>;
}
