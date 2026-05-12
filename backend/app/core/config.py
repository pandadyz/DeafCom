from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    app_name: str = "SignDETR Backend"
    app_version: str = "0.1.0"
    allowed_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_access_token_expire_minutes: int = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "120"))


settings = Settings()

