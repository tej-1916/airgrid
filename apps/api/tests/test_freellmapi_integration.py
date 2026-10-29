import os
from pathlib import Path
import pytest
import httpx

from airgrid.core.config import Settings, settings
from airgrid.schemas.ai import AIGenerateRequest, PromptCategory
from airgrid.services.ai_gateway import AIGatewayService


def test_ai_settings_alias_choices():
    """Verify both AIRGRID_AI_API_BASE_URL and AIRGRID_AI_GATEWAY_URL are accepted."""
    s1 = Settings(AIRGRID_AI_API_BASE_URL="http://127.0.0.1:3001/v1")
    assert s1.AIRGRID_AI_API_BASE_URL == "http://127.0.0.1:3001/v1"

    s2 = Settings(AIRGRID_AI_GATEWAY_URL="http://127.0.0.1:3001/v1")
    assert s2.AIRGRID_AI_API_BASE_URL == "http://127.0.0.1:3001/v1"


@pytest.mark.asyncio
async def test_ai_gateway_unavailable_fallback(monkeypatch):
    """Verify that an unreachable AI provider returns unavailable cleanly without crashing."""
    monkeypatch.setattr(settings, "AIRGRID_AI_ENABLED", True)
    service = AIGatewayService()
    service.base_url = "http://127.0.0.1:39999/v1"
    service.api_key = "test-key"
    service.default_model = "auto"

    health = await service.health()
    assert health["status"] == "unavailable"
    assert "latency_ms" in health

    req = AIGenerateRequest(
        category=PromptCategory.DIAGNOSTIC,
        prompt="Ping",
        allow_external=True,
        requested_model="auto",
    )
    res = await service.generate(req)
    assert res.status in ("failed", "timeout")


@pytest.mark.asyncio
async def test_live_freellmapi_connection_if_available(monkeypatch):
    """If FreeLLMAPI is active on localhost:3001 with configured key in .env, verify real connection."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        pytest.skip(".env not present")

    env_vars = {}
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip().strip("'\"")

    base_url = env_vars.get("AIRGRID_AI_API_BASE_URL") or env_vars.get("AIRGRID_AI_GATEWAY_URL")
    api_key = env_vars.get("AIRGRID_AI_API_KEY")
    if not base_url or not api_key:
        pytest.skip("FreeLLMAPI credentials not configured in apps/api/.env")

    # Check if local port 3001 is reachable
    try:
        async with httpx.AsyncClient(timeout=1.0) as client:
            resp = await client.get("http://127.0.0.1:3001/")
            if resp.status_code != 200:
                pytest.skip("FreeLLMAPI port 3001 returned non-200")
    except Exception:
        pytest.skip("FreeLLMAPI port 3001 unreachable")

    monkeypatch.setattr(settings, "AIRGRID_AI_ENABLED", True)
    monkeypatch.setattr(settings, "AIRGRID_AI_API_BASE_URL", base_url)
    monkeypatch.setattr(settings, "AIRGRID_AI_API_KEY", api_key)
    monkeypatch.setattr(settings, "AIRGRID_AI_DEFAULT_MODEL", env_vars.get("AIRGRID_AI_DEFAULT_MODEL", "auto"))

    service = AIGatewayService()
    health = await service.health()
    assert health["status"] == "available"
    assert "auto" in health["discovered_models"]
    assert health["discovered_count"] > 0
    assert health["latency_ms"] >= 0

    # Minimal non-sensitive test generation
    req = AIGenerateRequest(
        category=PromptCategory.DIAGNOSTIC,
        prompt="Reply with the exact single word: PONG",
        allow_external=True,
        requested_model="auto",
    )
    res = await service.generate(req)
    assert res.status == "success"
    assert res.verified_model is not None
    assert "PONG" in res.output_text.strip()
    assert api_key not in res.output_text
