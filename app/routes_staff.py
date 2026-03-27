from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.access import hash_password, require_roles
from app.core import get_db
from app.models import (
    ClassInvite,
    ClassMember,
    ClassTaskAssignment,
    CourseClass,
    Lesson,
    LessonTheoryBlock,
    TaskAttempt,
    TaskTemplate,
    User,
)
from app.schemas import (
    AddMemberBody,
    AdminLessonBody,
    AdminTaskBody,
    AdminTheoryBody,
    AdminUserBody,
    CreateClassBody,
    TeacherAssignTaskBody,
    UserPublic,
)
from app.invites import new_invite_code, new_invite_token
from app.services import ensure_user_economy_rows


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
    )


@teacher_router.get("/classes/{class_id}/assignments", response_model=list[AssignmentOut])
def list_class_assignments(
    class_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles("teacher", "admin"))],
) -> list[AssignmentOut]:
    c = db.get(CourseClass, class_id)
    if not c or c.teacher_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Class not found")
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
            )
        )
    return out


# --- admin ---


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
