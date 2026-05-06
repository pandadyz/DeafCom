from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket


class ChatConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[user_id].add(websocket)

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        sockets = self._connections.get(user_id)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: UUID, payload: dict) -> None:
        sockets = list(self._connections.get(user_id, set()))
        for socket in sockets:
            await socket.send_json(payload)


chat_ws_manager = ChatConnectionManager()

