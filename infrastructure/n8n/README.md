# AirGrid n8n Automation Workflows

This directory contains integration templates and workflow JSON definitions for n8n.

## Port Assignment
To prevent collisions with existing containers or debugging tools on the local machine (ports 5678 and 5679 are commonly reserved), AirGrid configures n8n to listen on host port **5680**:
- Web UI: `http://localhost:5680`
- Webhook Ingestion URL: `http://localhost:5680/webhook/airgrid-events`

## Security Protocols
All webhooks dispatched from AirGrid include:
1. `X-AirGrid-Signature`: `sha256=<hex_hmac>`
2. `X-AirGrid-Timestamp`: Epoch seconds
3. `X-AirGrid-Delivery-ID`: UUIDv4

The receiving Code node in n8n enforces:
- HMAC verification with `AIRGRID_WEBHOOK_SECRET`
- Replay prevention window: `abs(now - timestamp) <= 300` seconds
