from __future__ import annotations

import json
import math
import random
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    ClassTaskAssignment,
    CurrencyTransaction,
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
    if kind == "literal":
        if "expected" not in cfg:
            raise ValueError("literal checker requires expected")
        return str(cfg["expected"])
    if kind == "choice":
        eid = cfg.get("expected_choice_id")
        if not eid or not isinstance(eid, str):
            raise ValueError("choice checker requires expected_choice_id")
        return str(eid).strip()
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


# Уровень 1 с 0 XP; каждые следующие 1000 XP — новый уровень (2-й с 1000 XP, 3-й с 2000, …).
XP_PER_LEVEL = 1000


def level_from_total_xp(xp: int) -> int:
    if xp < 0:
        xp = 0
    return xp // XP_PER_LEVEL + 1


def grant_lesson_completion_xp_if_eligible(
    db: Session,
    user_id: int,
    lesson_id: int,
    xp_amount: int,
    *,
    coin_amount: int = 0,
    max_wrong: int = 2,
) -> tuple[int, int]:
    """Если теория и практика пройдены и бонус ещё не выдан — начисляет XP, коины и помечает урок.

    Возвращает (xp_выдано, коины_выдано).
    """
    lp = db.get(LessonProgress, (user_id, lesson_id))
    if not lp or not lp.theory_done or lp.lesson_xp_claimed:
        return (0, 0)
    if not recompute_lesson_practice_done(db, user_id, lesson_id, max_wrong=max_wrong):
        return (0, 0)
    lp.lesson_xp_claimed = True
    lp.updated_at = _now_iso()
    add_score(db, user_id, xp_amount)
    coins_granted = 0
    if coin_amount > 0:
        wallet = db.get(Wallet, user_id)
        if wallet:
            wallet.balance += coin_amount
            coins_granted = coin_amount
            db.add(
                CurrencyTransaction(
                    user_id=user_id,
                    delta=coin_amount,
                    reason="lesson_complete",
                    ref_type="lesson",
                    ref_id=lesson_id,
                    created_at=_now_iso(),
                )
            )
    return (xp_amount, coins_granted)


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
            TaskInstance.assignment_id.is_(None),
            TaskTemplate.counts_toward_lesson_practice.is_(True),
        )
        .scalar()
    )
    return int(n or 0)


def recompute_lesson_practice_done(
    db: Session, user_id: int, lesson_id: int, *, max_wrong: int = 2
) -> bool:
    if wrong_attempts_for_lesson(db, user_id, lesson_id) > max_wrong:
        return False
    templates = (
        db.query(TaskTemplate)
        .filter(
            TaskTemplate.lesson_id == lesson_id,
            TaskTemplate.counts_toward_lesson_practice.is_(True),
        )
        .all()
    )
    if not templates:
        return True
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


def grade_2_to_5_from_wrong_attempts(wrong_attempts: int) -> int:
    """Оценка 2–5: 0 ошибок→5, 1→4, 2→3, 3 и более→2 (минимум 2)."""
    return max(2, 5 - wrong_attempts)


def assignment_attempt_counts(
    db: Session, user_id: int, assignment_id: int
) -> tuple[int, int, int]:
    """Число попыток по назначению: всего, неверных, верных."""
    inst_ids = [
        r[0]
        for r in db.query(TaskInstance.id)
        .filter(
            TaskInstance.assignment_id == assignment_id,
            TaskInstance.user_id == user_id,
        )
        .all()
    ]
    if not inst_ids:
        return 0, 0, 0
    total = (
        db.query(func.count(TaskAttempt.id))
        .filter(TaskAttempt.task_instance_id.in_(inst_ids))
        .scalar()
        or 0
    )
    wrong = (
        db.query(func.count(TaskAttempt.id))
        .filter(
            TaskAttempt.task_instance_id.in_(inst_ids),
            TaskAttempt.is_correct.is_(False),
        )
        .scalar()
        or 0
    )
    correct = (
        db.query(func.count(TaskAttempt.id))
        .filter(
            TaskAttempt.task_instance_id.in_(inst_ids),
            TaskAttempt.is_correct.is_(True),
        )
        .scalar()
        or 0
    )
    return int(total), int(wrong), int(correct)


def grade_for_assignment(db: Session, user_id: int, assignment_id: int) -> int:
    """Оценка 2–5 по числу неверных попыток по всем экземплярам этого назначения."""
    inst_ids = [
        r[0]
        for r in db.query(TaskInstance.id)
        .filter(
            TaskInstance.assignment_id == assignment_id,
            TaskInstance.user_id == user_id,
        )
        .all()
    ]
    if not inst_ids:
        return grade_2_to_5_from_wrong_attempts(0)
    wrong = (
        db.query(func.count(TaskAttempt.id))
        .filter(
            TaskAttempt.task_instance_id.in_(inst_ids),
            TaskAttempt.is_correct.is_(False),
        )
        .scalar()
    )
    return grade_2_to_5_from_wrong_attempts(int(wrong or 0))


def block_assignment_ids_ordered(db: Session, block_id: int) -> list[int]:
    rows = (
        db.query(ClassTaskAssignment.id)
        .filter(ClassTaskAssignment.block_id == block_id)
        .order_by(ClassTaskAssignment.id.asc())
        .all()
    )
    return [r[0] for r in rows]


def block_grade_ceil_mean(db: Session, user_id: int, block_id: int) -> int | None:
    """Среднее арифметическое оценок по заданиям блока, округление вверх."""
    aids = block_assignment_ids_ordered(db, block_id)
    if not aids:
        return None
    grades = [grade_for_assignment(db, user_id, aid) for aid in aids]
    return int(math.ceil(sum(grades) / len(grades)))


def block_all_other_tasks_solved_correctly(
    db: Session, user_id: int, block_id: int, current_assignment_id: int
) -> bool:
    """У всех заданий блока, кроме текущего, уже есть верная попытка (для выдачи бонуса за блок на последней задаче)."""
    aids = block_assignment_ids_ordered(db, block_id)
    for aid in aids:
        if aid == current_assignment_id:
            continue
        ok = (
            db.query(TaskAttempt.id)
            .join(TaskInstance, TaskAttempt.task_instance_id == TaskInstance.id)
            .filter(
                TaskInstance.assignment_id == aid,
                TaskInstance.user_id == user_id,
                TaskAttempt.is_correct.is_(True),
            )
            .first()
        )
        if not ok:
            return False
    return True


def block_every_task_has_correct_attempt(db: Session, user_id: int, block_id: int) -> bool:
    aids = block_assignment_ids_ordered(db, block_id)
    for aid in aids:
        ok = (
            db.query(TaskAttempt.id)
            .join(TaskInstance, TaskAttempt.task_instance_id == TaskInstance.id)
            .filter(
                TaskInstance.assignment_id == aid,
                TaskInstance.user_id == user_id,
                TaskAttempt.is_correct.is_(True),
            )
            .first()
        )
        if not ok:
            return False
    return True


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
