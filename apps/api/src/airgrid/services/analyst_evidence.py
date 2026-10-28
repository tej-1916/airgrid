"""Evidence-grounded questions, comparisons and history for the Analyst.

Every answer is composed locally from persisted records and cites them. The
optional gateway pass may only rephrase: its citations must be known evidence
IDs and every number it states must already appear in the evidence, the local
answer or the question; otherwise the local answer stands.
"""
import json
import math
import re
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from airgrid.models.all_models import (
    AnalysisRecord, AuditLog, InternetSpeedTest, MLEvaluation, MLModel, NetworkTelemetrySnapshot,
    SurveyMeasurement, SurveySession, User,
)
from airgrid.schemas.ai import AIGenerateRequest
from airgrid.services.ai_gateway import ai_gateway
from airgrid.services.diagnostic_engine import diagnostic_engine
from airgrid.services.diagnostic_service import snapshot_to_response
from airgrid.services.optimization_service import SURVEY_SOURCES, get_optimization

WEAK_RSSI_DBM = -75
TOPICS = {
    # Ordered: earlier topics win ties.
    "ml_vs_idw": ("model", "ml", "idw", "outperform", "prediction", "predict", "interpolation"),
    "latency": ("latency", "ping", "rtt", "lag", "delay", "jitter"),
    "improvement": ("improve", "improved", "better", "worse", "yesterday", "compared", "change", "changed"),
    "measurement_gaps": ("where", "gap", "gaps", "additional", "coverage", "measure", "measurements"),
    "survey": ("survey", "heatmap", "session", "sessions", "results"),
    "weak_signal": ("weak", "signal", "rssi", "dbm", "why", "poor"),
}
TELEMETRY_METRICS = {"rssi_dbm": "dBm", "rx_bitrate_mbps": "Mbps", "tx_bitrate_mbps": "Mbps",
                     "gateway_ping_avg_ms": "ms", "gateway_ping_loss_pct": "%"}
SPEED_METRICS = {"download_mbps": "Mbps", "upload_mbps": "Mbps", "latency_ms": "ms"}
# Smallest median change reported as a change rather than "no clear change".
CHANGE_THRESHOLDS = {"rssi_dbm": 3.0, "gateway_ping_avg_ms": 5.0, "latency_ms": 5.0, "gateway_ping_loss_pct": 1.0}
CHANGE_FRACTION = 0.2  # throughput metrics: 20 %


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=3, max_length=500)
    floor_id: Optional[uuid.UUID] = None
    collector_id: Optional[uuid.UUID] = None
    network_label: Optional[str] = Field(default=None, min_length=1, max_length=64)
    days: int = Field(default=7, ge=1, le=90)
    use_gateway: bool = False
    allow_external: bool = False


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: str
    floor_id: Optional[uuid.UUID] = None
    collector_id: Optional[uuid.UUID] = None
    earlier_start: datetime
    earlier_end: datetime
    later_start: datetime
    later_end: datetime


class GatewayAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer: str = Field(min_length=1, max_length=1200)
    citations: list[str] = Field(min_length=1, max_length=20)


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def classify(question: str) -> Optional[str]:
    words = re.findall(r"[a-z0-9]+", question.lower())
    scores = {topic: sum(w in keys for w in words) for topic, keys in TOPICS.items()}
    best = max(scores.values())
    return next((t for t in TOPICS if scores[t] == best), None) if best else None


def cite(kind: str, rid, ts: Optional[datetime], metric: str, value, unit: str = "") -> dict:
    return {"source_id": f"{kind}:{rid}", "kind": kind, "timestamp": _utc(ts).isoformat() if ts else None,
            "metric": metric, "value": round(value, 2) if isinstance(value, float) else value, "unit": unit}


def is_change(metric: str, earlier: float, later: float) -> bool:
    if metric in CHANGE_THRESHOLDS:
        return abs(later - earlier) >= CHANGE_THRESHOLDS[metric]
    return abs(later - earlier) >= CHANGE_FRACTION * max(abs(earlier), 1e-9)


def compare_groups(earlier: list[float], later: list[float], metric: str, min_samples: int = 3) -> dict:
    """Median comparison of two windows from one source and method."""
    if len(earlier) < min_samples or len(later) < min_samples:
        return {"status": "insufficient", "earlier_n": len(earlier), "later_n": len(later),
                "detail": f"At least {min_samples} samples per window are required."}
    a, b = statistics.median(earlier), statistics.median(later)
    return {"status": "changed" if is_change(metric, a, b) else "no_clear_change", "earlier_n": len(earlier),
            "later_n": len(later), "earlier_median": round(a, 2), "later_median": round(b, 2), "delta": round(b - a, 2)}


def persistence(values: list[tuple[datetime, float]], threshold: float = WEAK_RSSI_DBM) -> dict:
    """Weak-signal persistence across a window: persistent needs >=5 samples on >=2 days, >=70 % weak."""
    if not values:
        return {"class": "no_data", "weak_share": None, "n": 0}
    weak = [v for _, v in values if v < threshold]
    share = len(weak) / len(values)
    days = len({_utc(t).date() for t, _ in values})
    if share == 0:
        label = "none_observed"
    elif share >= 0.7 and len(values) >= 5 and days >= 2:
        label = "persistent"
    elif share < 0.3:
        label = "transient"
    else:
        label = "intermittent_or_insufficient"
    return {"class": label, "weak_share": round(share, 2), "n": len(values), "days": days}


def grid_cell(x: float, y: float, n: int = 8) -> tuple[int, int]:
    return min(n - 1, int(x * n)), min(n - 1, int(y * n))


def session_stats(points) -> dict:
    rssi = [p.rssi_dbm for p in points]
    if not rssi:
        return {"n": 0}
    times = [_utc(p.observed_at) for p in points]
    return {"n": len(rssi), "median_rssi_dbm": round(statistics.median(rssi), 1),
            "weak_share": round(sum(r < WEAK_RSSI_DBM for r in rssi) / len(rssi), 2),
            "provenance": sorted({p.data_provenance for p in points}),
            "sources": sorted({p.measurement_source for p in points}),
            "cells": len({grid_cell(p.normalized_x, p.normalized_y) for p in points}),
            "first_at": min(times).isoformat(), "last_at": max(times).isoformat()}


def _qualifying(points, network_label):
    return [p for p in points if p.network_label == network_label and p.data_provenance in SURVEY_SOURCES
            and p.observed_at and math.isfinite(p.rssi_dbm) and -100 <= p.rssi_dbm <= -20
            and 0 <= p.normalized_x <= 1 and 0 <= p.normalized_y <= 1]


def compare_sessions(before, after, before_points, after_points, network_label: str) -> dict:
    """Observed before/after comparison of two survey sessions; co-located grid cells are paired."""
    if before.floor_id != after.floor_id:
        raise HTTPException(status_code=422, detail="Sessions are on different floors and cannot be compared.")
    if before.id == after.id:
        raise HTTPException(status_code=422, detail="Select two different sessions.")
    a, b = _qualifying(before_points, network_label), _qualifying(after_points, network_label)
    cells_a, cells_b = {}, {}
    for p in a:
        cells_a.setdefault(grid_cell(p.normalized_x, p.normalized_y), []).append(p.rssi_dbm)
    for p in b:
        cells_b.setdefault(grid_cell(p.normalized_x, p.normalized_y), []).append(p.rssi_dbm)
    shared = sorted(set(cells_a) & set(cells_b))
    deltas = {c: statistics.median(cells_b[c]) - statistics.median(cells_a[c]) for c in shared}
    stats_a, stats_b = session_stats(a), session_stats(b)
    caveats = []
    if stats_a.get("provenance") != stats_b.get("provenance"):
        caveats.append("Sessions use different measurement methods; differences may reflect the method, not the network.")
    if stats_a.get("sources") != stats_b.get("sources"):
        caveats.append("Different measurement sources/devices were used; device sensitivity differs.")
    if len(shared) < 3:
        caveats.append("Fewer than 3 co-located grid cells; the paired comparison is not established.")
    return {
        "network_label": network_label, "floor_id": str(before.floor_id), "kind": "observed",
        "before": {"session_id": str(before.id), "name": before.session_name, **stats_a},
        "after": {"session_id": str(after.id), "name": after.session_name, **stats_b},
        "paired_cells": len(shared),
        "median_cell_delta_db": round(statistics.median(deltas.values()), 1) if deltas else None,
        "improved_cells": sum(d >= 3 for d in deltas.values()),
        "degraded_cells": sum(d <= -3 for d in deltas.values()),
        "unchanged_cells": sum(-3 < d < 3 for d in deltas.values()),
        "cells_only_before": len(set(cells_a) - set(cells_b)), "cells_only_after": len(set(cells_b) - set(cells_a)),
        "cell_deltas": [{"cell": list(c), "delta_db": round(d, 1), "before_n": len(cells_a[c]), "after_n": len(cells_b[c])}
                        for c, d in deltas.items()],
        "evidence_ids": [f"survey_point:{p.id}" for p in (a + b)][:400],
        "caveats": caveats + ["Observed values only; no predicted gain is implied. A 3 dB change is the minimum reported per cell."],
    }


async def load_session_pair(db: AsyncSession, before_id: uuid.UUID, after_id: uuid.UUID):
    sessions = []
    for sid in (before_id, after_id):
        s = await db.get(SurveySession, sid)
        if not s:
            raise HTTPException(status_code=404, detail=f"Survey session {sid} not found.")
        pts = list((await db.execute(select(SurveyMeasurement).where(SurveyMeasurement.survey_session_id == sid)
                                     .limit(10000))).scalars())
        sessions.append((s, pts))
    return sessions


# --- Evidence queries ------------------------------------------------------------------

async def telemetry(db: AsyncSession, req, since: datetime) -> list[NetworkTelemetrySnapshot]:
    q = select(NetworkTelemetrySnapshot).where(
        NetworkTelemetrySnapshot.collected_at >= since,
        NetworkTelemetrySnapshot.data_provenance != "operator_reported",
        NetworkTelemetrySnapshot.collection_status != "failed")
    if req.collector_id:
        q = q.where(NetworkTelemetrySnapshot.collector_id == req.collector_id)
    if req.floor_id:
        q = q.where(NetworkTelemetrySnapshot.floor_id == req.floor_id)
    rows = list((await db.execute(q.order_by(desc(NetworkTelemetrySnapshot.collected_at)).limit(2000))).scalars())
    return sorted(rows, key=lambda r: _utc(r.collected_at))


async def speed_tests(db: AsyncSession, req, since: datetime) -> list[InternetSpeedTest]:
    q = select(InternetSpeedTest).where(InternetSpeedTest.executed_at >= since, InternetSpeedTest.status == "completed")
    if req.floor_id:
        q = q.where(InternetSpeedTest.floor_id == req.floor_id)
    return list((await db.execute(q.order_by(InternetSpeedTest.executed_at).limit(500))).scalars())


def source_key(row) -> str:
    return f"collector:{row.collector_id}" if row.collector_id else f"vantage:{row.vantage_point}"


def device_key(row) -> str:
    return f"device:{row.device_id}" if row.device_id else "browser:unattributed"


# --- Topic answers ------------------------------------------------------------------------

async def answer_weak_signal(db, req, since):
    rows = [r for r in await telemetry(db, req, since) if r.rssi_dbm is not None]
    if not rows:
        return None, [], ["No instrument RSSI observations in this scope and window."]
    groups = {}
    for r in rows:
        groups.setdefault(source_key(r), []).append(r)
    source, group = max(groups.items(), key=lambda kv: len(kv[1]))
    latest = group[-1]
    findings, _, _ = diagnostic_engine.analyze(snapshot_to_response(latest))
    signal = [f for f in findings if f.metric_key in ("rssi_dbm", "band", "frequency_mhz", "rx_bitrate_mbps")]
    p = persistence([(r.collected_at, r.rssi_dbm) for r in group])
    citations = [cite("snapshot", r.id, r.collected_at, "rssi_dbm", r.rssi_dbm, "dBm") for r in group[-20:]]
    text = (f"The latest instrument observation from {source} recorded {latest.rssi_dbm:.0f} dBm"
            f"{f' on {latest.band}' if latest.band else ''} at {_utc(latest.collected_at).isoformat()}. "
            f"{round(p['weak_share'] * 100)}% of {p['n']} samples over {p['days']} day(s) were below {WEAK_RSSI_DBM} dBm "
            f"({p['class'].replace('_', ' ')}). ")
    if signal:
        text += "Rule checks: " + " ".join(f"{f.title}: {f.measured_evidence}" for f in signal[:3])
    missing = ["AP placement, walls and interference are not recorded, so a cause cannot be established."]
    if len(groups) > 1:
        missing.append(f"{len(groups)} sources exist in scope; only the source with most samples was used.")
    return {"text": text.strip(), "details": {"persistence": p, "source": source,
                                              "recommendations": [f.recommendation for f in signal[:3]]}}, citations, missing


async def _window_compare(db, req, metric, earlier, later):
    """earlier/later are (start, end) tuples; groups by one source/device so methods never mix."""
    if metric in TELEMETRY_METRICS:
        rows = [r for r in await telemetry(db, req, earlier[0]) if getattr(r, metric) is not None]
        key, kind, ts, unit = source_key, "snapshot", "collected_at", TELEMETRY_METRICS[metric]
    elif metric in SPEED_METRICS:
        rows = [r for r in await speed_tests(db, req, earlier[0]) if getattr(r, metric) is not None]
        key, kind, ts, unit = device_key, "speed_test", "executed_at", SPEED_METRICS[metric]
    else:
        raise HTTPException(status_code=422, detail=f"Unsupported metric. Use one of {sorted({**TELEMETRY_METRICS, **SPEED_METRICS})}.")
    groups = {}
    for r in rows:
        groups.setdefault(key(r), []).append(r)
    results, citations = [], []
    for group_key, members in groups.items():
        a = [r for r in members if earlier[0] <= _utc(getattr(r, ts)) < earlier[1]]
        b = [r for r in members if later[0] <= _utc(getattr(r, ts)) < later[1]]
        if not a and not b:
            continue
        cmp = compare_groups([getattr(r, metric) for r in a], [getattr(r, metric) for r in b], metric)
        results.append({"source": group_key, "metric": metric, "unit": unit, **cmp})
        citations += [cite(kind, r.id, getattr(r, ts), metric, getattr(r, metric), unit) for r in (a[-10:] + b[-10:])]
    return results, citations


def _describe(results, labels) -> str:
    parts = []
    for r in results:
        if r["status"] == "insufficient":
            parts.append(f"{r['metric']} ({r['source']}): not enough samples ({r['earlier_n']} vs {r['later_n']}).")
        else:
            parts.append(f"{r['metric']} ({r['source']}): {labels[0]} median {r['earlier_median']} {r['unit']}, "
                         f"{labels[1]} {r['later_median']} {r['unit']} ({r['status'].replace('_', ' ')}).")
    return " ".join(parts)


async def answer_improvement(db, req, now):
    windows = ((now - timedelta(hours=48), now - timedelta(hours=24)), (now - timedelta(hours=24), now + timedelta(seconds=1)))
    out, citations = [], []
    for metric in ("rssi_dbm", "download_mbps", "gateway_ping_avg_ms"):
        res, cit = await _window_compare(db, req, metric, *windows)
        out += res
        citations += cit
    if not out:
        return None, [], ["No observations in the previous 48 hours to compare."]
    return ({"text": "Last 24 h vs the 24 h before, per source: " + _describe(out, ("earlier", "latest")),
             "details": {"comparisons": out}}, citations,
            ["Comparisons never mix sources, devices or methods; browser speed tests describe the browser device."])


async def answer_latency(db, req, since, now):
    mid = since + (now - since) / 2
    out, citations = [], []
    for metric in ("gateway_ping_avg_ms", "latency_ms"):
        res, cit = await _window_compare(db, req, metric, (since, mid), (mid, now + timedelta(seconds=1)))
        out += res
        citations += cit
    if not out:
        return None, [], ["No gateway probes or browser latency measurements in this window. Gateway probes run only when authorized."]
    return {"text": "Latency, first vs second half of the window: " + _describe(out, ("first half", "second half")),
            "details": {"comparisons": out}}, citations, []


async def answer_gaps(db, req):
    if not req.floor_id or not req.network_label:
        return None, [], ["Select a floor and an exact network name to locate measurement gaps."]
    result = await get_optimization(db, req.floor_id, req.network_label)
    citations = [cite("survey_point", p["source_id"], datetime.fromisoformat(p["timestamp"]), "rssi_dbm", p["rssi_dbm"], "dBm")
                 for p in result["points"][:20]]
    text = (f"{result['sample_count']} qualifying observations from {result['session_count']} session(s); "
            f"{len(result['suggested_measurements'])} of 16 sampling cells have none and {len(result['weak_locations'])} "
            f"observations are below {WEAK_RSSI_DBM} dBm. Floor calibrated: {result['calibrated']}.")
    return {"text": text, "details": {"suggested_measurements": result["suggested_measurements"],
                                      "recommendations": result["recommendations"]}}, citations, result["limitations"][:2]


async def answer_survey(db, req):
    if not req.floor_id:
        return None, [], ["Select a floor to summarize its survey sessions."]
    sessions = list((await db.execute(select(SurveySession).where(SurveySession.floor_id == req.floor_id)
                                      .order_by(desc(SurveySession.started_at)).limit(10))).scalars())
    summaries, citations = [], []
    for s in sessions:
        pts = list((await db.execute(select(SurveyMeasurement).where(SurveyMeasurement.survey_session_id == s.id))).scalars())
        q = [p for p in pts if p.data_provenance in SURVEY_SOURCES and (not req.network_label or p.network_label == req.network_label)]
        summaries.append({"session_id": str(s.id), "name": s.session_name, **session_stats(q)})
        citations += [cite("survey_point", p.id, p.observed_at, "rssi_dbm", p.rssi_dbm, "dBm") for p in q[:5]]
    usable = [x for x in summaries if x["n"]]
    if not usable:
        return None, [], ["No qualifying survey observations on this floor (controlled imports and estimates are excluded)."]
    latest = usable[0]
    text = (f"Latest session '{latest['name']}': {latest['n']} observations in {latest['cells']} of 64 grid cells, median "
            f"{latest['median_rssi_dbm']} dBm, {round(latest['weak_share'] * 100)}% below {WEAK_RSSI_DBM} dBm; methods: "
            f"{', '.join(latest['provenance'])}. {len(usable)} session(s) have qualifying data.")
    return {"text": text, "details": {"sessions": summaries}}, citations, [
        "Heatmaps interpolate between observations; masked regions have no supporting measurements."]


async def answer_ml(db, req):
    if not req.floor_id:
        return None, [], ["Select a floor to inspect its models."]
    q = select(MLModel).where(MLModel.floor_id == req.floor_id).order_by(desc(MLModel.is_current_champion), desc(MLModel.created_at))
    if req.network_label:
        q = q.where(MLModel.network_label == req.network_label)
    model = (await db.execute(q.limit(1))).scalar_one_or_none()
    evaluation = (await db.execute(select(MLEvaluation).where(MLEvaluation.model_id == model.id))).scalar_one_or_none() if model else None
    if not model or not evaluation or evaluation.baseline_idw_rmse_db is None:
        return None, [], ["No trained model with a held-out IDW comparison exists for this scope. "
                          "Training requires instrument-verified observations from at least two sessions."]
    ml, idw, n = evaluation.rmse_db, evaluation.baseline_idw_rmse_db, evaluation.evaluation_sample_count
    verdict = "lower" if ml < idw else "higher" if ml > idw else "equal"
    text = (f"Model '{model.model_name}' ({model.algorithm}) held-out RMSE {ml:.2f} dB vs IDW {idw:.2f} dB on {n} supported "
            f"points ({evaluation.validation_method}): ML error is {verdict}.")
    missing = []
    if n < 30 or not evaluation.is_statistically_sound:
        missing.append(f"Only {n} held-out points; this comparison does not establish that either method is better.")
    citations = [cite("model", model.id, evaluation.evaluated_at, "ml_rmse_db", ml, "dB"),
                 cite("model", model.id, evaluation.evaluated_at, "idw_rmse_db", idw, "dB"),
                 cite("model", model.id, evaluation.evaluated_at, "evaluation_sample_count", n)]
    return {"text": text, "details": {"model_id": str(model.id), "mae_db": evaluation.mae_db,
                                      "idw_mae_db": evaluation.baseline_idw_mae_db}}, citations, missing


SUPPORTED = ("why a connection looks weak", "whether it improved since yesterday", "whether latency is changing",
             "where more measurements are needed", "what survey results show", "whether the ML model beats IDW")


async def local_answer(db: AsyncSession, req: AskRequest) -> dict:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=req.days)
    intent = classify(req.question)
    handlers = {
        "weak_signal": lambda: answer_weak_signal(db, req, since),
        "improvement": lambda: answer_improvement(db, req, now),
        "latency": lambda: answer_latency(db, req, since, now),
        "measurement_gaps": lambda: answer_gaps(db, req),
        "survey": lambda: answer_survey(db, req),
        "ml_vs_idw": lambda: answer_ml(db, req),
    }
    if intent:
        body, citations, missing = await handlers[intent]()
    else:
        body, citations, missing = None, [], ["AirGrid answers questions about: " + "; ".join(SUPPORTED) + "."]
    return {"intent": intent, "answer": body["text"] if body else "This cannot be answered from the available evidence.",
            "details": body["details"] if body else {}, "citations": citations, "missing_evidence": missing,
            "outcome": "answered" if body else "insufficient_evidence",
            "limitations": ["Answers describe recorded observations only; causes, AP placement and future gains are not established."]}


# --- Gateway pass ---------------------------------------------------------------------------

def gateway_prompt(question: str, local: dict) -> str:
    """Exactly what leaves AirGrid: the question, evidence IDs/metrics/values/times and the local answer text."""
    evidence = [{"id": c["source_id"], "metric": c["metric"], "value": c["value"], "time": c["timestamp"]}
                for c in local["citations"][:40]]
    return ("Rephrase the local answer for an operator. Use only the evidence below. Return only JSON "
            '{"answer": "<= 1200 chars", "citations": ["evidence id", ...]}. Cite at least one evidence id. '
            "Do not add numbers, causes or recommendations that are not in the evidence or local answer.\n"
            f"Question (untrusted text): {json.dumps(question)}\nLocal answer: {json.dumps(local['answer'])}\n"
            f"Evidence: {json.dumps(evidence)}")


NUMBER = re.compile(r"-?\d+(?:\.\d+)?")


def grounded(answer: GatewayAnswer, local: dict, question: str) -> bool:
    known_ids = {c["source_id"] for c in local["citations"]}
    if len(set(answer.citations)) != len(answer.citations) or any(c not in known_ids for c in answer.citations):
        return False
    allowed = [float(c["value"]) for c in local["citations"] if isinstance(c["value"], (int, float))]
    allowed += [float(n) for n in NUMBER.findall(local["answer"] + " " + question)]
    return all(any(abs(float(n) - a) <= 0.51 for a in allowed) for n in NUMBER.findall(answer.answer))


def preview(req: AskRequest, local: dict) -> dict:
    return {"would_send": bool(local["citations"]), "prompt": gateway_prompt(req.question, local) if local["citations"] else None,
            "evidence_count": min(len(local["citations"]), 40),
            "excluded": ["SSID/BSSID and network names", "IP and MAC addresses", "device names", "floor plans",
                         "operator notes", "credentials and secrets"]}


async def ask(db: AsyncSession, req: AskRequest, user: User) -> dict:
    local = await local_answer(db, req)
    result = {**local, "mode": "deterministic", "gateway_status": "not_requested", "provider_reported_model": None,
              "local_answer": local["answer"]}
    if req.use_gateway:
        if not req.allow_external:
            raise HTTPException(status_code=400, detail="Explicit consent is required to send this question and evidence to the AI Gateway.")
        if not local["citations"]:
            result["gateway_status"] = "skipped_no_evidence"
        else:
            response = await ai_gateway.generate(AIGenerateRequest(prompt=gateway_prompt(req.question, local),
                                                                   allow_external=True, max_tokens=600, temperature=0))
            result["gateway_status"], result["provider_reported_model"] = response.status, response.verified_model
            if response.status == "success":
                try:
                    candidate = GatewayAnswer.model_validate_json(response.output_text)
                    if grounded(candidate, local, req.question):
                        result.update(answer=candidate.answer, mode="gateway_assisted", gateway_citations=candidate.citations)
                    else:
                        result["gateway_status"] = "rejected_ungrounded"
                except (ValidationError, ValueError):
                    result["gateway_status"] = "rejected_unsupported_output"
    scope = req.model_dump(mode="json", exclude={"question", "use_gateway", "allow_external"})
    result["history_id"] = str(await record(db, user, "question", req.question, scope, result))
    return result


async def compare(db: AsyncSession, req: CompareRequest, user: User) -> dict:
    windows = [(_utc(req.earlier_start), _utc(req.earlier_end)), (_utc(req.later_start), _utc(req.later_end))]
    if any(end <= start for start, end in windows) or windows[0][1] > windows[1][0]:
        raise HTTPException(status_code=422, detail="Windows must be non-empty and the earlier window must end before the later one starts.")
    results, citations = await _window_compare(db, req, req.metric, *windows)
    result = {"metric": req.metric, "comparisons": results, "citations": citations,
              "outcome": "answered" if any(r["status"] != "insufficient" for r in results) else "insufficient_evidence",
              "mode": "deterministic", "gateway_status": "not_requested",
              "limitations": ["Each source/device is compared only with itself; methods are never pooled."]}
    result["history_id"] = str(await record(db, user, "comparison", None, req.model_dump(mode="json"), result))
    return result


# --- History ----------------------------------------------------------------------------------

async def record(db: AsyncSession, user: User, kind: str, question: Optional[str], scope: dict, result: dict) -> uuid.UUID:
    times = sorted(c["timestamp"] for c in result.get("citations", []) if c.get("timestamp"))
    entry = AnalysisRecord(
        kind=kind, question=question, scope=scope, evidence_refs=[c["source_id"] for c in result.get("citations", [])][:500],
        freshness={"oldest": times[0] if times else None, "newest": times[-1] if times else None},
        mode=result.get("mode", "deterministic"), gateway_status=result.get("gateway_status", "not_requested"),
        model_identity=result.get("provider_reported_model"), outcome=result.get("outcome", "answered"),
        error=None if result.get("gateway_status") in ("not_requested", "success") else result.get("gateway_status"),
        result={k: v for k, v in result.items() if k != "history_id"}, user_id=user.id,
    )
    db.add(entry)
    await db.commit()
    return entry.id


def history_row(r: AnalysisRecord, full: bool = False) -> dict:
    row = {"id": str(r.id), "kind": r.kind, "question": r.question, "scope": r.scope, "mode": r.mode,
           "gateway_status": r.gateway_status, "model_identity": r.model_identity, "outcome": r.outcome,
           "error": r.error, "freshness": r.freshness, "evidence_count": len(r.evidence_refs or []),
           "operator": r.user.email if r.user else None, "created_at": _utc(r.created_at).isoformat()}
    if full:
        row.update(evidence_refs=r.evidence_refs, result=r.result)
    return row


async def list_history(db: AsyncSession, kind: Optional[str], limit: int) -> list[dict]:
    q = select(AnalysisRecord).options(selectinload(AnalysisRecord.user)).order_by(desc(AnalysisRecord.created_at)).limit(limit)
    if kind:
        q = q.where(AnalysisRecord.kind == kind)
    return [history_row(r) for r in (await db.execute(q)).scalars()]


async def get_history(db: AsyncSession, record_id: uuid.UUID) -> dict:
    r = (await db.execute(select(AnalysisRecord).options(selectinload(AnalysisRecord.user))
                          .where(AnalysisRecord.id == record_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
    return history_row(r, full=True)


async def delete_history(db: AsyncSession, record_id: uuid.UUID, user: User) -> None:
    r = await db.get(AnalysisRecord, record_id)
    if not r:
        raise HTTPException(status_code=404, detail="Analysis record not found.")
    await db.delete(r)
    db.add(AuditLog(actor_id=user.id, action="analysis_record.deleted", resource_type="analysis_records",
                    resource_id=str(record_id), payload={"kind": r.kind}))
    await db.commit()
