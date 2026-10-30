const { chromium } = require(process.env.AIRGRID_PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const fs = require('node:fs');

async function main() {
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

  console.log('1. Logging in as operator...');
  await page.goto('http://127.0.0.1:5173/auth/login');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', 'new-engineer-fb92e1@airgrid.test');
  await page.fill('input[type="password"]', 'EngineerSecure2026!');
  await page.click('button[type="submit"]');

  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('2. Logged in successfully. Navigating to /speed-test...');

  await page.goto('http://127.0.0.1:5173/speed-test');
  await page.waitForSelector('text=Network Speed Test Lab', { timeout: 10000 });
  await page.waitForTimeout(1500); // Allow live Wi-Fi telemetry to fetch

  console.log('3. Clicking Start Network Speed Test to open Consent Modal...');
  const startBtn = await page.waitForSelector('button:has-text("Start Network Speed Test")');
  await startBtn.click();

  console.log('4. Waiting for SpeedTestConsentModal...');
  await page.waitForSelector('text=Operator Speed Test Authorization', { timeout: 5000 });
  await page.waitForTimeout(500);

  const shotPath = path.join(screenshotsDir, 'operator_consent_modal_verified.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`5. Screenshot captured at ${shotPath}`);

  // Inspect modal content
  const modalText = await page.textContent('body');
  const hasSSID = modalText.includes('MOJO-JAN-C1-F2');
  const hasDuration = modalText.includes('10s');
  const hasDataCap = modalText.includes('13–16 MB') || modalText.includes('150 MB');
  const hasStandalone = modalText.includes('Standalone Audit');

  console.log('Modal Verification Details:');
  console.log('- Displays connected SSID (MOJO-JAN-C1-F2):', hasSSID);
  console.log('- Displays duration cap (~10s):', hasDuration);
  console.log('- Displays traffic bounds (~13–16 MB / 150 MB):', hasDataCap);
  console.log('- Displays Standalone Audit scope:', hasStandalone);

  await browser.close();
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
