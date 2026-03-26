from __future__ import annotations

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    login: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    avatar_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)

    __table_args__ = (CheckConstraint("role IN ('child','teacher','admin')", name="ck_users_role"),)


class ParentChallenge(Base):
    __tablename__ = "parent_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    operation: Mapped[str] = mapped_column(String(1), nullable=False)
    left_operand: Mapped[int] = mapped_column(Integer, nullable=False)
    right_operand: Mapped[int] = mapped_column(Integer, nullable=False)
    expected_answer: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[str] = mapped_column(String(32), nullable=False)
    used_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)

    __table_args__ = (
        CheckConstraint("operation IN ('+','-','*')", name="ck_parent_op"),
    )


class CourseClass(Base):
    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)


class ClassMember(Base):
    __tablename__ = "class_members"

    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[str] = mapped_column(String(32), nullable=False)


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)

    theory_blocks: Mapped[list[LessonTheoryBlock]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan"
    )
    task_templates: Mapped[list[TaskTemplate]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan"
    )


class LessonTheoryBlock(Base):
    __tablename__ = "lesson_theory_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)

    lesson: Mapped[Lesson] = relationship(back_populates="theory_blocks")


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str | None] = mapped_column(String(256), nullable=True)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    param_spec_json: Mapped[str] = mapped_column(Text, nullable=False)
    checker_type: Mapped[str] = mapped_column(String(32), nullable=False, default="numeric")
    checker_config_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    lesson: Mapped[Lesson] = relationship(back_populates="task_templates")

    __table_args__ = (
        CheckConstraint("checker_type IN ('numeric','expression')", name="ck_checker_type"),
    )


class TaskInstance(Base):
    __tablename__ = "task_instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    task_template_id: Mapped[int] = mapped_column(
        ForeignKey("task_templates.id", ondelete="CASCADE"), nullable=False
    )
    params_json: Mapped[str] = mapped_column(Text, nullable=False)
    expected_answer: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)


class TaskAttempt(Base):
    __tablename__ = "task_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_instance_id: Mapped[int] = mapped_column(
        ForeignKey("task_instances.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    answer_submitted: Mapped[str] = mapped_column(String(256), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    started_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    submitted_at: Mapped[str] = mapped_column(String(32), nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency_awarded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class LessonProgress(Base):
    __tablename__ = "lesson_progress"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True)
    theory_done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    practice_done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[str] = mapped_column(String(32), nullable=False)


class Wallet(Base):
    __tablename__ = "wallets"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (CheckConstraint("balance >= 0", name="ck_wallet_balance"),)


class CurrencyTransaction(Base):
    __tablename__ = "currency_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(128), nullable=False)
    ref_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)


class MascotItem(Base):
    __tablename__ = "mascot_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    slot: Mapped[str] = mapped_column(String(32), nullable=False, default="skin")

    __table_args__ = (
        CheckConstraint("slot IN ('skin','hat','accessory')", name="ck_mascot_slot"),
        CheckConstraint("price >= 0", name="ck_mascot_price"),
    )


class UserMascotInventory(Base):
    __tablename__ = "user_mascot_inventory"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("mascot_items.id", ondelete="CASCADE"), primary_key=True)
    purchased_at: Mapped[str] = mapped_column(String(32), nullable=False)


class UserMascotEquipped(Base):
    __tablename__ = "user_mascot_equipped"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    skin_item_id: Mapped[int | None] = mapped_column(ForeignKey("mascot_items.id"), nullable=True)
    hat_item_id: Mapped[int | None] = mapped_column(ForeignKey("mascot_items.id"), nullable=True)
    accessory_item_id: Mapped[int | None] = mapped_column(ForeignKey("mascot_items.id"), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(32), nullable=False)


class UserStat(Base):
    __tablename__ = "user_stats"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    score_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score_week: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    week_id: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    updated_at: Mapped[str] = mapped_column(String(32), nullable=False)


class ParentViewAudit(Base):
    __tablename__ = "parent_view_audit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    viewed_at: Mapped[str] = mapped_column(String(32), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
