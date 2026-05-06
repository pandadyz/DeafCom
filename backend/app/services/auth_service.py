from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.schemas.auth import AuthResponse, UserPublic
from models import User


def _normalize_username(username: str) -> str:
    return username.strip().lower()


def get_user_by_username(session: Session, username: str) -> User | None:
    normalized = _normalize_username(username)
    query = select(User).where(User.username == normalized)
    return session.exec(query).first()


def get_user_by_id(session: Session, user_id: UUID) -> User | None:
    query = select(User).where(User.id == user_id)
    return session.exec(query).first()


def register_user(session: Session, username: str, password: str) -> AuthResponse:
    normalized = _normalize_username(username)
    existing = get_user_by_username(session, normalized)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="username_already_exists")

    user = User(
        username=normalized,
        password_hash=hash_password(password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(str(user.id))
    return AuthResponse(
        access_token=token,
        expires_in_seconds=settings.jwt_access_token_expire_minutes * 60,
        user=UserPublic.model_validate(user),
    )


def login_user(session: Session, username: str, password: str) -> AuthResponse:
    user = get_user_by_username(session, username)
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

    user.last_seen_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(str(user.id))
    return AuthResponse(
        access_token=token,
        expires_in_seconds=settings.jwt_access_token_expire_minutes * 60,
        user=UserPublic.model_validate(user),
    )

