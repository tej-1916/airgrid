import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.api.deps import require_admin, require_authenticated, require_engineer_or_admin, verify_csrf
from airgrid.core.database import get_db
from airgrid.models.all_models import User
from airgrid.schemas.analyst import AnalystRequest, AnalystResponse
from airgrid.services import analyst_evidence
from airgrid.services.analyst_evidence import AskRequest, CompareRequest
from airgrid.services.analyst_service import analyst_service

router = APIRouter(prefix='/analyst', tags=['AirGrid Analyst'])


@router.post('/analyze', response_model=AnalystResponse, dependencies=[Depends(verify_csrf)])
async def analyze_recorded_report(req: AnalystRequest, db: AsyncSession = Depends(get_db),
                                  user: User = Depends(require_engineer_or_admin)):
    result = await analyst_service.analyze(db, req, user)
    citations = [{'source_id': e.source_id, 'timestamp': e.timestamp} for e in result.evidence]
    result.history_id = str(await analyst_evidence.record(db, user, 'report_analysis', None, {'report_id': str(req.report_id)}, {
        **result.model_dump(mode='json'), 'citations': citations, 'outcome': 'answered' if result.evidence else 'insufficient_evidence',
        'provider_reported_model': result.provider_reported_model}))
    return result


@router.post('/ask', dependencies=[Depends(verify_csrf)])
async def ask_question(req: AskRequest, db: AsyncSession = Depends(get_db), user: User = Depends(require_engineer_or_admin)):
    """Answer from persisted evidence with citations; optional consented, grounding-checked gateway rephrasing."""
    return await analyst_evidence.ask(db, req, user)


@router.post('/ask/preview', dependencies=[Depends(verify_csrf)])
async def preview_external_payload(req: AskRequest, db: AsyncSession = Depends(get_db),
                                   user: User = Depends(require_engineer_or_admin)):
    """Shows exactly what would be sent to the AI Gateway; sends nothing and stores nothing."""
    await analyst_evidence.authorize_scope(db, user, req)
    local = await analyst_evidence.local_answer(db, req)
    return {'local_answer': local, **analyst_evidence.preview(req, local)}


@router.post('/compare', dependencies=[Depends(verify_csrf)])
async def compare_windows(req: CompareRequest, db: AsyncSession = Depends(get_db), user: User = Depends(require_engineer_or_admin)):
    return await analyst_evidence.compare(db, req, user)


@router.get('/history')
async def list_analysis_history(kind: str | None = Query(None, max_length=32), limit: int = Query(50, ge=1, le=200),
                                db: AsyncSession = Depends(get_db), user: User = Depends(require_authenticated)):
    return await analyst_evidence.list_history(db, kind, limit, user)


@router.get('/history/{record_id}')
async def get_analysis_record(record_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                              user: User = Depends(require_authenticated)):
    return await analyst_evidence.get_history(db, record_id, user)


@router.delete('/history/{record_id}', dependencies=[Depends(verify_csrf)])
async def delete_analysis_record(record_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    await analyst_evidence.delete_history(db, record_id, user)
    return {'ok': True}
