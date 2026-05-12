from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from jose import JWTError
from sqlmodel import Session

from app.core.security import decode_access_token
from app.db.session import engine
from app.schemas.chat import MessagePublic
from app.services.auth_service import get_user_by_id
from app.services.chat_service import edit_message, mark_messages_as_read, recall_message, send_message
from app.services.chat_ws_manager import chat_ws_manager
from models import MessageType

router = APIRouter(tags=["chat-ws"])


def _parse_user_id(token: str | None) -> UUID | None:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")
        if not subject:
            return None
        return UUID(subject)
    except (JWTError, ValueError):
        return None


@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    user_id = _parse_user_id(token)
    if user_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    with Session(engine) as session:
        user = get_user_by_id(session, user_id)
        if user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    await chat_ws_manager.connect(user_id, websocket)
    try:
        await chat_ws_manager.send_to_user(
            user_id,
            {"event": "presence", "status": "connected", "user_id": str(user_id)},
        )
        while True:
            raw = await websocket.receive_json()
            event = raw.get("event")
            payload = raw.get("payload", {})
            with Session(engine) as session:
                if event == "message.send":
                    receiver_id = UUID(payload["receiver_id"])
                    message_type = MessageType(payload.get("message_type", MessageType.TEXT))
                    message = send_message(
                        session=session,
                        sender_id=user_id,
                        receiver_id=receiver_id,
                        content=payload.get("content", ""),
                        message_type=message_type,
                    )
                    message_payload = MessagePublic.model_validate(message).model_dump(mode="json")
                    await chat_ws_manager.send_to_user(user_id, {"event": "message.new", "payload": message_payload})
                    await chat_ws_manager.send_to_user(receiver_id, {"event": "message.new", "payload": message_payload})

                elif event == "message.edit":
                    message_id = UUID(payload["message_id"])
                    message = edit_message(
                        session=session,
                        current_user_id=user_id,
                        message_id=message_id,
                        new_content=payload.get("content", ""),
                    )
                    message_payload = MessagePublic.model_validate(message).model_dump(mode="json")
                    await chat_ws_manager.send_to_user(user_id, {"event": "message.updated", "payload": message_payload})
                    await chat_ws_manager.send_to_user(message.receiver_id, {"event": "message.updated", "payload": message_payload})

                elif event == "message.recall":
                    message_id = UUID(payload["message_id"])
                    message = recall_message(session=session, current_user_id=user_id, message_id=message_id)
                    response = {
                        "message_id": str(message.id),
                        "is_recalled": message.is_recalled,
                        "recalled_at": message.deleted_at.isoformat() if message.deleted_at else None,
                    }
                    await chat_ws_manager.send_to_user(user_id, {"event": "message.recalled", "payload": response})
                    await chat_ws_manager.send_to_user(message.receiver_id, {"event": "message.recalled", "payload": response})

                elif event == "message.read":
                    peer_id = UUID(payload["peer_id"])
                    updated_count = mark_messages_as_read(session=session, current_user_id=user_id, peer_id=peer_id)
                    receipt = {
                        "peer_id": str(peer_id),
                        "reader_id": str(user_id),
                        "updated_count": updated_count,
                    }
                    await chat_ws_manager.send_to_user(user_id, {"event": "message.read_receipt", "payload": receipt})
                    await chat_ws_manager.send_to_user(peer_id, {"event": "message.read_receipt", "payload": receipt})

                else:
                    await websocket.send_json({"event": "error", "error": "unknown_event"})
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        await websocket.send_json(
            jsonable_encoder({"event": "error", "error": str(exc)}),
        )
    finally:
        chat_ws_manager.disconnect(user_id, websocket)

