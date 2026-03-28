"""Лёгкие миграции SQLite без Alembic (добавление колонок к существующим БД)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.invites import new_invite_code
from app.models import ClassInvite, Lesson, LessonTheoryBlock, TaskTemplate


def apply_sqlite_migrations(engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(class_invites)")).fetchall()
        col_names = {r[1] for r in rows}
        if "invite_code" not in col_names:
            conn.execute(text("ALTER TABLE class_invites ADD COLUMN invite_code VARCHAR(16)"))
            conn.commit()

        rows = conn.execute(text("PRAGMA table_info(lesson_progress)")).fetchall()
        lp_cols = {r[1] for r in rows}
        if "lesson_xp_claimed" not in lp_cols:
            conn.execute(
                text("ALTER TABLE lesson_progress ADD COLUMN lesson_xp_claimed BOOLEAN NOT NULL DEFAULT 0")
            )
            conn.commit()
        if "practice_pool_coins" not in lp_cols:
            conn.execute(
                text("ALTER TABLE lesson_progress ADD COLUMN practice_pool_coins INTEGER NOT NULL DEFAULT 0")
            )
            conn.commit()
        if "practice_pool_xp" not in lp_cols:
            conn.execute(
                text("ALTER TABLE lesson_progress ADD COLUMN practice_pool_xp INTEGER NOT NULL DEFAULT 0")
            )
            conn.commit()

        rows = conn.execute(text("PRAGMA table_info(class_task_assignments)")).fetchall()
        acols = {r[1] for r in rows}
        if "reward_coins" not in acols:
            conn.execute(
                text(
                    "ALTER TABLE class_task_assignments ADD COLUMN reward_coins INTEGER NOT NULL DEFAULT 0"
                )
            )
            conn.commit()
        if "reward_xp" not in acols:
            conn.execute(
                text("ALTER TABLE class_task_assignments ADD COLUMN reward_xp INTEGER NOT NULL DEFAULT 0")
            )
            conn.commit()
        if "block_id" not in acols:
            conn.execute(text("ALTER TABLE class_task_assignments ADD COLUMN block_id INTEGER"))
            conn.commit()

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS assignment_blocks (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    class_id INTEGER NOT NULL,
                    teacher_id INTEGER NOT NULL,
                    note TEXT,
                    created_at VARCHAR(32) NOT NULL,
                    reward_coins INTEGER NOT NULL DEFAULT 0,
                    reward_xp INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(class_id) REFERENCES classes (id) ON DELETE CASCADE,
                    FOREIGN KEY(teacher_id) REFERENCES users (id) ON DELETE CASCADE
                )
                """
            )
        )
        conn.commit()
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS teacher_block_reward_claims (
                    user_id INTEGER NOT NULL,
                    block_id INTEGER NOT NULL,
                    claimed_at VARCHAR(32) NOT NULL,
                    PRIMARY KEY (user_id, block_id),
                    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
                    FOREIGN KEY(block_id) REFERENCES assignment_blocks (id) ON DELETE CASCADE
                )
                """
            )
        )
        conn.commit()

        rows = conn.execute(text("PRAGMA table_info(task_instances)")).fetchall()
        tcols = {r[1] for r in rows}
        if "assignment_id" not in tcols:
            conn.execute(text("ALTER TABLE task_instances ADD COLUMN assignment_id INTEGER"))
            conn.commit()
        if "teacher_assignment_paid" not in tcols:
            conn.execute(
                text(
                    "ALTER TABLE task_instances ADD COLUMN teacher_assignment_paid BOOLEAN NOT NULL DEFAULT 0"
                )
            )
            conn.commit()

        rows = conn.execute(text("PRAGMA table_info(task_templates)")).fetchall()
        tt_cols = {r[1] for r in rows}
        if "assignable_by_teacher" not in tt_cols:
            conn.execute(
                text(
                    "ALTER TABLE task_templates ADD COLUMN assignable_by_teacher BOOLEAN NOT NULL DEFAULT 0"
                )
            )
            conn.commit()

        rows = conn.execute(text("PRAGMA table_info(task_templates)")).fetchall()
        tt_cols2 = {r[1] for r in rows}
        if "counts_toward_lesson_practice" not in tt_cols2:
            conn.execute(
                text(
                    "ALTER TABLE task_templates ADD COLUMN counts_toward_lesson_practice "
                    "BOOLEAN NOT NULL DEFAULT 1"
                )
            )
            conn.commit()

        claims_tbl = conn.execute(
            text(
                "SELECT 1 FROM sqlite_master WHERE type='table' "
                "AND name='teacher_assignment_reward_claims'"
            )
        ).fetchone()
        if claims_tbl:
            conn.execute(
                text(
                    """
                    DELETE FROM teacher_assignment_reward_claims
                    WHERE assignment_id NOT IN (SELECT id FROM class_task_assignments)
                    """
                )
            )
            conn.commit()

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS teacher_assignment_reward_claims (
                    user_id INTEGER NOT NULL,
                    assignment_id INTEGER NOT NULL,
                    claimed_at VARCHAR(32) NOT NULL,
                    PRIMARY KEY (user_id, assignment_id),
                    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
                    FOREIGN KEY(assignment_id) REFERENCES class_task_assignments (id) ON DELETE CASCADE
                )
                """
            )
        )
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


def ensure_catalog_blocks_2_3_teacher_assignable(session: Session) -> None:
    """Уроки с sort_order 2 и 3 (блоки карты «Йотунхейм» и «Ванахейм»): в каталоге и доступны учителю для ДЗ."""
    title_upgrade = {
        "Урок 1. Сложение": "Йотунхейм — встреча с драконом",
        "Урок 2. Вычитание": "Ванахейм — знакомство с землёй",
    }
    for lesson in session.query(Lesson).filter(Lesson.sort_order.in_((2, 3))).all():
        new_title = title_upgrade.get(lesson.title)
        if new_title:
            lesson.title = new_title
        lesson.is_published = True
        session.query(TaskTemplate).filter(TaskTemplate.lesson_id == lesson.id).update(
            {TaskTemplate.assignable_by_teacher: True},
            synchronize_session=False,
        )
    session.commit()


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ensure_teacher_assignable_platform(session: Session) -> None:
    """Один раз: снять с публикации демо-уроки и добавить единственное задание, доступное для назначения."""
    has_assignable = (
        session.query(TaskTemplate)
        .filter(TaskTemplate.assignable_by_teacher.is_(True))
        .first()
    )
    if has_assignable is not None:
        return

    for title in ("Урок 1. Сложение", "Урок 2. Вычитание"):
        row = session.query(Lesson).filter(Lesson.title == title).first()
        if row:
            row.is_published = False

    asgard_title = "Основы информатики — Асгард"
    lesson = session.query(Lesson).filter(Lesson.title == asgard_title).first()
    ts = _now_iso()
    if not lesson:
        lesson = Lesson(title=asgard_title, sort_order=1, is_published=True, created_at=ts)
        session.add(lesson)
        session.flush()
        session.add(
            LessonTheoryBlock(
                lesson_id=lesson.id,
                sort_order=1,
                body_markdown=(
                    "Этот урок на карте доступен с полной катсценой по пути **«Асгард»**. "
                    "Здесь — то же **задание 1** в формате для проверки ответа (без катсцены)."
                ),
            )
        )
    prompt = (
        "Дано выражение ¬A ∧ B ∨ C, где A=1, B=0, C=1. Каково значение выражения "
        "с приоритетом (¬, затем ∧, затем ∨)?\n\n"
        "Введите ответ одной цифрой: **1** — истина, **0** — ложь."
    )
    existing_task = (
        session.query(TaskTemplate)
        .filter(
            TaskTemplate.lesson_id == lesson.id,
            TaskTemplate.assignable_by_teacher.is_(True),
        )
        .first()
    )
    if not existing_task:
        session.add(
            TaskTemplate(
                lesson_id=lesson.id,
                sort_order=1,
                title="Задание 1: логическое выражение",
                prompt_template=prompt,
                param_spec_json="{}",
                checker_type="numeric",
                checker_config_json='{"kind":"literal","expected":"1"}',
                assignable_by_teacher=True,
                counts_toward_lesson_practice=False,
            )
        )
    session.commit()
