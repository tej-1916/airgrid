"""Read-only survey decision support. Plans never configure infrastructure."""
import math
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select

from airgrid.models.all_models import Floor, FloorPlanAsset, SurveyMeasurement


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
    return {**response, 'floor_id': str(floor_id), 'network_label': network_label,
            'available_networks': networks, 'calibrated': calibrated,
            'generated_at': datetime.now(timezone.utc).isoformat()}
