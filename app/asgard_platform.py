"""Три задания «Асгард» для каталога учителя (те же тексты и варианты, что в уроке на карте)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import Lesson, TaskTemplate

ASGARD_LESSON_TITLE = "Основы информатики — Асгард"


def _choice_config(options: list[tuple[str, str, bool]]) -> dict[str, Any]:
    choices = [{"id": cid, "text": text} for cid, text, _ in options]
    expected = next(cid for cid, _, ok in options if ok)
    return {"kind": "choice", "expected_choice_id": expected, "choices": choices}


# Совпадает с frontend/src/lib/asgardQuizSpec.js (DEFAULT_ASGARD_QUIZ_SPEC)
ASGARD_TEACHER_TASKS: list[dict[str, Any]] = [
    {
        "sort_order": 1,
        "title": "Задание 1: логическое выражение",
        "prompt": (
            "Дано выражение ¬A ∧ B ∨ C, где A=1, B=0, C=1. Каково значение выражения "
            "с приоритетом (¬, затем ∧, затем ∨)?"
        ),
        "checker_config": _choice_config(
            [
                ("asg1-true", "Истина (1)", True),
                ("asg1-false", "Ложь (0)", False),
                ("asg1-order", "Зависит от порядка вычислений", False),
            ]
        ),
    },
    {
        "sort_order": 2,
        "title": "Задание 2: законы де Моргана",
        "prompt": (
            "Известны законы де Моргана: ¬(A ∧ B) = ¬A ∨ ¬B и ¬(A ∨ B) = ¬A ∧ ¬B. "
            "Выберите выражение, которое логически эквивалентно выражению ¬(¬X ∨ Y)."
        ),
        "checker_config": _choice_config(
            [
                ("asg2-equiv", "X ∧ ¬Y", True),
                ("asg2-wrong1", "¬X ∨ ¬Y", False),
                ("asg2-wrong2", "X ∨ ¬Y", False),
            ]
        ),
    },
    {
        "sort_order": 3,
        "title": "Задание 3: кто разбил окно",
        "prompt": (
            "В школе разбили окно. Анна сказала: «Это сделал Борис». Борис сказал: "
            "«Это сделала Галина». Виктор сказал: «Я этого не делал». Галина сказала: "
            "«Борис лжёт, когда говорит, что это сделала я». Известно, что правду сказал "
            "ровно один ученик. Кто разбил окно?"
        ),
        "checker_config": _choice_config(
            [
                ("asg3-anna", "Анна", False),
                ("asg3-boris", "Борис", False),
                ("asg3-victor", "Виктор", True),
                ("asg3-galina", "Галина", False),
            ]
        ),
    },
]


def asgard_checker_json(row: dict[str, Any]) -> str:
    return json.dumps(row["checker_config"], ensure_ascii=False)


def asgard_teacher_task_specs() -> list[dict[str, Any]]:
    return ASGARD_TEACHER_TASKS


def sync_asgard_lesson_tasks(session: Session) -> None:
    """Поддерживает в БД ровно три назначаемых задания Асгарда (как в интерактивном уроке)."""
    known_titles = [t["title"] for t in ASGARD_TEACHER_TASKS]
    lesson = session.query(Lesson).filter(Lesson.title == ASGARD_LESSON_TITLE).first()
    if not lesson:
        return

    orphans = (
        session.query(TaskTemplate)
        .filter(
            TaskTemplate.lesson_id == lesson.id,
            TaskTemplate.assignable_by_teacher.is_(True),
            TaskTemplate.title.notin_(known_titles),
        )
        .all()
    )
    for o in orphans:
        session.delete(o)

    for spec in ASGARD_TEACHER_TASKS:
        cfg_json = json.dumps(spec["checker_config"], ensure_ascii=False)
        row = (
            session.query(TaskTemplate)
            .filter(TaskTemplate.lesson_id == lesson.id, TaskTemplate.title == spec["title"])
            .first()
        )
        if row is None:
            session.add(
                TaskTemplate(
                    lesson_id=lesson.id,
                    sort_order=spec["sort_order"],
                    title=spec["title"],
                    prompt_template=spec["prompt"],
                    param_spec_json="{}",
                    checker_type="numeric",
                    checker_config_json=cfg_json,
                    assignable_by_teacher=True,
                    counts_toward_lesson_practice=False,
                )
            )
        else:
            row.sort_order = spec["sort_order"]
            row.prompt_template = spec["prompt"]
            row.checker_config_json = cfg_json
            row.assignable_by_teacher = True
            row.counts_toward_lesson_practice = False
            row.checker_type = "numeric"
            row.param_spec_json = "{}"

    session.commit()
