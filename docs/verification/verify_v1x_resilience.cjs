/* Browser acceptance: Settings health states, Copilot provider failure + recovery, exact server-side message counts.
 * Env: AIRGRID_PLAYWRIGHT_MODULE, E2E_BASE (default http://127.0.0.1:5190), E2E_EMAIL, E2E_PASSWORD_FILE, E2E_OUT.
 * Synthetic demo database only. */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.AIRGRID_PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5190';
const OUT = process.env.E2E_OUT || path.join(__dirname, 'v1x');
fs.mkdirSync(OUT, { recursive: true });
const pw = fs.readFileSync(process.env.E2E_PASSWORD_FILE, 'utf8').trim();
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/login');
  await page.fill('input[type="email"]', process.env.E2E_EMAIL);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });

  // --- Settings health states
  const settingsText = async () => { await page.goto(BASE + '/settings'); await page.waitForTimeout(1500); return page.locator('main').innerText(); };
  let t = await settingsText();
  check('settings: healthy state from real API', /Operational/.test(t) && /connected/i.test(t) && /150 MB/.test(t) && !/Unavailable/.test(t));
  await page.route('**/api/v1/health', (r) => r.abort());
  t = await settingsText();
  check('settings: health failure shows unavailable, not Operational/Connected', /Status unavailable/.test(t) && /Unavailable/.test(t) && !/Operational/.test(t) && !/\bconnected\b/i.test(t));
  await page.unroute('**/api/v1/health');
  await page.route('**/api/v1/health', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'degraded', version: 'x', environment: 'test', uptime_seconds: 5, dependencies: { database: { status: 'error' } } }) }));
  t = await settingsText();
  check('settings: degraded state shown', /Degraded/.test(t) && !/Operational/.test(t));
  await page.unroute('**/api/v1/health');
  await page.screenshot({ path: path.join(OUT, 'settings_states_desktop.png') });

  // --- Copilot: failure then recovery, with exact server-side counts
  await page.goto(BASE + '/ai-copilot');
  await page.waitForTimeout(1500);
  await page.locator('text=New AI Conversation').first().click();
  await page.waitForTimeout(800);
  const Q = 'Resilience probe: summarise the ground floor coverage in one sentence.';
  await page.route('**/messages/stream', (r) => r.abort());
  await page.locator('textarea').fill(Q);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const body = await page.locator('main').innerText();
  check('failure: error shown with Retry offered', /cannot reach|interrupted|error|failed/i.test(body) && await page.getByRole('button', { name: /^\s*retry\s*$/i }).count() > 0);
  await page.unroute('**/messages/stream');
  await page.getByRole('button', { name: /^\s*retry\s*$/i }).first().click();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await page.waitForTimeout(2000);
    const tx = await page.locator('main').innerText();
    ok = !/Streaming response/.test(tx) && i > 2 && !/Nothing to retry/.test(tx) && tx.split(Q).length > 1 && /(dBm|synthetic|coverage)/i.test(tx.split(Q).pop());
    if (/Nothing to retry/.test(tx)) break;
  }
  await page.screenshot({ path: path.join(OUT, 'copilot_recovery_desktop.png') });
  const msgs = await page.evaluate(async (q) => {
    const list = await (await fetch('/api/v1/ai/copilot/conversations?limit=1', { credentials: 'include' })).json();
    const conv = await (await fetch('/api/v1/ai/copilot/conversations/' + list.conversations[0].id, { credentials: 'include' })).json();
    return conv.messages.map((m) => ({ role: m.role, status: m.status, mine: m.content === q, model: m.model_used }));
  }, Q);
  check('recovery: answer delivered after retry', ok);
  check('recovery: user message stored exactly once', msgs.filter((m) => m.mine).length === 1, JSON.stringify(msgs.map((m) => m.role + ':' + m.status)));
  check('recovery: no failed assistant rows left, one completed answer', msgs.filter((m) => m.role === 'assistant' && m.status === 'error').length === 0 && msgs.filter((m) => m.role === 'assistant' && m.status === 'completed').length === 1);
  check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  fs.writeFileSync(path.join(OUT, 'resilience_results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
