"""Persisted telemetry trends and operator-applied retention.

Trends read only stored rows. Retention never runs on a schedule: an administrator
sets a policy, previews the affected count, and applies it with that count.
Snapshots linked to a saved report or a survey point are always protected.
"""
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, delete, desc, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from airgrid.models.all_models import (
    AuditLog, DataRetentionPolicy, InternetSpeedTest, NetworkTelemetrySnapshot, SurveyMeasurement,
    TelemetryDailyAggregate, User,
)

TREND_LIMIT = 2000
AGGREGATED_METRICS = ("rssi_dbm", "rx_bitrate_mbps", "tx_bitrate_mbps", "gateway_ping_avg_ms", "gateway_ping_loss_pct")
DATASETS = {
    "collector_telemetry": "Telemetry snapshots not linked to a saved diagnostic report or survey point.",
}


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def connection_label(row) -> str:
    if row.collection_status == "failed":
        return "collection_failed"
    if row.connection_state:
        return row.connection_state
    return "connected" if row.bssid else "unknown"


def connection_transitions(rows) -> list[dict]:
    """State changes and BSSID roams per source; rows must be sorted by collected_at."""
    last: dict[str, tuple[str, str | None]] = {}
    transitions = []
    for row in rows:
        source = str(row.collector_id or row.vantage_point)
        state = (connection_label(row), row.bssid)
        previous = last.get(source)
        if previous and previous != state:
            kind = "roam" if previous[0] == state[0] == "connected" else "state_change"
            transitions.append({"at": _utc(row.collected_at).isoformat(), "source": source, "kind": kind,
                                "from": previous[0], "to": state[0], "snapshot_id": str(row.id)})
        last[source] = state
    return transitions


def merge_metrics(metrics: dict, rows) -> dict:
    """Exact count/sum/min/max merge so repeated retention runs compose."""
    merged = {k: dict(v) for k, v in (metrics or {}).items()}
    for row in rows:
        for name in AGGREGATED_METRICS:
            value = getattr(row, name)
            if value is None:
                continue
            m = merged.setdefault(name, {"count": 0, "sum": 0.0, "min": value, "max": value})
            m["count"] += 1
            m["sum"] += value
            m["min"] = min(m["min"], value)
            m["max"] = max(m["max"], value)
    return merged


async def get_trends(db: AsyncSession, collector_id: uuid.UUID | None, floor_id: uuid.UUID | None,
                     days: int, include_operator_reported: bool) -> dict:
    until = datetime.now(timezone.utc)
    since = until - timedelta(days=days)
    q = select(NetworkTelemetrySnapshot).where(NetworkTelemetrySnapshot.collected_at >= since)
    if collector_id:
        q = q.where(NetworkTelemetrySnapshot.collector_id == collector_id)
    if floor_id:
        q = q.where(NetworkTelemetrySnapshot.floor_id == floor_id)
    if not include_operator_reported:
        q = q.where(NetworkTelemetrySnapshot.data_provenance != "operator_reported")
    # Newest rows win when truncated; returned ascending for charting.
    rows = list((await db.execute(q.order_by(desc(NetworkTelemetrySnapshot.collected_at)).limit(TREND_LIMIT + 1))).scalars())
    truncated = len(rows) > TREND_LIMIT
    rows = sorted(rows[:TREND_LIMIT], key=lambda r: _utc(r.collected_at))

    series = [{
        "snapshot_id": str(r.id), "collected_at": _utc(r.collected_at).isoformat(),
        "collector_id": str(r.collector_id) if r.collector_id else None, "report_id": str(r.report_id) if r.report_id else None,
        "vantage_point": r.vantage_point, "data_provenance": r.data_provenance,
        "collection_status": r.collection_status, "connection_state": connection_label(r),
        "ssid": r.ssid, "bssid": r.bssid, "band": r.band, "channel": r.channel,
        "rssi_dbm": r.rssi_dbm, "rx_bitrate_mbps": r.rx_bitrate_mbps, "tx_bitrate_mbps": r.tx_bitrate_mbps,
        "gateway_rtt_avg_ms": r.gateway_ping_avg_ms, "gateway_loss_pct": r.gateway_ping_loss_pct,
    } for r in rows]

    st = select(InternetSpeedTest).where(InternetSpeedTest.executed_at >= since, InternetSpeedTest.status == "completed")
    if floor_id:
        st = st.where(InternetSpeedTest.floor_id == floor_id)
    speed_rows = list((await db.execute(st.order_by(InternetSpeedTest.executed_at).limit(500))).scalars())
    speed_tests = [{
        "id": str(s.id), "executed_at": _utc(s.executed_at).isoformat(), "vantage_point": s.vantage_point,
        "data_provenance": s.data_provenance, "download_mbps": s.download_mbps, "upload_mbps": s.upload_mbps,
        "latency_ms": s.latency_ms, "jitter_ms": s.jitter_ms, "packet_loss_pct": s.packet_loss_pct,
    } for s in speed_rows]

    ag = select(TelemetryDailyAggregate).where(TelemetryDailyAggregate.day >= since - timedelta(days=1))
    if collector_id:
        ag = ag.where(TelemetryDailyAggregate.collector_id == collector_id)
    if floor_id:
        ag = ag.where(TelemetryDailyAggregate.floor_id == floor_id)
    aggregates = [{
        "day": _utc(a.day).date().isoformat(), "collector_id": str(a.collector_id) if a.collector_id else None,
        "vantage_point": a.vantage_point, "sample_count": a.sample_count,
        "metrics": {k: {**v, "avg": v["sum"] / v["count"]} for k, v in (a.metrics or {}).items() if v.get("count")},
    } for a in (await db.execute(ag.order_by(TelemetryDailyAggregate.day))).scalars()]

    latest = _utc(rows[-1].collected_at) if rows else None
    latest_speed = _utc(speed_rows[-1].executed_at) if speed_rows else None
    metric_keys = ("rssi_dbm", "rx_bitrate_mbps", "tx_bitrate_mbps", "gateway_rtt_avg_ms", "gateway_loss_pct")
    return {
        "window": {"since": since.isoformat(), "until": until.isoformat(), "days": days},
        "filters": {"collector_id": str(collector_id) if collector_id else None, "floor_id": str(floor_id) if floor_id else None,
                    "include_operator_reported": include_operator_reported},
        "series": series, "transitions": connection_transitions(rows), "speed_tests": speed_tests,
        "daily_aggregates": aggregates, "truncated": truncated,
        "availability": {k: sum(1 for p in series if p[k] is not None) for k in metric_keys}
                        | {"speed_tests": len(speed_tests), "failed_collections": sum(1 for p in series if p["collection_status"] == "failed")},
        "freshness": {
            "latest_observation_at": latest.isoformat() if latest else None,
            "observation_age_seconds": (until - latest).total_seconds() if latest else None,
            "latest_speed_test_at": latest_speed.isoformat() if latest_speed else None,
        },
        "notes": ["Values are persisted observations only; gaps mean nothing was recorded.",
                  "Browser speed tests describe the operator's browser device, not the collector host."],
    }


# --- Retention -------------------------------------------------------------

def _require_dataset(dataset: str) -> None:
    if dataset not in DATASETS:
        raise HTTPException(status_code=404, detail="Unknown retention dataset.")


def _eligible_filter(cutoff: datetime):
    return and_(
        NetworkTelemetrySnapshot.report_id.is_(None),
        NetworkTelemetrySnapshot.collected_at < cutoff,
        ~exists().where(SurveyMeasurement.source_telemetry_snapshot_id == NetworkTelemetrySnapshot.id),
    )


async def list_policies(db: AsyncSession) -> list[dict]:
    stored = {p.dataset: p for p in (await db.execute(select(DataRetentionPolicy))).scalars()}
    return [{
        "dataset": name, "description": description,
        "retention_days": stored[name].retention_days if name in stored else None,
        "aggregate_before_delete": stored[name].aggregate_before_delete if name in stored else True,
        "updated_at": stored[name].updated_at.isoformat() if name in stored else None,
    } for name, description in DATASETS.items()]


async def update_policy(db: AsyncSession, dataset: str, retention_days: int | None, aggregate: bool, user: User) -> dict:
    _require_dataset(dataset)
    policy = await db.get(DataRetentionPolicy, dataset)
    before = policy.retention_days if policy else None
    if not policy:
        policy = DataRetentionPolicy(dataset=dataset)
        db.add(policy)
    policy.retention_days = retention_days
    policy.aggregate_before_delete = aggregate
    policy.updated_by_id = user.id
    db.add(AuditLog(actor_id=user.id, action="retention.policy_updated", resource_type="data_retention_policies",
                    resource_id=dataset, payload={"retention_days_before": before, "retention_days": retention_days,
                                                  "aggregate_before_delete": aggregate}))
    await db.commit()
    return next(p for p in await list_policies(db) if p["dataset"] == dataset)


async def preview(db: AsyncSession, dataset: str) -> dict:
    _require_dataset(dataset)
    policy = await db.get(DataRetentionPolicy, dataset)
    if not policy or policy.retention_days is None:
        return {"dataset": dataset, "enabled": False, "retention_days": None, "cutoff": None,
                "eligible_count": 0, "protected_count": 0, "oldest_eligible_at": None,
                "note": "Retention is disabled; all records are kept."}
    cutoff = datetime.now(timezone.utc) - timedelta(days=policy.retention_days)
    eligible, oldest = (await db.execute(select(func.count(NetworkTelemetrySnapshot.id), func.min(NetworkTelemetrySnapshot.collected_at))
                                         .where(_eligible_filter(cutoff)))).one()
    older = (await db.execute(select(func.count(NetworkTelemetrySnapshot.id))
                              .where(NetworkTelemetrySnapshot.collected_at < cutoff))).scalar_one()
    return {"dataset": dataset, "enabled": True, "retention_days": policy.retention_days, "cutoff": cutoff.isoformat(),
            "eligible_count": eligible, "protected_count": older - eligible,
            "oldest_eligible_at": _utc(oldest).isoformat() if oldest else None,
            "aggregate_before_delete": policy.aggregate_before_delete,
            "note": "Snapshots linked to saved reports or survey points are protected."}


async def apply(db: AsyncSession, dataset: str, confirm: bool, expected_count: int, user: User) -> dict:
    current = await preview(db, dataset)
    if not confirm:
        raise HTTPException(status_code=400, detail="Explicit confirmation is required to delete records.")
    if not current["enabled"]:
        raise HTTPException(status_code=409, detail="Retention is disabled for this dataset.")
    if current["eligible_count"] != expected_count:
        raise HTTPException(status_code=409, detail="Eligible record count changed; preview again before applying.")
    cutoff = datetime.fromisoformat(current["cutoff"])
    # ponytail: loads all eligible rows at once; batch by id ranges if a single run exceeds ~100k rows.
    rows = list((await db.execute(select(NetworkTelemetrySnapshot).where(_eligible_filter(cutoff)))).scalars())

    aggregated_groups = 0
    if current["aggregate_before_delete"]:
        groups = defaultdict(list)
        for r in rows:
            day = _utc(r.collected_at).replace(hour=0, minute=0, second=0, microsecond=0)
            groups[(r.collector_id, r.floor_id, r.vantage_point, r.data_provenance, day)].append(r)
        for (collector_id, floor_id, vantage, provenance, day), members in groups.items():
            existing = (await db.execute(select(TelemetryDailyAggregate).where(
                TelemetryDailyAggregate.collector_id.is_(None) if collector_id is None else TelemetryDailyAggregate.collector_id == collector_id,
                TelemetryDailyAggregate.floor_id.is_(None) if floor_id is None else TelemetryDailyAggregate.floor_id == floor_id,
                TelemetryDailyAggregate.vantage_point == vantage, TelemetryDailyAggregate.data_provenance == provenance,
                TelemetryDailyAggregate.day == day))).scalar_one_or_none()
            if existing:
                existing.metrics = merge_metrics(existing.metrics, members)
                existing.sample_count += len(members)
            else:
                db.add(TelemetryDailyAggregate(collector_id=collector_id, floor_id=floor_id, vantage_point=vantage,
                                               data_provenance=provenance, day=day, sample_count=len(members),
                                               metrics=merge_metrics({}, members)))
        aggregated_groups = len(groups)

    ids = [r.id for r in rows]
    for start in range(0, len(ids), 1000):
        await db.execute(delete(NetworkTelemetrySnapshot).where(NetworkTelemetrySnapshot.id.in_(ids[start:start + 1000])))
    db.add(AuditLog(actor_id=user.id, action="retention.applied", resource_type="data_retention_policies",
                    resource_id=dataset, payload={"deleted": len(ids), "aggregated_groups": aggregated_groups,
                                                  "cutoff": current["cutoff"]}))
    await db.commit()
    return {"dataset": dataset, "deleted": len(ids), "aggregated_groups": aggregated_groups, "cutoff": current["cutoff"]}
