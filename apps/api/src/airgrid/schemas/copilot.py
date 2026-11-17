import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Optional[str] = Field(default=None, max_length=150)
    model: Optional[str] = Field(default="auto", max_length=100)
    campus_id: Optional[uuid.UUID] = None


class ConversationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: Optional[str] = Field(default=None, min_length=1, max_length=150)
    model: Optional[str] = Field(default=None, min_length=1, max_length=100)


class ChatMessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=4000)
    model: Optional[str] = Field(default=None, max_length=100)
    include_network_context: bool = True


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    model_used: Optional[str] = None
    tokens_prompt: Optional[int] = None
    tokens_completion: Optional[int] = None
    duration_ms: Optional[int] = None
    citations: Optional[List[dict]] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    model: str
    campus_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    messages: List[ChatMessageResponse] = []


class ConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    model: str
    campus_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message_preview: Optional[str] = None


class ConversationListResponse(BaseModel):
    conversations: List[ConversationSummary]
    total: int
