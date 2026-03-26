from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.access import get_current_user
from app.core import get_db
from app.models import (
    CurrencyTransaction,
    MascotItem,
    User,
    UserMascotEquipped,
    UserMascotInventory,
    UserStat,
    Wallet,
)
from app.schemas import BuyBody, EquipBody

play_router = APIRouter(tags=["play"])


class WalletOut(BaseModel):
    balance: int


class MascotItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    price: int
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
    score: int


class PublicProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    avatar_id: str | None
    score_total: int
    score_week: int


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough currency")

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

    _must_own(body.skin_item_id)
    _must_own(body.hat_item_id)
    _must_own(body.accessory_item_id)

    eq = db.get(UserMascotEquipped, user.id)
    ts = _now_iso()
    if not eq:
        eq = UserMascotEquipped(user_id=user.id, updated_at=ts)
        db.add(eq)
    if body.skin_item_id is not None:
        it = db.get(MascotItem, body.skin_item_id)
        if it and it.slot != "skin":
            raise HTTPException(status_code=400, detail="Wrong slot")
        eq.skin_item_id = body.skin_item_id
    if body.hat_item_id is not None:
        it = db.get(MascotItem, body.hat_item_id)
        if it and it.slot != "hat":
            raise HTTPException(status_code=400, detail="Wrong slot")
        eq.hat_item_id = body.hat_item_id
    if body.accessory_item_id is not None:
        it = db.get(MascotItem, body.accessory_item_id)
        if it and it.slot != "accessory":
            raise HTTPException(status_code=400, detail="Wrong slot")
        eq.accessory_item_id = body.accessory_item_id
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
                score=st.score_week if scope == "week" else st.score_total,
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
    return PublicProfile(
        id=u.id,
        display_name=u.display_name,
        avatar_id=u.avatar_id,
        score_total=st.score_total if st else 0,
        score_week=st.score_week if st else 0,
    )
