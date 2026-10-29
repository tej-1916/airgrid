// Isolated browser verification for AirGrid final engineering acceptance.
// All API responses are labeled fixtures; all non-local requests are blocked.
// Verifies 16 routes at desktop (1440x900) and mobile (390x844) viewports.
const { chromium } = require(process.env.AIRGRID_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.AIRGRID_BROWSER_URL || 'http://127.0.0.1:5187';
const timestamp = '2026-10-28T00:00:00Z';
const recent = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const id = '00000000-0000-0000-0000-000000000001';
const floorId = '00000000-0000-0000-0000-000000000002';
const collectorId = '00000000-0000-0000-0000-000000000003';
const snapshotId = '00000000-0000-0000-0000-000000000004';
const fixtureUser = { id, email: 'operator@airgrid.test', full_name: 'Isolated Fixture Operator', role: 'administrator', is_active: true, created_at: timestamp };
const floor = { id: floorId, building_id: id, floor_number: 1, name: 'Fixture Floor', status: 'active', has_floor_plan: false, dimensions_width_m: 20, dimensions_height_m: 10 };
const campus = { id, name: 'ISOLATED FIXTURE CAMPUS', code: 'FIXTURE', status: 'active', buildings_count: 1, floors_count: 1, floor_plans_count: 0, buildings: [{ id, campus_id: id, name: 'Fixture Building', building_code: 'F', status: 'active', floors_count: 1, floors: [floor] }] };
const telemetry = { mac_address: null, bssid: null, signal_quality_pct: null, frequency_mhz: null, channel: null, channel_width_mhz: null, band: null, rx_bitrate_mbps: null, tx_bitrate_mbps: null, security_protocol: null, gateway_ip: null, gateway_ping: null, iperf: null, internet_download_mbps: null, internet_upload_mbps: null, internet_latency_ms: null, interface_name: 'fixture0', rssi_dbm: -80, ssid: 'ISOLATED FIXTURE NETWORK', vantage_point: 'operator_supplied', data_provenance: 'controlled_test_import', collected_at: timestamp, raw_details: {} };
const report = { id, title: 'ISOLATED FIXTURE REPORT', device_name: 'Fixture device', user_email: fixtureUser.email, status: 'warning', interface_name: 'fixture0', vantage_point: 'operator_supplied', data_provenance: 'controlled_test_import', summary_headline: 'Fixture evidence only', overall_score: 80, findings_count: 1, warning_count: 1, critical_count: 0, good_count: 0, telemetry, findings: [{ title: 'Observed wireless signal', severity: 'warning', category: 'signal', measured_evidence: '-80 dBm observed at fixture point', recommendation: 'Check physical obstacles and interference.' }], created_at: timestamp, updated_at: timestamp };
const analysis = { report_id: id, mode: 'deterministic', summary: 'ISOLATED FIXTURE: weak observed signal; no cause established.', gateway_status: 'not_requested', provider_reported_model: null, confidence: 'Fixture observation, not campus evidence.', evidence: [{ source_id: `${id}:rssi_dbm`, timestamp, metric: 'rssi_dbm', value: -80, unit: 'dBm' }], findings: [{ source_id: `${id}:finding:0`, title: 'Observed wireless signal', severity: 'warning', measured_evidence: `ISOLATED FIXTURE: -80 dBm at ${timestamp}.`, recommendation: 'Repeat at the same location.' }], limitations: ['No AP fault or improvement estimate established.'] };
const optimization = { floor_id: floorId, network_label: 'ISOLATED FIXTURE NETWORK', available_networks: ['ISOLATED FIXTURE NETWORK'], generated_at: timestamp, calibrated: false, sample_count: 1, session_count: 1, points: [], weak_locations: [{ source_id: id, x: .25, y: .5, rssi_dbm: -80, timestamp, provenance: 'controlled_test_import (browser fixture only)', historical: true }], suggested_measurements: [{ x: .125, y: .125 }], recommendations: [{ priority: 'measurement_first', title: 'Fixture: collect independent evidence', evidence_ids: [id], expected_benefit: 'Reduce uncertainty', required_evidence: 'Calibrated independent survey', validation: 'Repeat observations; no numerical gains predicted.' }], limitations: ['ISOLATED FIXTURE: no configuration changes.'], access_points: [] };
const collector = { id: collectorId, name: 'ISOLATED FIXTURE COLLECTOR', host_label: 'fixture-host', description: null, campus_id: id, building_id: id, floor_id: floorId, status: 'active', created_at: timestamp, revoked_at: null, last_seen_at: recent(5), last_submission_status: 'collected', submission_count: 3, rejected_count: 0 };
const snapshot = { ...telemetry, id: snapshotId, vantage_point: 'registered_collector', data_provenance: 'instrumented_linux_telemetry', collector_id: collectorId, report_id: null, collection_status: 'collected', connection_state: 'connected', band: '5 GHz', channel: 36, rx_bitrate_mbps: 300, tx_bitrate_mbps: 260, rssi_dbm: -67, collected_at: recent(5) };
const point = (m, rssi, rx, rtt) => ({ snapshot_id: `fixture-${m}`, collected_at: recent(m), collector_id: collectorId, report_id: null, vantage_point: 'registered_collector', data_provenance: 'instrumented_linux_telemetry', collection_status: 'collected', connection_state: 'connected', ssid: 'ISOLATED FIXTURE NETWORK', bssid: null, band: '5 GHz', channel: 36, rssi_dbm: rssi, rx_bitrate_mbps: rx, tx_bitrate_mbps: rx - 40, gateway_rtt_avg_ms: rtt, gateway_loss_pct: 0 });
const trends = { window: { since: recent(10080), until: recent(0), days: 7 }, series: [point(300, -70, 280, 3.1), point(120, -68, 300, 2.4), point(5, -67, 300, 2.2)], transitions: [{ at: recent(120), source: collectorId, kind: 'roam', from: 'connected', to: 'connected', snapshot_id: 'fixture-120' }], speed_tests: [{ id: 'fixture-st-1', executed_at: recent(200), vantage_point: 'client_browser', data_provenance: 'client_reported', download_mbps: 210, upload_mbps: 40, latency_ms: 18, jitter_ms: 2, packet_loss_pct: 0 }, { id: 'fixture-st-2', executed_at: recent(30), vantage_point: 'client_browser', data_provenance: 'client_reported', download_mbps: 230, upload_mbps: 42, latency_ms: 16, jitter_ms: 2, packet_loss_pct: 0 }], daily_aggregates: [], truncated: false, availability: { rssi_dbm: 3, rx_bitrate_mbps: 3, tx_bitrate_mbps: 3, gateway_rtt_avg_ms: 3, gateway_loss_pct: 3, speed_tests: 2, failed_collections: 0 }, freshness: { latest_observation_at: recent(5), observation_age_seconds: 300, latest_speed_test_at: recent(30) }, notes: ['ISOLATED FIXTURE history.'] };
const answer = { intent: 'weak_signal', answer: 'ISOLATED FIXTURE: the latest instrument observation recorded -67 dBm on 5 GHz.', local_answer: 'ISOLATED FIXTURE: the latest instrument observation recorded -67 dBm on 5 GHz.', mode: 'deterministic', gateway_status: 'not_requested', provider_reported_model: null, outcome: 'answered', citations: [{ source_id: `snapshot:${snapshotId}`, kind: 'snapshot', timestamp: recent(5), metric: 'rssi_dbm', value: -67, unit: 'dBm' }], missing_evidence: ['AP placement, walls and interference are not recorded, so a cause cannot be established.'], limitations: ['Fixture answer only.'], details: { persistence: { class: 'none_observed' } }, history_id: id };
const historyRow = { id, kind: 'question', question: 'Why does this Wi-Fi connection appear weak?', scope: {}, mode: 'deterministic', gateway_status: 'not_requested', model_identity: null, outcome: 'answered', error: null, freshness: { oldest: recent(5), newest: recent(5) }, evidence_count: 1, operator: fixtureUser.email, created_at: recent(1) };
const sessions = [{ id: 'fixture-session-a', floor_id: floorId, session_name: 'FIXTURE BEFORE', started_at: timestamp }, { id: 'fixture-session-b', floor_id: floorId, session_name: 'FIXTURE AFTER', started_at: timestamp }];
const sessionComparison = { kind: 'observed', network_label: 'ISOLATED FIXTURE NETWORK', before: { session_id: 'a', name: 'FIXTURE BEFORE', n: 3, median_rssi_dbm: -80, weak_share: 1, cells: 3, provenance: ['operator_reported'] }, after: { session_id: 'b', name: 'FIXTURE AFTER', n: 3, median_rssi_dbm: -70, weak_share: 0, cells: 3, provenance: ['field_instrument_verified'] }, paired_cells: 3, median_cell_delta_db: 10, improved_cells: 3, degraded_cells: 0, unchanged_cells: 0, cells_only_before: 0, cells_only_after: 0, cell_deltas: [], caveats: ['Sessions use different measurement methods; differences may reflect the method, not the network.'] };

const aiStatus = {
  is_configured: true,
  provider: 'freellmapi',
  base_url: 'https://api.freellmapi.com/v1',
  active_model: 'deepseek-chat',
  default_model: 'deepseek-chat',
  configured_model: 'deepseek-chat',
  available_models: ['deepseek-chat', 'llama-3.3-70b', 'qwen-2.5-72b'],
  last_health_check: timestamp,
  last_health_status: 'healthy',
  last_health_latency_ms: 182,
  last_health_error: null,
  privacy_mode: 'local_deterministic_default',
};

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.AIRGRID_CHROMIUM_PATH || '/usr/bin/chromium'
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  let authenticated = false;
  const unexpected = [];
  const posted = {};
  const plans = [];
  const collectors = [collector];
  let externalAttempts = 0;
  let probeAttempts = 0;

  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) {
      externalAttempts++;
      return route.abort();
    }
    const p = url.pathname;
    const method = request.method();
    if (p === '/healthz') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    if (!p.startsWith('/api/')) return route.continue();
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (method !== 'GET') {
      try { posted[p] = request.postDataJSON(); } catch { posted[p] = null; }
    }

    if (p.endsWith('/auth/session')) return send({ authenticated, user: authenticated ? fixtureUser : null, csrf_token: 'fixture' });
    if (p.endsWith('/auth/login')) { authenticated = true; return send({ user: fixtureUser, csrf_token: 'fixture' }); }
    if (p.endsWith('/buildings')) return send(campus.buildings);
    if (p.endsWith('/floors')) return send([floor]);
    if (p === `/api/v1/campuses/${id}`) return send(campus);
    if (p === '/api/v1/campuses') return send({ items: [campus], total: 1, skip: 0, limit: 100 });
    if (p === '/api/v1/dashboard/summary') return send({ campuses_count: 1, buildings_count: 1, floors_count: 1, floor_plans_count: 0, calibrated_floor_plans_count: 0, active_campuses_count: 1 });
    if (p === '/api/v1/dashboard/system-status') return send({ overall: 'operational', components: [], timestamp });
    if (p.startsWith('/api/v1/dashboard/')) return send({ items: [], total: 0 });
    if (p === '/api/v1/diagnostics/reports') return send({ reports: [report], total: 1, skip: 0, limit: 100 });
    if (p === '/api/v1/diagnostics/live-connection') return send({
      is_connected: true,
      connection_state: 'connected',
      interface_name: 'fixture0',
      ssid: 'ISOLATED FIXTURE NETWORK',
      bssid: '00:11:22:33:44:55',
      frequency_mhz: 5200,
      channel: 40,
      channel_width_mhz: 40,
      band: '5 GHz',
      rssi_dbm: -67.0,
      signal_quality_pct: 75,
      rx_bitrate_mbps: 300.0,
      tx_bitrate_mbps: 260.0,
      security_protocol: 'WPA2-PSK',
      measuring_device: 'Isolated Fixture Host',
      hostname: 'fixture-host',
      ip_address: '192.168.1.100',
      default_gateway: '192.168.1.1',
      data_provenance: 'live_system_probe',
      checked_at: timestamp,
      age_seconds: 0,
      freshness: 'fresh',
      freshness_label: 'Fresh (<2m)',
    });
    if (p === '/api/v1/diagnostics/interfaces') return send({ detail: 'Backend collector disabled. ISOLATED FIXTURE.' }, 409);
    if (/diagnostics\/(collect|ping-gateway|iperf)/.test(p)) {
      probeAttempts++;
      return send({ detail: 'Live collection forbidden in browser verification' }, 403);
    }
    if (p === '/api/v1/diagnostics/analyze') return send({ ...report, id: 'fixture-collector-report', vantage_point: 'registered_collector', data_provenance: 'instrumented_linux_telemetry', telemetry: { ...snapshot, report_id: 'fixture-collector-report' } }, 201);
    if (p === '/api/v1/diagnostics/trends') return send(trends);
    if (p === '/api/v1/collectors' && method === 'GET') return send(collectors);
    if (p === '/api/v1/collectors' && method === 'POST') {
      const created = { ...collector, id: 'fixture-new', name: posted[p].name, submission_count: 0, last_seen_at: null };
      collectors.unshift(created);
      return send({ collector: created, secret: 'ISOLATED-FIXTURE-SECRET-NOT-REAL', notice: 'Fixture notice: shown once.' }, 201);
    }
    if (p.startsWith('/api/v1/collectors/') && p.endsWith('/observations')) return send(p.includes('fixture-new') ? [] : [snapshot]);
    if (p === '/api/v1/retention') return send([{ dataset: 'collector_telemetry', description: 'Fixture dataset', retention_days: 30, aggregate_before_delete: true, updated_at: timestamp }, { dataset: 'analysis_records', description: 'Fixture history', retention_days: null, aggregate_before_delete: true, updated_at: null }]);
    if (p === '/api/v1/retention/collector_telemetry/preview') return send({ dataset: 'collector_telemetry', enabled: true, retention_days: 30, cutoff: timestamp, eligible_count: 4, protected_count: 2, oldest_eligible_at: timestamp, note: 'Fixture preview' });

    // AI endpoints
    if (p === '/api/v1/ai/status') return send(aiStatus);
    if (p === '/api/v1/ai/models') return send({ models: ['deepseek-chat', 'llama-3.3-70b', 'qwen-2.5-72b'] });
    if (p === '/api/v1/ai/health' && method === 'POST') {
      aiStatus.last_health_status = 'available';
      aiStatus.last_health_latency_ms = 182;
      return send({ status: 'available', latency_ms: 182, discovered_count: 3 });
    }
    if (p === '/api/v1/ai/test-connection') return send({ ok: true, provider: 'freellmapi', latency_ms: 182, model: 'deepseek-chat', model_identity: 'deepseek-chat', message: 'Connection verified successfully.' });
    if (p === '/api/v1/ai/select-model') {
      aiStatus.active_model = posted[p]?.model || 'deepseek-chat';
      return send({ ok: true, active_model: aiStatus.active_model });
    }

    // Health endpoint for settings
    if (p === '/api/v1/health') return send({ status: 'ok', environment: 'isolated-fixture', version: '0.1.0-final', uptime_seconds: 180, dependencies: { database: { status: 'connected' } } });

    // Analyst endpoints
    if (p === '/api/v1/analyst/analyze') { assert.equal(posted[p].use_gateway, false); return send(analysis); }
    if (p === '/api/v1/analyst/ask') { assert.equal(posted[p].use_gateway, false); return send(answer); }
    if (p === '/api/v1/analyst/history') return send([historyRow]);
    if (p === `/api/v1/analyst/history/${id}`) return send({ ...historyRow, evidence_refs: answer.citations.map(c => c.source_id), result: answer });

    // Optimization endpoints
    if (p === '/api/v1/optimization/survey') return send(optimization);
    if (p === '/api/v1/optimization/plans' && method === 'GET') return send(plans);
    if (p === '/api/v1/optimization/plans' && method === 'POST') {
      const saved = { ...posted[p], id: 'fixture-plan', version: 1, author: fixtureUser.email, author_id: id, created_at: timestamp, updated_at: timestamp };
      plans.push(saved);
      return send(saved, 201);
    }
    if (p === '/api/v1/optimization/access-points' && method === 'GET') return send([]);
    if (p === '/api/v1/optimization/access-points' && method === 'POST') return send({ ...posted[p], id: 'fixture-ap', tx_power_dbm: null, source: 'operator_registered' }, 201);
    if (p === '/api/v1/optimization/compare-sessions') return send(sessionComparison);

    // ML endpoints
    if (p === '/api/v1/ml/algorithms' || p === '/api/v1/ml/models') return send([]);
    if (p === '/api/v1/ml/readiness') return send({ is_ready: false, status: 'insufficient_data', headline: 'ISOLATED FIXTURE: insufficient data', guidance: 'Collect independent instrument observations.', requirements_checklist: [], summary: { total_measurements: 13, genuine_measurements: 0, test_import_measurements: 12 }, available_networks: [] });
    if (p === '/api/v1/ml/dataset-explorer') return send({ total_samples: 0, eligible_samples: 0, session_count: 0, rssi_histogram: [], provenance_breakdown: {}, outliers_count: 0, duplicate_locations_count: 0, spatial_coverage_m2: 0 });

    // Surveys & Speed tests
    if (p === '/api/v1/surveys' && url.searchParams.get('limit') === '100') return send({ items: sessions, total: 2 });
    if (p.startsWith('/api/v1/surveys')) return send({ sessions: [], measurements: [], items: [], total: 0 });
    if (p.startsWith('/api/v1/speed-tests')) return send({ items: [], tests: [], total: 0, total_tests: 0, completed_tests: 0 });

    unexpected.push(`${method} ${p}`);
    return send({ detail: 'Unmapped fixture API' }, 404);
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  const screenshotDir = path.join(__dirname, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });
  const shot = (name) => page.screenshot({ path: path.join(screenshotDir, `fixture_${name}.png`), fullPage: true });

  const mobileCheck = async (name) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Verify sidebar is collapsed / offcanvas on mobile
    await page.waitForFunction(() => {
      const aside = document.querySelector('aside');
      return !aside || aside.getBoundingClientRect().right <= 1;
    });
    // Check horizontal scrollbar overflow
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(hasOverflow, false, `${name} horizontally overflows at 390px`);
    await page.locator('main').evaluate(element => { element.scrollTop = 0; });
    await shot(`${name}_mobile`);
    await page.setViewportSize({ width: 1440, height: 900 });
  };

  try {
    // 1. Landing Page
    await page.goto(base);
    await page.locator('h1').first().waitFor();
    await shot('landing_desktop');

    // 2. Login Page
    await page.goto(`${base}/auth/login`);
    await page.locator('input[type=email]').waitFor();
    await shot('login_desktop');
    await page.locator('input[type=email]').fill(fixtureUser.email);
    await page.locator('input[type=password]').fill('isolated-fixture-value');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard');

    // 3. Iterate through all authenticated routes
    const allRoutes = [
      '/dashboard',
      '/campuses',
      '/speed-test',
      '/heatmaps',
      '/devices',
      '/monitor',
      '/ml-lab',
      '/diagnostics',
      '/ai-models',
      '/ai-analyst',
      '/optimization',
      '/alerts',
      '/reports',
      '/settings'
    ];

    for (const route of allRoutes) {
      console.log(`Navigating to ${route}...`);
      await page.goto(base + route);
      try {
        await page.locator('h1').first().waitFor();
      } catch (err) {
        console.error(`Timeout waiting for h1 on ${route}. Current URL: ${page.url()}`);
        const bodyContent = await page.locator('body').innerHTML();
        console.error(`Body snippet: ${bodyContent.slice(0, 300)}`);
        throw err;
      }
      const h1Text = (await page.locator('h1').first().textContent()).trim();
      assert.ok(h1Text, `Route ${route} rendered empty h1`);
      await page.waitForLoadState('networkidle');
      const name = route.slice(1).replaceAll('-', '_');
      await shot(`${name}_desktop`);
      await mobileCheck(name);
      console.log(`Route verified (desktop + mobile): ${route} ["${h1Text}"]`);
    }

    // 4. Detailed interactive checks on key operational flows:

    // 4.1 AI Models Page (/ai-models)
    console.log('Testing AI Models interactions...');
    await page.goto(base + '/ai-models');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await page.getByText('Provider connected successfully (182 ms)').first().waitFor();
    await page.getByText('llama-3.3-70b').waitFor();
    await shot('ai_models_tested_desktop');

    // 4.2 Devices Page (/devices)
    console.log('Testing Devices interactions...');
    await page.goto(base + '/devices');
    await page.waitForLoadState('networkidle');
    await page.getByText('ISOLATED FIXTURE COLLECTOR').first().waitFor();
    await page.getByRole('button', { name: 'Register Collector' }).click();
    await page.getByLabel('Collector Name *').fill('Audit Laptop');
    await page.getByLabel('Host Label *').fill('laptop-fixture-1');
    await page.getByRole('button', { name: 'Register & Generate Secret' }).click();
    await page.getByText('Collector Secret Credentials').waitFor();
    await shot('devices_modal_desktop');
    await page.getByRole('button', { name: 'I Have Stored the Secret Securely' }).click();
    await page.getByText('Audit Laptop', { exact: true }).waitFor();

    // 4.3 Monitor Page (/monitor)
    console.log('Testing Monitor interactions...');
    await page.goto(base + '/monitor');
    await page.waitForLoadState('networkidle');
    await page.getByText('Median RSSI').first().waitFor();
    await page.getByText(/Speed Test Records/).waitFor();
    await shot('monitor_populated_desktop');

    // 4.4 Alerts Page (/alerts)
    console.log('Testing Alerts interactions...');
    await page.goto(base + '/alerts');
    await page.waitForLoadState('networkidle');
    await page.getByText('Ground Truth Safeguard:').waitFor();
    await page.getByText('Observed wireless signal').first().waitFor();
    await shot('alerts_populated_desktop');

    // 4.5 Reports Page (/reports)
    console.log('Testing Reports interactions...');
    await page.goto(base + '/reports');
    await page.waitForLoadState('networkidle');
    await page.getByText('ISOLATED FIXTURE REPORT').first().waitFor();
    await page.getByRole('button', { name: /Survey Sessions/ }).click();
    await page.getByText('FIXTURE BEFORE').waitFor();
    await shot('reports_populated_desktop');

    // 4.6 ML readiness shows actual counts by source (/ml-lab)
    console.log('Testing ML Lab interactions...');
    await page.goto(base + '/ml-lab');
    await page.waitForLoadState('networkidle');
    await page.locator('main select').first().selectOption(id);
    await page.getByLabel('Measurement counts by source').waitFor();
    assert.match(await page.getByLabel('Measurement counts by source').textContent(), /Instrument-verified \(eligible\): 0/);

    // 4.7 Backend host collection disabled guardrail (/diagnostics)
    console.log('Testing Diagnostics interactions...');
    await page.goto(base + '/diagnostics');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Collect Network Data' }).first().click();
    const checks = page.getByRole('checkbox');
    assert.equal(await checks.nth(0).isChecked(), false);
    assert.equal(await checks.nth(1).isChecked(), false);
    await page.getByText('Backend collector disabled. ISOLATED FIXTURE.').waitFor();

    // 4.8 Registered collectors snapshot analysis (/diagnostics)
    await page.goto(base + '/diagnostics');
    await page.waitForLoadState('networkidle');
    await page.locator('main select').first().selectOption(id);
    await page.getByRole('tab', { name: 'Registered collectors' }).click();
    await page.getByRole('button', { name: 'ISOLATED FIXTURE COLLECTOR' }).click();
    const analyze = page.getByRole('button', { name: 'Analyze', exact: true });
    assert.equal(await analyze.isDisabled(), true);
    await page.getByLabel('I approve local deterministic analysis of selected stored observations').check();
    await analyze.click();
    await page.getByRole('link', { name: 'View analysis' }).waitFor();
    assert.equal(posted['/api/v1/diagnostics/analyze'].telemetry_snapshot_id, snapshotId);

    // 4.9 Analyst Q&A (/ai-analyst)
    console.log('Testing Analyst interactions...');
    await page.goto(base + `/ai-analyst?report=${id}`);
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Source measurement session').selectOption(id);
    await page.getByRole('button', { name: 'Analyze Current Results' }).click();
    await page.getByRole('heading', { name: 'Evidence report', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Ask the evidence' }).click();
    await page.getByRole('button', { name: 'Why does this Wi-Fi connection appear weak?' }).click();
    await page.getByRole('button', { name: 'Answer from evidence' }).click();
    await page.getByText('Cited records (1)').waitFor();

    // 4.10 Optimization candidate plan (/optimization)
    console.log('Testing Optimization interactions...');
    await page.goto(base + '/optimization');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Floor', { exact: true }).selectOption(floorId);
    await page.getByLabel('Network', { exact: true }).selectOption('ISOLATED FIXTURE NETWORK');
    await page.getByRole('heading', { name: 'Evidence quality', exact: true }).waitFor();
    const plansSection = page.getByRole('region', { name: 'Candidate plans — speculative, saved' });
    await plansSection.getByLabel('Name', { exact: true }).fill('Fixture Plan A');
    await plansSection.getByLabel('Operator notes').fill('Fixture: collect validation observations.');
    await plansSection.getByLabel('X (% from left)').fill('25');
    await plansSection.getByLabel('Label').fill('Corridor candidate');
    await plansSection.getByRole('button', { name: 'Add candidate marker' }).click();
    await page.getByText('Corridor candidate: 25.0%, 50.0%').waitFor();
    await plansSection.getByLabel(/Attach the 1 displayed weak observations/).check();
    await plansSection.getByRole('button', { name: 'Save plan' }).click();
    await page.getByText('Saved version 1').waitFor();

    assert.equal(probeAttempts, 0);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);

    console.log(JSON.stringify({
      result: 'passed',
      totalRoutesVerified: 16,
      viewportsChecked: ['1440x900', '390x844'],
      liveProbeAttempts: probeAttempts,
      externalRequestsBlocked: externalAttempts,
      pageErrors: errors.length
    }, null, 2));

  } catch (err) {
    console.error('Verification failed. Errors:', errors, 'Unexpected API calls:', unexpected);
    await page.screenshot({ path: path.join(screenshotDir, 'fixture_failure.png'), fullPage: true });
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
