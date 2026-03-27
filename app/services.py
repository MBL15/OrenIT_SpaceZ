from __future__ import annotations

import json
import random
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Lesson,
    LessonProgress,
    TaskAttempt,
    TaskInstance,
    TaskTemplate,
    UserMascotEquipped,
    UserStat,
    Wallet,
)


# --- task generation / checking ---


def sample_params(spec: dict[str, Any]) -> dict[str, int]:
    out: dict[str, int] = {}
    for k, v in spec.items():
        if isinstance(v, dict) and "min" in v and "max" in v:
            lo, hi = int(v["min"]), int(v["max"])
            if lo > hi:
                lo, hi = hi, lo
            out[k] = random.randint(lo, hi)
        else:
            raise ValueError(f"bad param spec for {k}")
    return out


def render_prompt(template: str, params: dict[str, int]) -> str:
    def repl(m: re.Match[str]) -> str:
        key = m.group(1).strip()
        if key not in params:
            return m.group(0)
        return str(params[key])

    return re.sub(r"\{\{\s*(\w+)\s*\}\}", repl, template)


def compute_expected(
    params: dict[str, int],
    checker_type: str,
    checker_config: dict[str, Any] | None,
) -> str:
    cfg = checker_config or {}
    if checker_type != "numeric":
        raise ValueError("only numeric checker implemented")
    kind = cfg.get("kind", "binary")
    if kind != "binary":
        raise ValueError("unsupported kind")
    op = cfg.get("op", "+")
    left_k = cfg.get("left", "a")
    right_k = cfg.get("right", "b")
    a, b = params[left_k], params[right_k]
    if op == "+":
        return str(a + b)
    if op == "-":
        if a < b:
            a, b = b, a
        return str(a - b)
    if op == "*":
        return str(a * b)
    raise ValueError("unsupported op")


def answers_match(expected: str, submitted: str, tolerance: float) -> bool:
    try:
        exp = float(expected.strip().replace(",", "."))
        got = float(submitted.strip().replace(",", "."))
    except ValueError:
        return expected.strip() == submitted.strip()
    return abs(exp - got) <= tolerance


def parse_checker_config(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    return json.loads(raw)


def parse_param_spec(raw: str) -> dict[str, Any]:
    return json.loads(raw)


# --- stats / progress ---


def iso_week_id() -> str:
    dt = datetime.now(timezone.utc).date()
    y, w, _ = dt.isocalendar()
    return f"{y}-W{w:02d}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# Пороги уровней: 1-й с 0 XP; 2-й с 100; далее шаг к следующему уровню +100 (+200, +300, …).
_XP_PER_LEVEL_TIER = 100


def min_xp_for_level(level: int) -> int:
    """Минимум суммарного XP, чтобы находиться на уровне level (level 1 — с нуля)."""
    if level <= 1:
        return 0
    return _XP_PER_LEVEL_TIER * (level - 1) * level // 2


def level_from_total_xp(xp: int) -> int:
    if xp < 0:
        xp = 0
    level = 1
    while min_xp_for_level(level + 1) <= xp:
        level += 1
    return level


def grant_lesson_completion_xp_if_eligible(
    db: Session,
    user_id: int,
    lesson_id: int,
    xp_amount: int,
    *,
    max_wrong: int = 2,
) -> int:
    """Если теория и практика пройдены и бонус ещё не выдан — начисляет XP и помечает урок."""
    lp = db.get(LessonProgress, (user_id, lesson_id))
    if not lp or not lp.theory_done or lp.lesson_xp_claimed:
        return 0
    if not recompute_lesson_practice_done(db, user_id, lesson_id, max_wrong=max_wrong):
        return 0
    lp.lesson_xp_claimed = True
    lp.updated_at = _now_iso()
    add_score(db, user_id, xp_amount)
    return xp_amount


def add_score(db: Session, user_id: int, points: int) -> None:
    stat = db.get(UserStat, user_id)
    wid = iso_week_id()
    if not stat:
        if points <= 0:
            return
        stat = UserStat(
            user_id=user_id,
            score_total=points,
            score_week=points,
            week_id=wid,
            updated_at=_now_iso(),
        )
        db.add(stat)
        return
    if stat.week_id != wid:
        stat.score_week = 0
        stat.week_id = wid
    stat.score_total = max(0, stat.score_total + points)
    stat.score_week = max(0, stat.score_week + points)
    stat.updated_at = _now_iso()


def wrong_attempts_for_lesson(db: Session, user_id: int, lesson_id: int) -> int:
    n = (
        db.query(func.count(TaskAttempt.id))
        .join(TaskInstance, TaskAttempt.task_instance_id == TaskInstance.id)
        .join(TaskTemplate, TaskInstance.task_template_id == TaskTemplate.id)
        .filter(
            TaskAttempt.user_id == user_id,
            TaskTemplate.lesson_id == lesson_id,
            TaskAttempt.is_correct.is_(False),
        )
        .scalar()
    )
    return int(n or 0)


def recompute_lesson_practice_done(
    db: Session, user_id: int, lesson_id: int, *, max_wrong: int = 2
) -> bool:
    if wrong_attempts_for_lesson(db, user_id, lesson_id) > max_wrong:
        return False
    templates = db.query(TaskTemplate).filter(TaskTemplate.lesson_id == lesson_id).all()
    if not templates:
        return False
    for t in templates:
        exists = (
            db.query(TaskAttempt)
            .join(TaskInstance, TaskAttempt.task_instance_id == TaskInstance.id)
            .filter(
                TaskAttempt.user_id == user_id,
                TaskAttempt.is_correct.is_(True),
                TaskInstance.task_template_id == t.id,
            )
            .first()
        )
        if not exists:
            return False
    return True


def published_lesson_ids(db: Session) -> list[int]:
    return [
        r[0]
        for r in db.query(Lesson.id)
        .filter(Lesson.is_published.is_(True))
        .order_by(Lesson.sort_order)
        .all()
    ]


# --- new user rows ---


def ensure_user_economy_rows(db: Session, user_id: int) -> None:
    if not db.get(Wallet, user_id):
        db.add(Wallet(user_id=user_id, balance=0))
    if not db.get(UserStat, user_id):
        db.add(
            UserStat(
                user_id=user_id,
                score_total=0,
                score_week=0,
                week_id=iso_week_id(),
                updated_at=_now_iso(),
            )
        )
    if not db.get(UserMascotEquipped, user_id):
        db.add(UserMascotEquipped(user_id=user_id, updated_at=_now_iso()))
