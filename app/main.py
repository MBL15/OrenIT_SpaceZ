from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core import Base, SessionLocal, engine, get_settings
from parent_mode import parent_mode_router

from app.routes_auth import auth_router, parent_router
from app.routes_learning import learning_router
from app.routes_play import play_router
from app.routes_staff import admin_router, teacher_router
from app.seed import (
    ensure_admin_exists,
    ensure_mascot_catalog,
    seed_if_empty,
    sync_default_admin_password,
)
from app.asgard_platform import sync_asgard_lesson_tasks
from app.sqlite_migrate import (
    apply_sqlite_migrations,
    backfill_class_invite_codes,
    ensure_teacher_assignable_platform,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Path("data").mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    apply_sqlite_migrations(engine)
    db = SessionLocal()
    try:
        backfill_class_invite_codes(db)
        seed_if_empty(db)
        ensure_admin_exists(db)
        if get_settings().sync_admin_password:
            sync_default_admin_password(db)
        ensure_mascot_catalog(db)
        ensure_teacher_assignable_platform(db)
        sync_asgard_lesson_tasks(db)
    finally:
        db.close()
    yield


app = FastAPI(title="OrenIT Learning API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(parent_router)
app.include_router(parent_mode_router)
app.include_router(learning_router)
app.include_router(play_router)
app.include_router(teacher_router)
app.include_router(admin_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
