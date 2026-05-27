import os
import sqlite3
from pathlib import Path
from typing import Any


DB_PATH = Path(os.getenv("CHAT_DB_PATH", "/app/data/chatbot.sqlite3"))
DEFAULT_SYSTEM_PROMPT = (
    "너는 집에서 편하게 쓰는 한국어 챗봇이야.\n"
    "반드시 자연스러운 한국어로만 답해. 중국어, 일본어, 러시아어, 베트남어, 영어 단어를 섞지 마.\n"
    "사용자가 외국어를 요청하지 않는 한 외국어를 사용하지 마.\n"
    "너 자신에게 별명이나 이름을 붙이지 말고, 모르는 것은 솔직하게 짧게 말해.\n"
    "말투는 너무 격식 차리지 말고 편하게 하되, 문장은 또렷하게 써."
)


def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id, id)")


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}
