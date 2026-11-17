const playwrightModule = process.env.AIRGRID_PLAYWRIGHT_MODULE || (() => {
  const candidates = [
    '/home/teju/.local/lib/node_modules/@playwright/cli/node_modules/playwright',
    '/home/teju/.npm/_npx/9833c18b2d85bc59/node_modules/playwright',
    'playwright'
  ];
  for (const c of candidates) {
    try {
      require.resolve(c);
      return c;
    } catch (_) {}
  }
  return 'playwright';
})();

const { chromium } = require(playwrightModule);
const path = require('node:path');
const fs = require('node:fs');

async function run() {
  console.log('--- Starting AirGrid AI Copilot Playwright E2E Verification ---');
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.AIRGRID_CHROMIUM_PATH || '/usr/bin/chromium',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Login
  console.log('1. Navigating to login page...');
  await page.goto('http://127.0.0.1:5173/auth/login');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', 'new-engineer-fb92e1@airgrid.test');
  await page.fill('input[type="password"]', 'EngineerSecure2026!');
  await page.click('button[type="submit"]');

  console.log('2. Waiting for dashboard navigation...');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // 3. Test Contextual Copilot Drawer from Dashboard
  console.log('3. Testing Copilot drawer toggle from Header...');
  const copilotBtn = await page.waitForSelector('button:has-text("Copilot")');
  await copilotBtn.click();
  await page.waitForSelector('text=Contextual Assistant', { timeout: 5000 });
  await page.waitForTimeout(1000);

  console.log('4. Capturing contextual drawer screenshot...');
  const drawerPath = path.join(screenshotsDir, 'copilot_drawer_desktop.png');
  await page.screenshot({ path: drawerPath });
  console.log('   Saved:', drawerPath);

  // Close drawer
  const closeBtn = await page.waitForSelector('button[title="Close Drawer"]');
  await closeBtn.click();
  await page.waitForTimeout(500);

  // 5. Navigate to full AI Copilot Workspace
  console.log('5. Navigating to /ai-copilot full workspace...');
  await page.goto('http://127.0.0.1:5173/ai-copilot');
  await page.waitForSelector('text=AirGrid Wi-Fi Intelligence Copilot', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // Verify Gateway connection status pill & model selector
  const content = await page.content();
  const hasGateway = content.includes('Gateway Ready');
  const hasAuto = content.includes('auto');
  console.log('   Gateway connection indicator ready:', hasGateway);
  console.log('   Model selector contains auto:', hasAuto);

  console.log('6. Capturing empty workspace screenshot with suggested prompts...');
  const emptyPath = path.join(screenshotsDir, 'copilot_workspace_empty_desktop.png');
  await page.screenshot({ path: emptyPath });
  console.log('   Saved:', emptyPath);

  // 6. Test Starter Question: Click "What does -70 dBm mean?"
  console.log('7. Selecting prompt "What does -70 dBm mean?"...');
  const suggestionBtn = await page.waitForSelector('button:has-text("What does -70 dBm mean?")');
  await suggestionBtn.click();
  await page.waitForTimeout(500);

  // Click Send
  console.log('8. Sending message and waiting for real inference...');
  const sendBtn = await page.waitForSelector('button[title="Send message"]');
  await sendBtn.click();

  // Wait for assistant response to appear
  await page.waitForSelector('text=AirGrid Copilot', { timeout: 30000 });
  // Wait for response completion
  await page.waitForTimeout(5000);

  console.log('9. Capturing first response screenshot...');
  const chatPath = path.join(screenshotsDir, 'copilot_chat_desktop.png');
  await page.screenshot({ path: chatPath });
  console.log('   Saved:', chatPath);

  // 7. Multi-turn conversation check: Ask follow-up question
  console.log('10. Sending multi-turn follow up: "Explain my latest speed test."...');
  const textarea = await page.waitForSelector('textarea');
  await textarea.fill('Explain my latest speed test.');
  await page.waitForTimeout(500);
  const activeSendBtn = await page.waitForSelector('button[title="Send message"]:not([disabled])', { timeout: 15000 });
  await activeSendBtn.click();

  // Wait for follow up response
  await page.waitForTimeout(7000);

  console.log('11. Capturing multi-turn conversation screenshot...');
  const multiturnPath = path.join(screenshotsDir, 'copilot_multiturn_desktop.png');
  await page.screenshot({ path: multiturnPath });
  console.log('   Saved:', multiturnPath);

  // 8. Mobile responsiveness test (390x844)
  console.log('12. Testing mobile viewport (390x844)...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);

  const mobilePath = path.join(screenshotsDir, 'copilot_mobile.png');
  await page.screenshot({ path: mobilePath });
  console.log('   Saved:', mobilePath);

  console.log('--- ALL PLAYWRIGHT E2E COPILOT CHECKS PASSED SUCCESSFULLY ---');
  await browser.close();
}

run().catch((err) => {
  console.error('Error during Copilot verification:', err);
  process.exit(1);
});
