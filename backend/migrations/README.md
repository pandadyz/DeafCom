# Migrations

This folder contains baseline schema migration artifacts for the chat domain.

- `0001_chat_schema.sql`: Initial SQL schema for users, conversations, messages, and message edit history.
- Apply with your preferred SQL client or `psql` before running the app in non-dev environments.

For local development, `python init_db.py` still works through SQLModel metadata creation.

