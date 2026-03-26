from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.access import get_current_user, hash_password, require_roles
from app.core import get_db
from app.models import ClassMember, CourseClass, Lesson, LessonTheoryBlock, TaskAttempt, TaskTemplate, User
from app.schemas import (
    AddMemberBody,
    AdminLessonBody,
    AdminTaskBody,
    AdminTheoryBody,
    AdminUserBody,
    CreateClassBody,
    UserPublic,
)
from app.services import ensure_user_economy_rows


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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
