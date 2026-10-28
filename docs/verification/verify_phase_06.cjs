// Isolated browser verification: no production credentials, telemetry or network probes.
// AIRGRID_PLAYWRIGHT_MODULE may point to an existing cached Playwright installation.
const { chromium } = require(process.env.AIRGRID_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.AIRGRID_BROWSER_URL || 'http://127.0.0.1:5187';
const timestamp = '2026-10-28T00:00:00Z';
const id = '00000000-0000-0000-0000-000000000001';
const floorId = '00000000-0000-0000-0000-000000000002';
const fixtureUser = { id, email: 'operator@airgrid.test', full_name: 'Isolated Fixture Operator', role: 'administrator', is_active: true, created_at: timestamp };
const floor = { id: floorId, building_id: id, floor_number: 1, name: 'Fixture Floor', status: 'active', has_floor_plan: false, dimensions_width_m: 20, dimensions_height_m: 10 };
const campus = { id, name: 'ISOLATED FIXTURE CAMPUS', code: 'FIXTURE', status: 'active', buildings_count: 1, floors_count: 1, floor_plans_count: 0, buildings: [{ id, campus_id: id, name: 'Fixture Building', building_code: 'F', status: 'active', floors_count: 1, floors: [floor] }] };
const telemetry = { mac_address: null, bssid: null, signal_quality_pct: null, frequency_mhz: null, channel: null, channel_width_mhz: null, band: null, rx_bitrate_mbps: null, tx_bitrate_mbps: null, security_protocol: null, gateway_ip: null, gateway_ping: null, iperf: null, internet_download_mbps: null, internet_upload_mbps: null, internet_latency_ms: null, interface_name: 'fixture0', rssi_dbm: -80, ssid: 'ISOLATED FIXTURE NETWORK', vantage_point: 'operator_supplied', data_provenance: 'controlled_test_import', collected_at: timestamp, raw_details: {} };
const report = { id, title: 'ISOLATED FIXTURE REPORT', device_name: 'Fixture device', user_email: fixtureUser.email, status: 'warning', interface_name: 'fixture0', vantage_point: 'operator_supplied', data_provenance: 'controlled_test_import', summary_headline: 'Fixture evidence only', overall_score: 80, findings_count: 1, warning_count: 1, critical_count: 0, good_count: 0, telemetry, findings: [], created_at: timestamp, updated_at: timestamp };
const analysis = { report_id: id, mode: 'deterministic', summary: 'ISOLATED FIXTURE: weak observed signal; no cause established.', gateway_status: 'not_requested', provider_reported_model: null, confidence: 'Fixture observation, not campus evidence.', evidence: [{ source_id: `${id}:rssi_dbm`, timestamp, metric: 'rssi_dbm', value: -80, unit: 'dBm' }], findings: [{ source_id: `${id}:finding:0`, title: 'Observed wireless signal', severity: 'warning', measured_evidence: `ISOLATED FIXTURE: -80 dBm at ${timestamp}.`, recommendation: 'Repeat at the same location.' }], limitations: ['No AP fault or improvement estimate established.'] };
const optimization = { floor_id: floorId, network_label: 'ISOLATED FIXTURE NETWORK', available_networks: ['ISOLATED FIXTURE NETWORK'], generated_at: timestamp, calibrated: false, sample_count: 1, session_count: 1, points: [], weak_locations: [{ source_id: id, x: .25, y: .5, rssi_dbm: -80, timestamp, provenance: 'controlled_test_import (browser fixture only)', historical: true }], suggested_measurements: [{ x: .125, y: .125 }], recommendations: [{ priority: 'measurement_first', title: 'Fixture: collect independent evidence', evidence_ids: [id], expected_benefit: 'Reduce uncertainty', required_evidence: 'Calibrated independent survey', validation: 'Repeat observations; no numerical gains predicted.' }], limitations: ['ISOLATED FIXTURE: no configuration changes.'] };

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.AIRGRID_CHROMIUM_PATH || '/usr/bin/chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  let authenticated = false;
  const unexpected = [];
  let externalAttempts = 0;
  let probeAttempts = 0;
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) { externalAttempts++; return route.abort(); }
    const p = url.pathname;
    if (p === '/healthz') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    if (!p.startsWith('/api/')) return route.continue();
    const send = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p.endsWith('/auth/session')) return send({ authenticated, user: authenticated ? fixtureUser : null, csrf_token: 'fixture' });
    if (p.endsWith('/auth/login')) { authenticated = true; return send({ user: fixtureUser, csrf_token: 'fixture' }); }
    if (p.endsWith('/buildings')) return send(campus.buildings);
    if (p.endsWith('/floors')) return send([floor]);
    if (p === `/api/v1/campuses/${id}`) return send(campus);
    if (p === '/api/v1/campuses') return send({ items: [campus], total: 1, skip: 0, limit: 100 });
    if (p === '/api/v1/dashboard/summary') return send({ campuses_count: 1, buildings_count: 1, floors_count: 1, floor_plans_count: 0, calibrated_floor_plans_count: 0, active_campuses_count: 1 });
    if (p === '/api/v1/dashboard/system-status') return send({ overall: 'operational', components: [], timestamp });
    if (p.startsWith('/api/v1/dashboard/')) return send({ items: [], total: 0 });
    if (p === '/api/v1/diagnostics/reports') return send({ reports: [report], total: 1, skip: 0, limit: 20 });
    if (p === '/api/v1/diagnostics/interfaces') return send({ detail: 'Backend collector disabled. ISOLATED FIXTURE.' }, 409);
    if (/diagnostics\/(collect|ping-gateway|iperf)/.test(p)) { probeAttempts++; return send({ detail: 'Live collection forbidden in browser verification' }, 403); }
    if (p === '/api/v1/ai/status') return send({ is_configured: false });
    if (p === '/api/v1/analyst/analyze') { const body = request.postDataJSON(); assert.equal(body.use_gateway, false); return send(analysis); }
    if (p === '/api/v1/optimization/survey') return send(optimization);
    if (p === '/api/v1/ml/algorithms' || p === '/api/v1/ml/models') return send([]);
    if (p === '/api/v1/ml/readiness') return send({ is_ready: false, status: 'insufficient_data', headline: 'ISOLATED FIXTURE: insufficient data', guidance: 'Collect independent instrument observations.', requirements_checklist: [], summary: {}, available_networks: [] });
    if (p === '/api/v1/ml/dataset-explorer') return send({ total_samples: 0, eligible_samples: 0, session_count: 0, rssi_histogram: [], provenance_breakdown: {}, outliers_count: 0, duplicate_locations_count: 0, spatial_coverage_m2: 0 });
    if (p.startsWith('/api/v1/surveys')) return send({ sessions: [], measurements: [], items: [], total: 0 });
    if (p.startsWith('/api/v1/speed-tests')) return send({ items: [], tests: [], total: 0, total_tests: 0, completed_tests: 0 });
    unexpected.push(p);
    return send({ detail: 'Unmapped fixture API' }, 404);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const screenshotDir = path.join(__dirname, 'screenshots'); fs.mkdirSync(screenshotDir, { recursive: true });
  try {
    await page.goto(base); await page.locator('h1').first().waitFor();
    await page.screenshot({ path: path.join(screenshotDir, 'fixture_landing_desktop.png'), fullPage: true });
    await page.goto(`${base}/auth/login`);
    await page.locator('input[type=email]').waitFor();
    await page.screenshot({ path: path.join(screenshotDir, 'fixture_login_desktop.png'), fullPage: true });
    await page.locator('input[type=email]').fill(fixtureUser.email);
    await page.locator('input[type=password]').fill('isolated-fixture-value');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/dashboard');
    for (const route of ['/dashboard', '/campuses', '/speed-test', '/heatmaps', '/ml-lab', '/network-tools', '/ai-analyst', '/optimization']) {
      await page.goto(base + route); await page.locator('h1').first().waitFor();
      assert.ok((await page.locator('h1').first().textContent()).trim());
      await page.waitForLoadState('networkidle');
      const name = route.slice(1).replaceAll('-', '_');
      await page.screenshot({ path: path.join(screenshotDir, `fixture_${name}_desktop.png`), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().right <= 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(screenshotDir, `fixture_${name}_mobile.png`), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
      console.log(`Route rendered: ${route}`);
    }
    await page.goto(base + '/diagnostics');
    await page.getByRole('button', { name: 'Collect Network Data' }).first().click();
    const checks = page.getByRole('checkbox');
    assert.equal(await checks.nth(0).isChecked(), false);
    assert.equal(await checks.nth(1).isChecked(), false);
    await page.getByText('Backend collector disabled. ISOLATED FIXTURE.').waitFor();
    await page.screenshot({ path: path.join(screenshotDir, 'fixture_collector_disabled_desktop.png'), fullPage: true });
    await page.goto(base + '/ai-analyst');
    await page.getByLabel('Source measurement session').selectOption(id);
    await page.getByRole('button', { name: 'Analyze Current Results' }).click();
    await page.getByRole('heading', { name: 'Evidence report', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Ask AirGrid to prioritize findings' }).isDisabled(), true);
    await page.screenshot({ path: path.join(screenshotDir, 'fixture_analyst_desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().right <= 1);
    await page.screenshot({ path: path.join(screenshotDir, 'fixture_analyst_mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('aside').isVisible(), false);
    await page.pdf({ path: path.join(screenshotDir, 'fixture_analyst_report.pdf'), printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + '/optimization');
    await page.getByLabel('Floor', { exact: true }).selectOption(floorId);
    await page.getByLabel('Network', { exact: true }).selectOption('ISOLATED FIXTURE NETWORK');
    await page.getByRole('heading', { name: 'Evidence quality', exact: true }).waitFor();
    await page.getByLabel('Operator annotations').fill('Fixture Plan A: collect validation observations.');
    await page.getByLabel('X (% from left)').fill('25');
    await page.getByRole('button', { name: 'Add planned AP marker' }).click();
    await page.getByText('Planned AP 1: 25.0%, 50.0%').waitFor();
    await page.getByLabel('Candidate', { exact: true }).selectOption('1');
    await page.getByLabel('Operator annotations').fill('Fixture Plan B: alternative evidence plan.');
    assert.equal(await page.getByRole('button', { name: 'Remove marker 1', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Add planned AP marker' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export analysis and plans' }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.candidate_plans[0].markers.length, 1);
    assert.match(exported.candidate_plans[1].notes, /Plan B/);
    assert.equal(exported.evidence.floor_id, floorId);
    await page.locator('main').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.join(screenshotDir, 'fixture_optimization_desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().right <= 1);
    await page.locator('main').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: path.join(screenshotDir, 'fixture_optimization_mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(probeAttempts, 0);
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'passed', routes: 9, viewportWidths: [1440, 390], liveProbeAttempts: probeAttempts, externalRequestsBlocked: externalAttempts, pageErrors: errors.length }));
  } catch (err) { console.error({ errors, unexpected }); await page.screenshot({ path: path.join(screenshotDir, "fixture_failure.png"), fullPage: true }); throw err; } finally { await browser.close(); }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
