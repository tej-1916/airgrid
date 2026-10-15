import json
import time
import pytest
from httpx import AsyncClient

from airgrid.core.security import compute_webhook_signature, verify_webhook_signature
from airgrid.schemas.webhook import WebhookEventPayload, SystemEventType, EventSeverity


def test_hmac_signature_generation_and_verification():
    secret = "test-secret-key-12345"
    payload = b'{"event_type": "network.degradation", "severity": "warning"}'
    now = int(time.time())

    signature = compute_webhook_signature(payload, now, secret)
    assert signature.startswith("sha256=")

    # Valid verification
    is_valid = verify_webhook_signature(payload, signature, now, secret, tolerance_seconds=300)
    assert is_valid is True

    # Tampered payload fails
    tampered_payload = b'{"event_type": "network.degradation", "severity": "critical"}'
    assert verify_webhook_signature(tampered_payload, signature, now, secret) is False

    # Stale timestamp fails (replay defense: 10 minutes ago)
    old_timestamp = now - 600
    assert verify_webhook_signature(payload, signature, old_timestamp, secret, tolerance_seconds=300) is False


@pytest.mark.asyncio
async def test_automation_dispatch_simulation(client: AsyncClient):
    payload = {
        "event_type": "network.degradation",
        "severity": "warning",
        "data": {"campus": "North Campus", "ap_mac": "AA:BB:CC:DD:EE:01"},
    }
    response = await client.post("/api/v1/automations/dispatch-test", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "simulated"
    assert data["status_code"] == 200
    assert "delivery_id" in data
