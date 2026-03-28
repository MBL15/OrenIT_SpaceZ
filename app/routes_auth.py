from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.access import (
    create_access_token,
    create_parent_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.core import get_db, get_settings
from app.models import ParentChallenge, ParentViewAudit, User
from app.schemas import LoginBody, ParentVerifyBody, RegisterBody, TokenResponse, UserPublic
from app.services import ensure_user_economy_rows

settings = get_settings()

auth_router = APIRouter(prefix="/auth", tags=["auth"])
parent_router = APIRouter(prefix="/parent-gate", tags=["parent-gate"])


@auth_router.post("/register", response_model=UserPublic)
def register(body: RegisterBody, db: Annotated[Session, Depends(get_db)]) -> User:
    if db.query(User).filter(User.login == body.login).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Login taken")
    ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    role = "teacher" if body.account_type == "teacher" else "child"
    user = User(
        login=body.login,
        password_hash=hash_password(body.password),
        role=role,
        display_name=body.display_name,
        avatar_id=None,
        created_at=ts,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if role == "child":
        ensure_user_economy_rows(db, user.id)
        db.commit()
    return user


@auth_router.post("/login", response_model=TokenResponse)
def login(body: LoginBody, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    user = db.query(User).filter(User.login == body.login).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )
    token = create_access_token(user.id, user.role)
    return TokenResponse(access_token=token)


@auth_router.get("/me", response_model=UserPublic)
def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user


class ChallengeResponse(BaseModel):
    challenge_id: int
    expression: str


class ParentTokenResponse(BaseModel):
    parent_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fmt_expression(op: str, a: int, b: int) -> str:
    sym = "×" if op == "*" else op
    return f"{a} {sym} {b}"


@parent_router.post("/challenge", response_model=ChallengeResponse)
def create_challenge(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ChallengeResponse:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only for students")

    db.query(ParentChallenge).filter(ParentChallenge.user_id == user.id).delete()

    op = random.choice(["+", "-", "*"])
    if op == "+":
        a, b = random.randint(3, 18), random.randint(3, 18)
        ans = a + b
    elif op == "-":
        a, b = random.randint(12, 40), random.randint(2, 15)
        if a < b:
            a, b = b, a
        ans = a - b
    else:
        a, b = random.randint(2, 9), random.randint(2, 9)
        ans = a * b

    exp = (_now() + timedelta(minutes=settings.parent_challenge_ttl_minutes)).replace(microsecond=0).isoformat()
    row = ParentChallenge(
        user_id=user.id,
        operation=op,
        left_operand=a,
        right_operand=b,
        expected_answer=ans,
        expires_at=exp,
        used_at=None,
        created_at=_now().replace(microsecond=0).isoformat(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ChallengeResponse(challenge_id=row.id, expression=_fmt_expression(op, a, b))


@parent_router.post("/verify", response_model=ParentTokenResponse)
def verify_challenge(
    body: ParentVerifyBody,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ParentTokenResponse:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only for students")

    row = db.get(ParentChallenge, body.challenge_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found")
    if row.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already used")
    if _now() > datetime.fromisoformat(row.expires_at):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expired")

    if int(body.answer) != int(row.expected_answer):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Wrong answer")

    row.used_at = _now().replace(microsecond=0).isoformat()
    db.add(
        ParentViewAudit(
            user_id=user.id,
            viewed_at=row.used_at,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    db.commit()

    token = create_parent_token(user.id)
    return ParentTokenResponse(
        parent_token=token,
        expires_in_minutes=settings.parent_token_expire_minutes,
    )
