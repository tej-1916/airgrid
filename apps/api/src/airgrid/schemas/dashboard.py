import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict


class DashboardSummaryResponse(BaseModel):
    selected_campus_id: Optional[uuid.UUID] = None
    selected_campus_name: Optional[str] = None
    total_campuses: int = 0
    total_buildings: int = 0
    total_floors: int = 0
    total_floor_plans: int = 0
    total_access_points: int = 0
    uncalibrated_floor_plans: int = 0
    database_connected: bool = True
    backend_version: str = "0.1.0"


class CampusInventoryItem(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    status: str
    address: Optional[str] = None
    buildings_count: int = 0
    floors_count: int = 0
    floor_plans_count: int = 0
    last_updated: datetime


class CampusInventoryResponse(BaseModel):
    total: int
    items: List[CampusInventoryItem]


class DashboardActivityItem(BaseModel):
    id: uuid.UUID
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    actor_id: Optional[uuid.UUID] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    payload: Dict[str, Any] = {}
    ip_address: Optional[str] = None
    created_at: datetime


class DashboardActivityResponse(BaseModel):
    items: List[DashboardActivityItem]


class ComponentStatus(BaseModel):
    name: str
    status: str  # "healthy" | "degraded" | "unconfigured" | "unavailable"
    description: str
    latency_ms: Optional[float] = None
    last_checked: datetime


class DashboardSystemStatusResponse(BaseModel):
    overall: str  # "operational" | "degraded" | "issues"
    components: List[ComponentStatus]
    timestamp: datetime
