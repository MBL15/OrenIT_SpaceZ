from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from sqlalchemy import create_engine
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
        self.base_currency_reward = int(os.getenv("BASE_CURRENCY_REWARD", "10"))
        self.speed_bonus_ms = int(os.getenv("SPEED_BONUS_MS", "30000"))
        self.speed_bonus_amount = int(os.getenv("SPEED_BONUS_AMOUNT", "5"))


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


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
