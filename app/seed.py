from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.invites import new_invite_code, new_invite_token
from app.models import (
    ClassInvite,
    ClassMember,
    CourseClass,
    Lesson,
    LessonTheoryBlock,
    MascotItem,
    TaskTemplate,
    User,
    UserMascotEquipped,
    UserMascotInventory,
)
from app.access import hash_password
from app.asgard_platform import asgard_checker_json, asgard_teacher_task_specs
from app.services import ensure_user_economy_rows


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def seed_if_empty(db: Session) -> None:
    if db.query(User).first() is not None:
        return

    admin = User(
        login="admin",
        password_hash=hash_password("admin"),
        role="admin",
        display_name="Администратор",
        avatar_id=None,
        created_at=_now_iso(),
    )
    teacher = User(
        login="teacher",
        password_hash=hash_password("teacher"),
        role="teacher",
        display_name="Учитель",
        avatar_id=None,
        created_at=_now_iso(),
    )
    child = User(
        login="student",
        password_hash=hash_password("student"),
        role="child",
        display_name="Артемий",
        avatar_id="default",
        created_at=_now_iso(),
    )
    db.add_all([admin, teacher, child])
    db.flush()

    for u in (admin, teacher, child):
        ensure_user_economy_rows(db, u.id)

    items = [
        MascotItem(slug="skin-academy", name="Космическая академия", price=40, slot="skin"),
        MascotItem(slug="skin-knight", name="Тёмный рыцарь", price=80, slot="skin"),
        MascotItem(slug="hat-party", name="Праздничная шляпа", price=15, slot="hat"),
    ]
    db.add_all(items)
    db.flush()

    asgard_title = "Основы информатики — Асгард"
    lasgard = Lesson(title=asgard_title, sort_order=1, is_published=True, created_at=_now_iso())
    l1 = Lesson(title="Урок 1. Сложение", sort_order=2, is_published=False, created_at=_now_iso())
    l2 = Lesson(title="Урок 2. Вычитание", sort_order=3, is_published=False, created_at=_now_iso())
    db.add_all([lasgard, l1, l2])
    db.flush()

    db.add_all(
        [
            LessonTheoryBlock(
                lesson_id=lasgard.id,
                sort_order=1,
                body_markdown=(
                    "Интерактивный урок с катсценой — на карте **«Асгард»**. "
                    "Там три вопроса с теми же формулировками и вариантами, что в каталоге для учителя; "
                    "прохождение на карте и задание от учителя на платформе **не связаны**."
                ),
            ),
            LessonTheoryBlock(
                lesson_id=l1.id,
                sort_order=1,
                body_markdown=(
                    "## Сложение\n\nСкладываем числа по разрядам. "
                    "Маскот **Артемий** любит, когда ответ получается быстро и верно!"
                ),
            ),
            LessonTheoryBlock(
                lesson_id=l2.id,
                sort_order=1,
                body_markdown=(
                    "## Вычитание\n\nИз большего вычитаем меньшее. "
                    "Если запутаешься — перечитай пример из теории."
                ),
            ),
        ]
    )

    asgard_templates = [
        TaskTemplate(
            lesson_id=lasgard.id,
            sort_order=row["sort_order"],
            title=row["title"],
            prompt_template=row["prompt"],
            param_spec_json="{}",
            checker_type="numeric",
            checker_config_json=asgard_checker_json(row),
            assignable_by_teacher=True,
            counts_toward_lesson_practice=False,
        )
        for row in asgard_teacher_task_specs()
    ]
    db.add_all(
        [
            *asgard_templates,
            TaskTemplate(
                lesson_id=l1.id,
                sort_order=1,
                title="Сложение в пределах 20",
                prompt_template="Сколько будет {{a}} + {{b}}?",
                param_spec_json='{"a":{"min":2,"max":12},"b":{"min":2,"max":12}}',
                checker_type="numeric",
                checker_config_json='{"kind":"binary","op":"+","left":"a","right":"b"}',
                assignable_by_teacher=False,
                counts_toward_lesson_practice=True,
            ),
            TaskTemplate(
                lesson_id=l2.id,
                sort_order=1,
                title="Вычитание",
                prompt_template="Сколько будет {{a}} − {{b}}?",
                param_spec_json='{"a":{"min":10,"max":25},"b":{"min":1,"max":9}}',
                checker_type="numeric",
                checker_config_json='{"kind":"binary","op":"-","left":"a","right":"b"}',
                assignable_by_teacher=False,
                counts_toward_lesson_practice=True,
            ),
        ]
    )

    klass = CourseClass(name="5 «А»", teacher_id=teacher.id, created_at=_now_iso())
    db.add(klass)
    db.flush()
    db.add(ClassMember(class_id=klass.id, user_id=child.id, joined_at=_now_iso()))
    db.add(
        ClassInvite(
            class_id=klass.id,
            token=new_invite_token(),
            invite_code=new_invite_code(),
            created_at=_now_iso(),
        )
    )

    db.commit()


def _retire_mascot_items_by_slug(db: Session, slugs: tuple[str, ...]) -> None:
    """Удаляет предметы из каталога и снимает их с экипировки / инвентаря."""
    for slug in slugs:
        item = db.query(MascotItem).filter(MascotItem.slug == slug).first()
        if not item:
            continue
        iid = item.id
        eqs = (
            db.query(UserMascotEquipped)
            .filter(
                (UserMascotEquipped.skin_item_id == iid)
                | (UserMascotEquipped.hat_item_id == iid)
                | (UserMascotEquipped.accessory_item_id == iid)
            )
            .all()
        )
        for eq in eqs:
            if eq.skin_item_id == iid:
                eq.skin_item_id = None
            if eq.hat_item_id == iid:
                eq.hat_item_id = None
            if eq.accessory_item_id == iid:
                eq.accessory_item_id = None
        db.query(UserMascotInventory).filter(UserMascotInventory.item_id == iid).delete(
            synchronize_session=False
        )
        db.delete(item)


def ensure_mascot_catalog(db: Session) -> None:
    """Синхронизирует каталог маскота с актуальным набором предметов."""
    _retire_mascot_items_by_slug(db, ("skin-blue", "skin-gold"))
    rows = [
        ("skin-academy", "Космическая академия", 40, "skin"),
        ("skin-knight", "Тёмный рыцарь", 80, "skin"),
        ("hat-party", "Праздничная шляпа", 15, "hat"),
    ]
    for slug, name, price, slot in rows:
        existing = db.query(MascotItem).filter(MascotItem.slug == slug).first()
        if existing:
            existing.name = name
            existing.price = price
            existing.slot = slot
        else:
            db.add(MascotItem(slug=slug, name=name, price=price, slot=slot))
    db.commit()
