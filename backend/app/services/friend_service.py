from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from models import FriendRequest, FriendRequestStatus, Friendship, User, Conversation


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _get_user_or_404(session: Session, user_id: UUID) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")
    return user


def _get_pair_key(user_a: UUID, user_b: UUID) -> str:
    a, b = sorted([str(user_a), str(user_b)])
    return f"{a}:{b}"


def _create_conversation_if_not_exists(session: Session, user_a_id: UUID, user_b_id: UUID) -> None:
    """Create conversation between users if it doesn't exist"""
    key = _get_pair_key(user_a_id, user_b_id)
    statement = select(Conversation).where(Conversation.pair_key == key)
    existing_conversation = session.exec(statement).first()
    
    if not existing_conversation:
        a, b = sorted([user_a_id, user_b_id], key=lambda item: str(item))
        conversation = Conversation(
            user_a_id=a,
            user_b_id=b,
            pair_key=key,
        )
        session.add(conversation)


def _get_friend_request_or_404(session: Session, request_id: UUID) -> FriendRequest:
    request = session.get(FriendRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="friend_request_not_found")
    return request


def send_friend_request(session: Session, sender_id: UUID, receiver_id: UUID) -> FriendRequest:
    if sender_id == receiver_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_send_request_to_self")

    _get_user_or_404(session, receiver_id)

    # Check if already friends
    friendship_statement = select(Friendship).where(
        or_(
            and_(Friendship.user_a_id == sender_id, Friendship.user_b_id == receiver_id),
            and_(Friendship.user_a_id == receiver_id, Friendship.user_b_id == sender_id),
        )
    )
    existing_friendship = session.exec(friendship_statement).first()
    if existing_friendship:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="already_friends")

    # Check if request already exists
    request_statement = select(FriendRequest).where(
        or_(
            and_(FriendRequest.sender_id == sender_id, FriendRequest.receiver_id == receiver_id),
            and_(FriendRequest.sender_id == receiver_id, FriendRequest.receiver_id == sender_id),
        )
    )
    existing_request = session.exec(request_statement).first()
    if existing_request:
        if existing_request.status == FriendRequestStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="friend_request_already_pending")
        elif existing_request.status == FriendRequestStatus.ACCEPTED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="already_friends")
        else:
            # Update existing rejected request to pending
            existing_request.status = FriendRequestStatus.PENDING
            existing_request.updated_at = _utc_now()
            session.add(existing_request)
            session.commit()
            session.refresh(existing_request)
            return existing_request

    # Create new friend request
    friend_request = FriendRequest(
        sender_id=sender_id,
        receiver_id=receiver_id,
        status=FriendRequestStatus.PENDING,
    )
    session.add(friend_request)
    session.commit()
    session.refresh(friend_request)
    return friend_request


def respond_to_friend_request(
    session: Session, current_user_id: UUID, request_id: UUID, accept: bool
) -> FriendRequest:
    friend_request = _get_friend_request_or_404(session, request_id)

    if friend_request.receiver_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_authorized_to_respond")

    if friend_request.status != FriendRequestStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="request_not_pending")

    if accept:
        # Create friendship
        a, b = sorted([friend_request.sender_id, friend_request.receiver_id], key=lambda item: str(item))
        friendship = Friendship(user_a_id=a, user_b_id=b)
        session.add(friendship)

        # Create conversation for the new friends
        _create_conversation_if_not_exists(session, friend_request.sender_id, friend_request.receiver_id)

        # Update request status
        friend_request.status = FriendRequestStatus.ACCEPTED
    else:
        friend_request.status = FriendRequestStatus.REJECTED

    friend_request.updated_at = _utc_now()
    session.add(friend_request)
    session.commit()
    session.refresh(friend_request)
    return friend_request


def get_friend_requests(session: Session, current_user_id: UUID) -> list[FriendRequest]:
    statement = (
        select(FriendRequest)
        .where(FriendRequest.receiver_id == current_user_id)
        .where(FriendRequest.status == FriendRequestStatus.PENDING)
        .order_by(FriendRequest.created_at.desc())
    )
    return list(session.exec(statement).all())


def get_friends(session: Session, current_user_id: UUID) -> list[User]:
    statement = (
        select(User)
        .join(Friendship, or_(Friendship.user_a_id == User.id, Friendship.user_b_id == User.id))
        .where(
            or_(Friendship.user_a_id == current_user_id, Friendship.user_b_id == current_user_id),
            User.id != current_user_id,
        )
        .order_by(User.username)
    )
    return list(session.exec(statement).all())
