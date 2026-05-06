import os
from sqlmodel import SQLModel, Session, create_engine

# Chuỗi kết nối có thể override bằng env để tiện deploy.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://pandadyz:123123hung@localhost:5432/chat_db",
)

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session