/* Browser acceptance: floor-grounded Copilot, conversation reopen, and an unavailable provider.
 * Same env as verify_v1x_campus3d.cjs. Demo database only (synthetic data). Credentials are never printed. */
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
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  let streamBody = null;
  page.on('request', (r) => { if (r.url().includes('/messages/stream') && r.method() === 'POST' && !streamBody) streamBody = r.postData(); });

  await page.goto(BASE + '/login');
  await page.fill('input[type="email"]', process.env.E2E_EMAIL);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });

  // select the ground floor and a room in 3D, then hand off to the Copilot
  await page.goto(BASE + '/campus-3d');
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Ground Floor', exact: true }).click();
  await page.waitForSelector('text=/Synthetic demo data/', { timeout: 15000 });
  const box = await page.locator('canvas').boundingBox();
  for (const fx of [0.5, 0.35, 0.65, 0.25, 0.75]) for (const fy of [0.5, 0.4, 0.6, 0.3]) {
    if (await page.locator('text=/Estimated signal/').count()) break;
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await page.waitForTimeout(100);
  }
  await page.getByRole('link', { name: /Ask the Copilot/ }).click();
  await page.waitForURL(/ai-copilot/);
  check('prompt prefilled from selected room', (await page.locator('textarea').inputValue()).includes('Explain the Wi-Fi coverage in room'));
  check('floor focus chip shown', await page.locator('text=/grounded in the floor you selected/').count() > 0);

  await page.locator('text=New AI Conversation').first().click();
  await page.waitForTimeout(800);
  await page.locator('textarea').fill('Explain the Wi-Fi coverage on the ground floor. Which rooms are weak, and is this data real or synthetic?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  check('stream request carries floor_id', !!streamBody && !!JSON.parse(streamBody).floor_id);

  let text = '', after = '', retries = 0;
  // The free provider is intermittently slow/unavailable; the product offers Retry for that case, so the check uses it (max 2).
  for (let attempt = 0; attempt < 3; attempt++) {
    for (let i = 0; i < 70; i++) {
      await page.waitForTimeout(2000);
      text = await page.locator('main').innerText().catch(() => '');
      if (i > 3 && !/Streaming response/.test(text)) break; // finished: answer stored or recoverable error shown
    }
    after = text.split('Which rooms are weak')[1] || '';
    if (/synthetic/i.test(after) && /(GF-|dBm)/.test(after)) break;
    const retry = page.getByRole('button', { name: /^\s*retry\s*$/i });
    if (attempt < 2 && await retry.count()) { await retry.first().click(); retries++; }
  }
  console.log('provider retries used:', retries);
  await page.screenshot({ path: path.join(OUT, 'copilot_floor_grounded_desktop.png') });
  const grounded = /synthetic/i.test(after) && /(GF-|dBm)/.test(after);
  check('response grounded: mentions synthetic data and room/dBm evidence', grounded, grounded ? '' : 'provider may be unavailable: ' + after.slice(0, 160).replace(/\s+/g, ' '));
  const executing = await page.evaluate(async () => {
    const list = await (await fetch('/api/v1/ai/copilot/conversations?limit=50', { credentials: 'include' })).json();
    for (const c of list.conversations) {
      const d = await (await fetch('/api/v1/ai/copilot/conversations/' + c.id, { credentials: 'include' })).json();
      const a = d.messages.find((m) => m.role === 'assistant' && m.status === 'completed' && /ground floor/i.test(d.messages[0].content));
      if (a) return a.model_used;
    }
    return null;
  });
  check('executing model identity stored with the answer', !!executing && executing !== 'auto', 'model=' + executing);

  // reopen: reload the page and open the saved conversation
  await page.reload(); await page.waitForTimeout(2500);
  await page.locator('text=/Explain the Wi-Fi coverage/').first().click().catch(() => {});
  await page.waitForTimeout(1500);
  check('conversation reopens from history', (await page.locator('main').innerText()).includes('Which rooms are weak'));
  await page.screenshot({ path: path.join(OUT, 'copilot_reopened_desktop.png') });

  // unavailable provider: abort the stream request; UI must report a recoverable error and not duplicate the user message
  await page.route('**/messages/stream', (r) => r.abort());
  await page.locator('textarea').fill('Second question while the provider is unreachable.');
  await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
  const body = await page.locator('main').innerText();
  check('unavailable provider: error shown, no crash', /error|failed|unavailable|retry|could not/i.test(body));
  check('user message not duplicated', (body.match(/Second question while the provider is unreachable/g) || []).length <= 2);
  await page.screenshot({ path: path.join(OUT, 'copilot_provider_unavailable_desktop.png') });

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  fs.writeFileSync(path.join(OUT, 'copilot_results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
