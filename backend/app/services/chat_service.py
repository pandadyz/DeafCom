from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlmodel import Session, select

from models import Conversation, Friendship, Message, MessageEditHistory, MessageStatus, MessageType, User

MESSAGE_MAX_LEN = 2000


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_content(content: str) -> str:
    normalized = content.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_message")
    if len(normalized) > MESSAGE_MAX_LEN:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message_too_long")
    return normalized


def _pair_key(user_a: UUID, user_b: UUID) -> str:
    a, b = sorted([str(user_a), str(user_b)])
    return f"{a}:{b}"


def _get_user_or_404(session: Session, user_id: UUID) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")
    return user


def _check_friendship(session: Session, user_a_id: UUID, user_b_id: UUID) -> bool:
    statement = select(Friendship).where(
        or_(
            and_(Friendship.user_a_id == user_a_id, Friendship.user_b_id == user_b_id),
            and_(Friendship.user_a_id == user_b_id, Friendship.user_b_id == user_a_id),
        )
    )
    return session.exec(statement).first() is not None


def get_or_create_conversation(session: Session, current_user_id: UUID, peer_id: UUID) -> Conversation:
    if current_user_id == peer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_chat_with_self")

    _get_user_or_404(session, peer_id)

    # Check if users are friends
    if not _check_friendship(session, current_user_id, peer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="must_be_friends_to_chat")

    key = _pair_key(current_user_id, peer_id)
    statement = select(Conversation).where(Conversation.pair_key == key)
    conversation = session.exec(statement).first()
    if conversation:
        return conversation

    a, b = sorted([current_user_id, peer_id], key=lambda item: str(item))
    conversation = Conversation(
        user_a_id=a,
        user_b_id=b,
        pair_key=key,
    )
    session.add(conversation)
    session.commit()
    session.refresh(conversation)
    return conversation


def send_message(
    session: Session,
    sender_id: UUID,
    receiver_id: UUID,
    content: str,
    message_type: MessageType,
) -> Message:
    normalized = _normalize_content(content)
    conversation = get_or_create_conversation(session, sender_id, receiver_id)
    now = _utc_now()
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=normalized,
        message_type=message_type,
        status=MessageStatus.SENT,
        created_at=now,
        updated_at=now,
    )
    conversation.last_message_at = now
    session.add(message)
    session.add(conversation)
    session.commit()
    session.refresh(message)
    return message


def list_messages_between_users(
    session: Session,
    current_user_id: UUID,
    peer_id: UUID,
    limit: int,
    cursor: datetime | None,
) -> tuple[list[Message], datetime | None, bool]:
    conversation = get_or_create_conversation(session, current_user_id, peer_id)

    statement = (
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .where(
            or_(
                and_(Message.sender_id == current_user_id, Message.receiver_id == peer_id),
                and_(Message.sender_id == peer_id, Message.receiver_id == current_user_id),
            )
        )
    )
    if cursor is not None:
        statement = statement.where(Message.created_at < cursor)

    statement = statement.order_by(Message.created_at.desc()).limit(limit + 1)
    rows = list(session.exec(statement).all())
    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = page[-1].created_at if has_more and page else None

    # UI renders oldest -> newest
    page.reverse()
    return page, next_cursor, has_more


def _get_message_or_404(session: Session, message_id: UUID) -> Message:
    message = session.get(Message, message_id)
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="message_not_found")
    return message


def edit_message(session: Session, current_user_id: UUID, message_id: UUID, new_content: str) -> Message:
    message = _get_message_or_404(session, message_id)
    if message.sender_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="edit_not_allowed")
    if message.is_recalled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message_already_recalled")

    normalized = _normalize_content(new_content)
    if normalized == message.content:
        return message

    history = MessageEditHistory(
        message_id=message.id,
        old_content=message.content,
        new_content=normalized,
        edited_by=current_user_id,
    )
    message.content = normalized
    message.version += 1
    message.edited_at = _utc_now()
    message.updated_at = message.edited_at

    session.add(history)
    session.add(message)
    session.commit()
    session.refresh(message)
    return message


def recall_message(session: Session, current_user_id: UUID, message_id: UUID) -> Message:
    message = _get_message_or_404(session, message_id)
    if message.sender_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="recall_not_allowed")
    if message.is_recalled:
        return message

    now = _utc_now()
    message.is_recalled = True
    message.deleted_at = now
    message.updated_at = now
    message.content = "This message was recalled."

    session.add(message)
    session.commit()
    session.refresh(message)
    return message


def mark_messages_as_read(session: Session, current_user_id: UUID, peer_id: UUID) -> int:
    conversation = get_or_create_conversation(session, current_user_id, peer_id)
    statement = (
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .where(Message.sender_id == peer_id)
        .where(Message.receiver_id == current_user_id)
        .where(Message.status != MessageStatus.READ)
    )
    rows = list(session.exec(statement).all())
    if not rows:
        return 0

    now = _utc_now()
    for item in rows:
        item.status = MessageStatus.READ
        item.updated_at = now
        session.add(item)
    session.commit()
    return len(rows)

