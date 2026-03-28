from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[misc, assignment]

if load_dotenv:
    _root = Path(__file__).resolve().parent.parent
    load_dotenv(_root / ".env")
    load_dotenv(_root / ".env.development", override=True)

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


@lru_cache
def get_settings():
    return Settings()


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
        self.jwt_secret = os.getenv("JWT_SECRET", "change-me-in-production-use-long-random")
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
        self.parent_token_expire_minutes = int(os.getenv("PARENT_TOKEN_EXPIRE_MINUTES", "15"))
        self.parent_challenge_ttl_minutes = int(os.getenv("PARENT_CHALLENGE_TTL_MINUTES", "5"))
        # Первая верная попытка за UTC-день: столько коинов; каждая следующая за тот же день: +extra.
        self.daily_first_correct_coins = int(os.getenv("DAILY_FIRST_CORRECT_COINS", "50"))
        self.daily_each_next_extra_coins = int(os.getenv("DAILY_EACH_NEXT_EXTRA_COINS", "10"))
        self.lesson_completion_xp = int(os.getenv("LESSON_COMPLETION_XP", "100"))
        self.lesson_completion_coins = int(os.getenv("LESSON_COMPLETION_COINS", "10"))
        # Макс. неверных попыток по уроку (практика): дальше ответ не принимается; зачёт урока только при ≤ этого числа ошибок.
        self.practice_max_wrong_per_lesson = int(os.getenv("PRACTICE_MAX_WRONG_PER_LESSON", "2"))
        self.practice_wrong_coin_penalty = int(os.getenv("PRACTICE_WRONG_COIN_PENALTY", "5"))
        self.practice_wrong_xp_penalty = int(os.getenv("PRACTICE_WRONG_XP_PENALTY", "10"))
        self.speed_bonus_ms = int(os.getenv("SPEED_BONUS_MS", "30000"))
        self.speed_bonus_amount = int(os.getenv("SPEED_BONUS_AMOUNT", "5"))
        # dev: при старте перезаписать пароль пользователя admin (см. app/seed.py)
        self.sync_admin_password = os.getenv(
            "ORENIT_SYNC_ADMIN_PASSWORD", ""
        ).lower() in ("1", "true", "yes")


_settings = get_settings()

connect_args: dict = {}
if _settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    path_part = _settings.database_url.removeprefix("sqlite:///")
    if path_part and path_part != ":memory:" and not path_part.startswith("memory"):
        db_path = Path(path_part)
        if db_path.parent.parts:
            db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(_settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def _sqlite_enable_foreign_keys(dbapi_connection, connection_record) -> None:
    """Без PRAGMA foreign_keys=ON в SQLite каскады ON DELETE не выполняются — остаются «висячие» записи."""
    if engine.dialect.name != "sqlite":
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
