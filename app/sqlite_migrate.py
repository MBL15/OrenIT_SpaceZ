"""Лёгкие миграции SQLite без Alembic (добавление колонок к существующим БД)."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.invites import new_invite_code
from app.models import ClassInvite


def apply_sqlite_migrations(engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(class_invites)")).fetchall()
        col_names = {r[1] for r in rows}
        if "invite_code" not in col_names:
            conn.execute(text("ALTER TABLE class_invites ADD COLUMN invite_code VARCHAR(16)"))
            conn.commit()


def backfill_class_invite_codes(session: Session) -> None:
    """Заполняет invite_code для строк, где колонка NULL (после ALTER)."""
    rows = session.query(ClassInvite).filter(ClassInvite.invite_code.is_(None)).all()
    used = {
        c
        for (c,) in session.query(ClassInvite.invite_code)
        .filter(ClassInvite.invite_code.isnot(None))
        .all()
        if c
    }
    for inv in rows:
        code = new_invite_code()
        while code in used:
            code = new_invite_code()
        inv.invite_code = code
        used.add(code)
    if rows:
        session.commit()
