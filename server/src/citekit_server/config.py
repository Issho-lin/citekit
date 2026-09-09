from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_SERVER_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CITEKIT_",
        env_file=_SERVER_DIR / ".env",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8000
    public_url: str = "http://127.0.0.1:8000"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    database_url: str = "mysql+pymysql://citekit:citekit@127.0.0.1:3306/citekit?charset=utf8mb4"
    qdrant_url: str = "http://127.0.0.1:6333"
    data_dir: Path = _SERVER_DIR / "data"
    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: str = "citekit"
    minio_secret_key: str = "citekitsecret"
    minio_bucket: str = "citekit"
    minio_secure: bool = False

    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


settings = Settings()
