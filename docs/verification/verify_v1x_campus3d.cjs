/* Browser acceptance for the 3D campus page.
 * Env: AIRGRID_PLAYWRIGHT_MODULE (path to playwright), E2E_BASE (default http://127.0.0.1:5190),
 *      E2E_EMAIL, E2E_PASSWORD_FILE, E2E_OUT (screenshot dir).
 * Uses a throwaway admin on a demo database seeded with SYNTHETIC data; never the operational database. */
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE + '/login');
  await page.fill('input[type="email"]', process.env.E2E_EMAIL);
  await page.fill('input[type="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  await page.screenshot({ path: path.join(OUT, 'dashboard_desktop.png') });
  check('login + dashboard', true);

  await page.click('a[href="/campus-3d"]');
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'campus3d_whole_desktop.png') });
  check('3D canvas rendered', await page.locator('canvas').count() === 1);

  // orbit + zoom change the rendered image
  const box = await page.locator('canvas').boundingBox();
  const hash = async () => (await page.locator('canvas').screenshot()).length;
  const h0 = await hash();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 - 40, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(400);
  const h1 = await hash();
  await page.mouse.wheel(0, -600); await page.waitForTimeout(400);
  const h2 = await hash();
  check('orbit changes view', h1 !== h0); check('zoom changes view', h2 !== h1);
  await page.getByRole('button', { name: /reset camera/i }).click(); await page.waitForTimeout(400);
  check('reset camera restores default view', (await hash()) === h0);

  for (const [key, title] of [['ground', 'Ground Floor'], ['first', 'First Floor'], ['second', 'Second Floor']]) {
    await page.getByRole('button', { name: title, exact: true }).click();
    await page.waitForSelector('text=/Synthetic demo data/', { timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `campus3d_${key}_desktop.png`) });
    check(`${title}: coverage panel shows synthetic disclosure`, await page.locator('text=/Synthetic demo data/').count() > 0);
    // room selection: click a grid of points until a room is reported
    let picked = false;
    for (const fx of [0.5, 0.35, 0.65, 0.25, 0.75]) for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      if (picked) break;
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await page.waitForTimeout(120);
      picked = (await page.locator('text=/Estimated signal/').count()) > 0;
    }
    check(`${title}: room selectable in 3D`, picked);
    if (picked) await page.screenshot({ path: path.join(OUT, `campus3d_${key}_room_desktop.png`) });
    await page.getByRole('button', { name: '2D floor plan' }).click(); await page.waitForTimeout(500);
    const polys = await page.locator('svg polygon').count();
    await page.locator('svg polygon').first().click({ force: true });
    await page.screenshot({ path: path.join(OUT, `plan2d_${key}_desktop.png`) });
    check(`${title}: 2D plan has room polygons`, polys === 20, `polygons=${polys}`);
    await page.getByRole('button', { name: '3D model' }).click(); await page.waitForTimeout(300);
  }

  await ctx.close();
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  await mp.goto(BASE + '/login');
  await mp.fill('input[type="email"]', process.env.E2E_EMAIL); await mp.fill('input[type="password"]', pw); await mp.click('button[type="submit"]');
  await mp.waitForURL(/dashboard/, { timeout: 20000 });
  await mp.goto(BASE + '/campus-3d'); await mp.waitForSelector('canvas', { timeout: 30000 }); await mp.waitForTimeout(2500);
  await mp.screenshot({ path: path.join(OUT, 'campus3d_mobile.png'), fullPage: true });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile: no horizontal overflow', overflow <= 1, `overflow=${overflow}`);
  await m.close();

  const fatal = errors.filter((e) => !/favicon|WebGL.*(deprecated|GPU stall)|GL Driver Message/i.test(e));
  check('no page/console errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(OUT, 'campus3d_results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
