from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.access import get_current_user, get_parent_token_user
from app.core import get_db, get_settings
from app.models import (
    AssignmentBlock,
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
    TeacherAssignmentRewardClaim,
    TeacherBlockRewardClaim,
    User,
    UserStat,
    Wallet,
)
from app.invites import find_class_invite
from app.schemas import JoinClassBody, PracticeSubmitBody
from app.services import (
    add_score,
    answers_match,
    assignment_attempt_counts,
    block_all_other_tasks_solved_correctly,
    block_assignment_ids_ordered,
    block_every_task_has_correct_attempt,
    block_grade_ceil_mean,
    compute_expected,
    grade_for_assignment,
    ensure_user_economy_rows,
    grade_2_to_5_from_wrong_attempts,
    grant_lesson_completion_xp_if_eligible,
    parse_checker_config,
    parse_param_spec,
    published_lesson_ids,
    recompute_lesson_practice_done,
    render_prompt,
    sample_params,
    task_payload_dragdrop_for_client,
    task_payload_terminal_for_client,
    verify_dragdrop_mapping,
    verify_terminal_io_outputs,
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
    q = db.query(Lesson).filter(Lesson.is_published.is_(True)).order_by(Lesson.sort_order)
    if user.role == "teacher":
        q = (
            q.join(TaskTemplate, TaskTemplate.lesson_id == Lesson.id)
            .filter(TaskTemplate.assignable_by_teacher.is_(True))
            .distinct()
        )
        return q.all()
    if user.role in ("child", "admin"):
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
    task_q = db.query(TaskTemplate).filter(TaskTemplate.lesson_id == lesson_id)
    if user.role == "teacher":
        task_q = task_q.filter(TaskTemplate.assignable_by_teacher.is_(True))
    tasks = task_q.order_by(TaskTemplate.sort_order).all()
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


class MyAssignmentTaskInBlock(BaseModel):
    assignment_id: int
    task_template_id: int
    lesson_id: int
    lesson_title: str
    task_title: str | None


class MyAssignmentRow(BaseModel):
    kind: Literal["single", "block"] = "single"
    block_id: int | None = None
    assignment_id: int
    class_id: int
    class_name: str
    task_template_id: int | None = None
    lesson_id: int | None = None
    lesson_title: str | None = None
    task_title: str | None = None
    note: str | None
    assigned_at: str
    reward_coins: int
    reward_xp: int
    bonus_claimed: bool = Field(description="Бонус учителя за назначение или за весь блок уже получен")
    tasks: list[MyAssignmentTaskInBlock] | None = None


class AssignmentJournalRow(BaseModel):
    """Журнал назначений учителя: что выдано и что сделано учеником."""

    assignment_id: int
    class_name: str
    lesson_title: str
    task_title: str | None
    note: str | None
    assigned_at: str
    block_id: int | None = None
    position_in_block: int | None = Field(
        default=None,
        description="Номер задания в блоке (1…N), если это блок",
    )
    block_tasks_total: int | None = None
    status: Literal["not_started", "in_progress", "done"]
    grade_2_5: int | None = None
    block_grade_2_5: int | None = Field(
        default=None,
        description="Оценка за весь блок, когда все задачи блока сданы верно",
    )
    total_attempts: int
    wrong_attempts: int
    correct_attempts: int
    bonus_claimed: bool


@learning_router.get("/me/assignments/journal", response_model=list[AssignmentJournalRow])
def my_assignments_journal(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[AssignmentJournalRow]:
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
    aid_list = [a.id for a in assigns]
    claimed_ids: set[int] = set()
    if aid_list:
        claimed_ids = {
            row.assignment_id
            for row in db.query(TeacherAssignmentRewardClaim)
            .filter(
                TeacherAssignmentRewardClaim.user_id == user.id,
                TeacherAssignmentRewardClaim.assignment_id.in_(aid_list),
            )
            .all()
        }
    block_ids_u = {a.block_id for a in assigns if a.block_id is not None}
    block_claimed: set[int] = set()
    if block_ids_u:
        block_claimed = {
            row.block_id
            for row in db.query(TeacherBlockRewardClaim)
            .filter(
                TeacherBlockRewardClaim.user_id == user.id,
                TeacherBlockRewardClaim.block_id.in_(block_ids_u),
            )
            .all()
        }

    block_grade: dict[int, int | None] = {}
    for bid in block_ids_u:
        if block_every_task_has_correct_attempt(db, user.id, bid):
            block_grade[bid] = block_grade_ceil_mean(db, user.id, bid)
        else:
            block_grade[bid] = None

    out: list[AssignmentJournalRow] = []
    for a in assigns:
        c = db.get(CourseClass, a.class_id)
        tmpl = db.get(TaskTemplate, a.task_template_id)
        lesson = db.get(Lesson, tmpl.lesson_id) if tmpl else None
        if not c or not tmpl or not lesson:
            continue
        total, wrong, correct = assignment_attempt_counts(db, user.id, a.id)
        if total == 0:
            st: Literal["not_started", "in_progress", "done"] = "not_started"
        elif correct > 0:
            st = "done"
        else:
            st = "in_progress"
        g25: int | None = (
            grade_for_assignment(db, user.id, a.id) if total > 0 else None
        )
        bid = a.block_id
        pos: int | None = None
        btot: int | None = None
        bg: int | None = None
        if bid is not None:
            aids = block_assignment_ids_ordered(db, bid)
            btot = len(aids)
            try:
                pos = aids.index(a.id) + 1
            except ValueError:
                pos = None
            bg = block_grade.get(bid)
            bonus = bid in block_claimed
        else:
            bonus = a.id in claimed_ids

        out.append(
            AssignmentJournalRow(
                assignment_id=a.id,
                class_name=c.name,
                lesson_title=lesson.title,
                task_title=tmpl.title,
                note=a.note,
                assigned_at=a.created_at,
                block_id=bid,
                position_in_block=pos,
                block_tasks_total=btot,
                status=st,
                grade_2_5=g25,
                block_grade_2_5=bg,
                total_attempts=total,
                wrong_attempts=wrong,
                correct_attempts=correct,
                bonus_claimed=bonus,
            )
        )
    return out


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
    aid_list = [a.id for a in assigns]
    claimed_ids: set[int] = set()
    if aid_list:
        claimed_ids = {
            row.assignment_id
            for row in db.query(TeacherAssignmentRewardClaim)
            .filter(
                TeacherAssignmentRewardClaim.user_id == user.id,
                TeacherAssignmentRewardClaim.assignment_id.in_(aid_list),
            )
            .all()
        }
    block_ids = {a.block_id for a in assigns if a.block_id is not None}
    block_claimed: set[int] = set()
    if block_ids:
        block_claimed = {
            row.block_id
            for row in db.query(TeacherBlockRewardClaim)
            .filter(
                TeacherBlockRewardClaim.user_id == user.id,
                TeacherBlockRewardClaim.block_id.in_(block_ids),
            )
            .all()
        }

    seen_blocks: set[int] = set()
    out: list[MyAssignmentRow] = []
    for a in assigns:
        c = db.get(CourseClass, a.class_id)
        tmpl = db.get(TaskTemplate, a.task_template_id)
        lesson = db.get(Lesson, tmpl.lesson_id) if tmpl else None
        if not c or not tmpl or not lesson:
            continue

        if a.block_id is None:
            out.append(
                MyAssignmentRow(
                    kind="single",
                    block_id=None,
                    assignment_id=a.id,
                    class_id=c.id,
                    class_name=c.name,
                    task_template_id=tmpl.id,
                    lesson_id=lesson.id,
                    lesson_title=lesson.title,
                    task_title=tmpl.title,
                    note=a.note,
                    assigned_at=a.created_at,
                    reward_coins=a.reward_coins,
                    reward_xp=a.reward_xp,
                    bonus_claimed=a.id in claimed_ids,
                    tasks=None,
                )
            )
            continue

        if a.block_id in seen_blocks:
            continue
        seen_blocks.add(a.block_id)
        blk = db.get(AssignmentBlock, a.block_id)
        if not blk:
            continue
        members = (
            db.query(ClassTaskAssignment)
            .filter(ClassTaskAssignment.block_id == a.block_id)
            .order_by(ClassTaskAssignment.id.asc())
            .all()
        )
        task_items: list[MyAssignmentTaskInBlock] = []
        for m in members:
            mt = db.get(TaskTemplate, m.task_template_id)
            ml = db.get(Lesson, mt.lesson_id) if mt else None
            if not mt or not ml:
                continue
            task_items.append(
                MyAssignmentTaskInBlock(
                    assignment_id=m.id,
                    task_template_id=mt.id,
                    lesson_id=ml.id,
                    lesson_title=ml.title,
                    task_title=mt.title,
                )
            )
        if not task_items:
            continue
        first = members[0]
        ft = db.get(TaskTemplate, first.task_template_id)
        fl = db.get(Lesson, ft.lesson_id) if ft else None
        out.append(
            MyAssignmentRow(
                kind="block",
                block_id=blk.id,
                assignment_id=first.id,
                class_id=c.id,
                class_name=c.name,
                task_template_id=ft.id if ft else None,
                lesson_id=fl.id if fl else None,
                lesson_title=fl.title if fl else None,
                task_title=ft.title if ft else None,
                note=blk.note,
                assigned_at=blk.created_at,
                reward_coins=blk.reward_coins,
                reward_xp=blk.reward_xp,
                bonus_claimed=blk.id in block_claimed,
                tasks=task_items,
            )
        )
    return out


class TheoryCompleteOut(BaseModel):
    xp_awarded: int = Field(
        description="Начислено XP за завершение урока (теория+практика, один раз)",
    )
    coins_awarded: int = Field(
        description="Начислено коинов за завершение урока (аналогично)",
    )


@learning_router.post("/lessons/{lesson_id}/theory-complete", response_model=TheoryCompleteOut)
def mark_theory_complete(
    lesson_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TheoryCompleteOut:
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
    xp_granted, coins_granted = grant_lesson_completion_xp_if_eligible(
        db,
        user.id,
        lesson_id,
        settings.lesson_completion_xp,
        coin_amount=settings.lesson_completion_coins,
        max_wrong=settings.practice_max_wrong_per_lesson,
    )
    db.commit()
    return TheoryCompleteOut(xp_awarded=xp_granted, coins_awarded=coins_granted)


# --- practice ---

ASSIGNMENT_REPEAT_NOTICE = (
    "Вы уже проходили это задание. При повторном прохождении Монеты и XP начисляться не будут."
)


class PracticeChoiceOut(BaseModel):
    choice_id: str
    text: str


class StartPracticeResponse(BaseModel):
    instance_id: int
    prompt: str
    created_at: str
    repeat_without_rewards: bool = False
    notice: str | None = None
    ui_mode: str | None = Field(
        default=None,
        description=(
            "asgard_mc — варианты; terminal_io — Python stdin/stdout; dragdrop — перетаскивание; "
            "иначе текстовый ответ"
        ),
    )
    choices: list[PracticeChoiceOut] | None = None
    task_payload: dict | None = Field(
        default=None,
        description="Данные для UI (без секретов эталона для terminal_io)",
    )


class SubmitPracticeResponse(BaseModel):
    correct: bool
    expected_answer: str | None = None
    coins_awarded: int = Field(
        description="Изменение коинов: начисление за верный ответ или списание за ошибку (отрицательное)",
    )
    xp_awarded: int = Field(
        description="Изменение XP: награда за задачу, штраф за ошибку (отрицательное) или бонус за урок",
    )
    notice: str | None = None
    grade_2_5: int | None = Field(
        default=None,
        description="Для задания от учителя: оценка 2–5 (5 без ошибок, −1 за каждую ошибку, минимум 2)",
    )
    block_grade_2_5: int | None = Field(
        default=None,
        description="Для блока от учителя: среднее оценок по заданиям блока, округлённое вверх (когда блок завершён)",
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
    assignment_id: Annotated[int | None, Query(description="ID назначения от учителя (/me/assignments)")] = None,
) -> StartPracticeResponse:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")

    tmpl = db.get(TaskTemplate, template_id)
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    if tmpl.assignable_by_teacher and assignment_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Это задание с платформы доступно только по назначению учителя. "
                "Откройте его в разделе «Задания от учителя»."
            ),
        )

    link_assignment_id: int | None = None
    if assignment_id is not None:
        asn = db.get(ClassTaskAssignment, assignment_id)
        if not asn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
        if asn.task_template_id != template_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Назначение не относится к этому шаблону задачи",
            )
        if db.get(ClassMember, (asn.class_id, user.id)) is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Вы не состоите в классе этого назначения",
            )
        link_assignment_id = asn.id

    checker_cfg = parse_checker_config(tmpl.checker_config_json)
    ui_kind = checker_cfg.get("kind")
    task_payload: dict | None = None

    if ui_kind == "terminal_io":
        params = {}
        expected = "__TERMINAL_IO__"
        prompt = (tmpl.prompt_template or "").strip() or str(checker_cfg.get("story") or "Решите задачу.")
        choices_response: list[PracticeChoiceOut] | None = None
        ui_mode = "terminal_io"
        task_payload = task_payload_terminal_for_client(checker_cfg)
    elif ui_kind == "dragdrop":
        params = {}
        sol = checker_cfg.get("solution") if isinstance(checker_cfg.get("solution"), dict) else {}
        expected = json.dumps(sol, ensure_ascii=False, sort_keys=True)
        prompt = (tmpl.prompt_template or "").strip() or str(checker_cfg.get("instruction") or "Задание")
        choices_response = None
        ui_mode = "dragdrop"
        task_payload = task_payload_dragdrop_for_client(checker_cfg)
    else:
        spec = parse_param_spec(tmpl.param_spec_json)
        params = sample_params(spec)
        expected = compute_expected(params, tmpl.checker_type, checker_cfg)
        prompt = render_prompt(tmpl.prompt_template, params)

        choices_response = None
        ui_mode = None
        if checker_cfg.get("kind") == "choice":
            raw_choices = checker_cfg.get("choices")
            if not isinstance(raw_choices, list) or len(raw_choices) < 2:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Некорректная конфигурация задания",
                )
            built: list[PracticeChoiceOut] = []
            seen_ids: list[str] = []
            for c in raw_choices:
                if not isinstance(c, dict):
                    continue
                cid = str(c.get("id", "")).strip()
                txt = str(c.get("text", "")).strip()
                if not cid or not txt:
                    continue
                built.append(PracticeChoiceOut(choice_id=cid, text=txt))
                seen_ids.append(cid)
            exp_c = str(checker_cfg.get("expected_choice_id", "")).strip()
            if exp_c not in seen_ids or len(built) < 2:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Некорректная конфигурация задания",
                )
            random.shuffle(built)
            choices_response = built
            ui_mode = "asgard_mc"

    repeat_without = False
    start_notice: str | None = None
    if link_assignment_id is not None:
        asn_start = db.get(ClassTaskAssignment, link_assignment_id)
        if asn_start and asn_start.block_id is not None:
            if (
                db.get(TeacherBlockRewardClaim, (user.id, asn_start.block_id))
                is not None
            ):
                repeat_without = True
                start_notice = ASSIGNMENT_REPEAT_NOTICE
        elif (
            db.get(TeacherAssignmentRewardClaim, (user.id, link_assignment_id))
            is not None
        ):
            repeat_without = True
            start_notice = ASSIGNMENT_REPEAT_NOTICE

    inst = TaskInstance(
        user_id=user.id,
        task_template_id=tmpl.id,
        assignment_id=link_assignment_id,
        params_json=json.dumps(params, ensure_ascii=False),
        expected_answer=expected,
        created_at=_now_iso(),
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return StartPracticeResponse(
        instance_id=inst.id,
        prompt=prompt,
        created_at=inst.created_at,
        repeat_without_rewards=repeat_without,
        notice=start_notice,
        ui_mode=ui_mode,
        choices=choices_response,
        task_payload=task_payload,
    )


@learning_router.post("/practice/submit/{instance_id}", response_model=SubmitPracticeResponse)
def submit_practice(
    instance_id: int,
    body: PracticeSubmitBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SubmitPracticeResponse:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")

    ensure_user_economy_rows(db, user.id)

    inst = db.get(TaskInstance, instance_id)
    if not inst or inst.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instance not found")

    tmpl = db.get(TaskTemplate, inst.task_template_id)
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Broken instance")

    cfg = parse_checker_config(tmpl.checker_config_json)
    tolerance = float(cfg.get("tolerance", 0))
    if cfg.get("kind") == "terminal_io":
        correct = verify_terminal_io_outputs(cfg, body.terminal_outputs)
    elif cfg.get("kind") == "dragdrop":
        correct = verify_dragdrop_mapping(cfg, body.dragdrop_mapping)
    elif cfg.get("kind") == "choice":
        correct = inst.expected_answer.strip() == body.answer.strip()
    else:
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
    submit_notice: str | None = None
    pending_teacher_claim: int | None = None
    pending_block_claim: int | None = None
    if correct:
        if inst.assignment_id is not None:
            asn = db.get(ClassTaskAssignment, inst.assignment_id)
            if asn and asn.block_id is not None:
                blk = db.get(AssignmentBlock, asn.block_id)
                bclaim = db.get(TeacherBlockRewardClaim, (user.id, asn.block_id))
                brc = int(blk.reward_coins or 0) if blk else 0
                brx = int(blk.reward_xp or 0) if blk else 0
                if bclaim is not None:
                    submit_notice = ASSIGNMENT_REPEAT_NOTICE
                elif (
                    blk
                    and (brc > 0 or brx > 0)
                    and block_all_other_tasks_solved_correctly(
                        db, user.id, asn.block_id, inst.assignment_id
                    )
                ):
                    coins_awarded = brc
                    xp_from_task = brx
                    pending_block_claim = asn.block_id
            else:
                claim = db.get(
                    TeacherAssignmentRewardClaim, (user.id, inst.assignment_id)
                )
                rc = int(asn.reward_coins or 0) if asn else 0
                rx = int(asn.reward_xp or 0) if asn else 0
                if claim is not None:
                    submit_notice = ASSIGNMENT_REPEAT_NOTICE
                elif asn and (rc > 0 or rx > 0):
                    coins_awarded = rc
                    xp_from_task = rx
                    pending_teacher_claim = inst.assignment_id
        else:
            prior_today = _count_correct_attempts_today_utc(db, user.id)
            coins_awarded = (
                settings.daily_first_correct_coins + settings.daily_each_next_extra_coins * prior_today
            )
            xp_from_task = 10
            if duration_ms <= settings.speed_bonus_ms:
                coins_awarded += settings.speed_bonus_amount
                xp_from_task += 5
        currency_on_attempt = coins_awarded

    if cfg.get("kind") == "terminal_io":
        ans_log = json.dumps(body.terminal_outputs or [], ensure_ascii=False)
    elif cfg.get("kind") == "dragdrop":
        ans_log = json.dumps(body.dragdrop_mapping or {}, ensure_ascii=False)
    else:
        ans_log = body.answer.strip()
    if len(ans_log) > 256:
        ans_log = ans_log[:253] + "..."

    attempt = TaskAttempt(
        task_instance_id=inst.id,
        user_id=user.id,
        answer_submitted=ans_log,
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
        if wallet and coins_awarded:
            tx_reason = (
                "teacher_assignment" if inst.assignment_id is not None else "task_correct"
            )
            wallet.balance += coins_awarded
            db.add(
                CurrencyTransaction(
                    user_id=user.id,
                    delta=coins_awarded,
                    reason=tx_reason,
                    ref_type="task_attempt",
                    ref_id=attempt.id,
                    created_at=_now_iso(),
                )
            )
        if xp_from_task:
            add_score(db, user.id, xp_from_task)

        if inst.assignment_id is None:
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

        if pending_teacher_claim is not None:
            db.add(
                TeacherAssignmentRewardClaim(
                    user_id=user.id,
                    assignment_id=pending_teacher_claim,
                    claimed_at=_now_iso(),
                )
            )
        if pending_block_claim is not None:
            db.add(
                TeacherBlockRewardClaim(
                    user_id=user.id,
                    block_id=pending_block_claim,
                    claimed_at=_now_iso(),
                )
            )

    elif not correct:
        lp_pen = db.get(LessonProgress, (user.id, tmpl.lesson_id))
        used_assignment_penalty = False
        if inst.assignment_id is not None:
            asn = db.get(ClassTaskAssignment, inst.assignment_id)
            if asn and asn.block_id is not None:
                pen_c, pen_x = 0, 0
            else:
                pen_c = int(asn.reward_coins or 0) if asn else 0
                pen_x = int(asn.reward_xp or 0) if asn else 0
            if pen_c > 0 or pen_x > 0:
                used_assignment_penalty = True
                coins_taken = 0
                if pen_c > 0:
                    wallet = db.get(Wallet, user.id)
                    if wallet:
                        coins_taken = min(pen_c, wallet.balance)
                        if coins_taken:
                            wallet.balance -= coins_taken
                            db.add(
                                CurrencyTransaction(
                                    user_id=user.id,
                                    delta=-coins_taken,
                                    reason="teacher_assignment_wrong",
                                    ref_type="task_attempt",
                                    ref_id=attempt.id,
                                    created_at=_now_iso(),
                                )
                            )
                coins_awarded = -coins_taken
                currency_on_attempt = -coins_taken
                attempt.currency_awarded = currency_on_attempt

                if pen_x > 0:
                    st0 = db.get(UserStat, user.id)
                    tot0 = st0.score_total if st0 else 0
                    take_xp = min(pen_x, tot0)
                    if take_xp > 0:
                        add_score(db, user.id, -take_xp)
                        xp_from_task = -take_xp

                if lp_pen:
                    lp_pen.updated_at = _now_iso()

        if (
            not used_assignment_penalty
            and lp_pen
            and (
                settings.practice_wrong_coin_penalty > 0
                or settings.practice_wrong_xp_penalty > 0
            )
        ):
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
    xp_from_lesson, coins_from_lesson = grant_lesson_completion_xp_if_eligible(
        db,
        user.id,
        tmpl.lesson_id,
        settings.lesson_completion_xp,
        coin_amount=settings.lesson_completion_coins,
        max_wrong=settings.practice_max_wrong_per_lesson,
    )
    xp_awarded = xp_from_task + xp_from_lesson
    coins_awarded_total = coins_awarded + coins_from_lesson

    grade_2_5: int | None = None
    if inst.assignment_id is not None:
        inst_ids_for_grade = [
            r[0]
            for r in db.query(TaskInstance.id)
            .filter(
                TaskInstance.assignment_id == inst.assignment_id,
                TaskInstance.user_id == user.id,
            )
            .all()
        ]
        if inst_ids_for_grade:
            wrong_for_grade = (
                db.query(func.count(TaskAttempt.id))
                .filter(
                    TaskAttempt.task_instance_id.in_(inst_ids_for_grade),
                    TaskAttempt.is_correct.is_(False),
                )
                .scalar()
            )
            grade_2_5 = grade_2_to_5_from_wrong_attempts(int(wrong_for_grade or 0))

    block_grade_2_5: int | None = None
    asn_blk = db.get(ClassTaskAssignment, inst.assignment_id) if inst.assignment_id else None
    if (
        asn_blk
        and asn_blk.block_id is not None
        and block_every_task_has_correct_attempt(db, user.id, asn_blk.block_id)
    ):
        block_grade_2_5 = block_grade_ceil_mean(db, user.id, asn_blk.block_id)

    db.commit()

    show_expected: str | None = None
    if not correct and cfg.get("kind") != "choice":
        show_expected = inst.expected_answer

    return SubmitPracticeResponse(
        correct=correct,
        expected_answer=show_expected,
        coins_awarded=coins_awarded_total,
        xp_awarded=xp_awarded,
        notice=submit_notice,
        grade_2_5=grade_2_5,
        block_grade_2_5=block_grade_2_5,
    )
