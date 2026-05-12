from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from models import FriendRequestStatus


class SendFriendRequestRequest(BaseModel):
    receiver_id: UUID


class FriendRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sender_id: UUID
    receiver_id: UUID
    status: FriendRequestStatus
    created_at: datetime
    updated_at: datetime


class RespondFriendRequestRequest(BaseModel):
    accept: bool


class FriendPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    username: str
    created_at: datetime


class FriendListResponse(BaseModel):
    friends: list[FriendPublic]


class FriendRequestListResponse(BaseModel):
    requests: list[FriendRequestResponse]
