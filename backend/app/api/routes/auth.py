from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.api.deps.auth import get_current_user
from app.db.session import get_session
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserPublic
from app.services.auth_service import login_user, register_user
from models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(
    payload: RegisterRequest,
    session: Session = Depends(get_session),
) -> AuthResponse:
    return register_user(session, payload.username, payload.password)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    session: Session = Depends(get_session),
) -> AuthResponse:
    return login_user(session, payload.username, payload.password)


@router.get("/me", response_model=UserPublic)
async def me(current_user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(current_user)


@router.get("/users", response_model=list[UserPublic])
async def get_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> list[UserPublic]:
    statement = select(User).where(User.id != current_user.id).order_by(User.username)
    users = session.exec(statement).all()
    return [UserPublic.model_validate(user) for user in users]

