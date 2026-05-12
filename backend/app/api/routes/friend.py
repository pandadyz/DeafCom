from uuid import UUID

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.api.deps.auth import get_current_user
from app.db.session import get_session
from app.schemas.friend import (
    FriendListResponse,
    FriendPublic,
    FriendRequestListResponse,
    FriendRequestResponse,
    RespondFriendRequestRequest,
    SendFriendRequestRequest,
)
from app.services.friend_service import (
    get_friend_requests,
    get_friends,
    respond_to_friend_request,
    send_friend_request,
)
from models import User

router = APIRouter(prefix="/friends", tags=["friends"])


@router.post("/request", response_model=FriendRequestResponse)
async def send_friend_request_endpoint(
    payload: SendFriendRequestRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FriendRequestResponse:
    friend_request = send_friend_request(
        session=session,
        sender_id=current_user.id,
        receiver_id=payload.receiver_id,
    )
    return FriendRequestResponse.model_validate(friend_request)


@router.get("/requests", response_model=FriendRequestListResponse)
async def get_friend_requests_endpoint(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FriendRequestListResponse:
    requests = get_friend_requests(session=session, current_user_id=current_user.id)
    return FriendRequestListResponse(
        requests=[FriendRequestResponse.model_validate(req) for req in requests]
    )


@router.post("/requests/{request_id}/respond", response_model=FriendRequestResponse)
async def respond_to_friend_request_endpoint(
    request_id: UUID,
    payload: RespondFriendRequestRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FriendRequestResponse:
    friend_request = respond_to_friend_request(
        session=session,
        current_user_id=current_user.id,
        request_id=request_id,
        accept=payload.accept,
    )
    return FriendRequestResponse.model_validate(friend_request)


@router.get("/", response_model=FriendListResponse)
async def get_friends_endpoint(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FriendListResponse:
    friends = get_friends(session=session, current_user_id=current_user.id)
    return FriendListResponse(
        friends=[FriendPublic.model_validate(friend) for friend in friends]
    )
