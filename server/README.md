# Citekit Server

当前已接 MySQL：模型目录、工作空间默认模型，以及 OpenAI 兼容上游的连通测试。知识库入库仍未实现。

## 要求

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- MySQL 8（仓库根目录 `pnpm dev:db` 或 `docker compose up -d mysql`）

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
