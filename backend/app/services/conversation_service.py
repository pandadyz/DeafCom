from uuid import UUID
from sqlalchemy import or_
from sqlmodel import Session, select

from models import Conversation, User


def get_user_conversations(session: Session, current_user_id: UUID) -> list[dict]:
    """Get all conversations for current user with friend info"""
    statement = (
        select(Conversation, User)
        .join(User, or_(
            Conversation.user_a_id == User.id,
            Conversation.user_b_id == User.id
        ))
        .where(
            or_(
                Conversation.user_a_id == current_user_id,
                Conversation.user_b_id == current_user_id
            ),
            User.id != current_user_id
        )
        .order_by(Conversation.last_message_at.desc())
    )
    
    results = []
    for conversation, friend in session.exec(statement).all():
        results.append({
            "conversation_id": conversation.id,
            "friend": friend,
            "last_message_at": conversation.last_message_at,
            "created_at": conversation.created_at
        })
    
    return results
