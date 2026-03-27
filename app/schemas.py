from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterBody(BaseModel):
    login: str = Field(min_length=2, max_length=128)
    password: str = Field(min_length=4, max_length=128)
    display_name: str = Field(min_length=1, max_length=128)
    account_type: Literal["child", "teacher"] = Field(
        default="child",
        description="child — ученик, teacher — учитель (свой класс, приглашения, задания)",
    )


class LoginBody(BaseModel):
    login: str
    password: str


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    login: str
    display_name: str
    role: str
    avatar_id: str | None = None


class ParentVerifyBody(BaseModel):
    challenge_id: int
    answer: int


class PracticeSubmitBody(BaseModel):
    answer: str
    started_at: str | None = None


class BuyBody(BaseModel):
    item_id: int


class EquipBody(BaseModel):
    skin_item_id: int | None = None
    hat_item_id: int | None = None
    accessory_item_id: int | None = None


class CreateClassBody(BaseModel):
    name: str = Field(min_length=1, max_length=256)


class AddMemberBody(BaseModel):
    user_id: int


class JoinClassBody(BaseModel):
    """Короткий invite_code (8 символов) или полный секретный токен."""

    invite_token: str = Field(min_length=6, max_length=128)


class TeacherAssignTaskBody(BaseModel):
    task_template_id: int
    note: str | None = Field(default=None, max_length=2000)
    reward_coins: int = Field(default=0, ge=0, le=100, description="Бонус монет за верное решение (один раз)")
    reward_xp: int = Field(default=0, ge=0, le=1000, description="Бонус XP за верное решение (один раз)")


class AdminUserBody(BaseModel):
    login: str
    password: str
    display_name: str
    role: str


class AdminLessonBody(BaseModel):
    title: str
    sort_order: int = 0
    is_published: bool = True


class AdminTheoryBody(BaseModel):
    body_markdown: str
    sort_order: int = 0


class AdminTaskBody(BaseModel):
    title: str | None = None
    sort_order: int = 0
    prompt_template: str
    param_spec_json: str
    checker_type: str = "numeric"
    checker_config_json: str | None = None
