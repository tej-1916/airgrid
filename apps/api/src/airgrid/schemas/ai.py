from enum import Enum
from typing import Optional, Dict
from pydantic import BaseModel, Field


class PromptCategory(str, Enum):
    DIAGNOSTIC = "diagnostic"
    OPTIMIZATION_SUMMARY = "optimization_summary"
    ANOMALY_ANALYSIS = "anomaly_analysis"


class AIGenerateRequest(BaseModel):
    category: PromptCategory = Field(default=PromptCategory.DIAGNOSTIC)
    prompt: str = Field(..., min_length=1, max_length=10000)
    requested_model: Optional[str] = Field(default=None, max_length=200)
    allow_external: bool = False
    temperature: Optional[float] = Field(default=0.2, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=512, ge=16, le=4096)


class TokenUsage(BaseModel):
    prompt: int = Field(default=0, ge=0)
    completion: int = Field(default=0, ge=0)
    total: int = Field(default=0, ge=0)


class AIGenerateResponse(BaseModel):
    request_id: str
    status: str  # "success", "failed", "unconfigured", "timeout"
    prompt_category: PromptCategory
    requested_model: str
    verified_model: Optional[str] = None
    is_verified_execution: bool = False
    fallback_detected: bool = False
    duration_ms: int = 0
    output_text: str
    tokens: TokenUsage = Field(default_factory=TokenUsage)
    error_message: Optional[str] = None
