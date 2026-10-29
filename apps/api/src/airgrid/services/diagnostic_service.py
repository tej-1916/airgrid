import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import select, func, desc, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from starlette.concurrency import run_in_threadpool

from airgrid.core.config import settings

from airgrid.models.all_models import (
    User,
    AuditLog,
    Campus,
    Building,
    Floor,
    InternetSpeedTest,
    NetworkDiagnosticReport,
    NetworkTelemetrySnapshot,
    NetworkDiagnosticFinding,
    NetworkCollector,
)
from airgrid.schemas.diagnostics import (
    TelemetryCollectionRequest,
    PingGatewayRequest,
    IperfTestRequest,
    TelemetrySnapshotResponse,
    GatewayPingResult,
    IperfResult,
    DiagnosticReportResponse,
    DiagnosticFindingResponse,
    DiagnosticReportListResponse,
    AnalyzeDiagnosticsRequest,
)
from airgrid.services.telemetry_collector import telemetry_collector
from airgrid.services.diagnostic_engine import diagnostic_engine


def calculate_freshness(collected_at: Optional[datetime]) -> Dict[str, Any]:
    """Computes age and freshness category (fresh <2m, aging 2-5m, stale >5m)."""
    if not collected_at:
        return {"age_seconds": None, "category": "unknown", "label": "Timestamp unavailable"}
    now = datetime.now(timezone.utc)
    dt = collected_at if collected_at.tzinfo else collected_at.replace(tzinfo=timezone.utc)
    age = max(0, int((now - dt).total_seconds()))
    if age < 120:
        cat = "fresh"
        label = "Fresh (<2m)"
    elif age < 300:
        cat = "aging"
        label = f"Aging ({int(age/60)}m ago)"
    else:
        cat = "stale"
        if age < 3600:
            label = f"Stale ({int(age/60)}m ago)"
        elif age < 86400:
            label = f"Stale ({int(age/3600)}h ago)"
        else:
            days = int(age / 86400)
            label = f"Stale ({days}d ago)"
    return {"age_seconds": age, "category": cat, "label": label}


def snapshot_to_response(t: NetworkTelemetrySnapshot) -> TelemetrySnapshotResponse:
    """Rebuild the API view of a persisted snapshot without inventing probe values."""
    stored_ping = (t.raw_details or {}).get("gateway_ping")
    if stored_ping:
        gateway_ping = GatewayPingResult(**stored_ping)
    elif t.gateway_ping_avg_ms is not None:
        # Legacy rows (pre-0009) stored only aggregates; keep their historical reconstruction.
        gateway_ping = GatewayPingResult(
            target_ip=t.gateway_ip or "unknown",
            transmitted=3,
            received=3 if t.gateway_ping_loss_pct != 100.0 else 0,
            loss_pct=t.gateway_ping_loss_pct or 0.0,
            rtt_avg_ms=t.gateway_ping_avg_ms,
            rtt_min_ms=t.gateway_ping_min_ms,
            rtt_max_ms=t.gateway_ping_max_ms,
        )
    else:
        gateway_ping = None
    fresh = calculate_freshness(t.collected_at)
    return TelemetrySnapshotResponse(
        id=t.id,
        interface_name=t.interface_name,
        mac_address=t.mac_address,
        ssid=t.ssid,
        bssid=t.bssid,
        rssi_dbm=t.rssi_dbm,
        signal_quality_pct=t.signal_quality_pct,
        frequency_mhz=t.frequency_mhz,
        channel=t.channel,
        channel_width_mhz=t.channel_width_mhz,
        band=t.band,
        rx_bitrate_mbps=t.rx_bitrate_mbps,
        tx_bitrate_mbps=t.tx_bitrate_mbps,
        security_protocol=t.security_protocol,
        gateway_ip=t.gateway_ip,
        gateway_ping=gateway_ping,
        internet_speed_test_id=t.internet_speed_test_id,
        internet_download_mbps=t.internet_download_mbps,
        internet_upload_mbps=t.internet_upload_mbps,
        internet_latency_ms=t.internet_latency_ms,
        vantage_point=t.vantage_point,
        data_provenance=t.data_provenance,
        raw_details=t.raw_details or {},
        collected_at=t.collected_at,
        report_id=t.report_id,
        collector_id=t.collector_id,
        collection_status=t.collection_status or "collected",
        collection_error=t.collection_error,
        connection_state=t.connection_state,
        age_seconds=fresh["age_seconds"],
        freshness=fresh["category"],
        freshness_label=fresh["label"],
    )


def snapshot_entity(telemetry: TelemetrySnapshotResponse, report_id, user_id, scope) -> NetworkTelemetrySnapshot:
    """Map a collected/supplied snapshot onto a new row; the full ping result is kept in raw_details."""
    ping = telemetry.gateway_ping
    raw = dict(telemetry.raw_details or {})
    if ping:
        raw["gateway_ping"] = ping.model_dump()
    return NetworkTelemetrySnapshot(
        id=uuid.uuid4(),
        report_id=report_id,
        user_id=user_id,
        campus_id=scope.campus_id,
        building_id=scope.building_id,
        floor_id=scope.floor_id,
        interface_name=telemetry.interface_name,
        mac_address=telemetry.mac_address,
        ssid=telemetry.ssid,
        bssid=telemetry.bssid,
        rssi_dbm=telemetry.rssi_dbm,
        signal_quality_pct=telemetry.signal_quality_pct,
        frequency_mhz=telemetry.frequency_mhz,
        channel=telemetry.channel,
        channel_width_mhz=telemetry.channel_width_mhz,
        band=telemetry.band,
        rx_bitrate_mbps=telemetry.rx_bitrate_mbps,
        tx_bitrate_mbps=telemetry.tx_bitrate_mbps,
        security_protocol=telemetry.security_protocol,
        gateway_ip=telemetry.gateway_ip,
        gateway_ping_avg_ms=ping.rtt_avg_ms if ping else None,
        gateway_ping_min_ms=ping.rtt_min_ms if ping else None,
        gateway_ping_max_ms=ping.rtt_max_ms if ping else None,
        gateway_ping_loss_pct=ping.loss_pct if ping else None,
        lan_iperf_throughput_mbps=telemetry.iperf.throughput_mbps if telemetry.iperf else None,
        internet_speed_test_id=telemetry.internet_speed_test_id,
        internet_download_mbps=telemetry.internet_download_mbps,
        internet_upload_mbps=telemetry.internet_upload_mbps,
        internet_latency_ms=telemetry.internet_latency_ms,
        vantage_point=telemetry.vantage_point,
        data_provenance=telemetry.data_provenance,
        raw_details=raw,
        collected_at=telemetry.collected_at,
    )


class DiagnosticService:
    """
    Coordinates local network telemetry collection, deterministic analysis,
    and PostgreSQL persistence for AirGrid Phase 06.
    """

    async def _validate_scope(self, db, req, current_user: Optional[User] = None):
        if req.floor_id:
            floor = await db.get(Floor, req.floor_id)
            if not floor:
                raise HTTPException(status_code=404, detail="Floor not found.")
            if req.building_id and req.building_id != floor.building_id:
                raise HTTPException(status_code=422, detail="Floor does not belong to the selected building.")
            req.building_id = floor.building_id
        if req.building_id:
            building = await db.get(Building, req.building_id)
            if not building:
                raise HTTPException(status_code=404, detail="Building not found.")
            if req.campus_id and req.campus_id != building.campus_id:
                raise HTTPException(status_code=422, detail="Building does not belong to the selected campus.")
            req.campus_id = building.campus_id
        elif req.campus_id and not await db.get(Campus, req.campus_id):
            raise HTTPException(status_code=404, detail="Campus not found.")

        if current_user and req.campus_id:
            from airgrid.services.campus_service import require_campus_access
            await require_campus_access(db, current_user, req.campus_id)

    async def collect_telemetry_snapshot(
        self,
        db: AsyncSession,
        req: TelemetryCollectionRequest,
        current_user: User,
    ) -> TelemetrySnapshotResponse:
        """
        Executes safe, opt-in telemetry collection on the local system.
        Enforces explicit operator consent.
        """
        if not req.operator_consent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Explicit operator authorization is required to collect live network telemetry.",
            )

        if not settings.AIRGRID_COLLECTOR_ENABLED:
            raise HTTPException(status_code=409, detail="Backend collector disabled by host configuration.")

        await self._validate_scope(db, req, current_user=current_user)

        # 1. Collect live wireless status from Linux OS tools
        raw_telemetry = await run_in_threadpool(telemetry_collector.collect_wireless_telemetry, req.interface_name)
        if "error" in raw_telemetry and not raw_telemetry.get("interface_name"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=raw_telemetry["error"],
            )

        target_iface = raw_telemetry.get("interface_name") or "unknown"
        default_gw, _ = await run_in_threadpool(telemetry_collector.discover_default_route)

        # 2. Optional Gateway Ping
        gw_ping_res: Optional[GatewayPingResult] = None
        if req.include_gateway_ping and default_gw:
            gw_ping_res = await run_in_threadpool(telemetry_collector.ping_gateway, default_gw, count=req.ping_count)

        # 3. Optional iperf3 LAN test
        iperf_res: Optional[IperfResult] = None
        if req.iperf_target_host:
            iperf_res = await run_in_threadpool(telemetry_collector.test_iperf,
                target_host=req.iperf_target_host,
                port=req.iperf_port,
                duration=5,
            )

        # 4. Phase 03 Internet Speed Test Reuse (without auto-running bandwidth-heavy tests)
        speed_test_rec: Optional[InternetSpeedTest] = None
        if req.link_internet_speed_test_id:
            st_stmt = select(InternetSpeedTest).where(InternetSpeedTest.id == req.link_internet_speed_test_id)
            res = await db.execute(st_stmt)
            speed_test_rec = res.scalars().first()

        snapshot = TelemetrySnapshotResponse(
            id=uuid.uuid4(),
            interface_name=target_iface,
            mac_address=raw_telemetry.get("mac_address"),
            ssid=raw_telemetry.get("ssid"),
            bssid=raw_telemetry.get("bssid"),
            rssi_dbm=raw_telemetry.get("rssi_dbm"),
            signal_quality_pct=raw_telemetry.get("signal_quality_pct"),
            frequency_mhz=raw_telemetry.get("frequency_mhz"),
            channel=raw_telemetry.get("channel"),
            channel_width_mhz=raw_telemetry.get("channel_width_mhz"),
            band=raw_telemetry.get("band"),
            rx_bitrate_mbps=raw_telemetry.get("rx_bitrate_mbps"),
            tx_bitrate_mbps=raw_telemetry.get("tx_bitrate_mbps"),
            security_protocol=raw_telemetry.get("security_protocol"),
            gateway_ip=default_gw,
            gateway_ping=gw_ping_res,
            iperf=iperf_res,
            internet_speed_test_id=speed_test_rec.id if speed_test_rec else None,
            internet_download_mbps=speed_test_rec.download_mbps if speed_test_rec else None,
            internet_upload_mbps=speed_test_rec.upload_mbps if speed_test_rec else None,
            internet_latency_ms=speed_test_rec.latency_ms if speed_test_rec else None,
            vantage_point="backend_server",
            data_provenance="instrumented_linux_telemetry",
            raw_details={**raw_telemetry.get("raw_details", {}), **({"internet_speed_test_source": {
                "id": str(speed_test_rec.id), "executed_at": speed_test_rec.executed_at.isoformat(),
                "vantage_point": "browser_device"}} if speed_test_rec else {})},
            collected_at=datetime.now(timezone.utc),
        )

        return snapshot

    async def collect_and_store_snapshot(
        self,
        db: AsyncSession,
        req: TelemetryCollectionRequest,
        current_user: User,
    ) -> TelemetrySnapshotResponse:
        """Collects on the backend host and stores the result so analysis can reference it by ID."""
        telemetry = await self.collect_telemetry_snapshot(db, req, current_user)
        entity = snapshot_entity(telemetry, None, current_user.id, req)
        db.add(entity)
        await db.commit()
        await db.refresh(entity)
        return snapshot_to_response(entity)

    async def _load_unreported_snapshot(self, db: AsyncSession, req: AnalyzeDiagnosticsRequest, current_user: Optional[User] = None) -> NetworkTelemetrySnapshot:
        snapshot = await db.get(NetworkTelemetrySnapshot, req.telemetry_snapshot_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail="Telemetry snapshot not found.")
        if snapshot.report_id:
            raise HTTPException(status_code=409, detail=f"Snapshot already analyzed in report {snapshot.report_id}.")
        if snapshot.collection_status == "failed":
            raise HTTPException(status_code=422, detail="Failed collections contain no measurements to analyze.")
        # The snapshot's recorded scope wins; a conflicting requested scope is rejected, not silently replaced.
        for field in ("campus_id", "building_id", "floor_id"):
            requested, recorded = getattr(req, field), getattr(snapshot, field)
            if requested and recorded and requested != recorded:
                raise HTTPException(status_code=422, detail=f"Requested {field} does not match the snapshot's recorded scope.")
        if snapshot.collector_id:
            collector = await db.get(NetworkCollector, snapshot.collector_id)
            req.device_name = f"Collector: {collector.name}" if collector else "Registered collector"
            req.device_fingerprint = None
        if snapshot.floor_id or snapshot.building_id or snapshot.campus_id:
            req.campus_id, req.building_id, req.floor_id = snapshot.campus_id, snapshot.building_id, snapshot.floor_id
            if current_user and req.campus_id:
                from airgrid.services.campus_service import require_campus_access
                await require_campus_access(db, current_user, req.campus_id)
        else:
            await self._validate_scope(db, req, current_user=current_user)
        return snapshot

    async def ping_gateway_probe(self, req: PingGatewayRequest) -> GatewayPingResult:
        if not req.operator_consent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operator authorization required for ICMP probe.",
            )
        if not settings.AIRGRID_COLLECTOR_ENABLED:
            raise HTTPException(status_code=409, detail="Backend collector disabled by host configuration.")
        return await run_in_threadpool(telemetry_collector.ping_gateway, gateway_ip=req.gateway_ip, count=req.ping_count)

    async def iperf_probe(self, req: IperfTestRequest) -> IperfResult:
        if not req.operator_consent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operator authorization required for LAN iperf3 throughput probe.",
            )
        if not settings.AIRGRID_COLLECTOR_ENABLED:
            raise HTTPException(status_code=409, detail="Backend collector disabled by host configuration.")
        return await run_in_threadpool(telemetry_collector.test_iperf,
            target_host=req.target_host,
            port=req.port,
            duration=req.duration_seconds,
            protocol=req.protocol,
        )

    async def analyze_and_create_report(
        self,
        db: AsyncSession,
        req: AnalyzeDiagnosticsRequest,
        current_user: User,
    ) -> DiagnosticReportResponse:
        """
        Runs deterministic diagnostics on collected or supplied telemetry and persists the report.
        """
        if not req.operator_consent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Operator authorization required to run diagnostics.",
            )

        if not req.telemetry_snapshot_id:
            await self._validate_scope(db, req, current_user=current_user)

        # 1. Obtain telemetry snapshot
        stored_snapshot: Optional[NetworkTelemetrySnapshot] = None
        if req.telemetry_snapshot_id:
            try:
                stored_snapshot = await self._load_unreported_snapshot(db, req, current_user=current_user)
            except TypeError:
                stored_snapshot = await self._load_unreported_snapshot(db, req)
            telemetry = snapshot_to_response(stored_snapshot)
        elif req.telemetry:
            telemetry = req.telemetry.model_copy(update={
                "data_provenance": "operator_reported", "vantage_point": "operator_supplied",
                "raw_details": {},
            })
        else:
            collect_req = TelemetryCollectionRequest(
                interface_name=req.interface_name,
                campus_id=req.campus_id,
                building_id=req.building_id,
                floor_id=req.floor_id,
                include_gateway_ping=req.include_gateway_ping,
                ping_count=req.ping_count,
                iperf_target_host=req.iperf_target_host,
                iperf_port=req.iperf_port,
                link_internet_speed_test_id=req.link_internet_speed_test_id,
                device_fingerprint=req.device_fingerprint,
                device_name=req.device_name,
                vantage_point=req.vantage_point,
                operator_consent=True,
            )
            telemetry = await self.collect_telemetry_snapshot(db, collect_req, current_user)

        # 2. Run deterministic analysis
        findings, overall_score, headline = diagnostic_engine.analyze(telemetry)

        # 3. Build Diagnostic Report Title
        report_title = req.title
        if not report_title:
            ssid_tag = f" ({telemetry.ssid})" if telemetry.ssid else ""
            report_title = f"Diagnostic Audit - {telemetry.interface_name}{ssid_tag}"

        crit_count = sum(1 for f in findings if f.severity == "critical")
        warn_count = sum(1 for f in findings if f.severity == "warning")
        good_count = sum(1 for f in findings if f.severity == "good")

        status_label = "healthy" if any(f.severity == "good" for f in findings) else "analyzed"
        if crit_count > 0:
            status_label = "critical"
        elif warn_count > 0:
            status_label = "warning"

        # 4. Save Report to Database
        report = NetworkDiagnosticReport(
            id=uuid.uuid4(),
            title=report_title,
            campus_id=req.campus_id,
            building_id=req.building_id,
            floor_id=req.floor_id,
            user_id=current_user.id,
            device_fingerprint=req.device_fingerprint,
            device_name=req.device_name or "Backend server",
            interface_name=telemetry.interface_name,
            vantage_point=telemetry.vantage_point,
            data_provenance=telemetry.data_provenance,
            status=status_label,
            summary_headline=headline,
            overall_score=overall_score,
            findings_count=len(findings),
            critical_count=crit_count,
            warning_count=warn_count,
            good_count=good_count,
        )
        db.add(report)
        await db.flush()

        # 5. Link the server-owned snapshot, or persist the collected/supplied one
        if stored_snapshot is not None:
            # Atomic claim: a concurrent analysis of the same snapshot loses with 409.
            claimed = await db.execute(
                update(NetworkTelemetrySnapshot)
                .where(NetworkTelemetrySnapshot.id == stored_snapshot.id, NetworkTelemetrySnapshot.report_id.is_(None))
                .values(report_id=report.id)
                .execution_options(synchronize_session=False))
            if claimed.rowcount != 1:
                await db.rollback()
                raise HTTPException(status_code=409, detail="Snapshot was analyzed concurrently; open the existing report.")
        else:
            db.add(snapshot_entity(telemetry, report.id, current_user.id, req))

        # 6. Save Finding Entities
        findings_responses: List[DiagnosticFindingResponse] = []
        for f in findings:
            finding_entity = NetworkDiagnosticFinding(
                id=uuid.uuid4(),
                report_id=report.id,
                category=f.category,
                severity=f.severity,
                title=f.title,
                description=f.description,
                measured_evidence=f.measured_evidence,
                metric_key=f.metric_key,
                measured_value=f.measured_value,
                threshold_value=f.threshold_value,
                unit=f.unit,
                recommendation=f.recommendation,
            )
            db.add(finding_entity)
            findings_responses.append(
                DiagnosticFindingResponse(
                    id=finding_entity.id,
                    category=finding_entity.category,
                    severity=finding_entity.severity,
                    title=finding_entity.title,
                    description=finding_entity.description,
                    measured_evidence=finding_entity.measured_evidence,
                    metric_key=finding_entity.metric_key,
                    measured_value=finding_entity.measured_value,
                    threshold_value=finding_entity.threshold_value,
                    unit=finding_entity.unit,
                    recommendation=finding_entity.recommendation,
                )
            )

        # 7. Audit Log
        audit = AuditLog(
            id=uuid.uuid4(),
            actor_id=current_user.id,
            action="network_diagnostics_analyzed",
            resource_type="network_diagnostic_reports",
            resource_id=str(report.id),
            payload={
                "interface": telemetry.interface_name,
                "ssid": telemetry.ssid,
                "rssi_dbm": telemetry.rssi_dbm,
                "overall_score": overall_score,
                "findings_count": len(findings),
                "status": status_label,
            },
        )
        db.add(audit)
        await db.commit()
        await db.refresh(report)

        return DiagnosticReportResponse(
            id=report.id,
            title=report.title,
            campus_id=report.campus_id,
            building_id=report.building_id,
            floor_id=report.floor_id,
            user_id=report.user_id,
            user_email=current_user.email,
            device_fingerprint=report.device_fingerprint,
            device_name=report.device_name,
            interface_name=report.interface_name,
            vantage_point=report.vantage_point,
            data_provenance=report.data_provenance,
            status=report.status,
            summary_headline=report.summary_headline,
            overall_score=report.overall_score,
            findings_count=report.findings_count,
            critical_count=report.critical_count,
            warning_count=report.warning_count,
            good_count=report.good_count,
            telemetry=telemetry,
            findings=findings_responses,
            created_at=report.created_at,
            updated_at=report.updated_at,
        )

    async def list_reports(
        self,
        db: AsyncSession,
        campus_id: Optional[uuid.UUID] = None,
        building_id: Optional[uuid.UUID] = None,
        floor_id: Optional[uuid.UUID] = None,
        skip: int = 0,
        limit: int = 20,
        current_user: Optional[User] = None,
    ) -> DiagnosticReportListResponse:
        """Lists historical diagnostic reports."""
        if current_user and current_user.role != "administrator":
            from airgrid.services.campus_service import require_campus_access, require_floor_access, get_authorized_campus_ids
            if campus_id:
                await require_campus_access(db, current_user, campus_id)
            elif floor_id:
                await require_floor_access(db, current_user, floor_id)
            else:
                authorized_ids = await get_authorized_campus_ids(db, current_user)
                if authorized_ids:
                    query_filter = NetworkDiagnosticReport.campus_id.in_(authorized_ids) | (
                        NetworkDiagnosticReport.campus_id.is_(None) & (NetworkDiagnosticReport.user_id == current_user.id)
                    )
                else:
                    query_filter = NetworkDiagnosticReport.campus_id.is_(None) & (NetworkDiagnosticReport.user_id == current_user.id)

        query = select(NetworkDiagnosticReport).options(
            selectinload(NetworkDiagnosticReport.user),
            selectinload(NetworkDiagnosticReport.telemetry),
            selectinload(NetworkDiagnosticReport.findings),
        )
        if current_user and current_user.role != "administrator" and not campus_id and not floor_id:
            query = query.where(query_filter)
        if campus_id:
            query = query.where(NetworkDiagnosticReport.campus_id == campus_id)
        if building_id:
            query = query.where(NetworkDiagnosticReport.building_id == building_id)
        if floor_id:
            query = query.where(NetworkDiagnosticReport.floor_id == floor_id)

        # Count total
        count_stmt = select(func.count(NetworkDiagnosticReport.id))
        if current_user and current_user.role != "administrator" and not campus_id and not floor_id:
            count_stmt = count_stmt.where(query_filter)
        if campus_id:
            count_stmt = count_stmt.where(NetworkDiagnosticReport.campus_id == campus_id)
        if building_id:
            count_stmt = count_stmt.where(NetworkDiagnosticReport.building_id == building_id)
        if floor_id:
            count_stmt = count_stmt.where(NetworkDiagnosticReport.floor_id == floor_id)

        total_res = await db.execute(count_stmt)
        total = total_res.scalar() or 0

        query = query.order_by(desc(NetworkDiagnosticReport.created_at)).offset(skip).limit(limit)
        res = await db.execute(query)
        reports = res.scalars().all()

        responses = []
        for r in reports:
            # Reconstruct telemetry if available
            tel_resp = snapshot_to_response(r.telemetry) if r.telemetry else None

            findings_list = [
                DiagnosticFindingResponse(
                    id=f.id,
                    category=f.category,
                    severity=f.severity,
                    title=f.title,
                    description=f.description,
                    measured_evidence=f.measured_evidence,
                    metric_key=f.metric_key,
                    measured_value=f.measured_value,
                    threshold_value=f.threshold_value,
                    unit=f.unit,
                    recommendation=f.recommendation,
                )
                for f in r.findings
            ]

            responses.append(
                DiagnosticReportResponse(
                    id=r.id,
                    title=r.title,
                    campus_id=r.campus_id,
                    building_id=r.building_id,
                    floor_id=r.floor_id,
                    user_id=r.user_id,
                    user_email=r.user.email if r.user else None,
                    device_fingerprint=r.device_fingerprint,
                    device_name=r.device_name,
                    interface_name=r.interface_name,
                    vantage_point=r.vantage_point,
                    data_provenance=r.data_provenance,
                    status=r.status,
                    summary_headline=r.summary_headline,
                    overall_score=r.overall_score,
                    findings_count=r.findings_count,
                    critical_count=r.critical_count,
                    warning_count=r.warning_count,
                    good_count=r.good_count,
                    telemetry=tel_resp,
                    findings=findings_list,
                    created_at=r.created_at,
                    updated_at=r.updated_at,
                )
            )

        return DiagnosticReportListResponse(
            reports=responses,
            total=total,
            skip=skip,
            limit=limit,
        )

    async def get_report_by_id(self, db: AsyncSession, report_id: uuid.UUID) -> Optional[DiagnosticReportResponse]:
        query = select(NetworkDiagnosticReport).where(
            NetworkDiagnosticReport.id == report_id
        ).options(
            selectinload(NetworkDiagnosticReport.user),
            selectinload(NetworkDiagnosticReport.telemetry),
            selectinload(NetworkDiagnosticReport.findings),
        )
        res = await db.execute(query)
        r = res.scalars().first()
        if not r:
            return None

        tel_resp = snapshot_to_response(r.telemetry) if r.telemetry else None

        findings_list = [
            DiagnosticFindingResponse(
                id=f.id,
                category=f.category,
                severity=f.severity,
                title=f.title,
                description=f.description,
                measured_evidence=f.measured_evidence,
                metric_key=f.metric_key,
                measured_value=f.measured_value,
                threshold_value=f.threshold_value,
                unit=f.unit,
                recommendation=f.recommendation,
            )
            for f in r.findings
        ]

        return DiagnosticReportResponse(
            id=r.id,
            title=r.title,
            campus_id=r.campus_id,
            building_id=r.building_id,
            floor_id=r.floor_id,
            user_id=r.user_id,
            user_email=r.user.email if r.user else None,
            device_fingerprint=r.device_fingerprint,
            device_name=r.device_name,
            interface_name=r.interface_name,
            vantage_point=r.vantage_point,
            data_provenance=r.data_provenance,
            status=r.status,
            summary_headline=r.summary_headline,
            overall_score=r.overall_score,
            findings_count=r.findings_count,
            critical_count=r.critical_count,
            warning_count=r.warning_count,
            good_count=r.good_count,
            telemetry=tel_resp,
            findings=findings_list,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )

    async def delete_report(self, db: AsyncSession, report_id: uuid.UUID, current_user: User) -> bool:
        """Deletes a diagnostic report."""
        allowed_roles = {"administrator", "admin", "network_engineer", "engineer", "technician"}
        if current_user.role.lower() not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only network engineers and administrators can delete diagnostic reports.",
            )

        query = select(NetworkDiagnosticReport).where(NetworkDiagnosticReport.id == report_id)
        res = await db.execute(query)
        report = res.scalars().first()
        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Diagnostic report not found.",
            )

        await db.delete(report)
        await db.commit()
        return True


diagnostic_service = DiagnosticService()
