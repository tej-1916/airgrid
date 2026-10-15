from datetime import datetime, timezone
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field


class DependencyHealth(BaseModel):
    status: str
    message: Optional[str] = None
    latency_ms: Optional[float] = None
    detail: Optional[str] = None


class AIGatewayHealth(BaseModel):
    status: str
    active_provider: str
    credentials_present: bool
    configured_model: str


class AutomationHealth(BaseModel):
    status: str
    signing_key_configured: bool
    webhook_url: str


class SystemHealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    uptime_seconds: float
    dependencies: Dict[str, Any]


class LivenessResponse(BaseModel):
    status: str = "ok"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
