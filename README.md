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

`pnpm dev:db` 会启动 MySQL 8（`citekit/citekit@127.0.0.1:3306/citekit`）和 Qdrant（`127.0.0.1:6333`）。之后：

```bash
pnpm dev
```

会同时拉起前端 http://localhost:5173 和 API http://127.0.0.1:8000。设置页的模型配置、工作空间默认模型，以及通用知识库的创建、本地文件入库和试搜走真实 API。检索工具与 MCP 仍是前端 mock。

只要前端：`pnpm dev:web`；只要后端：`pnpm dev:server`。健康检查 `/health`，接口文档 `/docs`。
