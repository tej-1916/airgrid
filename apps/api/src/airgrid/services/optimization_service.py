"""Read-only survey decision support. Plans never configure infrastructure."""
import math
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError

from airgrid.models.all_models import (
    AccessPoint, AuditLog, Floor, FloorPlanAsset, NetworkTelemetrySnapshot, OptimizationPlan, SurveyMeasurement, User,
)
from airgrid.schemas.auth import UserRole


# Manual observations are usable evidence with lower assurance, never instrument-certified.
SURVEY_SOURCES = {'operator_reported', 'field_instrument_verified'}


def recommend_survey(measurements, floor_id, network_label, calibrated):
    eligible = [m for m in measurements if network_label and m.floor_id == floor_id and m.network_label == network_label
                and m.data_provenance in SURVEY_SOURCES and m.observed_at
                and math.isfinite(m.rssi_dbm) and -100 <= m.rssi_dbm <= -20
                and math.isfinite(m.normalized_x) and math.isfinite(m.normalized_y)
                and 0 <= m.normalized_x <= 1 and 0 <= m.normalized_y <= 1]
    now = datetime.now(timezone.utc)
    points = []
    for m in eligible:
        observed = m.observed_at if m.observed_at.tzinfo else m.observed_at.replace(tzinfo=timezone.utc)
        points.append({'source_id': str(m.id), 'session_id': str(m.survey_session_id),
                       'x': m.normalized_x, 'y': m.normalized_y, 'rssi_dbm': m.rssi_dbm,
                       'timestamp': observed.isoformat(), 'provenance': m.data_provenance,
                       'historical': (now - observed).total_seconds() > 900})
    weak = [p for p in points if p['rssi_dbm'] < -75]
    sessions = len({m.survey_session_id for m in eligible})
    occupied = {(min(3, int(m.normalized_x * 4)), min(3, int(m.normalized_y * 4))) for m in eligible}
    missing = [{'x': (x + .5) / 4, 'y': (y + .5) / 4} for x in range(4) for y in range(4) if (x, y) not in occupied]
    recommendations = []
    if weak:
        recommendations.append({
            'priority': 'high', 'title': 'Verify weak observed locations',
            'evidence_ids': [p['source_id'] for p in weak[:200]],
            'expected_benefit': 'More reliable coverage evidence',
            'required_evidence': 'Repeat observations on the same network, device and locations; verify AP positions and obstacles.',
            'validation': 'Compare repeated measured RSSI at the listed coordinates; no numerical improvement is predicted.'})
    if missing or sessions < 2 or not calibrated:
        recommendations.append({
            'priority': 'measurement_first', 'title': 'Collect missing spatial and session evidence',
            'evidence_ids': [p['source_id'] for p in points[:200]],
            'expected_benefit': 'Reduce uncertainty before planning infrastructure changes',
            'required_evidence': f'{len(missing)} of 16 sampling cells have no qualifying observation; independent sessions: {sessions}; calibrated: {calibrated}.',
            'validation': 'Calibrate the floor and collect an independent survey. Suggested cells are sampling locations, not confirmed dead zones.'})
    return {'sample_count': len(eligible), 'session_count': sessions, 'points': points[:1000],
            'weak_locations': weak[:200], 'suggested_measurements': missing,
            'recommendations': recommendations,
            'limitations': ['AP placement and wall attenuation are unknown. Candidate AP markers are speculative.',
                            'Sampling cells indicate missing observations, not measured coverage or accessible locations.',
                            'Operator reports are not instrument-verified. Controlled imports and estimated values are excluded.',
                            'No channel, transmit-power, credential or router configuration is changed.',
                            'At most 1000 observations and 200 weak locations are displayed; counts describe all selected observations.']}


async def get_optimization(db, floor_id, network_label):
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail='Floor not found.')
    result = await db.execute(select(SurveyMeasurement).where(SurveyMeasurement.floor_id == floor_id)
                              .order_by(SurveyMeasurement.observed_at.desc()).limit(10001))
    measurements = list(result.scalars())
    if len(measurements) > 10000:
        raise HTTPException(status_code=422, detail='More than 10000 floor observations; narrow the dataset before analysis.')
    networks = sorted({m.network_label for m in measurements if m.network_label and m.data_provenance in SURVEY_SOURCES})
    plan = (await db.execute(select(FloorPlanAsset).where(FloorPlanAsset.floor_id == floor_id))).scalar_one_or_none()
    calibrated = bool(plan and plan.is_calibrated and plan.scale_pixels_per_meter > 0)
    response = recommend_survey(measurements, floor_id, network_label, calibrated)
    aps = list((await db.execute(select(AccessPoint).where(AccessPoint.floor_id == floor_id).limit(500))).scalars())
    response['recommendations'] += ap_review(response['weak_locations'], aps, plan if calibrated else None)
    response['recommendations'] += await repeated_changes(db, floor_id)
    return {**response, 'floor_id': str(floor_id), 'network_label': network_label,
            'available_networks': networks, 'calibrated': calibrated,
            'access_points': [ap_row(a) for a in aps],
            'generated_at': datetime.now(timezone.utc).isoformat()}


def ap_review(weak, aps, plan):
    """Relates weak observations to manually registered AP positions by measured plan distance only."""
    if not weak:
        return []
    placed = [a for a in aps if a.x_coord is not None and a.y_coord is not None and a.status != 'retired']
    if not placed:
        return [{'priority': 'measurement_first', 'title': 'Register known AP positions',
                 'evidence_ids': [p['source_id'] for p in weak[:200]], 'expected_benefit': 'Relate weak observations to infrastructure',
                 'required_evidence': 'No registered AP has a floor-plan position on this floor.',
                 'validation': 'Record AP positions from installation records or a site walk; AirGrid does not discover APs.'}]
    if plan is None:
        return [{'priority': 'measurement_first', 'title': 'Calibrate the floor plan to measure AP distances',
                 'evidence_ids': [p['source_id'] for p in weak[:200]], 'expected_benefit': 'Physical distances between weak observations and APs',
                 'required_evidence': 'A calibrated plan scale is required.', 'validation': 'Calibrate, then review this recommendation again.'}]
    w_m, h_m = plan.pixel_width / plan.scale_pixels_per_meter, plan.pixel_height / plan.scale_pixels_per_meter
    nearest = []
    for p in weak[:200]:
        ap, d = min(((a, math.hypot((p['x'] - a.x_coord) * w_m, (p['y'] - a.y_coord) * h_m)) for a in placed), key=lambda t: t[1])
        nearest.append({'source_id': p['source_id'], 'rssi_dbm': p['rssi_dbm'], 'nearest_ap': ap.name, 'distance_m': round(d, 1)})
    return [{'priority': 'review', 'title': 'Review AP coverage near weak observations',
             'evidence_ids': [n['source_id'] for n in nearest], 'nearest_registered_aps': nearest,
             'expected_benefit': 'Identify which registered APs to inspect first',
             'required_evidence': 'Straight-line plan distance to the nearest registered AP; walls, antennas and transmit power are unknown.',
             'validation': 'Repeat measurements near the AP and at the weak location; confirm AP status and channel before any change.'}]


async def repeated_changes(db, floor_id):
    """Flags instrument RSSI that changed between the last two 24 h windows, per source."""
    from airgrid.services.analyst_evidence import compare_groups, source_key
    now = datetime.now(timezone.utc)
    rows = list((await db.execute(select(NetworkTelemetrySnapshot).where(
        NetworkTelemetrySnapshot.floor_id == floor_id, NetworkTelemetrySnapshot.collected_at >= now - timedelta(hours=48),
        NetworkTelemetrySnapshot.data_provenance != 'operator_reported', NetworkTelemetrySnapshot.rssi_dbm.is_not(None))
        .limit(2000))).scalars())
    groups = {}
    for r in rows:
        groups.setdefault(source_key(r), []).append(r)
    out = []
    for source, members in groups.items():
        split = now - timedelta(hours=24)
        at = lambda r: r.collected_at if r.collected_at.tzinfo else r.collected_at.replace(tzinfo=timezone.utc)
        earlier, later = [r for r in members if at(r) < split], [r for r in members if at(r) >= split]
        cmp = compare_groups([r.rssi_dbm for r in earlier], [r.rssi_dbm for r in later], 'rssi_dbm')
        if cmp['status'] == 'changed':
            out.append({'priority': 'review', 'title': f'Recorded RSSI changed for {source}',
                        'evidence_ids': [str(r.id) for r in members[:200]],
                        'expected_benefit': 'Confirm whether a change persisted',
                        'required_evidence': f"Median {cmp['earlier_median']} dBm (n={cmp['earlier_n']}) vs {cmp['later_median']} dBm (n={cmp['later_n']}).",
                        'validation': 'Repeat collection at the same position; a single-source change does not establish a cause.'})
    return out


# --- Persisted plans and AP inventory -------------------------------------------------------

def _iso(v):
    return v.isoformat() if v else None


def plan_row(p: OptimizationPlan) -> dict:
    return {'id': str(p.id), 'floor_id': str(p.floor_id), 'building_id': str(p.building_id) if p.building_id else None,
            'campus_id': str(p.campus_id) if p.campus_id else None, 'network_label': p.network_label, 'name': p.name,
            'notes': p.notes, 'status': p.status, 'markers': p.markers, 'evidence_refs': p.evidence_refs, 'scenario': p.scenario,
            'version': p.version,
            'author': p.author.email if p.author else None, 'author_id': str(p.author_id) if p.author_id else None,
            'created_at': _iso(p.created_at), 'updated_at': _iso(p.updated_at), 'speculative': True}


def ap_row(a: AccessPoint) -> dict:
    return {'id': str(a.id), 'floor_id': str(a.floor_id) if a.floor_id else None, 'name': a.name, 'mac_address': a.mac_address,
            'model': a.model, 'vendor': a.vendor, 'x_coord': a.x_coord, 'y_coord': a.y_coord, 'channel_24ghz': a.channel_24ghz,
            'channel_5ghz': a.channel_5ghz, 'tx_power_dbm': a.tx_power_dbm, 'status': a.status, 'notes': a.notes,
            'source': 'operator_registered'}


def _audit(db, user, action, resource_type, rid, **payload):
    db.add(AuditLog(actor_id=user.id, action=action, resource_type=resource_type, resource_id=str(rid), payload=payload))


async def _floor_or_404(db, floor_id):
    floor = await db.get(Floor, floor_id)
    if not floor:
        raise HTTPException(status_code=404, detail='Floor not found.')
    return floor


async def _check_evidence(db, floor_id, refs):
    if not refs:
        return []
    found = set((await db.execute(select(SurveyMeasurement.id).where(
        SurveyMeasurement.id.in_(refs), SurveyMeasurement.floor_id == floor_id))).scalars())
    if missing := [str(r) for r in refs if r not in found]:
        raise HTTPException(status_code=422, detail=f'Evidence must be survey observations on this floor; unknown: {missing[:5]}')
    return [str(r) for r in refs]


async def _validate_scenario(db, floor_id, scenario):
    """A saved scenario must fit the floor and use only known, in-range model parameters; hypothetical APs are never registered."""
    if scenario is None:
        return None
    from airgrid.services import ap_prediction, scenario_service
    ctx = await scenario_service.floor_context(db, floor_id)
    data = scenario.model_dump(mode='json')
    scenario_service.check_candidates_in_bounds(ctx['fgeom'], data['candidates'])
    try:
        ap_prediction.resolve_parameters(data['parameters'])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return data


async def _plan_or_404(db, plan_id):
    from sqlalchemy.orm import selectinload
    plan = (await db.execute(select(OptimizationPlan).options(selectinload(OptimizationPlan.author))
                             .where(OptimizationPlan.id == plan_id))).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail='Plan not found.')
    return plan


async def list_plans(db, floor_id, user: User | None = None):
    from sqlalchemy.orm import selectinload
    from airgrid.services.campus_service import get_authorized_campus_ids
    q = select(OptimizationPlan).options(selectinload(OptimizationPlan.author)).order_by(desc(OptimizationPlan.updated_at)).limit(200)
    if floor_id:
        q = q.where(OptimizationPlan.floor_id == floor_id)
    elif user and user.role != "administrator":
        authorized_ids = await get_authorized_campus_ids(db, user)
        if not authorized_ids:
            return []
        q = q.where(OptimizationPlan.campus_id.in_(authorized_ids))
    return [plan_row(p) for p in (await db.execute(q)).scalars()]


async def get_plan(db, plan_id):
    return plan_row(await _plan_or_404(db, plan_id))


async def create_plan(db, req, user):
    floor = await _floor_or_404(db, req.floor_id)
    from airgrid.models.all_models import Building
    building = await db.get(Building, floor.building_id)
    plan = OptimizationPlan(
        id=uuid.uuid4(), floor_id=floor.id, building_id=floor.building_id, campus_id=building.campus_id if building else None,
        network_label=req.network_label, name=req.name.strip(), notes=req.notes, status=req.status,
        markers=[m.model_dump() for m in req.markers], evidence_refs=await _check_evidence(db, floor.id, req.evidence_refs),
        scenario=await _validate_scenario(db, floor.id, req.scenario), version=1, author_id=user.id, updated_by_id=user.id)
    db.add(plan)
    from airgrid.services.scenario_service import record_version
    record_version(db, plan, user)
    _audit(db, user, 'optimization_plan.created', 'optimization_plans', plan.id, name=plan.name, markers=len(plan.markers))
    await db.commit()
    return await get_plan(db, plan.id)


async def update_plan(db, plan_id, req, user):
    plan = await _plan_or_404(db, plan_id)
    if plan.version != req.expected_version:
        raise HTTPException(status_code=409, detail=f'Plan changed since you loaded it (now version {plan.version}); reload before saving.')
    changes = req.model_dump(exclude_unset=True, exclude={'expected_version'})
    if 'markers' in changes:
        changes['markers'] = [m.model_dump() for m in req.markers]
    if 'evidence_refs' in changes:
        changes['evidence_refs'] = await _check_evidence(db, plan.floor_id, req.evidence_refs)
    if 'scenario' in changes:
        changes['scenario'] = await _validate_scenario(db, plan.floor_id, req.scenario)
    for key, value in changes.items():
        setattr(plan, key, value)
    plan.version += 1
    plan.updated_by_id = user.id
    from airgrid.services.scenario_service import record_version
    record_version(db, plan, user)
    _audit(db, user, 'optimization_plan.updated', 'optimization_plans', plan.id, fields=sorted(changes), version=plan.version)
    await db.commit()
    return await get_plan(db, plan.id)


async def delete_plan(db, plan_id, user):
    plan = await _plan_or_404(db, plan_id)
    if plan.author_id != user.id and UserRole.normalize(user.role) != UserRole.ADMINISTRATOR:
        raise HTTPException(status_code=403, detail='Only the plan author or an administrator can delete a plan.')
    _audit(db, user, 'optimization_plan.deleted', 'optimization_plans', plan.id, name=plan.name)
    await db.delete(plan)
    await db.commit()


async def list_access_points(db, floor_id):
    await _floor_or_404(db, floor_id)
    return [ap_row(a) for a in (await db.execute(select(AccessPoint).where(AccessPoint.floor_id == floor_id)
                                                 .order_by(AccessPoint.name).limit(500))).scalars()]


async def create_access_point(db, req, user):
    await _floor_or_404(db, req.floor_id)
    ap = AccessPoint(id=uuid.uuid4(), created_by_id=user.id, **{**req.model_dump(), 'mac_address': req.mac_address.lower()})
    db.add(ap)
    _audit(db, user, 'access_point.registered', 'access_points', ap.id, name=ap.name)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail='An access point with this MAC address is already registered.')
    return ap_row(ap)


async def update_access_point(db, ap_id, req, user):
    ap = await db.get(AccessPoint, ap_id)
    if not ap:
        raise HTTPException(status_code=404, detail='Access point not found.')
    changes = req.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(ap, key, value)
    _audit(db, user, 'access_point.updated', 'access_points', ap.id, fields=sorted(changes))
    await db.commit()
    return ap_row(ap)


async def delete_access_point(db, ap_id, user):
    ap = await db.get(AccessPoint, ap_id)
    if not ap:
        raise HTTPException(status_code=404, detail='Access point not found.')
    _audit(db, user, 'access_point.deleted', 'access_points', ap.id, name=ap.name)
    await db.delete(ap)
    await db.commit()
