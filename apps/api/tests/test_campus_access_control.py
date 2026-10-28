import uuid
import pytest
from httpx import AsyncClient

from airgrid.core.database import AsyncSessionLocal
from airgrid.core.security import hash_password
from airgrid.models.all_models import User, Campus, Building, Floor, CampusMembership


@pytest.fixture
async def auth_user(client: AsyncClient):
    """Helper to create and log in a user with a specific role."""
    created_users = []

    async def _make_user(role: str = "network_engineer"):
        unique_email = f"user-{role}-{uuid.uuid4().hex[:8]}@airgrid.test"
        password = "SecurePassword123!"
        hashed = hash_password(password)

        async with AsyncSessionLocal() as session:
            user = User(
                email=unique_email,
                hashed_password=hashed,
                full_name=f"Test {role.title()}",
                role=role,
                is_active=True,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            created_users.append(user.id)

        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": unique_email, "password": password},
        )
        assert login_resp.status_code == 200
        csrf_token = login_resp.json()["csrf_token"]
        session_cookie = login_resp.cookies["airgrid_session"]

        return {
            "user_id": user.id,
            "email": unique_email,
            "role": role,
            "csrf_token": csrf_token,
            "headers": {
                "X-CSRF-Token": csrf_token,
                "Cookie": f"airgrid_session={session_cookie}",
            },
        }

    yield _make_user

    async with AsyncSessionLocal() as session:
        for uid in created_users:
            u = await session.get(User, uid)
            if u:
                await session.delete(u)
        await session.commit()


@pytest.mark.asyncio
async def test_campus_access_scoping_and_memberships(client: AsyncClient, auth_user):
    admin = await auth_user("administrator")
    engineer_a = await auth_user("network_engineer")
    engineer_b = await auth_user("network_engineer")
    viewer = await auth_user("viewer")

    # 1. Admin creates two separate campuses with buildings and floors
    campus_a_resp = await client.post(
        "/api/v1/campuses",
        json={"name": "North Science Campus", "code": f"NSC-{uuid.uuid4().hex[:4]}", "timezone": "America/New_York"},
        headers=admin["headers"],
    )
    assert campus_a_resp.status_code == 201
    campus_a_id = campus_a_resp.json()["id"]

    campus_b_resp = await client.post(
        "/api/v1/campuses",
        json={"name": "South Engineering Campus", "code": f"SEC-{uuid.uuid4().hex[:4]}", "timezone": "America/New_York"},
        headers=admin["headers"],
    )
    assert campus_b_resp.status_code == 201
    campus_b_id = campus_b_resp.json()["id"]

    # Create building and floor on Campus A
    bldg_a_resp = await client.post(
        f"/api/v1/campuses/{campus_a_id}/buildings",
        json={"name": "Science Hall", "building_code": "SCI-1"},
        headers=admin["headers"],
    )
    assert bldg_a_resp.status_code == 201
    bldg_a_id = bldg_a_resp.json()["id"]

    floor_a_resp = await client.post(
        f"/api/v1/buildings/{bldg_a_id}/floors",
        json={"name": "Floor 1", "floor_number": 1},
        headers=admin["headers"],
    )
    assert floor_a_resp.status_code == 201
    floor_a_id = floor_a_resp.json()["id"]

    try:
        # 2. Verify unassigned engineer cannot see or access either campus
        list_resp_a = await client.get("/api/v1/campuses", headers=engineer_a["headers"])
        assert list_resp_a.status_code == 200
        assert list_resp_a.json()["total"] == 0
        assert len(list_resp_a.json()["items"]) == 0

        get_resp_a = await client.get(f"/api/v1/campuses/{campus_a_id}", headers=engineer_a["headers"])
        assert get_resp_a.status_code == 403

        get_floor_a = await client.get(f"/api/v1/floors/{floor_a_id}", headers=engineer_a["headers"])
        assert get_floor_a.status_code == 403

        # 3. Admin assigns engineer_a to Campus A
        add_member_resp = await client.post(
            f"/api/v1/campuses/{campus_a_id}/members",
            json={"user_id": str(engineer_a["user_id"])},
            headers=admin["headers"],
        )
        assert add_member_resp.status_code == 201
        assert add_member_resp.json()["campus_id"] == campus_a_id
        assert add_member_resp.json()["user_id"] == str(engineer_a["user_id"])

        # Non-admin cannot assign members (403)
        unauth_add = await client.post(
            f"/api/v1/campuses/{campus_a_id}/members",
            json={"user_id": str(engineer_b["user_id"])},
            headers=engineer_a["headers"],
        )
        assert unauth_add.status_code == 403

        # 4. Engineer A can now see and access Campus A, but NOT Campus B
        list_after = await client.get("/api/v1/campuses", headers=engineer_a["headers"])
        assert list_after.status_code == 200
        assert list_after.json()["total"] == 1
        assert list_after.json()["items"][0]["id"] == campus_a_id

        get_a = await client.get(f"/api/v1/campuses/{campus_a_id}", headers=engineer_a["headers"])
        assert get_a.status_code == 200

        get_b = await client.get(f"/api/v1/campuses/{campus_b_id}", headers=engineer_a["headers"])
        assert get_b.status_code == 403

        get_floor_ok = await client.get(f"/api/v1/floors/{floor_a_id}", headers=engineer_a["headers"])
        assert get_floor_ok.status_code == 200

        # Engineer B is still unassigned
        get_bldg_b = await client.get(f"/api/v1/buildings/{bldg_a_id}", headers=engineer_b["headers"])
        assert get_bldg_b.status_code == 403

        # 5. List members as Admin and verify Engineer A is in the list
        members_resp = await client.get(f"/api/v1/campuses/{campus_a_id}/members", headers=admin["headers"])
        assert members_resp.status_code == 200
        member_ids = [m["user_id"] for m in members_resp.json()]
        assert str(engineer_a["user_id"]) in member_ids

        # 6. Admin removes Engineer A from Campus A
        del_member_resp = await client.delete(
            f"/api/v1/campuses/{campus_a_id}/members/{engineer_a['user_id']}",
            headers=admin["headers"],
        )
        assert del_member_resp.status_code == 204

        # Now Engineer A gets 403 again
        revoked_access = await client.get(f"/api/v1/campuses/{campus_a_id}", headers=engineer_a["headers"])
        assert revoked_access.status_code == 403

        # 7. Test Cross-Campus Resource Protection (Optimization Plans & Collectors)
        # Re-assign Engineer A to Campus A
        await client.post(
            f"/api/v1/campuses/{campus_a_id}/members",
            json={"user_id": str(engineer_a["user_id"])},
            headers=admin["headers"],
        )

        # Create floor on Campus B
        bldg_b_resp = await client.post(
            f"/api/v1/campuses/{campus_b_id}/buildings",
            json={"name": "Engineering Center", "building_code": "ENG-1"},
            headers=admin["headers"],
        )
        assert bldg_b_resp.status_code == 201
        bldg_b_id = bldg_b_resp.json()["id"]

        floor_b_resp = await client.post(
            f"/api/v1/buildings/{bldg_b_id}/floors",
            json={"name": "Floor 2", "floor_number": 2},
            headers=admin["headers"],
        )
        assert floor_b_resp.status_code == 201
        floor_b_id = floor_b_resp.json()["id"]

        # Admin creates plan on Floor B
        plan_b_resp = await client.post(
            "/api/v1/optimization/plans",
            json={"floor_id": floor_b_id, "name": "Plan Campus B", "network_label": "ENG-WIFI", "status": "draft", "markers": [], "evidence_refs": []},
            headers=admin["headers"],
        )
        assert plan_b_resp.status_code == 201
        plan_b_id = plan_b_resp.json()["id"]

        # Engineer A tries to access plan on Campus B -> 403
        eng_get_plan_b = await client.get(f"/api/v1/optimization/plans/{plan_b_id}", headers=engineer_a["headers"])
        assert eng_get_plan_b.status_code == 403

        # Engineer A creates plan on Floor A -> 201
        plan_a_resp = await client.post(
            "/api/v1/optimization/plans",
            json={"floor_id": floor_a_id, "name": "Plan Campus A", "network_label": "SCI-WIFI", "status": "draft", "markers": [], "evidence_refs": []},
            headers=engineer_a["headers"],
        )
        assert plan_a_resp.status_code == 201
        plan_a_id = plan_a_resp.json()["id"]

        # Engineer A listing plans only sees Campus A plans
        eng_plans = await client.get("/api/v1/optimization/plans", headers=engineer_a["headers"])
        assert eng_plans.status_code == 200
        plan_ids = [p["id"] for p in eng_plans.json()]
        assert plan_a_id in plan_ids
        assert plan_b_id not in plan_ids

        # 8. Test Viewer role restrictions on assigned campus
        # Assign viewer to Campus A
        await client.post(
            f"/api/v1/campuses/{campus_a_id}/members",
            json={"user_id": str(viewer["user_id"])},
            headers=admin["headers"],
        )

        # Viewer can read Campus A and its plans
        viewer_get_camp = await client.get(f"/api/v1/campuses/{campus_a_id}", headers=viewer["headers"])
        assert viewer_get_camp.status_code == 200
        viewer_get_plan = await client.get(f"/api/v1/optimization/plans/{plan_a_id}", headers=viewer["headers"])
        assert viewer_get_plan.status_code == 200

        # Viewer cannot create plan (403)
        viewer_create_plan = await client.post(
            "/api/v1/optimization/plans",
            json={"floor_id": floor_a_id, "name": "Unauthorized Plan", "network_label": "SCI-WIFI", "status": "draft", "markers": [], "evidence_refs": []},
            headers=viewer["headers"],
        )
        assert viewer_create_plan.status_code == 403

        # Viewer cannot register access point (403)
        viewer_reg_ap = await client.post(
            "/api/v1/optimization/access-points",
            json={"floor_id": floor_a_id, "name": "Test AP", "mac_address": "00:11:22:33:44:55"},
            headers=viewer["headers"],
        )
        assert viewer_reg_ap.status_code == 403

    finally:
        # Cleanup
        async with AsyncSessionLocal() as session:
            ca = await session.get(Campus, uuid.UUID(campus_a_id))
            if ca:
                await session.delete(ca)
            cb = await session.get(Campus, uuid.UUID(campus_b_id))
            if cb:
                await session.delete(cb)
            await session.commit()
