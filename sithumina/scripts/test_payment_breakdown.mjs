import { chromium } from "playwright-core";
import path from "path";

const ARTIFACT_DIR = "C:/Users/LENOVO/.gemini/antigravity/brain/ba117b01-86d4-401c-9160-aaae5b965c0d";
const CHROME_PATH = "C:/Users/LENOVO/AppData/Local/Google/Chrome/Application/chrome.exe";

async function run() {
  console.log("Launching Chrome...");
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  console.log("Navigating to http://localhost:3000/admin...");
  await page.goto("http://localhost:3000/admin", { waitUntil: "networkidle", timeout: 25000 });

  const pinInput = await page.$('input[type="password"]');
  if (pinInput) {
    await pinInput.fill("ST@2024");
    await page.locator('button:has-text("Sign In to Command Center")').click();
    await page.waitForTimeout(2000);
  }

  // Navigate to All Bookings -> Tab 3: Completed Bookings
  console.log("Navigating to All Bookings -> Completed Bookings...");
  const allBookingsNav = page.locator('aside button:has-text("All Bookings")').first();
  await allBookingsNav.click();
  await page.waitForTimeout(1500);

  const completedTab = page.locator('button:has-text("Completed Bookings")').first();
  await completedTab.click();
  await page.waitForTimeout(1000);

  // Expand all completed booking cards (click all "Details ▾" buttons)
  const detailsButtons = page.locator('button:has-text("Details ▾")');
  const count = await detailsButtons.count();
  console.log(`Found ${count} details buttons to expand.`);
  for (let i = 0; i < count; i++) {
    await detailsButtons.nth(0).click(); // as each one expands, it turns to "Hide ▴"
    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(1000);

  // Capture full screenshot of expanded completed cards
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-payment-breakdown-desktop.png"), fullPage: false });
  console.log("Captured e2e-completed-payment-breakdown-desktop.png");

  // Mobile Viewport (390x844)
  console.log("Testing Mobile Viewport...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-payment-breakdown-mobile.png"), fullPage: false });
  console.log("Captured e2e-completed-payment-breakdown-mobile.png");

  await browser.close();
  console.log("Completed payment breakdown test successfully!");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
