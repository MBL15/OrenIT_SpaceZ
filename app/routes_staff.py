from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.access import hash_password, require_roles
from app.core import get_db
from app.models import (
    AssignmentBlock,
    ClassInvite,
    ClassMember,
    ClassTaskAssignment,
    CourseClass,
    Lesson,
    LessonTheoryBlock,
    TaskAttempt,
    TaskInstance,
    TaskTemplate,
    TeacherAssignmentRewardClaim,
    User,
)
from app.schemas import (
    AddMemberBody,
    AdminLessonBody,
    AdminPatchUserRoleBody,
    AdminTaskBody,
    AdminTheoryBody,
    AdminUserBody,
    CreateClassBody,
    TeacherAssignBatchBody,
    TeacherAssignTaskBody,
    UserPublic,
)
from app.invites import new_invite_code, new_invite_token
from app.services import ensure_user_economy_rows, grade_2_to_5_from_wrong_attempts


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _ensure_class_invite(db: Session, class_id: int) -> ClassInvite:
    row = db.query(ClassInvite).filter(ClassInvite.class_id == class_id).first()
    if row:
        if not row.invite_code:
            used = {
                c
                for (c,) in db.query(ClassInvite.invite_code)
                .filter(ClassInvite.invite_code.isnot(None))
                .all()
                if c
            }
            code = new_invite_code()
            while code in used:
                code = new_invite_code()
            row.invite_code = code
            db.commit()
            db.refresh(row)
        return row
    ts = _now_iso()
    used = {
        c
        for (c,) in db.query(ClassInvite.invite_code)
        .filter(ClassInvite.invite_code.isnot(None))
        .all()
        if c
    }
    code = new_invite_code()
    while code in used:
        code = new_invite_code()
    row = ClassInvite(
        class_id=class_id,
        token=new_invite_token(),
        invite_code=code,
        created_at=ts,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


teacher_router = APIRouter(prefix="/teacher", tags=["teacher"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])


# --- teacher ---


class ClassOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    teacher_id: int


class StudentSummary(BaseModel):
    user: UserPublic
    total_attempts: int
    correct_attempts: int


@teacher_router.post("/classes", response_model=ClassOut)
def create_class(
    body: CreateClassBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> CourseClass:
    c = CourseClass(name=body.name, teacher_id=user.id, created_at=_now_iso())
    db.add(c)
    db.commit()
    db.refresh(c)
    _ensure_class_invite(db, c.id)
    return c


@teacher_router.get("/classes", response_model=list[ClassOut])
def list_my_classes(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> list[CourseClass]:
    return db.query(CourseClass).filter(CourseClass.teacher_id == user.id).order_by(CourseClass.id).all()


@teacher_router.post("/classes/{class_id}/members", status_code=204)
def add_member(
    class_id: int,
    body: AddMemberBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> None:
    c = db.get(CourseClass, class_id)
    if not c or c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    child = db.get(User, body.user_id)
    if not child or child.role != "child":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User must be a student")
    if db.get(ClassMember, (class_id, body.user_id)):
        return None
    db.add(ClassMember(class_id=class_id, user_id=body.user_id, joined_at=_now_iso()))
    db.commit()
    return None


@teacher_router.get("/classes/{class_id}/students", response_model=list[StudentSummary])
def class_students(
    class_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> list[StudentSummary]:
    c = db.get(CourseClass, class_id)
    if not c or c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    members = db.query(ClassMember).filter(ClassMember.class_id == class_id).all()
    out: list[StudentSummary] = []
    for m in members:
        u = db.get(User, m.user_id)
        if not u:
            continue
        total = (
            db.query(func.count(TaskAttempt.id)).filter(TaskAttempt.user_id == u.id).scalar() or 0
        )
        corr = (
            db.query(func.count(TaskAttempt.id))
            .filter(TaskAttempt.user_id == u.id, TaskAttempt.is_correct.is_(True))
            .scalar()
            or 0
        )
        out.append(
            StudentSummary(
                user=UserPublic.model_validate(u),
                total_attempts=int(total),
                correct_attempts=int(corr),
            )
        )
    return out


class InviteLinkOut(BaseModel):
    invite_code: str
    invite_token: str
    join_hint: str = Field(
        description="Ученик вводит invite_code в кабинете или передаёт invite_token в POST /classes/join",
    )


@teacher_router.get("/classes/{class_id}/invite", response_model=InviteLinkOut)
def get_class_invite(
    class_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> InviteLinkOut:
    c = db.get(CourseClass, class_id)
    if not c or c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    inv = _ensure_class_invite(db, class_id)
    return InviteLinkOut(
        invite_code=inv.invite_code or "",
        invite_token=inv.token,
        join_hint="Короткий код для ученика — invite_code; полный токен тоже подходит для POST /classes/join",
    )


@teacher_router.post("/classes/{class_id}/invite/refresh", response_model=InviteLinkOut)
def refresh_class_invite(
    class_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> InviteLinkOut:
    c = db.get(CourseClass, class_id)
    if not c or c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    inv = db.query(ClassInvite).filter(ClassInvite.class_id == class_id).first()
    ts = _now_iso()
    used = {
        c
        for (c,) in db.query(ClassInvite.invite_code).filter(ClassInvite.invite_code.isnot(None)).all()
        if c
    }
    new_code = new_invite_code()
    while new_code in used:
        new_code = new_invite_code()
    if inv:
        inv.token = new_invite_token()
        inv.invite_code = new_code
        inv.created_at = ts
    else:
        inv = ClassInvite(
            class_id=class_id,
            token=new_invite_token(),
            invite_code=new_code,
            created_at=ts,
        )
        db.add(inv)
    db.commit()
    db.refresh(inv)
    return InviteLinkOut(
        invite_code=inv.invite_code or "",
        invite_token=inv.token,
        join_hint="Короткий код для ученика — invite_code; полный токен тоже подходит для POST /classes/join",
    )


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    class_id: int
    task_template_id: int
    lesson_id: int
    lesson_title: str
    task_title: str | None
    note: str | None
    created_at: str
    reward_coins: int
    reward_xp: int
    block_id: int | None = None


def _effective_rewards_for_assignment(
    db: Session, row: ClassTaskAssignment
) -> tuple[int, int]:
    """Для блока награда хранится в AssignmentBlock; в строках назначения — нули."""
    if row.block_id is not None:
        blk = db.get(AssignmentBlock, row.block_id)
        if blk is not None:
            return (blk.reward_coins, blk.reward_xp)
    return (row.reward_coins, row.reward_xp)


def _assignments_out_for_class(db: Session, class_id: int) -> list[AssignmentOut]:
    rows = (
        db.query(ClassTaskAssignment)
        .filter(ClassTaskAssignment.class_id == class_id)
        .order_by(ClassTaskAssignment.id.desc())
        .all()
    )
    out: list[AssignmentOut] = []
    for row in rows:
        tmpl = db.get(TaskTemplate, row.task_template_id)
        lesson = db.get(Lesson, tmpl.lesson_id) if tmpl else None
        if not tmpl or not lesson:
            continue
        rc, rx = _effective_rewards_for_assignment(db, row)
        out.append(
            AssignmentOut(
                id=row.id,
                class_id=row.class_id,
                task_template_id=row.task_template_id,
                lesson_id=lesson.id,
                lesson_title=lesson.title,
                task_title=tmpl.title,
                note=row.note,
                created_at=row.created_at,
                reward_coins=rc,
                reward_xp=rx,
                block_id=row.block_id,
            )
        )
    return out


@teacher_router.post("/classes/{class_id}/assignments", response_model=AssignmentOut)
def assign_task_to_class(
    class_id: int,
    body: TeacherAssignTaskBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> AssignmentOut:
    c = db.get(CourseClass, class_id)
    if not c or c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    tmpl = db.get(TaskTemplate, body.task_template_id)
    if not tmpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task template not found")
    if not tmpl.assignable_by_teacher:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Это задание недоступно для назначения классу — на платформе для учителей доступны только опубликованные шаблоны из каталога.",
        )
    lesson = db.get(Lesson, tmpl.lesson_id)
    if not lesson:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Broken lesson")
    if not lesson.is_published:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Назначать можно только задания из опубликованных уроков платформы",
        )
    row = ClassTaskAssignment(
        class_id=class_id,
        task_template_id=tmpl.id,
        teacher_id=user.id,
        note=body.note,
        created_at=_now_iso(),
        reward_coins=body.reward_coins,
        reward_xp=body.reward_xp,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return AssignmentOut(
        id=row.id,
        class_id=row.class_id,
        task_template_id=row.task_template_id,
        lesson_id=lesson.id,
        lesson_title=lesson.title,
        task_title=tmpl.title,
        note=row.note,
        created_at=row.created_at,
        reward_coins=row.reward_coins,
        reward_xp=row.reward_xp,
        block_id=row.block_id,
    )


def _assignment_out_from_row(
    db: Session, row: ClassTaskAssignment, tmpl: TaskTemplate, lesson: Lesson
) -> AssignmentOut:
    rc, rx = _effective_rewards_for_assignment(db, row)
    return AssignmentOut(
        id=row.id,
        class_id=row.class_id,
        task_template_id=row.task_template_id,
        lesson_id=lesson.id,
        lesson_title=lesson.title,
        task_title=tmpl.title,
        note=row.note,
        created_at=row.created_at,
        reward_coins=rc,
        reward_xp=rx,
        block_id=row.block_id,
    )


@teacher_router.post("/classes/{class_id}/assignments/batch", response_model=list[AssignmentOut])
def assign_tasks_batch_to_class(
    class_id: int,
    body: TeacherAssignBatchBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> list[AssignmentOut]:
    """Назначить классу блок заданий: общие комментарий и одна награда за весь блок."""
    c = db.get(CourseClass, class_id)
    if not c or c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")

    seen_ids: set[int] = set()
    ordered_ids: list[int] = []
    for tid in body.task_template_ids:
        if tid in seen_ids:
            continue
        seen_ids.add(tid)
        ordered_ids.append(tid)

    if not ordered_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Укажите хотя бы одно задание",
        )

    validated: list[tuple[TaskTemplate, Lesson]] = []
    for task_template_id in ordered_ids:
        tmpl = db.get(TaskTemplate, task_template_id)
        if not tmpl:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Шаблон задачи {task_template_id} не найден",
            )
        if not tmpl.assignable_by_teacher:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Задача {task_template_id} недоступна для назначения — "
                    "доступны только шаблоны из каталога для учителей."
                ),
            )
        lesson = db.get(Lesson, tmpl.lesson_id)
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Broken lesson",
            )
        if not lesson.is_published:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Урок для задачи {task_template_id} не опубликован",
            )
        validated.append((tmpl, lesson))

    ts = _now_iso()
    block = AssignmentBlock(
        class_id=class_id,
        teacher_id=user.id,
        note=body.note,
        created_at=ts,
        reward_coins=body.reward_coins,
        reward_xp=body.reward_xp,
    )
    db.add(block)
    db.flush()

    out: list[AssignmentOut] = []
    for tmpl, lesson in validated:
        row = ClassTaskAssignment(
            class_id=class_id,
            task_template_id=tmpl.id,
            teacher_id=user.id,
            note=body.note,
            created_at=ts,
            reward_coins=0,
            reward_xp=0,
            block_id=block.id,
        )
        db.add(row)
        db.flush()
        out.append(_assignment_out_from_row(db, row, tmpl, lesson))

    db.commit()
    return out


@teacher_router.get("/classes/{class_id}/assignments", response_model=list[AssignmentOut])
def list_class_assignments(
    class_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> list[AssignmentOut]:
    c = db.get(CourseClass, class_id)
    if not c or c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    return _assignments_out_for_class(db, class_id)


class AssignmentHistoryRow(AssignmentOut):
    """Все назначения учителя по всем классам (для вкладки «Домашние задания»)."""

    class_name: str


@teacher_router.get("/assignments/history", response_model=list[AssignmentHistoryRow])
def teacher_assignments_history(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> list[AssignmentHistoryRow]:
    classes = db.query(CourseClass).filter(CourseClass.teacher_id == user.id).all()
    if not classes:
        return []
    cid_to_name = {c.id: c.name for c in classes}
    class_ids = list(cid_to_name.keys())
    rows = (
        db.query(ClassTaskAssignment)
        .filter(ClassTaskAssignment.class_id.in_(class_ids))
        .order_by(ClassTaskAssignment.id.desc())
        .all()
    )
    out: list[AssignmentHistoryRow] = []
    for row in rows:
        tmpl = db.get(TaskTemplate, row.task_template_id)
        lesson = db.get(Lesson, tmpl.lesson_id) if tmpl else None
        if not tmpl or not lesson:
            continue
        rc, rx = _effective_rewards_for_assignment(db, row)
        out.append(
            AssignmentHistoryRow(
                id=row.id,
                class_id=row.class_id,
                task_template_id=row.task_template_id,
                lesson_id=lesson.id,
                lesson_title=lesson.title,
                task_title=tmpl.title,
                note=row.note,
                created_at=row.created_at,
                reward_coins=rc,
                reward_xp=rx,
                block_id=row.block_id,
                class_name=cid_to_name.get(row.class_id, ""),
            )
        )
    return out


class StudentAssignmentProgressOut(BaseModel):
    user_id: int
    display_name: str
    login: str
    status: Literal["not_started", "in_progress", "completed"]
    attempts: int
    wrong_attempts: int = Field(description="Число неверных отправок по этому назначению")
    grade: int | None = Field(
        default=None,
        description="Оценка 2–5: 5 без ошибок, за каждую ошибку минус балл, минимум 2; null если не начинал",
    )
    correct_any: bool
    bonus_claimed: bool


def _assignment_progress_rows(
    db: Session, class_id: int, assignment_id: int
) -> list[StudentAssignmentProgressOut]:
    asn = db.get(ClassTaskAssignment, assignment_id)
    if not asn or asn.class_id != class_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    members = db.query(ClassMember).filter(ClassMember.class_id == class_id).all()
    if not members:
        return []

    out: list[StudentAssignmentProgressOut] = []
    for m in members:
        u = db.get(User, m.user_id)
        if not u or u.role != "child":
            continue

        inst_ids = [
            r[0]
            for r in db.query(TaskInstance.id)
            .filter(
                TaskInstance.assignment_id == assignment_id,
                TaskInstance.user_id == u.id,
            )
            .all()
        ]

        attempts_list: list[TaskAttempt] = []
        if inst_ids:
            attempts_list = (
                db.query(TaskAttempt)
                .filter(TaskAttempt.task_instance_id.in_(inst_ids))
                .all()
            )

        attempts_n = len(attempts_list)
        wrong_n = sum(1 for a in attempts_list if not a.is_correct)
        grade_val = (
            None if attempts_n == 0 else grade_2_to_5_from_wrong_attempts(wrong_n)
        )
        correct_any = any(a.is_correct for a in attempts_list)
        claim = db.get(TeacherAssignmentRewardClaim, (u.id, assignment_id))
        bonus_claimed = claim is not None

        if attempts_n == 0:
            status_s: Literal["not_started", "in_progress", "completed"] = "not_started"
        elif correct_any:
            status_s = "completed"
        else:
            status_s = "in_progress"

        out.append(
            StudentAssignmentProgressOut(
                user_id=u.id,
                display_name=u.display_name,
                login=u.login,
                status=status_s,
                attempts=attempts_n,
                wrong_attempts=wrong_n,
                grade=grade_val,
                correct_any=correct_any,
                bonus_claimed=bonus_claimed,
            )
        )

    out.sort(key=lambda r: (r.display_name or r.login).lower())
    return out


def _delete_one_assignment_cascade(db: Session, row: ClassTaskAssignment) -> int | None:
    """Удаляет экземпляры задач и претензии на бонус по одному назначению. Возвращает block_id до удаления строки."""
    aid = row.id
    bid = row.block_id
    for inst in db.query(TaskInstance).filter(TaskInstance.assignment_id == aid).all():
        db.delete(inst)
    db.query(TeacherAssignmentRewardClaim).filter(
        TeacherAssignmentRewardClaim.assignment_id == aid
    ).delete()
    db.delete(row)
    return bid


def _maybe_delete_orphan_block(db: Session, block_id: int) -> None:
    n = (
        db.query(ClassTaskAssignment)
        .filter(ClassTaskAssignment.block_id == block_id)
        .count()
    )
    if n == 0:
        blk = db.get(AssignmentBlock, block_id)
        if blk:
            db.delete(blk)


@teacher_router.get(
    "/classes/{class_id}/assignments/{assignment_id}/progress",
    response_model=list[StudentAssignmentProgressOut],
)
def assignment_progress_for_class(
    class_id: int,
    assignment_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> list[StudentAssignmentProgressOut]:
    c = db.get(CourseClass, class_id)
    if not c or c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    return _assignment_progress_rows(db, class_id, assignment_id)


@teacher_router.delete(
    "/classes/{class_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_class_assignment(
    class_id: int,
    assignment_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> None:
    """Удалить одно назначение (в т.ч. одну задачу из блока; блок остаётся, пока есть другие задачи)."""
    c = db.get(CourseClass, class_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    if user.role != "admin" and c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    row = db.get(ClassTaskAssignment, assignment_id)
    if not row or row.class_id != class_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    bid = _delete_one_assignment_cascade(db, row)
    db.flush()
    if bid is not None:
        _maybe_delete_orphan_block(db, bid)
    db.commit()


@teacher_router.delete(
    "/classes/{class_id}/assignment-blocks/{block_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_class_assignment_block(
    class_id: int,
    block_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> None:
    """Удалить весь блок: все задачи этого пакета и общие настройки блока."""
    c = db.get(CourseClass, class_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    if user.role != "admin" and c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    blk = db.get(AssignmentBlock, block_id)
    if not blk or blk.class_id != class_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    rows = (
        db.query(ClassTaskAssignment)
        .filter(
            ClassTaskAssignment.block_id == block_id,
            ClassTaskAssignment.class_id == class_id,
        )
        .all()
    )
    if not rows:
        db.delete(blk)
        db.commit()
        return
    for row in rows:
        _delete_one_assignment_cascade(db, row)
    blk2 = db.get(AssignmentBlock, block_id)
    if blk2:
        db.delete(blk2)
    db.commit()


# --- admin ---


class AdminClassOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    teacher_id: int
    teacher_login: str
    teacher_display_name: str


@admin_router.get("/classes", response_model=list[AdminClassOut])
def admin_list_all_classes(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles("admin"))],
) -> list[AdminClassOut]:
    rows = db.query(CourseClass).order_by(CourseClass.id).all()
    out: list[AdminClassOut] = []
    for c in rows:
        t = db.get(User, c.teacher_id)
        out.append(
            AdminClassOut(
                id=c.id,
                name=c.name,
                teacher_id=c.teacher_id,
                teacher_login=t.login if t else "",
                teacher_display_name=(t.display_name or t.login) if t else "",
            )
        )
    return out


@admin_router.get("/classes/{class_id}/assignments", response_model=list[AssignmentOut])
def admin_list_class_assignments(
    class_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles("admin"))],
) -> list[AssignmentOut]:
    c = db.get(CourseClass, class_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
    return _assignments_out_for_class(db, class_id)


class LessonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    sort_order: int
    is_published: bool


class TheoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lesson_id: int
    sort_order: int
    body_markdown: str


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lesson_id: int
    sort_order: int
    title: str | None
    prompt_template: str
    param_spec_json: str
    checker_type: str
    checker_config_json: str | None


class AdminStatsOut(BaseModel):
    users_total: int
    users_child: int
    users_teacher: int
    users_admin: int
    classes_total: int
    class_memberships: int
    lessons_total: int
    task_attempts_total: int


@admin_router.get("/stats", response_model=AdminStatsOut)
def admin_get_stats(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles("admin"))],
) -> AdminStatsOut:
    return AdminStatsOut(
        users_total=db.query(User).count(),
        users_child=db.query(User).filter(User.role == "child").count(),
        users_teacher=db.query(User).filter(User.role == "teacher").count(),
        users_admin=db.query(User).filter(User.role == "admin").count(),
        classes_total=db.query(CourseClass).count(),
        class_memberships=db.query(ClassMember).count(),
        lessons_total=db.query(Lesson).count(),
        task_attempts_total=db.query(TaskAttempt).count(),
    )


@admin_router.get("/users", response_model=list[UserPublic])
def admin_list_users(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles("admin"))],
) -> list[User]:
    return db.query(User).order_by(User.id).all()


@admin_router.patch("/users/{user_id}", response_model=UserPublic)
def admin_patch_user_role(
    user_id: int,
    body: AdminPatchUserRoleBody,
    db: Annotated[Session, Depends(get_db)],
    admin_user: Annotated[User, Depends(require_roles("admin"))],
) -> User:
    if body.role not in ("child", "teacher", "admin"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недопустимая роль")
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if admin_user.id == user_id and u.role == "admin" and body.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя снять с себя роль администратора",
        )
    if u.role == "admin" and body.role != "admin":
        admins = db.query(func.count(User.id)).filter(User.role == "admin").scalar() or 0
        if int(admins) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Нельзя убрать последнего администратора",
            )
    u.role = body.role
    db.commit()
    db.refresh(u)
    return u


@admin_router.post("/users", response_model=UserPublic)
def create_user(
    body: AdminUserBody,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles("admin"))],
) -> User:
    if body.role not in ("child", "teacher", "admin"):
        raise HTTPException(status_code=400, detail="Invalid role")
    if db.query(User).filter(User.login == body.login).first():
        raise HTTPException(status_code=409, detail="Login taken")
    u = User(
        login=body.login,
        password_hash=hash_password(body.password),
        role=body.role,
        display_name=body.display_name,
        avatar_id=None,
        created_at=_now_iso(),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    ensure_user_economy_rows(db, u.id)
    db.commit()
    return u


@admin_router.get("/lessons", response_model=list[LessonOut])
def admin_list_lessons(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles("admin"))],
) -> list[Lesson]:
    return db.query(Lesson).order_by(Lesson.sort_order, Lesson.id).all()


def _validate_admin_task_config(body: AdminTaskBody) -> None:
    """Проверка checker_config_json для kind terminal_io и dragdrop."""
    raw = body.checker_config_json
    if raw is None or not str(raw).strip():
        return
    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"checker_config_json: невалидный JSON ({e})",
        ) from e
    kind = cfg.get("kind")
    if kind == "terminal_io":
        tests = cfg.get("tests")
        if not isinstance(tests, list) or len(tests) < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="terminal_io: нужен непустой массив tests",
            )
        for i, t in enumerate(tests):
            if not isinstance(t, dict):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"terminal_io: tests[{i}] должен быть объектом",
                )
            if "stdin" not in t or "expected_stdout" not in t:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="terminal_io: у каждого теста должны быть stdin и expected_stdout",
                )
    elif kind == "dragdrop":
        for key in ("slots", "items", "solution"):
            if key not in cfg:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"dragdrop: в конфиге нужен ключ {key}",
                )
        if not isinstance(cfg.get("slots"), list) or not isinstance(cfg.get("items"), list):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="dragdrop: slots и items — массивы",
            )
        if not isinstance(cfg.get("solution"), dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="dragdrop: solution — объект slot_id -> item_id",
            )


@admin_router.post("/lessons", response_model=LessonOut)
def create_lesson(
    body: AdminLessonBody,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles("admin"))],
) -> Lesson:
    lesson = Lesson(
        title=body.title,
        sort_order=body.sort_order,
        is_published=body.is_published,
        created_at=_now_iso(),
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return lesson


@admin_router.post("/lessons/{lesson_id}/theory", response_model=TheoryOut)
def add_theory(
    lesson_id: int,
    body: AdminTheoryBody,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles("admin"))],
) -> LessonTheoryBlock:
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    block = LessonTheoryBlock(
        lesson_id=lesson_id,
        sort_order=body.sort_order,
        body_markdown=body.body_markdown,
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


@admin_router.post("/lessons/{lesson_id}/tasks", response_model=TaskOut)
def add_task(
    lesson_id: int,
    body: AdminTaskBody,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles("admin"))],
) -> TaskTemplate:
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    if body.checker_type not in ("numeric", "expression"):
        raise HTTPException(status_code=400, detail="Invalid checker_type")
    _validate_admin_task_config(body)
    t = TaskTemplate(
        lesson_id=lesson_id,
        sort_order=body.sort_order,
        title=body.title,
        prompt_template=body.prompt_template,
        param_spec_json=body.param_spec_json,
        checker_type=body.checker_type,
        checker_config_json=body.checker_config_json,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t
