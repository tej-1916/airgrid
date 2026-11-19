"""Provider failure handling for the Copilot stream: bounded retry, clear errors, no duplicates."""
import asyncio
import functools
import json

import httpx
import pytest

from airgrid.services import ai_gateway as gw_module
from airgrid.services.ai_gateway import AIGatewayService, ai_gateway


def sse(model, *pieces):
    body = "".join(
        "data: " + json.dumps({"model": model, "choices": [{"delta": {"content": p}}]}) + "\n\n" for p in pieces
    )
    return httpx.Response(200, content=(body + "data: [DONE]\n\n").encode(), headers={"content-type": "text/event-stream"})


def make_gateway(monkeypatch, handler):
    """Gateway whose HTTP layer is replaced by `handler(request) -> Response | raises`."""
    monkeypatch.setattr(gw_module.settings, "AIRGRID_AI_ENABLED", True)
    monkeypatch.setattr(
        gw_module.httpx, "AsyncClient",
        functools.partial(httpx.AsyncClient, transport=httpx.MockTransport(handler)),
    )
    svc = AIGatewayService()
    svc.base_url, svc.api_key, svc.default_model = "http://127.0.0.1:3001/v1", "k", "auto"
    svc.retry_backoff = 0
    return svc


async def run(svc, **kw):
    return [e async for e in svc.generate_chat_stream([{"role": "user", "content": "Hello"}], **kw)]


@pytest.mark.asyncio
async def test_timeout_then_retry_succeeds_with_real_model(monkeypatch):
    calls = []

    def handler(req):
        calls.append(json.loads(req.content)["model"])
        if len(calls) == 1:
            raise httpx.ReadTimeout("stalled", request=req)
        return sse("nvidia/real-model", "Hi")

    events = await run(make_gateway(monkeypatch, handler))
    assert len(calls) == 2
    assert [e["type"] for e in events] == ["chunk", "done"]
    assert events[-1]["model"] == "nvidia/real-model"  # executing identity, not "auto"
    assert events[-1]["requested_model"] == "auto"


@pytest.mark.asyncio
async def test_persistent_timeout_is_one_clear_recoverable_error(monkeypatch):
    calls = []

    def handler(req):
        calls.append(1)
        raise httpx.ReadTimeout("stalled", request=req)

    events = await run(make_gateway(monkeypatch, handler))
    assert len(calls) == 2  # bounded: 1 try + 1 retry, no hidden non-stream fallback
    assert len(events) == 1 and events[0]["type"] == "error"
    assert events[0]["code"] == "timeout" and events[0]["recoverable"] is True


@pytest.mark.asyncio
async def test_auth_failure_is_not_retried(monkeypatch):
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(401, json={"error": "nope"})

    events = await run(make_gateway(monkeypatch, handler))
    assert len(calls) == 1
    assert events[0]["code"] == "provider_http_401" and events[0]["recoverable"] is False


@pytest.mark.asyncio
async def test_gateway_down_is_unavailable(monkeypatch):
    def handler(req):
        raise httpx.ConnectError("refused", request=req)

    events = await run(make_gateway(monkeypatch, handler))
    assert events[0]["code"] == "unavailable" and events[0]["recoverable"] is True


@pytest.mark.asyncio
async def test_verified_fallback_model_used_only_on_retry(monkeypatch):
    seen = []

    def handler(req):
        seen.append(json.loads(req.content)["model"])
        return httpx.Response(503) if len(seen) == 1 else sse("fb-model", "ok")

    svc = make_gateway(monkeypatch, handler)
    svc.available_models = ["auto", "fb-model"]
    svc.fallback_model = "fb-model"
    events = await run(svc)
    assert seen == ["auto", "fb-model"]
    assert events[-1]["type"] == "done" and events[-1]["model"] == "fb-model"

    # unverified fallback is ignored: retry stays on the requested model
    seen.clear()
    svc.fallback_model = "not-in-gateway"
    await run(svc)
    assert seen == ["auto", "auto"]


@pytest.mark.asyncio
async def test_cancel_closes_upstream_request(monkeypatch):
    closed = []

    class Body(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"model":"m","choices":[{"delta":{"content":"a"}}]}\n\n'
            await asyncio.sleep(60)  # upstream still pending

        async def aclose(self):
            closed.append(True)

    svc = make_gateway(monkeypatch, lambda req: httpx.Response(200, stream=Body()))
    agen = svc.generate_chat_stream([{"role": "user", "content": "Hello"}])
    assert (await agen.__anext__())["type"] == "chunk"
    await agen.aclose()
    assert closed == [True]


# ---- endpoint level ----

async def _conv(client):
    r = await client.post("/api/v1/ai/copilot/conversations", json={"title": "t", "model": "auto"})
    return r.json()["id"]


def _events(text):
    return [json.loads(l[6:]) for l in text.splitlines() if l.startswith("data: ")]


@pytest.mark.asyncio
async def test_failed_stream_saves_real_error_and_retry_does_not_duplicate(auth_client, monkeypatch):
    client = await auth_client("network_engineer")
    cid = await _conv(client)
    mode = {"fail": True}

    async def fake_stream(messages, model=None, **kw):
        if mode["fail"]:
            yield {"type": "error", "error": "Provider request timed out.", "code": "timeout", "recoverable": True, "model": "auto"}
        else:
            yield {"type": "chunk", "content": "Hi!", "model": "real/model"}
            yield {"type": "done", "model": "real/model"}

    monkeypatch.setattr(ai_gateway, "generate_chat_stream", fake_stream)
    url = f"/api/v1/ai/copilot/conversations/{cid}/messages/stream"

    res = await client.post(url, json={"content": "Hello", "include_network_context": False})
    assert res.status_code == 200
    ev = _events(res.text)
    assert [e["type"] for e in ev] == ["error"]
    assert ev[0]["code"] == "timeout" and ev[0]["recoverable"] is True and ev[0]["message_id"]

    msgs = (await client.get(f"/api/v1/ai/copilot/conversations/{cid}")).json()["messages"]
    assert [(m["role"], m["status"]) for m in msgs] == [("user", "completed"), ("assistant", "error")]
    assert "No response generated" not in msgs[1]["content"]
    assert msgs[1]["error_message"] == "timeout"

    mode["fail"] = False
    res = await client.post(url, json={"content": "Hello", "include_network_context": False, "retry": True})
    assert _events(res.text)[-1]["type"] == "done"
    msgs = (await client.get(f"/api/v1/ai/copilot/conversations/{cid}")).json()["messages"]
    assert [(m["role"], m["status"]) for m in msgs] == [("user", "completed"), ("assistant", "completed")]
    assert msgs[1]["model_used"] == "real/model"


@pytest.mark.asyncio
async def test_retry_when_request_never_reached_server_is_a_normal_send_stored_once(auth_client, monkeypatch):
    """Regression: a dropped connection leaves nothing stored; the UI's Retry used to hit 409 'Nothing to retry'."""
    client = await auth_client("network_engineer")
    cid = await _conv(client)

    async def fake_stream(messages, model=None, **kw):
        yield {"type": "chunk", "content": "Hi!", "model": "real/model"}
        yield {"type": "done", "model": "real/model"}

    monkeypatch.setattr(ai_gateway, "generate_chat_stream", fake_stream)
    url = f"/api/v1/ai/copilot/conversations/{cid}/messages/stream"
    for _ in range(2):  # empty conversation, then again after a completed turn: neither may re-run or duplicate older turns
        res = await client.post(url, json={"content": "Hello", "include_network_context": False, "retry": True})
        assert res.status_code == 200 and _events(res.text)[-1]["type"] == "done"
    msgs = (await client.get(f"/api/v1/ai/copilot/conversations/{cid}")).json()["messages"]
    assert [(m["role"], m["status"]) for m in msgs] == [("user", "completed"), ("assistant", "completed")] * 2


@pytest.mark.asyncio
async def test_failed_assistant_turn_is_not_sent_back_as_model_context(auth_client, monkeypatch):
    client = await auth_client("network_engineer")
    cid = await _conv(client)
    sent = []
    mode = {"fail": True}

    async def fake_stream(messages, model=None, **kw):
        sent.append(messages)
        if mode["fail"]:
            yield {"type": "error", "error": "Provider request timed out.", "code": "timeout", "recoverable": True}
        else:
            yield {"type": "chunk", "content": "ok", "model": "real/model"}
            yield {"type": "done", "model": "real/model"}

    monkeypatch.setattr(ai_gateway, "generate_chat_stream", fake_stream)
    url = f"/api/v1/ai/copilot/conversations/{cid}/messages/stream"
    await client.post(url, json={"content": "first question", "include_network_context": False})
    mode["fail"] = False
    await client.post(url, json={"content": "second question", "include_network_context": False})

    roles = [m["role"] for m in sent[-1]]
    assert roles == ["system", "user", "user"]  # no assistant turn from the failed attempt
    assert all("did not return a response" not in m["content"] for m in sent[-1])
