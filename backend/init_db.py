#!/usr/bin/env python3
"""Script khởi tạo database schema cho chat."""
from database import create_db_and_tables
from models import Conversation, FriendRequest, Friendship, Message, MessageEditHistory, User

def main():
    print("Đang tạo database và chat tables...")
    try:
        create_db_and_tables()
        print("✅ Chat schema đã được tạo thành công!")
    except Exception as e:
        print(f"❌ Lỗi khi tạo database: {e}")

if __name__ == "__main__":
    main()
