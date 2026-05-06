from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlmodel import Session

from app.core.security import decode_access_token
from app.db.session import get_session
from app.services.auth_service import get_user_by_id
from models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid_token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")
        if not subject:
            raise unauthorized
        user_id = UUID(subject)
    except (JWTError, ValueError):
        raise unauthorized

    user = get_user_by_id(session, user_id)
    if user is None:
        raise unauthorized
    return user

