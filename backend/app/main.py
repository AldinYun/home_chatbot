from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .model import stream_chat
from .schemas import ChatRequest, SessionCreate, SessionUpdate
from .store import add_message, create_session, delete_session, get_session, list_messages, list_sessions, maybe_title_session, update_session


app = FastAPI(title="Home Chatbot", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/sessions")
def sessions() -> dict[str, list[dict]]:
    return {"sessions": list_sessions()}


@app.post("/api/sessions")
def create(payload: SessionCreate) -> dict:
    return create_session(payload)


@app.get("/api/sessions/{session_id}")
def session_detail(session_id: str) -> dict:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session": session, "messages": list_messages(session_id)}


@app.patch("/api/sessions/{session_id}")
def patch_session(session_id: str, payload: SessionUpdate) -> dict:
    session = update_session(session_id, payload)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.delete("/api/sessions/{session_id}")
def remove_session(session_id: str) -> dict[str, bool]:
    delete_session(session_id)
    return {"ok": True}


@app.post("/api/chat/stream")
def chat(payload: ChatRequest) -> StreamingResponse:
    session = get_session(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    history = list_messages(payload.session_id) if payload.include_history else []
    add_message(payload.session_id, "user", payload.message)
    maybe_title_session(payload.session_id, payload.message)

    def generate():
        chunks: list[str] = []
        for chunk in stream_chat(
            session["system_prompt"],
            history,
            payload.message,
            payload.max_new_tokens,
            payload.temperature,
            payload.top_p,
        ):
            chunks.append(chunk)
            yield chunk
        add_message(payload.session_id, "assistant", "".join(chunks))

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


static_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
