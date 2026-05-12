from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from models import MessageStatus, MessageType


class SendMessageRequest(BaseModel):
    receiver_id: UUID
    content: str = Field(min_length=1, max_length=2000)
    message_type: MessageType = MessageType.TEXT


class EditMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class RecallMessageResponse(BaseModel):
    message_id: UUID
    is_recalled: bool
    recalled_at: datetime


class MarkReadRequest(BaseModel):
    peer_id: UUID


class MarkReadResponse(BaseModel):
    updated_count: int
    peer_id: UUID


class MessagePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    sender_id: UUID
    receiver_id: UUID
    content: str
    message_type: MessageType
    status: MessageStatus
    version: int
    is_recalled: bool
    created_at: datetime
    updated_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None


class MessageListResponse(BaseModel):
    items: list[MessagePublic]
    next_cursor: datetime | None
    has_more: bool


class ConversationFriend(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    username: str
    created_at: datetime


class ConversationItem(BaseModel):
    conversation_id: UUID
    friend: ConversationFriend
    last_message_at: datetime
    created_at: datetime


class ConversationListResponse(BaseModel):
    conversations: list[ConversationItem]

