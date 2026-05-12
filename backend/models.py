from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MessageType(str, Enum):
    TEXT = "text"
    SIGN_TEXT = "sign_text"


class MessageStatus(str, Enum):
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    username: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    password_hash: str = Field(sa_column=Column(String(255), nullable=False))
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    last_seen_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("pair_key", name="uq_conversations_pair_key"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_a_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    user_b_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    pair_key: str = Field(sa_column=Column(String(128), nullable=False, index=True))
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    last_message_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))


class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    conversation_id: UUID = Field(foreign_key="conversations.id", nullable=False, index=True)
    sender_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    receiver_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    content: str = Field(sa_column=Column(String(2000), nullable=False))
    message_type: MessageType = Field(
        default=MessageType.TEXT,
        sa_column=Column(SAEnum(MessageType, name="message_type_enum"), nullable=False),
    )
    status: MessageStatus = Field(
        default=MessageStatus.SENT,
        sa_column=Column(SAEnum(MessageStatus, name="message_status_enum"), nullable=False),
    )
    version: int = Field(
        default=1,
        sa_column=Column(Integer, nullable=False),
    )
    is_recalled: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, default=False))
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))
    updated_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    edited_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    deleted_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


class MessageEditHistory(SQLModel, table=True):
    __tablename__ = "message_edit_history"

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    message_id: UUID = Field(foreign_key="messages.id", nullable=False, index=True)
    old_content: str = Field(sa_column=Column(String(2000), nullable=False))
    new_content: str = Field(sa_column=Column(String(2000), nullable=False))
    edited_by: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    edited_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False, index=True))


class FriendRequestStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class FriendRequest(SQLModel, table=True):
    __tablename__ = "friend_requests"
    __table_args__ = (UniqueConstraint("sender_id", "receiver_id", name="uq_friend_requests_sender_receiver"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    sender_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    receiver_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    status: FriendRequestStatus = Field(
        default=FriendRequestStatus.PENDING,
        sa_column=Column(SAEnum(FriendRequestStatus, name="friend_request_status_enum"), nullable=False),
    )
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class Friendship(SQLModel, table=True):
    __tablename__ = "friendships"
    __table_args__ = (UniqueConstraint("user_a_id", "user_b_id", name="uq_friendships_user_a_user_b"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_a_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    user_b_id: UUID = Field(foreign_key="users.id", nullable=False, index=True)
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))