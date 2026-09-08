import type { ReactNode } from "react";
import { Link, type NavigateFunction } from "react-router-dom";
import { EmptyTipArt } from "./ColorIcon";

export function goBack(nav: NavigateFunction, fallback: string) {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === "number" && idx > 0) nav(-1);
  else nav(fallback);
}

export function PageHero({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-hero">
      <div>
        <h1 className="page-title">{title}</h1>
        {desc ? <p className="page-desc">{desc}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Crumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="crumb" aria-label="面包屑">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`}>
          {i > 0 ? <span className="crumb-sep">/</span> : null}
          {item.href ? <Link to={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function NextBar({
  text,
  cta,
  to,
  done,
}: {
  text: string;
  cta: string;
  to: string;
  done?: boolean;
}) {
  return (
    <div className={done ? "next-bar done" : "next-bar"}>
      <span>{text}</span>
      <Link to={to} className="next-bar-btn">
        {cta}
      </Link>
    </div>
  );
}

export function Empty({
  text,
  to,
  cta,
}: {
  text: ReactNode;
  to?: string;
  cta?: string;
}) {
  return (
    <div className="empty">
      <EmptyTipArt />
      <p>{text}</p>
      {to && cta ? <Link to={to}>{cta}</Link> : null}
    </div>
  );
}

export function DataTable({
  headers,
  children,
  footer,
  className,
}: {
  headers: ReactNode[];
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={["data-wrap", className].filter(Boolean).join(" ")}>
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function Panel({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
        {extra}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
