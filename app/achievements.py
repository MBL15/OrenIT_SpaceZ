"""Достижения ученика (список с флагом unlocked)."""

from __future__ import annotations

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.asgard_platform import ASGARD_LESSON_TITLE
from app.models import User, UserMascotEquipped, UserStat, Wallet
from app.services import ensure_user_economy_rows


class AchievementOut(BaseModel):
    id: str
    title: str
    description: str
    icon: str
    unlocked: bool


def achievements_for_child(db: Session, user: User) -> list[AchievementOut]:
    # Импорт после загрузки routes_learning (избегает циклов при старте приложения).
    from app.routes_learning import _progress_for_user

    ensure_user_economy_rows(db, user.id)
    rows = _progress_for_user(db, user)
    st = db.get(UserStat, user.id)
    xp = int(st.score_total) if st and st.score_total is not None else 0
    w = db.get(Wallet, user.id)
    coins = int(w.balance) if w and w.balance is not None else 0

    any_theory = any(r.theory_done for r in rows)
    any_practice = any(r.practice_done for r in rows)
    any_full = any(r.theory_done and r.practice_done for r in rows)
    n = len(rows)
    all_theory = n > 0 and all(r.theory_done for r in rows)
    all_complete = n > 0 and all(r.theory_done and r.practice_done for r in rows)
    attempts_sum = sum(r.total_attempts for r in rows)
    perfect_once = any(r.practice_done and r.wrong_attempts == 0 for r in rows)

    asgard_done = any(
        r.lesson_title == ASGARD_LESSON_TITLE and r.theory_done and r.practice_done for r in rows
    )
    eq_mascot = db.get(UserMascotEquipped, user.id)
    skin_changed = bool(eq_mascot and eq_mascot.skin_item_id is not None)

    specs: list[tuple[str, str, str, str, bool]] = [
        ("first_theory", "Первый шаг", "Пройти теорию любого урока", "📘", any_theory),
        ("first_practice", "В деле", "Завершить практику урока", "✏️", any_practice),
        ("double", "Слово и дело", "Полностью пройти урок (теория и практика)", "⭐", any_full),
        ("all_theory", "Знаток теории", "Пройти теорию всех уроков курса", "📚", all_theory),
        ("course_star", "Звезда курса", "Пройти все уроки целиком", "🌟", all_complete),
        ("xp_1k", "Опытный", "Набрать 1000 XP", "🚀", xp >= 1000),
        ("xp_5k", "Ветеран", "Набрать 5000 XP", "🏆", xp >= 5000),
        ("grinder", "Упорство", "Сделать не менее 25 попыток в практике", "💪", attempts_sum >= 25),
        ("sharp", "Без ошибок", "Закончить практику урока без неверных попыток", "🎯", perfect_once),
        ("coins_50", "Копилка", "Накопить 50 монет", "🪙", coins >= 50),
        (
            "asgard_complete",
            "Помощник бога",
            "Пройти урок «Асгард» целиком (теория и практика)",
            "⚡",
            asgard_done,
        ),
        ("stylist", "Стиляга", "Сменить скин маскота", "👔", skin_changed),
    ]
    return [
        AchievementOut(id=a, title=t, description=d, icon=i, unlocked=u) for a, t, d, i, u in specs
    ]
