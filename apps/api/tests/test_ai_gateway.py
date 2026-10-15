import pytest
from httpx import AsyncClient, Response
from unittest.mock import AsyncMock, patch

from airgrid.schemas.ai import AIGenerateRequest, PromptCategory
from airgrid.services.ai_gateway import AIGatewayService


@pytest.mark.asyncio
async def test_ai_gateway_unconfigured_contract(client: AsyncClient):
    """Verifies that an unconfigured AI gateway returns safe degraded status without crashing."""
    payload = {
        "category": "diagnostic",
        "prompt": "Investigate interference on 5GHz channel 36.",
        "requested_model": "llama-3.3-70b-versatile",
    }
    response = await client.post("/api/v1/ai/generate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "unconfigured"
    assert data["requested_model"] == "llama-3.3-70b-versatile"
    assert data["verified_model"] is None
    assert data["is_verified_execution"] is False
    assert data["fallback_detected"] is False
    assert "Phase 00" in data["output_text"]


@pytest.mark.asyncio
async def test_ai_gateway_model_verification_success():
    """Verifies model identity when provider responds truthfully."""
    service = AIGatewayService()
    service.api_key = "mock-test-key"

    mock_provider_response = {
        "id": "chatcmpl-123",
        "model": "llama-3.3-70b-versatile",
        "choices": [
            {"message": {"role": "assistant", "content": "Diagnosis: SNR acceptable."}}
        ],
        "usage": {"prompt_tokens": 15, "completion_tokens": 8, "total_tokens": 23},
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = Response(200, json=mock_provider_response)

        req = AIGenerateRequest(
            category=PromptCategory.DIAGNOSTIC,
            prompt="Analyze RSSI drop",
            requested_model="llama-3.3-70b-versatile",
        )
        res = await service.generate(req)

        assert res.status == "success"
        assert res.requested_model == "llama-3.3-70b-versatile"
        assert res.verified_model == "llama-3.3-70b-versatile"
        assert res.is_verified_execution is True
        assert res.fallback_detected is False
        assert "SNR acceptable" in res.output_text


@pytest.mark.asyncio
async def test_ai_gateway_fallback_detection():
    """Verifies fallback detection when provider substitutes a different model under the hood."""
    service = AIGatewayService()
    service.api_key = "mock-test-key"

    # Provider returns llama-3.1-8b-instant even though 70b was requested
    mock_provider_response = {
        "id": "chatcmpl-456",
        "model": "llama-3.1-8b-instant",
        "choices": [
            {"message": {"role": "assistant", "content": "Fallback response."}}
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = Response(200, json=mock_provider_response)

        req = AIGenerateRequest(
            category=PromptCategory.DIAGNOSTIC,
            prompt="Analyze dead zone",
            requested_model="llama-3.3-70b-versatile",
        )
        res = await service.generate(req)

        assert res.status == "success"
        assert res.requested_model == "llama-3.3-70b-versatile"
        assert res.verified_model == "llama-3.1-8b-instant"
        assert res.is_verified_execution is True
        assert res.fallback_detected is True
