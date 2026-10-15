from fastapi import APIRouter
from airgrid.schemas.webhook import WebhookEventPayload, WebhookDeliveryResult
from airgrid.services.webhook_dispatcher import webhook_dispatcher

router = APIRouter()


@router.post("/dispatch-test", response_model=WebhookDeliveryResult, tags=["Automation & n8n"])
async def dispatch_test_webhook(event: WebhookEventPayload):
    """
    Simulates sending an HMAC-signed webhook to n8n.
    In Phase 00, operates in simulation mode without sending live notifications.
    """
    return await webhook_dispatcher.dispatch(event, simulate=True)
