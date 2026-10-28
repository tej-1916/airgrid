from unittest.mock import AsyncMock, patch

import httpx
import pytest

from airgrid.core.config import settings
from airgrid.schemas.ai import AIGenerateRequest
from airgrid.services.ai_gateway import AIGatewayService


@pytest.fixture
def gateway(monkeypatch):
    monkeypatch.setattr(settings, 'AIRGRID_AI_ENABLED', True)
    service = AIGatewayService()
    service.base_url = 'http://127.0.0.1:9999/v1'
    service.default_model = 'fixture-model'
    service.api_key = 'fixture-secret'
    return service


@pytest.mark.asyncio
async def test_ai_routes_require_authentication(client):
    for method, url, body in [
        ('GET', '/api/v1/ai/status', None),
        ('POST', '/api/v1/ai/generate', {'prompt': 'test'}),
        ('POST', '/api/v1/ai/select-model', {'model': 'test'}),
        ('POST', '/api/v1/analyst/analyze', {'report_id': '00000000-0000-0000-0000-000000000001'}),
    ]:
        response = await client.request(method, url, json=body)
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_unconfigured_and_no_consent_never_send(gateway, monkeypatch):
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as post:
        response = await gateway.generate(AIGenerateRequest(prompt='private observation'))
        assert response.status == 'consent_required'
        monkeypatch.setattr(settings, 'AIRGRID_AI_ENABLED', False)
        assert (await gateway.generate(AIGenerateRequest(prompt='x', allow_external=True))).status == 'unconfigured'
        post.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize('model', ['fixture-model', 'substituted-model', None])
async def test_provider_identity_is_self_reported(gateway, model):
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as post:
        post.return_value = httpx.Response(200, json={'model': model, 'choices': [{'message': {'content': 'Fixture output'}}]})
        response = await gateway.generate(AIGenerateRequest(prompt='fixture', allow_external=True, temperature=0, max_tokens=4096))
        assert response.status == 'success'
        assert response.verified_model == model
        assert not response.is_verified_execution
        assert response.fallback_detected == bool(model and model != 'fixture-model')
        payload = post.call_args.kwargs['json']
        assert payload['max_tokens'] == 1024 and payload['temperature'] == 0
        assert 'tools' not in payload


@pytest.mark.asyncio
@pytest.mark.parametrize('status,body', [(401, {'error': 'fixture-secret'}), (404, {}), (503, {}), (200, {}), (200, {'choices': []}), (200, {'choices': [{'message': {'content': 10}}]})])
async def test_provider_errors_are_redacted(gateway, status, body):
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as post:
        post.return_value = httpx.Response(status, json=body)
        result = await gateway.generate(AIGenerateRequest(prompt='x', allow_external=True))
        assert result.status == 'failed'
        assert 'fixture-secret' not in result.model_dump_json()


@pytest.mark.asyncio
async def test_timeout_and_unapproved_model(gateway):
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as post:
        post.side_effect = httpx.ReadTimeout('private endpoint fixture-secret')
        assert (await gateway.generate(AIGenerateRequest(prompt='x', allow_external=True))).status == 'timeout'
        assert (await gateway.generate(AIGenerateRequest(prompt='x', requested_model='unapproved', allow_external=True))).status == 'failed'
        assert post.call_count == 1  # zero retries


@pytest.mark.asyncio
async def test_gateway_rate_limit(gateway):
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as post:
        post.return_value = httpx.Response(503)
        for _ in range(10):
            await gateway.generate(AIGenerateRequest(prompt='fixture', allow_external=True))
        assert (await gateway.generate(AIGenerateRequest(prompt='fixture', allow_external=True))).status == 'rate_limited'
        assert post.call_count == 10


@pytest.mark.asyncio
async def test_explicit_provider_health(gateway):
    with patch('httpx.AsyncClient.get', new_callable=AsyncMock) as get:
        get.return_value = httpx.Response(200, json={'data': [{'id': 'fixture-model'}, {'id': 'discovered-model-2'}]})
        health = await gateway.health()
        assert health['status'] == 'available'
        assert 'discovered-model-2' in health['discovered_models']
        assert health['latency_ms'] is not None

        get.return_value = httpx.Response(401, json={'error': 'fixture-secret'})
        health_unauth = await gateway.health()
        assert health_unauth['status'] == 'unavailable'
        assert health_unauth.get('error') == 'authentication_failed'


@pytest.mark.asyncio
async def test_provider_cannot_echo_configured_secret(gateway):
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as post:
        post.return_value = httpx.Response(200, json={'model': 'fixture-model', 'choices': [{'message': {'content': 'echo fixture-secret'}}]})
        result = await gateway.generate(AIGenerateRequest(prompt='fixture', allow_external=True))
        assert result.status == 'success'
        assert 'fixture-secret' not in result.model_dump_json()
        assert '[REDACTED]' in result.output_text


@pytest.mark.asyncio
async def test_model_selection_and_status(gateway, auth_client):
    ac = await auth_client("network_engineer")

    # Gateway status initially reports unconfigured or configured state
    resp = await ac.get('/api/v1/ai/status')
    assert resp.status_code == 200
    status_data = resp.json()
    assert 'is_configured' in status_data
    assert 'privacy_status' in status_data
    assert 'available_models' in status_data

    # Model selection on gateway instance
    gateway.available_models = ['model-a', 'model-b']
    assert gateway.select_model('model-a') is True
    assert gateway.active_model == 'model-a'
    assert gateway.select_model('unrecognized-model') is False

    # Generation with selected active model
    with patch('httpx.AsyncClient.post', new_callable=AsyncMock) as post:
        post.return_value = httpx.Response(200, json={'model': 'model-a', 'choices': [{'message': {'content': 'Generated output'}}]})
        res = await gateway.generate(AIGenerateRequest(prompt='Hello', requested_model='model-a', allow_external=True))
        assert res.status == 'success'
        assert res.requested_model == 'model-a'
