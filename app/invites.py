"""Коды и токены приглашений в класс."""

from __future__ import annotations

import re
import secrets

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import ClassInvite

_INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_INVITE_CODE_LEN = 8


def new_invite_token() -> str:
    return secrets.token_urlsafe(24)


def new_invite_code() -> str:
    return "".join(secrets.choice(_INVITE_CODE_ALPHABET) for _ in range(_INVITE_CODE_LEN))


def find_class_invite(db: Session, raw: str) -> ClassInvite | None:
    """Полный токен — точное совпадение; короткий код — без пробелов и дефисов, без учёта регистра."""
    stripped = (raw or "").strip()
    if not stripped:
        return None
    inv = db.query(ClassInvite).filter(ClassInvite.token == stripped).first()
    if inv:
        return inv
    compact = re.sub(r"[^A-Za-z0-9]", "", stripped)
    if len(compact) < 6:
        return None
    code_upper = compact.upper()
    return (
        db.query(ClassInvite)
        .filter(ClassInvite.invite_code.isnot(None))
        .filter(func.upper(ClassInvite.invite_code) == code_upper)
        .first()
    )
