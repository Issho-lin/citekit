from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from citekit_server import __version__
from citekit_server.api import router
from citekit_server.calls_api import router as calls_router
from citekit_server.config import settings
from citekit_server.db import Base, SessionLocal, UploadedFileRow, engine, ensure_schema
from citekit_server.kb_api import router as kb_router
from citekit_server.seed import seed_if_empty
from citekit_server.storage import ensure_bucket, migrate_local_uploads


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    ensure_bucket()
    db = SessionLocal()
    try:
        seed_if_empty(db)
        if migrate_local_uploads(db.query(UploadedFileRow).all()):
            db.commit()
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
app.include_router(kb_router)
app.include_router(calls_router)


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
