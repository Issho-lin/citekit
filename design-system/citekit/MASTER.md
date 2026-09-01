# Design System Master File

> Citekit · 清新控制台。页面级 `pages/[name].md` 若存在则覆盖本文件。

**Project:** Citekit  
**Updated:** 2026-08-30  
**Category:** Knowledge Base / SaaS Admin

## Global Rules

### Color Palette（清新：fresh cyan + clean green）

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#0891B2` | `--color-primary` |
| Secondary | `#22D3EE` | `--color-secondary` |
| CTA | `#059669` | `--color-cta` |
| Background | `#F0FDFA` | `--color-background` |
| Surface | `#FFFFFF` | `--color-surface` |
| Text | `#134E4A` | `--color-text` |
| Muted | `#0F766E` | `--color-muted` |
| Line | `#CCFBF1` | `--color-line` |

**Notes:** Cleaning-service 清新青 + 干净绿。正文与弱化字均满足浅底 ≥4.5:1。侧栏浅色，不用墨黑。

### Typography

- **Heading / Body:** Plus Jakarta Sans
- **Mono:** ui-monospace（工具名）
- **Mood:** friendly, airy, SaaS, clean
- **Import:** `Plus Jakarta Sans` 300–700 + 系统中文回退

### Spacing

`--space-xs` 4px · `--space-sm` 8px · `--space-md` 16px · `--space-lg` 24px · `--space-xl` 32px

### Motion

150–250ms ease-out；禁止 hover 位移/缩放造成布局跳动；尊重 `prefers-reduced-motion`。

### Style

Minimalism / Swiss：留白、网格、几何圆角 12px。卡片用细描边 + 极轻投影，不用玻璃拟态、不用 emoji 图标。

## Anti-Patterns

- 深色墨黑侧栏、暖灰纸张底
- hover scale / translateY
- 灰 400 级正文
- emoji 当图标
