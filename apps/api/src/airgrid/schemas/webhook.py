import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field


class EventSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class SystemEventType(str, Enum):
    NETWORK_DEGRADATION = "network.degradation"
    DEADZONE_DETECTED = "deadzone.detected"
    AI_DIAGNOSTIC_REPORT = "ai.diagnostic_report"
    ML_TRAINING_COMPLETED = "ml.training_completed"
    REPORT_WEEKLY_SUMMARY = "report.weekly_summary"
    EMAIL_DELIVERY_REQUEST = "email.delivery_request"
    AUTOMATION_FAILURE = "automation.failure"


class WebhookEventPayload(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: SystemEventType
    severity: EventSeverity
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data: Dict[str, Any] = Field(default_factory=dict)


class WebhookDeliveryResult(BaseModel):
    delivery_id: str
    event_id: str
    status: str  # "delivered", "simulated", "failed"
    status_code: Optional[int] = None
    attempt: int = 1
    duration_ms: int = 0
    error_message: Optional[str] = None
