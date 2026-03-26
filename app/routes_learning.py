from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.access import get_current_user, get_parent_token_user
from app.core import get_db, get_settings
from app.models import (
    CurrencyTransaction,
    Lesson,
    LessonProgress,
    LessonTheoryBlock,
    ParentViewAudit,
    TaskAttempt,
    TaskInstance,
    TaskTemplate,
    User,
    Wallet,
)
from app.schemas import PracticeSubmitBody
from app.services import (
    add_score,
    answers_match,
    compute_expected,
    parse_checker_config,
    parse_param_spec,
    published_lesson_ids,
    recompute_lesson_practice_done,
    render_prompt,
    sample_params,
)

settings = get_settings()
learning_router = APIRouter(tags=["learning"])


# --- lessons ---


class TheoryBlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sort_order: int
    body_markdown: str


class TaskTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lesson_id: int
    sort_order: int
    title: str | None
    prompt_template: str


class LessonListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    sort_order: int


class LessonDetail(BaseModel):
    id: int
    title: str
    sort_order: int
    theory: list[TheoryBlockOut]
    task_templates: list[TaskTemplateOut]


@learning_router.get("/lessons", response_model=list[LessonListItem])
def list_lessons(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[Lesson]:
    q = db.query(Lesson).filter(Lesson.is_published.is_(True)).order_by(Lesson.sort_order)
    if user.role == "child":
        return q.all()
    if user.role in ("teacher", "admin"):
        return db.query(Lesson).order_by(Lesson.sort_order).all()
    return []


@learning_router.get("/lessons/{lesson_id}", response_model=LessonDetail)
def get_lesson(
    lesson_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> LessonDetail:
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not lesson.is_published and user.role == "child":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    theory = (
        db.query(LessonTheoryBlock)
        .filter(LessonTheoryBlock.lesson_id == lesson_id)
        .order_by(LessonTheoryBlock.sort_order)
        .all()
    )
    tasks = (
        db.query(TaskTemplate)
        .filter(TaskTemplate.lesson_id == lesson_id)
        .order_by(TaskTemplate.sort_order)
        .all()
    )
    return LessonDetail(
        id=lesson.id,
        title=lesson.title,
        sort_order=lesson.sort_order,
        theory=[TheoryBlockOut.model_validate(b) for b in theory],
        task_templates=[
            TaskTemplateOut(
                id=t.id,
                lesson_id=t.lesson_id,
                sort_order=t.sort_order,
                title=t.title,
                prompt_template=t.prompt_template,
            )
            for t in tasks
        ],
    )


# --- progress ---


class ProgressRow(BaseModel):
    lesson_id: int
    lesson_title: str
    theory_done: bool
    practice_done: bool
    correct_attempts: int
    total_attempts: int


def _counts_for_lesson(db: Session, user_id: int, lesson_id: int) -> tuple[int, int]:
    total = (
        db.query(func.count(TaskAttempt.id))
        .join(TaskInstance, TaskAttempt.task_instance_id == TaskInstance.id)
        .join(TaskTemplate, TaskInstance.task_template_id == TaskTemplate.id)
        .filter(TaskAttempt.user_id == user_id, TaskTemplate.lesson_id == lesson_id)
        .scalar()
        or 0
    )
    corr = (
        db.query(func.count(TaskAttempt.id))
        .join(TaskInstance, TaskAttempt.task_instance_id == TaskInstance.id)
        .join(TaskTemplate, TaskInstance.task_template_id == TaskTemplate.id)
        .filter(
            TaskAttempt.user_id == user_id,
            TaskTemplate.lesson_id == lesson_id,
            TaskAttempt.is_correct.is_(True),
        )
        .scalar()
        or 0
    )
    return int(corr), int(total)


def _progress_for_user(db: Session, user: User) -> list[ProgressRow]:
    ids = published_lesson_ids(db)
    out: list[ProgressRow] = []
    for lid in ids:
        lesson = db.get(Lesson, lid)
        if not lesson:
            continue
        lp = db.get(LessonProgress, (user.id, lid))
        c, t = _counts_for_lesson(db, user.id, lid)
        out.append(
            ProgressRow(
                lesson_id=lid,
                lesson_title=lesson.title,
                theory_done=bool(lp.theory_done) if lp else False,
                practice_done=bool(lp.practice_done) if lp else False,
                correct_attempts=c,
                total_attempts=t,
            )
        )
    return out


@learning_router.get("/me/progress", response_model=list[ProgressRow])
def my_progress(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[ProgressRow]:
    return _progress_for_user(db, user)


@learning_router.get("/parent/progress", response_model=list[ProgressRow])
def parent_progress(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_parent_token_user)],
) -> list[ProgressRow]:
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    db.add(
        ParentViewAudit(
            user_id=user.id,
            viewed_at=ts,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    db.commit()
    return _progress_for_user(db, user)


@learning_router.post("/lessons/{lesson_id}/theory-complete", status_code=204)
def mark_theory_complete(
    lesson_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")
    lesson = db.get(Lesson, lesson_id)
    if not lesson or not lesson.is_published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    lp = db.get(LessonProgress, (user.id, lesson_id))
    if not lp:
        lp = LessonProgress(
            user_id=user.id,
            lesson_id=lesson_id,
            theory_done=True,
            practice_done=False,
            updated_at=ts,
        )
        db.add(lp)
    else:
        lp.theory_done = True
        lp.updated_at = ts
    db.commit()
    return None


# --- practice ---


class StartPracticeResponse(BaseModel):
    instance_id: int
    prompt: str
    created_at: str


class SubmitPracticeResponse(BaseModel):
    correct: bool
    expected_answer: str | None = None
    currency_awarded: int
    score_awarded: int


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@learning_router.post("/practice/start/{template_id}", response_model=StartPracticeResponse)
def start_practice(
    template_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> StartPracticeResponse:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")

    tmpl = db.get(TaskTemplate, template_id)
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    spec = parse_param_spec(tmpl.param_spec_json)
    params = sample_params(spec)
    checker_cfg = parse_checker_config(tmpl.checker_config_json)
    expected = compute_expected(params, tmpl.checker_type, checker_cfg)
    prompt = render_prompt(tmpl.prompt_template, params)

    inst = TaskInstance(
        user_id=user.id,
        task_template_id=tmpl.id,
        params_json=json.dumps(params, ensure_ascii=False),
        expected_answer=expected,
        created_at=_now_iso(),
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return StartPracticeResponse(instance_id=inst.id, prompt=prompt, created_at=inst.created_at)


@learning_router.post("/practice/submit/{instance_id}", response_model=SubmitPracticeResponse)
def submit_practice(
    instance_id: int,
    body: PracticeSubmitBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SubmitPracticeResponse:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")

    inst = db.get(TaskInstance, instance_id)
    if not inst or inst.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instance not found")

    tmpl = db.get(TaskTemplate, inst.task_template_id)
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Broken instance")

    cfg = parse_checker_config(tmpl.checker_config_json)
    tolerance = float(cfg.get("tolerance", 0))
    correct = answers_match(inst.expected_answer, body.answer, tolerance)

    start = datetime.fromisoformat(inst.created_at)
    end = datetime.now(timezone.utc).replace(microsecond=0)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    duration_ms = int((end - start).total_seconds() * 1000)

    currency_awarded = 0
    score_awarded = 0
    if correct:
        currency_awarded = settings.base_currency_reward
        score_awarded = 10
        if duration_ms <= settings.speed_bonus_ms:
            currency_awarded += settings.speed_bonus_amount
            score_awarded += 5

    attempt = TaskAttempt(
        task_instance_id=inst.id,
        user_id=user.id,
        answer_submitted=body.answer.strip(),
        is_correct=correct,
        started_at=body.started_at,
        submitted_at=_now_iso(),
        duration_ms=duration_ms,
        currency_awarded=currency_awarded,
    )
    db.add(attempt)
    db.flush()

    if correct:
        wallet = db.get(Wallet, user.id)
        if wallet:
            wallet.balance += currency_awarded
            db.add(
                CurrencyTransaction(
                    user_id=user.id,
                    delta=currency_awarded,
                    reason="task_correct",
                    ref_type="task_attempt",
                    ref_id=attempt.id,
                    created_at=_now_iso(),
                )
            )
        add_score(db, user.id, score_awarded)

        lp = db.get(LessonProgress, (user.id, tmpl.lesson_id))
        if not lp:
            lp = LessonProgress(
                user_id=user.id,
                lesson_id=tmpl.lesson_id,
                theory_done=False,
                practice_done=False,
                updated_at=_now_iso(),
            )
            db.add(lp)
            db.flush()
        if recompute_lesson_practice_done(db, user.id, tmpl.lesson_id):
            lp2 = db.get(LessonProgress, (user.id, tmpl.lesson_id))
            if lp2:
                lp2.practice_done = True
                lp2.updated_at = _now_iso()

    db.commit()

    return SubmitPracticeResponse(
        correct=correct,
        expected_answer=inst.expected_answer if not correct else None,
        currency_awarded=currency_awarded,
        score_awarded=score_awarded,
    )
