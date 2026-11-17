/* UX sweep: every app route at desktop, tablet and mobile widths. Read-only (navigation only).
 * Records API errors (status >= 400 on /api), uncaught page errors, horizontal overflow and near-empty pages.
 * Same env as verify_v1x_campus3d.cjs. Demo database only. */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.AIRGRID_PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5190';
const OUT = process.env.E2E_OUT || path.join(__dirname, 'v1x');
fs.mkdirSync(OUT, { recursive: true });
const pw = fs.readFileSync(process.env.E2E_PASSWORD_FILE, 'utf8').trim();
const ROUTES = ['dashboard', 'campuses', 'campus-3d', 'heatmaps', 'speed-test', 'monitor', 'devices', 'ml-lab', 'optimization', 'ai-copilot', 'diagnostics', 'ai-analyst', 'ai-models', 'alerts', 'reports', 'settings'];
const WIDTHS = [1440, 768, 390];
const rows = [];

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
    const page = await ctx.newPage();
    let apiErrors = [], pageErrors = [];
    page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400 && !/auth\/session/.test(r.url())) apiErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(BASE + '/login');
    await page.fill('input[type="email"]', process.env.E2E_EMAIL);
    await page.fill('input[type="password"]', pw);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 20000 });
    for (const route of ROUTES) {
      apiErrors = []; pageErrors = [];
      await page.goto(`${BASE}/${route}`);
      await page.waitForTimeout(route === 'campus-3d' ? 3500 : 1800);
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, text: (document.querySelector('main') || document.body).innerText.trim().length }));
      const row = { route, width, apiErrors: [...apiErrors], pageErrors: [...pageErrors], overflow: m.overflow, textLength: m.text };
      row.ok = row.apiErrors.length === 0 && row.pageErrors.length === 0 && row.overflow <= 1 && row.textLength > 80;
      rows.push(row);
      console.log(`${row.ok ? 'PASS' : 'FAIL'} ${width} /${route} overflow=${row.overflow} text=${row.textLength} api=${row.apiErrors.join(',')} err=${row.pageErrors.join('|').slice(0, 80)}`);
      if (!row.ok || width === 768) await page.screenshot({ path: path.join(OUT, `sweep_${route}_${width}.png`) });
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'sweep_results.json'), JSON.stringify(rows, null, 2));
  await browser.close();
  process.exit(rows.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
