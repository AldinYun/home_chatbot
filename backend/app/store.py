import uuid

from .database import DEFAULT_SYSTEM_PROMPT, get_db, row_to_dict
from .schemas import SessionCreate, SessionUpdate


def list_sessions() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT s.*, (
                SELECT content FROM messages m
                WHERE m.session_id = s.id
                ORDER BY m.id DESC
                LIMIT 1
            ) AS last_message
            FROM sessions s
            ORDER BY s.updated_at DESC
            """
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def create_session(payload: SessionCreate) -> dict:
    session_id = str(uuid.uuid4())
    system_prompt = payload.system_prompt or DEFAULT_SYSTEM_PROMPT
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, title, system_prompt) VALUES (?, ?, ?)",
            (session_id, payload.title, system_prompt),
        )
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    return row_to_dict(row)


def get_session(session_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    return row_to_dict(row) if row else None


def update_session(session_id: str, payload: SessionUpdate) -> dict | None:
    current = get_session(session_id)
    if not current:
        return None
    title = payload.title if payload.title is not None else current["title"]
    system_prompt = payload.system_prompt if payload.system_prompt is not None else current["system_prompt"]
    with get_db() as conn:
        conn.execute(
            "UPDATE sessions SET title = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (title, system_prompt, session_id),
        )
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    return row_to_dict(row)


def delete_session(session_id: str) -> None:
    with get_db() as conn:
        conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


def list_messages(session_id: str) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY id",
            (session_id,),
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def add_message(session_id: str, role: str, content: str) -> dict:
    with get_db() as conn:
        cursor = conn.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
            (session_id, role, content),
        )
        conn.execute("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (session_id,))
        row = conn.execute("SELECT id, role, content, created_at FROM messages WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_dict(row)


def maybe_title_session(session_id: str, user_message: str) -> None:
    session = get_session(session_id)
    if not session or session["title"] != "새 대화":
        return
    title = user_message.strip().replace("\n", " ")[:30] or "새 대화"
    update_session(session_id, SessionUpdate(title=title))

