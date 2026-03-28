from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.access import get_current_user
from app.achievements import AchievementOut, achievements_for_child
from app.core import Base, SessionLocal, engine, get_db, get_settings
from app.models import User
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
    ensure_catalog_blocks_2_3_teacher_assignable,
    ensure_map_lesson_templates_ignore_platform_practice,
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
        ensure_catalog_blocks_2_3_teacher_assignable(db)
        ensure_map_lesson_templates_ignore_platform_practice(db)
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


def _achievements_payload(db: Session, user: User) -> list[AchievementOut]:
    if user.role != "child":
        return []
    return achievements_for_child(db, user)


@app.get("/me/achievements", response_model=list[AchievementOut], tags=["achievements"])
def http_me_achievements(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[AchievementOut]:
    return _achievements_payload(db, user)


@app.get("/achievements", response_model=list[AchievementOut], tags=["achievements"])
def http_achievements_alias(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[AchievementOut]:
    """Тот же список, что /me/achievements — запасной путь для прокси."""
    return _achievements_payload(db, user)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
