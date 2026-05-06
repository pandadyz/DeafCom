from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.chat_ws import router as chat_ws_router
from app.api.routes.sign import router as sign_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(chat_router)
api_router.include_router(chat_ws_router)
api_router.include_router(sign_router)

