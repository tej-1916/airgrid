import uuid
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class AnalystRequest(BaseModel):
    report_id: uuid.UUID
    use_gateway: bool = False
    allow_external: bool = False


class AnalystSelection(BaseModel):
    """The provider may select known findings, never author new measurement claims."""
    model_config = ConfigDict(extra='forbid')
    finding_ids: list[str] = Field(max_length=20)


class EvidenceItem(BaseModel):
    source_id: str
    timestamp: str | None
    metric: str
    value: float | str
    unit: str


class AnalystResponse(BaseModel):
    report_id: uuid.UUID
    mode: Literal['deterministic', 'gateway_assisted'] = 'deterministic'
    summary: str
    evidence: list[EvidenceItem]
    findings: list[dict]
    limitations: list[str]
    gateway_status: str = 'not_requested'
    provider_reported_model: str | None = None
    confidence: str = 'Observations describe this sample only; causal diagnosis requires independent verification.'
