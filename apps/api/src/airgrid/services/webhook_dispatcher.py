import json
import time
import uuid
from typing import Optional
import httpx

from airgrid.core.config import settings
from airgrid.core.logging import logger
from airgrid.core.security import compute_webhook_signature
from airgrid.schemas.webhook import WebhookEventPayload, WebhookDeliveryResult


class WebhookDispatcherService:
    """
    Dispatches HMAC-signed webhook events to n8n automation pipelines.
    Enforces replay defense headers, bounded retries, and delivery tracking.
    """

    def __init__(self):
        self.webhook_url = settings.AIRGRID_N8N_WEBHOOK_URL
        self.secret = settings.AIRGRID_WEBHOOK_SECRET
        self.timeout = settings.AIRGRID_WEBHOOK_TIMEOUT_SECONDS

    async def dispatch(
        self,
        event: WebhookEventPayload,
        simulate: bool = True,  # Phase 00 default: do not send real live notifications
    ) -> WebhookDeliveryResult:
        delivery_id = str(uuid.uuid4())
        timestamp = int(time.time())
        start_time = time.perf_counter()

        # Serialize body consistently
        body_dict = event.model_dump(mode="json")
        body_bytes = json.dumps(body_dict, sort_keys=True).encode("utf-8")

        # Compute HMAC signature
        signature = compute_webhook_signature(body_bytes, timestamp, self.secret)

        headers = {
            "Content-Type": "application/json",
            "X-AirGrid-Signature": signature,
            "X-AirGrid-Timestamp": str(timestamp),
            "X-AirGrid-Delivery-ID": delivery_id,
        }

        if simulate:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            logger.info(
                "Simulated webhook dispatch (Delivery: %s, Event: %s, Signature: %s)",
                delivery_id,
                event.event_type,
                signature[:18] + "...",
            )
            return WebhookDeliveryResult(
                delivery_id=delivery_id,
                event_id=event.event_id,
                status="simulated",
                status_code=200,
                attempt=1,
                duration_ms=duration_ms,
            )

        # Active HTTP delivery with 3 bounded retries
        for attempt in range(1, 4):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(self.webhook_url, content=body_bytes, headers=headers)
                duration_ms = int((time.perf_counter() - start_time) * 1000)

                if resp.status_code in (200, 201, 202, 204):
                    return WebhookDeliveryResult(
                        delivery_id=delivery_id,
                        event_id=event.event_id,
                        status="delivered",
                        status_code=resp.status_code,
                        attempt=attempt,
                        duration_ms=duration_ms,
                    )
                logger.warning(
                    "Webhook endpoint responded with HTTP %s on attempt %d: %s",
                    resp.status_code,
                    attempt,
                    resp.text,
                )
            except Exception as exc:
                logger.warning("Webhook dispatch attempt %d failed: %s", attempt, exc)

        duration_ms = int((time.perf_counter() - start_time) * 1000)
        return WebhookDeliveryResult(
            delivery_id=delivery_id,
            event_id=event.event_id,
            status="failed",
            status_code=None,
            attempt=3,
            duration_ms=duration_ms,
            error_message="Webhook delivery failed after 3 attempts.",
        )


webhook_dispatcher = WebhookDispatcherService()
