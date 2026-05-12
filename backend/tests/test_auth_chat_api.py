from collections.abc import Generator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.db.session import get_session


def create_test_client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(chat_router)

    def override_get_session() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as client:
        yield client


def _register(client: TestClient, username: str, password: str) -> dict:
    response = client.post(
        "/auth/register",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_register_login_and_me() -> None:
    for client in create_test_client():
        register_data = _register(client, "alice", "password123")
        assert register_data["token_type"] == "bearer"
        assert register_data["user"]["username"] == "alice"

        login_response = client.post(
            "/auth/login",
            json={"username": "alice", "password": "password123"},
        )
        assert login_response.status_code == 200
        login_data = login_response.json()
        assert "access_token" in login_data

        me_response = client.get("/auth/me", headers=_auth_headers(login_data["access_token"]))
        assert me_response.status_code == 200
        assert me_response.json()["username"] == "alice"


def test_chat_send_list_pagination_and_read() -> None:
    for client in create_test_client():
        alice = _register(client, "alice", "password123")
        bob = _register(client, "bob", "password123")

        alice_headers = _auth_headers(alice["access_token"])
        bob_headers = _auth_headers(bob["access_token"])
        bob_id = bob["user"]["id"]
        alice_id = alice["user"]["id"]

        for content in ["hello", "how are you", "ping"]:
            response = client.post(
                "/chat/messages",
                headers=alice_headers,
                json={"receiver_id": bob_id, "content": content, "message_type": "text"},
            )
            assert response.status_code == 200

        page_1 = client.get(f"/chat/messages/{bob_id}?limit=2", headers=alice_headers)
        assert page_1.status_code == 200
        page_1_data = page_1.json()
        assert len(page_1_data["items"]) == 2
        assert page_1_data["has_more"] is True
        assert page_1_data["next_cursor"] is not None

        cursor = page_1_data["next_cursor"]
        page_2 = client.get(f"/chat/messages/{bob_id}?limit=2&cursor={cursor}", headers=alice_headers)
        assert page_2.status_code == 200
        page_2_data = page_2.json()
        assert len(page_2_data["items"]) == 1

        mark_read = client.post("/chat/messages/read", headers=bob_headers, json={"peer_id": alice_id})
        assert mark_read.status_code == 200
        assert mark_read.json()["updated_count"] == 3


def test_edit_recall_permissions() -> None:
    for client in create_test_client():
        alice = _register(client, "alice", "password123")
        bob = _register(client, "bob", "password123")

        alice_headers = _auth_headers(alice["access_token"])
        bob_headers = _auth_headers(bob["access_token"])
        bob_id = bob["user"]["id"]

        send_response = client.post(
            "/chat/messages",
            headers=alice_headers,
            json={"receiver_id": bob_id, "content": "original", "message_type": "text"},
        )
        assert send_response.status_code == 200
        message = send_response.json()
        message_id = message["id"]

        forbidden_edit = client.patch(
            f"/chat/messages/{message_id}",
            headers=bob_headers,
            json={"content": "hacked"},
        )
        assert forbidden_edit.status_code == 403

        ok_edit = client.patch(
            f"/chat/messages/{message_id}",
            headers=alice_headers,
            json={"content": "updated"},
        )
        assert ok_edit.status_code == 200
        edited = ok_edit.json()
        assert edited["content"] == "updated"
        assert edited["version"] == 2
        assert edited["edited_at"] is not None

        forbidden_recall = client.post(
            f"/chat/messages/{message_id}/recall",
            headers=bob_headers,
        )
        assert forbidden_recall.status_code == 403

        ok_recall = client.post(
            f"/chat/messages/{message_id}/recall",
            headers=alice_headers,
        )
        assert ok_recall.status_code == 200
        recalled = ok_recall.json()
        assert recalled["is_recalled"] is True

