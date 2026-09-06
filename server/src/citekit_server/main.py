from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from citekit_server import __version__
from citekit_server.api import router
from citekit_server.config import settings
from citekit_server.db import Base, SessionLocal, engine, ensure_schema
from citekit_server.seed import seed_if_empty


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Citekit", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "citekit-server",
        "version": __version__,
        "health": "/health",
        "docs": "/docs",
        "models": "/api/models",
    }


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {"ok": True, "service": "citekit-server", "version": __version__}


def run() -> None:
    import uvicorn

    uvicorn.run(
        "citekit_server.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
