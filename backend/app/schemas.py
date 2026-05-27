from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    title: str = "새 대화"
    system_prompt: str | None = None


class SessionUpdate(BaseModel):
    title: str | None = None
    system_prompt: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str = Field(min_length=1)
    max_new_tokens: int = Field(default=2048, ge=1, le=20000)
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    top_p: float = Field(default=1.0, ge=0.0, le=1.0)
