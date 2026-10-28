"""Registered collector credentials and signed telemetry ingestion.

Trust model: an administrator registers a collector and receives a secret once.
The secret is HMAC(AIRGRID_SECRET_KEY, id:salt) and is never stored, so a database
dump does not leak collector credentials. Each submission is signed over
collector id, unix timestamp, a single-use nonce and the SHA-256 of the exact body.
"""
import hashlib
import hmac
import re
import secrets
import time
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.core.config import settings
from airgrid.models.all_models import AuditLog, NetworkCollector, NetworkTelemetrySnapshot, User
from airgrid.schemas.collectors import CollectorCreate, CollectorSubmission
from airgrid.services.auth_service import LoginRateLimiter

MAX_BODY_BYTES = 16 * 1024
TIMESTAMP_WINDOW_SECONDS = 300
NONCE_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
SIGNATURE_RE = re.compile(r"^[0-9a-f]{64}$")
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}

# ponytail: per-process sliding windows; use a shared store before running multiple API workers.
# Accepted submissions count against the authenticated collector; failures count against the source IP,
# so a party without the secret cannot exhaust a real collector's quota. Behind a proxy, run uvicorn
# with --proxy-headers so request.client is the real client address.
ingest_limiter = LoginRateLimiter(max_attempts=30, window_seconds=60)
failure_limiter = LoginRateLimiter(max_attempts=100, window_seconds=300)


def _signing_key() -> bytes:
    # Fail closed: with the public default key, a database dump would be enough to derive collector secrets.
    key = settings.AIRGRID_SECRET_KEY
    default = type(settings).model_fields["AIRGRID_SECRET_KEY"].default
    if settings.AIRGRID_ENV.lower() != "testing" and (key == default or len(key) < 32):
        raise HTTPException(status_code=503, detail="Collector credentials require a unique AIRGRID_SECRET_KEY of at least 32 characters.")
    return key.encode()


def derive_secret(collector_id: uuid.UUID, salt: str) -> str:
    return hmac.new(_signing_key(), f"airgrid-collector:{collector_id}:{salt}".encode(),
                    hashlib.sha256).hexdigest()


def sign_submission(secret: str, collector_id: str, timestamp: int, nonce: str, body: bytes) -> str:
    """Shared by the API (verify) and packages/collector (sign)."""
    message = f"{collector_id}\n{timestamp}\n{nonce}\n{hashlib.sha256(body).hexdigest()}".encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def _audit(db: AsyncSession, user: User, action: str, collector: NetworkCollector, **payload) -> None:
    db.add(AuditLog(actor_id=user.id, action=action, resource_type="network_collectors",
                    resource_id=str(collector.id), payload={"name": collector.name, **payload}))


async def register(db: AsyncSession, req: CollectorCreate, user: User) -> tuple[NetworkCollector, str]:
    from airgrid.services.diagnostic_service import diagnostic_service
    await diagnostic_service._validate_scope(db, req)
    collector = NetworkCollector(
        id=uuid.uuid4(), name=req.name.strip(), host_label=req.host_label, description=req.description,
        campus_id=req.campus_id, building_id=req.building_id, floor_id=req.floor_id,
        status="active", secret_salt=secrets.token_hex(16), created_by_id=user.id,
        submission_count=0, rejected_count=0,
    )
    db.add(collector)
    _audit(db, user, "collector.registered", collector, floor_id=str(req.floor_id) if req.floor_id else None)
    await db.commit()
    await db.refresh(collector)
    return collector, derive_secret(collector.id, collector.secret_salt)


async def _get_or_404(db: AsyncSession, collector_id: uuid.UUID) -> NetworkCollector:
    collector = await db.get(NetworkCollector, collector_id)
    if not collector:
        raise HTTPException(status_code=404, detail="Collector not found.")
    return collector


async def revoke(db: AsyncSession, collector_id: uuid.UUID, user: User) -> NetworkCollector:
    collector = await _get_or_404(db, collector_id)
    if collector.status != "revoked":
        collector.status = "revoked"
        collector.revoked_at = datetime.now(timezone.utc)
        collector.revoked_by_id = user.id
        _audit(db, user, "collector.revoked", collector)
        await db.commit()
        await db.refresh(collector)
    return collector


async def rotate(db: AsyncSession, collector_id: uuid.UUID, user: User) -> tuple[NetworkCollector, str]:
    collector = await _get_or_404(db, collector_id)
    if collector.status != "active":
        raise HTTPException(status_code=409, detail="Revoked collectors cannot be rotated; register a new collector.")
    collector.secret_salt = secrets.token_hex(16)
    _audit(db, user, "collector.secret_rotated", collector)
    await db.commit()
    await db.refresh(collector)
    return collector, derive_secret(collector.id, collector.secret_salt)


async def list_collectors(db: AsyncSession) -> list[NetworkCollector]:
    result = await db.execute(select(NetworkCollector).order_by(desc(NetworkCollector.created_at)).limit(200))
    return list(result.scalars())


async def list_observations(db: AsyncSession, collector_id: uuid.UUID, limit: int) -> list[NetworkTelemetrySnapshot]:
    await _get_or_404(db, collector_id)
    result = await db.execute(select(NetworkTelemetrySnapshot)
                              .where(NetworkTelemetrySnapshot.collector_id == collector_id)
                              .order_by(desc(NetworkTelemetrySnapshot.collected_at)).limit(limit))
    return list(result.scalars())


def require_trusted_transport(request: Request) -> None:
    """Loopback may use plain HTTP; remote collectors must reach the API over HTTPS (TLS-terminating proxy)."""
    host = request.client.host if request.client else ""
    if host not in LOOPBACK_HOSTS and request.url.scheme != "https":
        raise HTTPException(status_code=403, detail="Remote collector submissions require HTTPS.")


async def read_bounded_body(request: Request) -> bytes:
    declared = request.headers.get("content-length")
    if declared and (not declared.isdigit() or int(declared) > MAX_BODY_BYTES):
        raise HTTPException(status_code=413, detail=f"Submission exceeds {MAX_BODY_BYTES} bytes.")
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail=f"Submission exceeds {MAX_BODY_BYTES} bytes.")
    return body


async def _reject(db: AsyncSession, collector: NetworkCollector, status_label: str) -> None:
    collector.rejected_count += 1
    collector.last_submission_status = status_label
    await db.commit()


async def authenticate(db: AsyncSession, request: Request, body: bytes) -> tuple[NetworkCollector, str]:
    """Returns (collector, nonce). Malformed or unknown credentials get the same generic 401."""
    # One coarse flood gate per source address, checked before any DB access. Only unauthenticated (401)
    # outcomes count, so key holders never add to it. Tradeoff: a flood above the threshold from a shared
    # address also delays a valid collector there; deploy with real client IPs (uvicorn --proxy-headers).
    key = f"ip:{request.client.host if request.client else 'unknown'}"
    limited, retry_after = failure_limiter.is_rate_limited(key)
    if limited:
        raise HTTPException(status_code=429, detail="Too many failed collector submissions from this address.",
                            headers={"Retry-After": str(retry_after)})
    try:
        return await _authenticate(db, request, body)
    except HTTPException as exc:
        if exc.status_code == 401:
            failure_limiter.record_failure(key)
        raise


async def _authenticate(db: AsyncSession, request: Request, body: bytes) -> tuple[NetworkCollector, str]:
    failed = HTTPException(status_code=401, detail="Collector authentication failed.")
    h = request.headers
    nonce, signature = h.get("X-AirGrid-Nonce", ""), h.get("X-AirGrid-Signature", "")
    try:
        collector_id = uuid.UUID(h.get("X-AirGrid-Collector", ""))
        timestamp = int(h.get("X-AirGrid-Timestamp", ""))
    except ValueError:
        raise failed
    if not NONCE_RE.fullmatch(nonce) or not SIGNATURE_RE.fullmatch(signature):
        raise failed

    if abs(time.time() - timestamp) > TIMESTAMP_WINDOW_SECONDS:
        raise HTTPException(status_code=401, detail="Collector request timestamp is outside the accepted window; check host clock.")
    collector = await db.get(NetworkCollector, collector_id)
    if not collector:
        raise failed
    expected = sign_submission(derive_secret(collector.id, collector.secret_salt), str(collector.id), timestamp, nonce, body)
    if not hmac.compare_digest(expected, signature):
        # Unauthenticated: bump the visible counter only; never overwrite the collector's last status.
        collector.rejected_count += 1
        await db.commit()
        raise failed
    # Revocation is disclosed only to holders of a once-valid secret.
    if collector.status != "active":
        await _reject(db, collector, "rejected_revoked")
        raise HTTPException(status_code=403, detail="Collector credential has been revoked.")
    exists = await db.execute(select(NetworkTelemetrySnapshot.id).where(
        NetworkTelemetrySnapshot.collector_id == collector.id, NetworkTelemetrySnapshot.submission_nonce == nonce))
    if exists.first():
        await _reject(db, collector, "rejected_replay")
        raise HTTPException(status_code=409, detail="Replayed submission rejected.")
    limited, retry_after = ingest_limiter.is_rate_limited(str(collector.id))
    if limited:
        raise HTTPException(status_code=429, detail="Collector submission rate exceeded.",
                            headers={"Retry-After": str(retry_after)})
    ingest_limiter.record_failure(str(collector.id))  # counts accepted attempts for this collector
    return collector, nonce


async def ingest(db: AsyncSession, collector: NetworkCollector, nonce: str, payload: CollectorSubmission) -> NetworkTelemetrySnapshot:
    received_at = datetime.now(timezone.utc)
    if abs((received_at - payload.collected_at).total_seconds()) > TIMESTAMP_WINDOW_SECONDS:
        await _reject(db, collector, "rejected_stale")
        raise HTTPException(status_code=422, detail="collected_at must be within 5 minutes of submission; submit observations promptly.")
    ping = payload.gateway_ping
    raw = {"received_at": received_at.isoformat(), "signed_submission": True,
           "collector_software": payload.collector_software}
    if ping:
        raw["gateway_ping"] = {"target_ip": "default_gateway", "status": "completed", **ping.model_dump()}
    snapshot = NetworkTelemetrySnapshot(
        id=uuid.uuid4(), report_id=None, user_id=None,
        campus_id=collector.campus_id, building_id=collector.building_id, floor_id=collector.floor_id,
        interface_name=payload.interface_name or "unknown",
        ssid=payload.ssid, bssid=payload.bssid, rssi_dbm=payload.rssi_dbm,
        signal_quality_pct=payload.signal_quality_pct, frequency_mhz=payload.frequency_mhz,
        channel=payload.channel, channel_width_mhz=payload.channel_width_mhz, band=payload.band,
        rx_bitrate_mbps=payload.rx_bitrate_mbps, tx_bitrate_mbps=payload.tx_bitrate_mbps,
        security_protocol=payload.security_protocol,
        gateway_ping_avg_ms=ping.rtt_avg_ms if ping else None,
        gateway_ping_min_ms=ping.rtt_min_ms if ping else None,
        gateway_ping_max_ms=ping.rtt_max_ms if ping else None,
        gateway_ping_loss_pct=ping.loss_pct if ping else None,
        vantage_point="registered_collector", data_provenance="instrumented_linux_telemetry",
        raw_details=raw, collected_at=payload.collected_at,
        collector_id=collector.id, submission_nonce=nonce,
        collection_status=payload.collection_status, collection_error=payload.error,
        connection_state=payload.connection_state,
    )
    db.add(snapshot)
    collector.last_seen_at = received_at
    collector.submission_count += 1
    collector.last_submission_status = payload.collection_status
    try:
        await db.commit()
    except IntegrityError:
        # Concurrent duplicate nonce: the unique constraint is the final replay guard.
        await db.rollback()
        raise HTTPException(status_code=409, detail="Replayed submission rejected.")
    await db.refresh(snapshot)
    return snapshot
