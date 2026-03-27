from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.access import get_current_user, get_parent_token_user
from app.core import get_db, get_settings
from app.models import (
    ClassInvite,
    ClassMember,
    ClassTaskAssignment,
    CourseClass,
    CurrencyTransaction,
    Lesson,
    LessonProgress,
    LessonTheoryBlock,
    ParentViewAudit,
    TaskAttempt,
    TaskInstance,
    TaskTemplate,
    User,
    UserStat,
    Wallet,
)
from app.invites import find_class_invite
from app.schemas import JoinClassBody, PracticeSubmitBody
from app.services import (
    add_score,
    answers_match,
    compute_expected,
    grant_lesson_completion_xp_if_eligible,
    parse_checker_config,
    parse_param_spec,
    published_lesson_ids,
    recompute_lesson_practice_done,
    render_prompt,
    sample_params,
    wrong_attempts_for_lesson,
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
    # Учитель назначает только то, что видно на платформе (опубликованные уроки).
    q = db.query(Lesson).filter(Lesson.is_published.is_(True)).order_by(Lesson.sort_order)
    if user.role in ("child", "teacher", "admin"):
        return q.all()
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
    if not lesson.is_published:
        if user.role == "child":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        if user.role == "teacher":
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
    wrong_attempts: int = Field(description="Неверные попытки по практике урока")


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
        wrong = max(0, t - c)
        practice_ok = recompute_lesson_practice_done(
            db, user.id, lid, max_wrong=settings.practice_max_wrong_per_lesson
        )
        out.append(
            ProgressRow(
                lesson_id=lid,
                lesson_title=lesson.title,
                theory_done=bool(lp.theory_done) if lp else False,
                practice_done=practice_ok,
                correct_attempts=c,
                total_attempts=t,
                wrong_attempts=wrong,
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


# --- класс учителя: вступление по приглашению, задания ---


class JoinClassResponse(BaseModel):
    class_id: int
    class_name: str
    already_member: bool = False


class InvitePreviewOut(BaseModel):
    class_name: str
    teacher_name: str | None = None
    already_member: bool


class MyClassRow(BaseModel):
    class_id: int
    class_name: str


class MyAssignmentRow(BaseModel):
    assignment_id: int
    class_id: int
    class_name: str
    task_template_id: int
    lesson_id: int
    lesson_title: str
    task_title: str | None
    note: str | None
    assigned_at: str


@learning_router.get("/classes/invite-preview", response_model=InvitePreviewOut)
def preview_class_invite(
    code: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvitePreviewOut:
    if user.role != "child":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Проверка кода доступна только ученикам",
        )
    raw = code.strip()
    if len(raw) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Введите код полностью (не короче 6 символов)",
        )
    inv = find_class_invite(db, raw)
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Класс не найден. Проверьте код или попросите учителя обновить приглашение.",
        )
    c = db.get(CourseClass, inv.class_id)
    if not c:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Класс больше не существует",
        )
    teacher = db.get(User, c.teacher_id)
    teacher_name = teacher.display_name if teacher else None
    already = db.get(ClassMember, (c.id, user.id)) is not None
    return InvitePreviewOut(
        class_name=c.name,
        teacher_name=teacher_name,
        already_member=already,
    )


@learning_router.get("/classes/me", response_model=list[MyClassRow])
def list_my_classes(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[MyClassRow]:
    if user.role != "child":
        return []
    members = db.query(ClassMember).filter(ClassMember.user_id == user.id).all()
    out: list[MyClassRow] = []
    for m in members:
        c = db.get(CourseClass, m.class_id)
        if c:
            out.append(MyClassRow(class_id=c.id, class_name=c.name))
    return out


@learning_router.post("/classes/join", response_model=JoinClassResponse)
def join_class_by_invite(
    body: JoinClassBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> JoinClassResponse:
    if user.role != "child":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="В класс могут вступать только ученики",
        )
    inv = find_class_invite(db, body.invite_token)
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Код не найден. Проверьте написание или попросите новый код у учителя.",
        )
    c = db.get(CourseClass, inv.class_id)
    if not c:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Класс больше не существует",
        )
    if db.get(ClassMember, (c.id, user.id)):
        return JoinClassResponse(class_id=c.id, class_name=c.name, already_member=True)
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    db.add(ClassMember(class_id=c.id, user_id=user.id, joined_at=ts))
    db.commit()
    return JoinClassResponse(class_id=c.id, class_name=c.name, already_member=False)


@learning_router.get("/me/assignments", response_model=list[MyAssignmentRow])
def my_teacher_assignments(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[MyAssignmentRow]:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")
    member_rows = db.query(ClassMember).filter(ClassMember.user_id == user.id).all()
    if not member_rows:
        return []
    class_ids = [m.class_id for m in member_rows]
    assigns = (
        db.query(ClassTaskAssignment)
        .filter(ClassTaskAssignment.class_id.in_(class_ids))
        .order_by(ClassTaskAssignment.id.desc())
        .all()
    )
    out: list[MyAssignmentRow] = []
    for a in assigns:
        c = db.get(CourseClass, a.class_id)
        tmpl = db.get(TaskTemplate, a.task_template_id)
        lesson = db.get(Lesson, tmpl.lesson_id) if tmpl else None
        if not c or not tmpl or not lesson:
            continue
        out.append(
            MyAssignmentRow(
                assignment_id=a.id,
                class_id=c.id,
                class_name=c.name,
                task_template_id=tmpl.id,
                lesson_id=lesson.id,
                lesson_title=lesson.title,
                task_title=tmpl.title,
                note=a.note,
                assigned_at=a.created_at,
            )
        )
    return out


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
    db.flush()
    grant_lesson_completion_xp_if_eligible(
        db,
        user.id,
        lesson_id,
        settings.lesson_completion_xp,
        max_wrong=settings.practice_max_wrong_per_lesson,
    )
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
    coins_awarded: int = Field(
        description="Изменение коинов: начисление за верный ответ или списание за ошибку (отрицательное)",
    )
    xp_awarded: int = Field(
        description="Изменение XP: награда за задачу, штраф за ошибку (отрицательное) или бонус за урок",
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _utc_day_bounds_iso() -> tuple[str, str]:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = now.replace(hour=0, minute=0, second=0)
    end = start + timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _count_correct_attempts_today_utc(db: Session, user_id: int) -> int:
    start_iso, end_iso = _utc_day_bounds_iso()
    n = (
        db.query(func.count(TaskAttempt.id))
        .filter(
            TaskAttempt.user_id == user_id,
            TaskAttempt.is_correct.is_(True),
            TaskAttempt.submitted_at >= start_iso,
            TaskAttempt.submitted_at < end_iso,
        )
        .scalar()
    )
    return int(n or 0)


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

    if not correct and wrong_attempts_for_lesson(db, user.id, tmpl.lesson_id) >= settings.practice_max_wrong_per_lesson:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Превышен лимит ошибок по этому уроку. "
                f"Разрешено не более {settings.practice_max_wrong_per_lesson} неверных ответов по практике."
            ),
        )

    start = datetime.fromisoformat(inst.created_at)
    end = datetime.now(timezone.utc).replace(microsecond=0)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    duration_ms = int((end - start).total_seconds() * 1000)

    coins_awarded = 0
    xp_from_task = 0
    currency_on_attempt = 0
    if correct:
        prior_today = _count_correct_attempts_today_utc(db, user.id)
        coins_awarded = (
            settings.daily_first_correct_coins + settings.daily_each_next_extra_coins * prior_today
        )
        xp_from_task = 10
        if duration_ms <= settings.speed_bonus_ms:
            coins_awarded += settings.speed_bonus_amount
            xp_from_task += 5
        currency_on_attempt = coins_awarded

    attempt = TaskAttempt(
        task_instance_id=inst.id,
        user_id=user.id,
        answer_submitted=body.answer.strip(),
        is_correct=correct,
        started_at=body.started_at,
        submitted_at=_now_iso(),
        duration_ms=duration_ms,
        currency_awarded=currency_on_attempt,
    )
    db.add(attempt)
    db.flush()

    if correct:
        wallet = db.get(Wallet, user.id)
        if wallet:
            wallet.balance += coins_awarded
            db.add(
                CurrencyTransaction(
                    user_id=user.id,
                    delta=coins_awarded,
                    reason="task_correct",
                    ref_type="task_attempt",
                    ref_id=attempt.id,
                    created_at=_now_iso(),
                )
            )
        add_score(db, user.id, xp_from_task)

        lp_gain = db.get(LessonProgress, (user.id, tmpl.lesson_id))
        if not lp_gain:
            lp_gain = LessonProgress(
                user_id=user.id,
                lesson_id=tmpl.lesson_id,
                theory_done=False,
                practice_done=False,
                updated_at=_now_iso(),
            )
            db.add(lp_gain)
            db.flush()
        lp_gain.practice_pool_coins += coins_awarded
        lp_gain.practice_pool_xp += xp_from_task
        lp_gain.updated_at = _now_iso()

    elif not correct and (settings.practice_wrong_coin_penalty > 0 or settings.practice_wrong_xp_penalty > 0):
        lp_pen = db.get(LessonProgress, (user.id, tmpl.lesson_id))
        if lp_pen:
            coins_taken = 0
            if settings.practice_wrong_coin_penalty > 0 and lp_pen.practice_pool_coins > 0:
                intended = min(settings.practice_wrong_coin_penalty, lp_pen.practice_pool_coins)
                wallet = db.get(Wallet, user.id)
                if wallet:
                    coins_taken = min(intended, wallet.balance)
                    if coins_taken:
                        wallet.balance -= coins_taken
                        lp_pen.practice_pool_coins -= coins_taken
                        db.add(
                            CurrencyTransaction(
                                user_id=user.id,
                                delta=-coins_taken,
                                reason="task_wrong",
                                ref_type="task_attempt",
                                ref_id=attempt.id,
                                created_at=_now_iso(),
                            )
                        )
            coins_awarded = -coins_taken
            currency_on_attempt = -coins_taken
            attempt.currency_awarded = currency_on_attempt

            if settings.practice_wrong_xp_penalty > 0 and lp_pen.practice_pool_xp > 0:
                take_xp = min(settings.practice_wrong_xp_penalty, lp_pen.practice_pool_xp)
                st0 = db.get(UserStat, user.id)
                tot0 = st0.score_total if st0 else 0
                add_score(db, user.id, -take_xp)
                st1 = db.get(UserStat, user.id)
                tot1 = st1.score_total if st1 else 0
                actual_xp = tot0 - tot1
                lp_pen.practice_pool_xp -= actual_xp
                xp_from_task = -actual_xp

            lp_pen.updated_at = _now_iso()

    lp = db.get(LessonProgress, (user.id, tmpl.lesson_id))
    if lp:
        done = recompute_lesson_practice_done(
            db, user.id, tmpl.lesson_id, max_wrong=settings.practice_max_wrong_per_lesson
        )
        lp.practice_done = done
        lp.updated_at = _now_iso()

    db.flush()
    xp_from_lesson = grant_lesson_completion_xp_if_eligible(
        db,
        user.id,
        tmpl.lesson_id,
        settings.lesson_completion_xp,
        max_wrong=settings.practice_max_wrong_per_lesson,
    )
    xp_awarded = xp_from_task + xp_from_lesson

    db.commit()

    return SubmitPracticeResponse(
        correct=correct,
        expected_answer=inst.expected_answer if not correct else None,
        coins_awarded=coins_awarded,
        xp_awarded=xp_awarded,
    )
