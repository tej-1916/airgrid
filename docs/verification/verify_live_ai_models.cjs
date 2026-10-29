const { chromium } = require(process.env.AIRGRID_PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const fs = require('node:fs');

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.AIRGRID_CHROMIUM_PATH || '/usr/bin/chromium'
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('1. Navigating to login page...');
  await page.goto('http://127.0.0.1:5173/auth/login');
  await page.waitForSelector('input[type="email"]');

  console.log('2. Logging in...');
  await page.fill('input[type="email"]', 'new-engineer-fb92e1@airgrid.test');
  await page.fill('input[type="password"]', 'EngineerSecure2026!');
  await page.click('button[type="submit"]');

  console.log('3. Waiting for dashboard navigation...');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await page.waitForTimeout(1000);

  console.log('4. Capturing dashboard screenshot with updated roadmap status...');
  await page.screenshot({ path: path.join(screenshotsDir, 'repaired_dashboard_desktop.png') });

  console.log('5. Navigating to /ai-models...');
  await page.goto('http://127.0.0.1:5173/ai-models');
  await page.waitForSelector('text=AI Gateway & FreeLLMAPI Control', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // Check state text
  const content = await page.content();
  const isConfigured = content.includes('Configured');
  const hasAuto = content.includes('auto');
  console.log('Gateway state shows Configured:', isConfigured);
  console.log('Active model displays auto:', hasAuto);

  console.log('6. Clicking Test Connection...');
  const testBtn = await page.waitForSelector('button:has-text("Test Connection")');
  await testBtn.click();

  console.log('7. Waiting for provider probe response...');
  await page.waitForSelector('text=Provider connected successfully', { timeout: 15000 });
  await page.waitForTimeout(1000);

  console.log('8. Capturing live AI models screenshot...');
  await page.screenshot({ path: path.join(screenshotsDir, 'repaired_ai_models_desktop.png') });

  // Mobile viewport test
  console.log('9. Testing mobile viewport (390x844)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(screenshotsDir, 'repaired_ai_models_mobile.png') });

  console.log('All live checks succeeded!');
  await browser.close();
}

run().catch((err) => {
  console.error('Error during live verification:', err);
  process.exit(1);
});
