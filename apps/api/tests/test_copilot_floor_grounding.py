"""Copilot floor grounding: authorization before intake/provider, synthetic disclosure, citations, data-sharing policy.

Synthetic data only (fixtures shared with test_campus_model).
"""
import uuid

import pytest
from sqlalchemy import func, select

from airgrid.core.config import settings
from airgrid.core.database import AsyncSessionLocal
from airgrid.models.all_models import AIChatMessage, User
from airgrid.services import copilot_service as cs
from tests.test_authz_remediation import login
from tests.test_campus_model import model_files, site  # noqa: F401  (fixtures)


async def _msg_count(conv_id):
    async with AsyncSessionLocal() as s:
        return (await s.execute(select(func.count()).select_from(AIChatMessage).where(AIChatMessage.conversation_id == conv_id))).scalar()


@pytest.mark.asyncio
async def test_floor_context_is_grounded_cited_and_discloses_synthetic(site, model_files):
    async with AsyncSessionLocal() as db:
        beta = await db.get(User, site["beta"].id)
        text, cites = await cs.gather_scoped_context(db, beta, None, site["floors"][0].id)
    assert "SYNTHETIC DEMO DATA" in text
    assert "GF-1" in text and "weak" in text
    room_cites = [c for c in cites if c["kind"] == "room"]
    assert len(room_cites) == 2 and all(c["source_id"].startswith("room:") for c in room_cites)
    assert {c["provenance"] for c in room_cites} <= {"SYNTHETIC_DEMO", "INTERPOLATED_ESTIMATE", "MEASURED"}
    assert any(c["kind"] == "floor" for c in cites)


@pytest.mark.asyncio
async def test_unauthorized_floor_is_denied_before_intake_and_provider_on_both_endpoints(client, site, model_files, monkeypatch):
    called = []

    async def boom(*a, **k):  # any provider transmission would be a policy failure
        called.append(1)
        raise AssertionError("provider must not be called")

    monkeypatch.setattr(cs.ai_gateway, "generate_chat_stream", boom, raising=False)
    ha = await login(client, site["alpha"])  # alpha: campus A only; floors belong to campus B
    conv = (await client.post("/api/v1/ai/copilot/conversations", json={"title": "floor test"}, headers=ha)).json()
    for path in ("messages", "messages/stream"):
        r = await client.post(f"/api/v1/ai/copilot/conversations/{conv['id']}/{path}",
                              json={"content": "Explain the Wi-Fi coverage on the ground floor.", "floor_id": str(site["floors"][0].id)}, headers=ha)
        assert r.status_code == 403, (path, r.status_code)
        assert "GF-1" not in r.text
    assert not called
    assert await _msg_count(uuid.UUID(conv["id"])) == 0  # the question was not even stored


@pytest.mark.asyncio
async def test_private_context_withheld_from_non_loopback_provider_unless_approved(site, model_files, monkeypatch):
    monkeypatch.setattr(settings, "AIRGRID_AI_API_BASE_URL", "https://provider.example.com/v1")
    monkeypatch.setattr(settings, "AIRGRID_AI_EXTERNAL_CONTEXT_APPROVED", False)
    async with AsyncSessionLocal() as db:
        beta = await db.get(User, site["beta"].id)
        text, cites = await cs.gather_scoped_context(db, beta, None, site["floors"][0].id)
        assert cites == [] and "withheld" in text and "GF-1" not in text
        monkeypatch.setattr(settings, "AIRGRID_AI_EXTERNAL_CONTEXT_APPROVED", True)
        text2, cites2 = await cs.gather_scoped_context(db, beta, None, site["floors"][0].id)
        assert cites2 and "GF-1" in text2
    for url in ("http://127.0.0.1:3001/v1", "http://localhost:3001/v1", ""):
        monkeypatch.setattr(settings, "AIRGRID_AI_API_BASE_URL", url)
        monkeypatch.setattr(settings, "AIRGRID_AI_EXTERNAL_CONTEXT_APPROVED", False)
        assert cs.context_sharing_allowed()


@pytest.mark.asyncio
async def test_history_drops_assistant_turns_for_non_approved_provider(site, monkeypatch):
    from airgrid.models.all_models import AIChatConversation
    async with AsyncSessionLocal() as db:
        conv = AIChatConversation(id=uuid.uuid4(), user_id=site["beta"].id, title="h", model="auto")
        db.add(conv)
        await db.flush()
        db.add_all([AIChatMessage(conversation_id=conv.id, role="user", content="q", status="completed"),
                    AIChatMessage(conversation_id=conv.id, role="assistant", content="PRIVATE-ROOM-FACT", status="completed")])
        await db.commit()
        monkeypatch.setattr(settings, "AIRGRID_AI_API_BASE_URL", "https://provider.example.com/v1")
        monkeypatch.setattr(settings, "AIRGRID_AI_EXTERNAL_CONTEXT_APPROVED", False)
        withheld = await cs.build_messages_history(db, conv, "sys")
        assert all("PRIVATE-ROOM-FACT" not in m["content"] for m in withheld)
        monkeypatch.setattr(settings, "AIRGRID_AI_EXTERNAL_CONTEXT_APPROVED", True)
        assert any("PRIVATE-ROOM-FACT" in m["content"] for m in await cs.build_messages_history(db, conv, "sys"))
