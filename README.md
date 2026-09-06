# Citekit

面向 Agent 的知识库与检索工具平台：入库、切片、检索策略、工具契约，再通过 MCP 白名单发布。

## 一键启动

根目录需要已安装 [pnpm](https://pnpm.io)、[uv](https://docs.astral.sh/uv/)、Python 3.12 和 Docker。第一次：

```bash
pnpm install
pnpm --dir web install
uv --directory server sync
pnpm dev:db
```

`pnpm dev:db` 会启动 MySQL 8（`citekit/citekit@127.0.0.1:3306/citekit`）。之后：

```bash
pnpm dev
```

会同时拉起前端 http://localhost:5173 和 API http://127.0.0.1:8000。设置页的模型配置与工作空间默认模型走真实 API，知识库与检索工具仍是前端 mock。

只要前端：`pnpm dev:web`；只要后端：`pnpm dev:server`。健康检查 `/health`，接口文档 `/docs`。
