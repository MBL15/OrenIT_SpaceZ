from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.access import get_current_user
from app.core import get_db
from app.models import (
    ClassMember,
    CourseClass,
    CurrencyTransaction,
    MascotItem,
    User,
    UserMascotEquipped,
    UserMascotInventory,
    UserStat,
    Wallet,
)
from app.schemas import BuyBody, EquipBody
from app.services import level_from_total_xp

play_router = APIRouter(tags=["play"])


class WalletOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    coins: int = Field(validation_alias="balance", description="Баланс коинов")


class MascotItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    price: int = Field(description="Цена в коинах")
    slot: str


class MascotStateOut(BaseModel):
    skin_item_id: int | None
    hat_item_id: int | None
    accessory_item_id: int | None
    owned_item_ids: list[int]


class LeaderRow(BaseModel):
    rank: int
    user_id: int
    display_name: str
    avatar_id: str | None
    xp: int = Field(description="Очки опыта")
    level: int = Field(description="Уровень (от суммарного XP)")


class CoinsLeaderRow(BaseModel):
    rank: int
    user_id: int
    display_name: str
    avatar_id: str | None
    coins_earned_total: int = Field(description="Всего заработано коинов за всё время")
    level: int = Field(description="Уровень (от суммарного XP)")


class PublicProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    avatar_id: str | None
    xp_total: int = Field(description="Всего очков опыта")
    xp_week: int = Field(description="Очки опыта за неделю")
    level: int = Field(description="Уровень (от суммарного XP)")


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _coins_earned_subquery(db: Session):
    """Сумма положительных delta по транзакциям = заработанные коины (без возвратов/списаний)."""
    return (
        db.query(
            CurrencyTransaction.user_id.label("uid"),
            func.coalesce(func.sum(CurrencyTransaction.delta), 0).label("earned"),
        )
        .filter(CurrencyTransaction.delta > 0)
        .group_by(CurrencyTransaction.user_id)
        .subquery()
    )


def _assert_class_coins_leaderboard_access(db: Session, user: User, class_id: int) -> CourseClass:
    c = db.get(CourseClass, class_id)
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Класс не найден")
    if user.role == "admin":
        return c
    if user.role == "teacher" and c.teacher_id == user.id:
        return c
    if user.role == "child" and db.get(ClassMember, (class_id, user.id)) is not None:
        return c
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Нет доступа к лидерборду этого класса",
    )


@play_router.get("/shop/items", response_model=list[MascotItemOut])
def list_items(db: Annotated[Session, Depends(get_db)]) -> list[MascotItem]:
    return db.query(MascotItem).order_by(MascotItem.id).all()


@play_router.get("/me/wallet", response_model=WalletOut)
def get_wallet(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Wallet:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")
    w = db.get(Wallet, user.id)
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No wallet")
    return w


@play_router.post("/shop/buy", response_model=MascotItemOut)
def buy_item(
    body: BuyBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MascotItem:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")
    item = db.get(MascotItem, body.item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    inv = db.get(UserMascotInventory, (user.id, item.id))
    if inv:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already owned")
    wallet = db.get(Wallet, user.id)
    if not wallet or wallet.balance < item.price:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недостаточно коинов")

    wallet.balance -= item.price
    db.add(
        CurrencyTransaction(
            user_id=user.id,
            delta=-item.price,
            reason="mascot_purchase",
            ref_type="mascot_item",
            ref_id=item.id,
            created_at=_now_iso(),
        )
    )
    db.add(UserMascotInventory(user_id=user.id, item_id=item.id, purchased_at=_now_iso()))
    db.commit()
    db.refresh(item)
    return item


@play_router.get("/me/mascot", response_model=MascotStateOut)
def get_mascot(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MascotStateOut:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")
    eq = db.get(UserMascotEquipped, user.id)
    owned = [r.item_id for r in db.query(UserMascotInventory).filter(UserMascotInventory.user_id == user.id).all()]
    if not eq:
        return MascotStateOut(
            skin_item_id=None,
            hat_item_id=None,
            accessory_item_id=None,
            owned_item_ids=owned,
        )
    return MascotStateOut(
        skin_item_id=eq.skin_item_id,
        hat_item_id=eq.hat_item_id,
        accessory_item_id=eq.accessory_item_id,
        owned_item_ids=owned,
    )


@play_router.put("/me/mascot/equip", response_model=MascotStateOut)
def equip_mascot(
    body: EquipBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> MascotStateOut:
    if user.role != "child":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only students")

    def _must_own(item_id: int | None) -> None:
        if item_id is None:
            return
        inv = db.get(UserMascotInventory, (user.id, item_id))
        if not inv:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item not owned")
        it = db.get(MascotItem, item_id)
        if not it:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    eq = db.get(UserMascotEquipped, user.id)
    ts = _now_iso()
    if not eq:
        eq = UserMascotEquipped(user_id=user.id, updated_at=ts)
        db.add(eq)
    patch = body.model_dump(exclude_unset=True)
    if "skin_item_id" in patch:
        sid = patch["skin_item_id"]
        if sid is not None:
            _must_own(sid)
            it = db.get(MascotItem, sid)
            if it and it.slot != "skin":
                raise HTTPException(status_code=400, detail="Wrong slot")
        eq.skin_item_id = sid
    if "hat_item_id" in patch:
        hid = patch["hat_item_id"]
        if hid is not None:
            _must_own(hid)
            it = db.get(MascotItem, hid)
            if it and it.slot != "hat":
                raise HTTPException(status_code=400, detail="Wrong slot")
        eq.hat_item_id = hid
    if "accessory_item_id" in patch:
        aid = patch["accessory_item_id"]
        if aid is not None:
            _must_own(aid)
            it = db.get(MascotItem, aid)
            if it and it.slot != "accessory":
                raise HTTPException(status_code=400, detail="Wrong slot")
        eq.accessory_item_id = aid
    eq.updated_at = ts
    db.commit()
    owned = [r.item_id for r in db.query(UserMascotInventory).filter(UserMascotInventory.user_id == user.id).all()]
    return MascotStateOut(
        skin_item_id=eq.skin_item_id,
        hat_item_id=eq.hat_item_id,
        accessory_item_id=eq.accessory_item_id,
        owned_item_ids=owned,
    )


@play_router.get("/leaderboard", response_model=list[LeaderRow])
def leaderboard(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    scope: Literal["week", "total"] = "week",
    limit: int = 50,
) -> list[LeaderRow]:
    if limit < 1 or limit > 200:
        limit = 50
    col = UserStat.score_week if scope == "week" else UserStat.score_total
    rows = (
        db.query(UserStat, User)
        .join(User, UserStat.user_id == User.id)
        .filter(User.role == "child")
        .order_by(col.desc())
        .limit(limit)
        .all()
    )
    out: list[LeaderRow] = []
    for i, (st, u) in enumerate(rows, start=1):
        out.append(
            LeaderRow(
                rank=i,
                user_id=u.id,
                display_name=u.display_name,
                avatar_id=u.avatar_id,
                xp=st.score_week if scope == "week" else st.score_total,
                level=level_from_total_xp(st.score_total),
            )
        )
    return out


@play_router.get("/leaderboard/coins", response_model=list[CoinsLeaderRow])
def leaderboard_coins_global(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
    limit: int = 50,
) -> list[CoinsLeaderRow]:
    """Все ученики: рейтинг по сумме заработанных коинов за всё время."""
    if limit < 1 or limit > 200:
        limit = 50
    tx_sum = _coins_earned_subquery(db)
    earned_col = func.coalesce(tx_sum.c.earned, 0)
    rows = (
        db.query(User, earned_col.label("coins_earned"))
        .outerjoin(tx_sum, User.id == tx_sum.c.uid)
        .filter(User.role == "child")
        .order_by(earned_col.desc(), User.id.asc())
        .limit(limit)
        .all()
    )
    out: list[CoinsLeaderRow] = []
    for i, (u, earned) in enumerate(rows, start=1):
        st = db.get(UserStat, u.id)
        xp_total = st.score_total if st else 0
        out.append(
            CoinsLeaderRow(
                rank=i,
                user_id=u.id,
                display_name=u.display_name,
                avatar_id=u.avatar_id,
                coins_earned_total=int(earned or 0),
                level=level_from_total_xp(xp_total),
            )
        )
    return out


@play_router.get(
    "/leaderboard/coins/class/{class_id}",
    response_model=list[CoinsLeaderRow],
)
def leaderboard_coins_for_class(
    class_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    limit: int = 50,
) -> list[CoinsLeaderRow]:
    """Ученики одного класса: тот же критерий (заработанные коины за всё время)."""
    _assert_class_coins_leaderboard_access(db, user, class_id)
    if limit < 1 or limit > 200:
        limit = 50
    tx_sum = _coins_earned_subquery(db)
    earned_col = func.coalesce(tx_sum.c.earned, 0)
    rows = (
        db.query(User, earned_col.label("coins_earned"))
        .join(ClassMember, ClassMember.user_id == User.id)
        .outerjoin(tx_sum, User.id == tx_sum.c.uid)
        .filter(User.role == "child", ClassMember.class_id == class_id)
        .order_by(earned_col.desc(), User.id.asc())
        .limit(limit)
        .all()
    )
    out: list[CoinsLeaderRow] = []
    for i, (u, earned) in enumerate(rows, start=1):
        st = db.get(UserStat, u.id)
        xp_total = st.score_total if st else 0
        out.append(
            CoinsLeaderRow(
                rank=i,
                user_id=u.id,
                display_name=u.display_name,
                avatar_id=u.avatar_id,
                coins_earned_total=int(earned or 0),
                level=level_from_total_xp(xp_total),
            )
        )
    return out


@play_router.get("/users/{user_id}/public", response_model=PublicProfile)
def public_profile(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
) -> PublicProfile:
    u = db.get(User, user_id)
    if not u or u.role != "child":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    st = db.get(UserStat, user_id)
    total = st.score_total if st else 0
    return PublicProfile(
        id=u.id,
        display_name=u.display_name,
        avatar_id=u.avatar_id,
        xp_total=total,
        xp_week=st.score_week if st else 0,
        level=level_from_total_xp(total),
    )
