import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react";
import { BrandLogo } from "../components/BrandLogo";
import { useStore } from "../mock/store";
import { usePageProgress } from "../progress";
import {
  IconBook,
  IconBolt,
  IconCheck,
  IconDash,
  IconGear,
  IconLink,
  IconTrace,
} from "../components/icons";

const links = [
  { to: "/", label: "工作台", icon: IconDash, exact: true },
  { to: "/kb", label: "知识库", icon: IconBook },
  { to: "/tools", label: "工具", icon: IconBolt },
  { to: "/mcp", label: "MCP", icon: IconLink },
  { to: "/calls", label: "调用", icon: IconTrace },
  { to: "/eval", label: "评测", icon: IconCheck },
  { to: "/settings", label: "设置", icon: IconGear },
];

export function AppShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const { knowledgeBases, kbsReady, tools, endpoints } = useStore();
  const [q, setQ] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);
  usePageProgress(!kbsReady);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return [
      ...knowledgeBases
        .filter((k) => k.kind !== "folder")
        .filter((k) => k.name.toLowerCase().includes(s))
        .map((k) => ({ href: `/kb/${k.id}`, title: k.name, kind: "知识库" })),
      ...tools
        .filter((t) => t.name.includes(s) || t.title.includes(s))
        .map((t) => ({ href: `/tools/${t.id}`, title: t.title, kind: "工具" })),
      ...endpoints
        .filter((e) => e.name.toLowerCase().includes(s))
        .map((e) => ({ href: `/mcp/${e.id}`, title: e.name, kind: "MCP" })),
    ].slice(0, 12);
  }, [q, knowledgeBases, tools, endpoints]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJumpOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" role="img" aria-label="Citekit">
          <BrandLogo />
        </div>
        <nav className="rail">
          {links.map(({ to, label, icon: Icon, exact }) => {
            const active = exact
              ? loc.pathname === to
              : loc.pathname === to || loc.pathname.startsWith(`${to}/`);
            return (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={active ? "rail-link active" : "rail-link"}
              >
                <Icon />
                {label}
              </NavLink>
            );
          })}
        </nav>
        <Menu>
          <MenuButton className="rail-avatar" aria-label="账号">
            运
          </MenuButton>
          <MenuList>
            <MenuItem isDisabled>运营</MenuItem>
            <MenuItem onClick={() => nav("/settings")}>设置</MenuItem>
            <MenuItem isDisabled>退出（登录未接入）</MenuItem>
          </MenuList>
        </Menu>
      </aside>
      <div className="main-col">
        <Outlet />
      </div>

      <Modal isOpen={jumpOpen} onClose={() => setJumpOpen(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>快速跳转</ModalHeader>
          <ModalBody pb={6}>
            <Input
              autoFocus
              placeholder="搜索名称…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div style={{ marginTop: 12 }}>
              {hits.length === 0 && q.trim() && (
                <div className="page-desc" style={{ margin: 8 }}>
                  无匹配
                </div>
              )}
              {hits.map((h) => (
                <button
                  key={h.href}
                  type="button"
                  className="jump-hit"
                  onClick={() => {
                    nav(h.href);
                    setJumpOpen(false);
                    setQ("");
                  }}
                >
                  <span className="jump-kind">{h.kind}</span>
                  {h.title}
                </button>
              ))}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
