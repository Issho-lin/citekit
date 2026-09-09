# Citekit Server

当前已接 MySQL：模型目录、工作空间默认模型，通用知识库的创建、本地文件入库和试搜，以及检索工具、MCP 端点与评测。向量写入 Qdrant，原文件写入 MinIO。MCP 对外地址：`POST /mcp/{endpoint_id}`，请求头 `Authorization: Bearer {apiKey}`。

## 要求

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- MySQL 8（仓库根目录 `pnpm dev:db` 或 `docker compose up -d mysql`）
- MinIO（`pnpm dev:db` 一并启动，API `127.0.0.1:9000`）

## 本地运行

```bash
cd server
cp .env.example .env   # 可选
uv sync
uv run citekit-server
```

健康检查：http://127.0.0.1:8000/health  
文档：http://127.0.0.1:8000/docs

环境变量用 `CITEKIT_` 前缀，见 `.env.example`。
