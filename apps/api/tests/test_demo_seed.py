"""Demo seed: deterministic, idempotent, and always labelled synthetic."""
import json

import pytest
from sqlalchemy import select

from airgrid import demo_seed
from airgrid.core.database import AsyncSessionLocal
from airgrid.models.all_models import Campus, SurveyMeasurement, SurveySession
from tests.test_campus_model import _geometry


def test_synthetic_values_are_deterministic_and_bounded():
    a = [demo_seed.synthetic_rssi(n, x, y) for n in (0, 1, 2) for x, y in demo_seed.grid_points()]
    b = [demo_seed.synthetic_rssi(n, x, y) for n in (0, 1, 2) for x, y in demo_seed.grid_points()]
    assert a == b and all(-95.0 <= v <= -30.0 for v in a)
    assert len(demo_seed.grid_points()) == 12 * 8 and len(demo_seed.grid_points(floor_number=2)) < 96  # floor 2 leaves a corner unsurveyed
    assert demo_seed.synthetic_rssi(2, -44, -28) < demo_seed.synthetic_rssi(0, -44, -28)  # fewer APs upstairs


@pytest.mark.asyncio
async def test_seed_is_idempotent_and_labels_everything_synthetic(tmp_path, monkeypatch):
    from airgrid.services import campus_model as cm
    (tmp_path / cm.GEOMETRY_FILE).write_text(json.dumps(_geometry()))
    monkeypatch.setattr(cm, "model_dir", lambda: tmp_path)
    cm._cache.clear()
    async with AsyncSessionLocal() as db:  # isolated test DB: clear any earlier demo campus so the pattern under test is what gets seeded
        old = (await db.execute(select(Campus).where(Campus.code == demo_seed.CAMPUS_CODE))).scalar_one_or_none()
        if old:
            await db.delete(old)
            await db.commit()
    await demo_seed.seed(None)
    second = await demo_seed.seed(None)
    assert second["created"] is False
    async with AsyncSessionLocal() as db:
        campus = (await db.execute(select(Campus).where(Campus.code == demo_seed.CAMPUS_CODE))).scalar_one()
        sessions = (await db.execute(select(SurveySession.id).where(SurveySession.campus_id == campus.id))).scalars().all()
        rows = (await db.execute(select(SurveyMeasurement).where(SurveyMeasurement.survey_session_id.in_(sessions)))).scalars().all()
    assert len(sessions) == 3 and len(rows) == sum(len(demo_seed.grid_points(floor_number=n)) for n in range(3))
    assert {r.data_provenance for r in rows} == {"controlled_test_import"}
    assert all("SYNTHETIC DEMO" in (r.notes or "") for r in rows)
