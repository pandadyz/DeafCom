from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.api.deps.auth import get_current_user
from app.db.session import get_session
from app.schemas.chat import (
    ConversationListResponse,
    EditMessageRequest,
    MarkReadRequest,
    MarkReadResponse,
    MessageListResponse,
    MessagePublic,
    RecallMessageResponse,
    SendMessageRequest,
)
from app.services.chat_service import (
    edit_message,
    list_messages_between_users,
    mark_messages_as_read,
    recall_message,
    send_message,
)
from app.services.conversation_service import get_user_conversations
from models import User

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/conversations", response_model=ConversationListResponse)
async def get_conversations(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ConversationListResponse:
    conversations = get_user_conversations(session=session, current_user_id=current_user.id)
    return ConversationListResponse(conversations=conversations)


@router.post("/messages", response_model=MessagePublic)
async def create_message(
    payload: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MessagePublic:
    message = send_message(
        session=session,
        sender_id=current_user.id,
        receiver_id=payload.receiver_id,
        content=payload.content,
        message_type=payload.message_type,
    )
    return MessagePublic.model_validate(message)


@router.get("/messages/{peer_id}", response_model=MessageListResponse)
async def get_messages(
    peer_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: datetime | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MessageListResponse:
    rows, next_cursor, has_more = list_messages_between_users(
        session=session,
        current_user_id=current_user.id,
        peer_id=peer_id,
        limit=limit,
        cursor=cursor,
    )
    return MessageListResponse(
        items=[MessagePublic.model_validate(item) for item in rows],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.patch("/messages/{message_id}", response_model=MessagePublic)
async def update_message(
    message_id: UUID,
    payload: EditMessageRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MessagePublic:
    message = edit_message(
        session=session,
        current_user_id=current_user.id,
        message_id=message_id,
        new_content=payload.content,
    )
    return MessagePublic.model_validate(message)


@router.post("/messages/{message_id}/recall", response_model=RecallMessageResponse)
async def recall_message_endpoint(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> RecallMessageResponse:
    message = recall_message(session=session, current_user_id=current_user.id, message_id=message_id)
    return RecallMessageResponse(
        message_id=message.id,
        is_recalled=message.is_recalled,
        recalled_at=message.deleted_at or message.updated_at,
    )


@router.post("/messages/read", response_model=MarkReadResponse)
async def mark_read(
    payload: MarkReadRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MarkReadResponse:
    updated_count = mark_messages_as_read(
        session=session,
        current_user_id=current_user.id,
        peer_id=payload.peer_id,
    )
    return MarkReadResponse(updated_count=updated_count, peer_id=payload.peer_id)

