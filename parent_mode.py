from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import random
import jwt
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from jwt import InvalidTokenError
from pydantic import BaseModel

from app.core import get_settings


class ParentModeVerifyBody(BaseModel):
    challenge_token: str
    answer: str


parent_mode_router = APIRouter(prefix="/parent_mode", tags=["parent-mode"])

CHALLENGE_TYP = "parent_math_challenge"
MODE_TYP = "mode_token"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
CHALLENGE_TTL_MINUTES = 10

KIND_ARITH = "arith"
KIND_LINEAR = "linear"


def _jwt_secret_alg() -> tuple[str, str]:
    s = get_settings()
    return s.jwt_secret, s.jwt_algorithm


def create_mode_token(mode: str, ttl_minutes: int = 60) -> str:
    now = datetime.now(timezone.utc)
    secret, alg = _jwt_secret_alg()
    payload = {
        "typ": MODE_TYP,
        "mode": mode,
        "iat": now,
        "exp": now + timedelta(minutes=ttl_minutes),
    }
    return jwt.encode(payload, secret, algorithm=alg)


def _create_challenge_payload() -> tuple[str, dict[str, Any]]:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=CHALLENGE_TTL_MINUTES)
    base = {"typ": CHALLENGE_TYP, "iat": now, "exp": exp}

    if random.random() < 0.55:
        op = random.choice(["+", "-", "*"])
        if op == "-":
            a = random.randint(12, 40)
            b = random.randint(1, a - 1)
        elif op == "*":
            a = random.randint(3, 14)
            b = random.randint(3, 14)
        else:
            a = random.randint(8, 45)
            b = random.randint(8, 45)
        op_human = {"+": "+", "-": "−", "*": "×"}[op]
        question = f"Сколько будет {a} {op_human} {b}? Ответ — целое число."
        return question, {**base, "kind": KIND_ARITH, "op": op, "a": a, "b": b}

    x = random.randint(2, 16)
    a = random.randint(2, 7)
    b = random.randint(1, 28)
    c = a * x + b
    question = (
        f"Найдите целое число x, если {a}·x + {b} = {c} "
        "(символ · — умножение)."
    )
    return question, {**base, "kind": KIND_LINEAR, "a": a, "b_coeff": b, "c": c}


def create_challenge_token() -> tuple[str, str]:
    question, payload = _create_challenge_payload()
    secret, alg = _jwt_secret_alg()
    return question, jwt.encode(payload, secret, algorithm=alg)


def verify_challenge_token(token: str) -> dict[str, Any]:
    secret, alg = _jwt_secret_alg()
    try:
        payload = jwt.decode(token, secret, algorithms=[alg])
    except InvalidTokenError:
        raise HTTPException(status_code=403, detail="Недействительный challenge-токен")
    if payload.get("typ") != CHALLENGE_TYP:
        raise HTTPException(status_code=403, detail="Неверный тип токена")
    return payload


def _expected_answer(payload: dict[str, Any]) -> int:
    kind = payload.get("kind")
    if kind == KIND_ARITH:
        op, a, b = payload["op"], int(payload["a"]), int(payload["b"])
        if op == "+":
            return a + b
        if op == "-":
            return a - b
        if op == "*":
            return a * b
    if kind == KIND_LINEAR:
        a = int(payload["a"])
        b = int(payload["b_coeff"])
        c = int(payload["c"])
        if a == 0 or (c - b) % a != 0:
            raise HTTPException(status_code=403, detail="Повреждённый challenge")
        return (c - b) // a
    raise HTTPException(status_code=403, detail="Повреждённый challenge")


def parse_integer_answer(raw: str) -> int:
    s = raw.strip().replace(" ", "").replace(",", ".")
    if not s:
        raise HTTPException(status_code=400, detail="Введите ответ")
    try:
        v = float(s)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ответ должен быть числом")
    if not v.is_integer():
        raise HTTPException(status_code=400, detail="Нужно целое число")
    return int(v)


def verify_mode_token(token: str) -> dict:
    secret, alg = _jwt_secret_alg()
    try:
        payload = jwt.decode(token, secret, algorithms=[alg])
    except InvalidTokenError:
        raise HTTPException(status_code=403, detail="Invalid mode token")
    if payload.get("typ") != MODE_TYP:
        raise HTTPException(status_code=403, detail="Wrong token type")
    return payload


def get_mode_from_request(request: Request) -> Optional[str]:
    # Вариант 1: из query ?mode_token=...
    token = request.query_params.get("mode_token")
    # Вариант 2: из cookie mode_token
    if not token:
        token = request.cookies.get("mode_token")
    if not token:
        return None
    payload = verify_mode_token(token)
    return payload.get("mode")


@parent_mode_router.post("/challenge")
def parent_mode_challenge():
    question, challenge_token = create_challenge_token()
    return JSONResponse(
        content={
            "question": question,
            "challenge_token": challenge_token,
        }
    )


@parent_mode_router.post("/verify")
def parent_mode_verify(body: ParentModeVerifyBody):
    payload = verify_challenge_token(body.challenge_token)
    expected = _expected_answer(payload)
    user_answer = parse_integer_answer(body.answer)
    if user_answer != expected:
        raise HTTPException(status_code=403, detail="Неверный ответ")
    mode_token = create_mode_token("new-ui", ttl_minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return JSONResponse(content={"mode_token": mode_token})
