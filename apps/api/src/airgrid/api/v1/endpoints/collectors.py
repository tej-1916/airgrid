import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from pydantic import ValidationError
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import require_admin, require_authenticated, verify_csrf
from airgrid.core.database import get_db
from airgrid.models.all_models import User
from airgrid.schemas.collectors import (
    CollectorCreate, CollectorCredentials, CollectorIngestResponse, CollectorResponse, CollectorSubmission,
)
from airgrid.schemas.diagnostics import TelemetrySnapshotResponse
from airgrid.services import collector_service
from airgrid.services.diagnostic_service import snapshot_to_response

router = APIRouter(prefix="/collectors", tags=["Registered Collectors"])


@router.get("", response_model=list[CollectorResponse])
async def list_collectors(db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    return await collector_service.list_collectors(db, user)


@router.post("", response_model=CollectorCredentials, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(verify_csrf)])
async def register_collector(req: CollectorCreate, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    collector, secret = await collector_service.register(db, req, user)
    return CollectorCredentials(collector=CollectorResponse.model_validate(collector), secret=secret)


@router.post("/{collector_id}/revoke", response_model=CollectorResponse, dependencies=[Depends(verify_csrf)])
async def revoke_collector(collector_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    return await collector_service.revoke(db, collector_id, user)


@router.post("/{collector_id}/rotate", response_model=CollectorCredentials, dependencies=[Depends(verify_csrf)])
async def rotate_collector_secret(collector_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    collector, secret = await collector_service.rotate(db, collector_id, user)
    return CollectorCredentials(collector=CollectorResponse.model_validate(collector), secret=secret)


@router.get("/{collector_id}/observations", response_model=list[TelemetrySnapshotResponse])
async def list_collector_observations(collector_id: uuid.UUID, limit: int = Query(50, ge=1, le=500),
                                      db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    return [snapshot_to_response(s) for s in await collector_service.list_observations(db, collector_id, limit, user)]


@router.post("/ingest", response_model=CollectorIngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest_signed_observation(request: Request, db: AsyncSession = Depends(get_db)):
    """Signed collector submissions only; no session cookie is accepted or required."""
    collector_service.require_trusted_transport(request)
    body = await collector_service.read_bounded_body(request)
    collector, nonce = await collector_service.authenticate(db, request, body)
    try:
        payload = CollectorSubmission.model_validate_json(body)
    except ValidationError as exc:
        await collector_service._reject(db, collector, "rejected_invalid")
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False, include_input=False))
    snapshot = await collector_service.ingest(db, collector, nonce, payload)
    return CollectorIngestResponse(snapshot_id=snapshot.id, collector_id=collector.id,
                                   collection_status=snapshot.collection_status, collected_at=snapshot.collected_at,
                                   received_at=snapshot.raw_details["received_at"])
