import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from airgrid.services.optimization_service import recommend_survey


def point(floor, network='Fixture', rssi=-80, provenance='operator_reported', x=.2, y=.3):
    return SimpleNamespace(id=uuid.uuid4(), floor_id=floor, network_label=network, rssi_dbm=rssi,
                           data_provenance=provenance, normalized_x=x, normalized_y=y,
                           observed_at=datetime.now(timezone.utc), survey_session_id=uuid.uuid4())


def test_empty_evidence_requires_measurement():
    result = recommend_survey([], uuid.uuid4(), 'Fixture', False)
    assert result['sample_count'] == 0
    assert len(result['suggested_measurements']) == 16
    assert result['recommendations'][0]['priority'] == 'measurement_first'
    assert not result['weak_locations']


def test_network_floor_and_provenance_isolation():
    floor = uuid.uuid4()
    valid = point(floor)
    rows = [valid, point(uuid.uuid4()), point(floor, network='fixture'),
            point(floor, provenance='controlled_test_import'), point(floor, provenance='estimated'),
            point(floor, rssi=float('nan')), point(floor, x=2)]
    result = recommend_survey(rows, floor, 'Fixture', True)
    assert result['sample_count'] == 1
    assert result['weak_locations'][0]['source_id'] == str(valid.id)
    assert result['recommendations'][0]['evidence_ids'] == [str(valid.id)]
    assert len(result['suggested_measurements']) == 15
    assert recommend_survey(rows, floor, None, True)['sample_count'] == 0


def test_good_samples_do_not_claim_full_coverage():
    floor = uuid.uuid4()
    result = recommend_survey([point(floor, rssi=-50)], floor, 'Fixture', True)
    assert not result['weak_locations']
    assert result['recommendations'][0]['priority'] == 'measurement_first'
    assert any('not measured coverage' in item for item in result['limitations'])


@pytest.mark.asyncio
async def test_optimization_requires_authentication(client):
    response = await client.get(f'/api/v1/optimization/survey?floor_id={uuid.uuid4()}')
    assert response.status_code == 401
