import { chromium } from "playwright-core";
import path from "path";

const ARTIFACT_DIR = "C:/Users/LENOVO/.gemini/antigravity/brain/ba117b01-86d4-401c-9160-aaae5b965c0d";
const CHROME_PATH = "C:/Users/LENOVO/AppData/Local/Google/Chrome/Application/chrome.exe";

async function run() {
  console.log("=== Starting Chrome Browser E2E Test ===");
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
  await page.goto("http://localhost:3000/admin", { waitUntil: "domcontentloaded" });

  const pinLocator = page.locator('input[type="password"]');
  try {
    await pinLocator.waitFor({ state: "visible", timeout: 8000 });
    console.log("PIN input found! Filling PIN...");
    await pinLocator.fill("ST@2024");
    await page.locator('button:has-text("Sign In to Command Center")').click();
    console.log("Clicked Sign In button.");
  } catch (e) {
    console.log("No PIN input visible or already authed.");
  }

  // Wait for sidebar
  console.log("Waiting for All Bookings in sidebar...");
  const allBookingsBtn = page.locator('aside button:has-text("All Bookings")').first();
  await allBookingsBtn.waitFor({ state: "visible", timeout: 15000 });
  await allBookingsBtn.click();
  console.log("Clicked All Bookings.");

  await page.waitForTimeout(1000);

  // Click Completed Bookings tab
  console.log("Clicking Completed Bookings tab...");
  const completedTab = page.locator('button:has-text("Completed Bookings")').first();
  await completedTab.waitFor({ state: "visible", timeout: 5000 });
  await completedTab.click();
  console.log("Clicked Completed Bookings tab.");

  await page.waitForTimeout(1500);

  // Expand all completed booking cards
  const detailsButtons = page.locator('button:has-text("Details ▾")');
  const dCount = await detailsButtons.count();
  console.log(`Expanding ${dCount} completed cards...`);
  for (let i = 0; i < dCount; i++) {
    await detailsButtons.nth(0).click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1000);

  // Screenshot desktop
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-bank-and-delete-desktop.png"), fullPage: false });
  console.log("Captured e2e-completed-bank-and-delete-desktop.png");

  // Check delete buttons
  const deleteBtn = page.locator('button:has-text("Delete Booking")').first();
  const deleteCount = await page.locator('button:has-text("Delete Booking")').count();
  console.log(`Found ${deleteCount} Delete Booking button(s) in Completed Bookings!`);

  if (deleteCount > 0) {
    console.log("Clicking first Delete Booking button...");
    await deleteBtn.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-delete-modal.png"), fullPage: false });
    console.log("Captured e2e-completed-delete-modal.png");

    const reasonInput = page.locator('textarea').first();
    await reasonInput.fill("Verified by Chrome E2E: deletion option restored in Completed Bookings.");
    await page.waitForTimeout(300);

    // Cancel modal to preserve data
    const cancelBtn = page.locator('button:has-text("Cancel")').last();
    await cancelBtn.click();
    await page.waitForTimeout(500);
    console.log("Cancelled deletion modal.");
  }

  // Mobile Viewport (390x844)
  console.log("Testing Mobile Viewport (390x844)...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-bank-mobile.png"), fullPage: false });
  console.log("Captured e2e-completed-bank-mobile.png");

  await browser.close();
  console.log("=== Chrome E2E Test Finished Successfully! ===");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
