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


@pytest.mark.asyncio
async def test_seed_registers_labelled_synthetic_aps_at_the_assumed_positions_and_is_additive(tmp_path, monkeypatch):
    from airgrid.models.all_models import AccessPoint, Building, Floor
    from airgrid.services import campus_model as cm
    (tmp_path / cm.GEOMETRY_FILE).write_text(json.dumps(_geometry()))
    monkeypatch.setattr(cm, "model_dir", lambda: tmp_path)
    cm._cache.clear()
    async with AsyncSessionLocal() as db:
        old = (await db.execute(select(Campus).where(Campus.code == demo_seed.CAMPUS_CODE))).scalar_one_or_none()
        if old:
            await db.delete(old)          # APs are orphaned (floor_id SET NULL), as after a real campus deletion
            await db.commit()
    await demo_seed.seed(None)
    await demo_seed.seed(None)            # idempotent: no duplicates
    cal = _geometry()["floors"][0]["calibration"]

    async def demo_floor_aps():
        async with AsyncSessionLocal() as db:
            campus = (await db.execute(select(Campus).where(Campus.code == demo_seed.CAMPUS_CODE))).scalar_one()
            rows = (await db.execute(select(AccessPoint, Floor.floor_number).join(Floor, Floor.id == AccessPoint.floor_id).join(Building, Building.id == Floor.building_id)
                                     .where(Building.campus_id == campus.id))).all()
            return campus, rows

    _, rows = await demo_floor_aps()
    assert len(rows) == sum(len(v) for v in demo_seed.APS.values())
    assert all("SYNTHETIC DEMO" in (ap.notes or "") and ap.mac_address.startswith("02:00:5e:") and ap.tx_power_dbm is None for ap, _ in rows)
    ground = sorted((round(x, 1), round(y, 1)) for ap, n in rows if n == 0 for x, y in [cm.pixel_to_world(ap.x_coord * cal["resolution_px"][0], ap.y_coord * cal["resolution_px"][1], cal)])
    assert ground == sorted(demo_seed.APS[0])                        # registered positions round-trip to the assumed world positions

    async with AsyncSessionLocal() as db:                            # an already seeded campus without APs is only extended when asked
        for ap, _ in rows:
            await db.delete(await db.get(AccessPoint, ap.id))
        await db.commit()
    assert (await demo_seed.seed(None))["created"] is False and not (await demo_floor_aps())[1]
    added = (await demo_seed.seed(None, add_aps_to_existing=True))["access_points_added"]
    assert added == sum(len(v) for v in demo_seed.APS.values()) and len((await demo_floor_aps())[1]) == added
    assert (await demo_seed.seed(None, add_aps_to_existing=True))["access_points_added"] == 0     # floors with APs are left alone
