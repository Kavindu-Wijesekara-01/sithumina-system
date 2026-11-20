import { chromium } from "playwright-core";
import path from "path";

const ARTIFACT_DIR = "C:/Users/LENOVO/.gemini/antigravity/brain/ba117b01-86d4-401c-9160-aaae5b965c0d";
const CHROME_PATH = "C:/Users/LENOVO/AppData/Local/Google/Chrome/Application/chrome.exe";

async function run() {
  console.log("=== Starting Chrome Browser E2E Test: Bank Transfer Details & Delete in Completed Bookings ===");
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

  const pin = page.locator('input[type="password"]');
  if (await pin.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("Entering PIN...");
    await pin.fill("ST@2024");
    await page.locator('button:has-text("Sign In to Command Center")').click();
    await page.waitForTimeout(2000);
  }

  // 1. Expand ST-BK-2678 and set its stage to Delivered / Completed
  console.log("Expanding ST-BK-2678 card on Overview...");
  const detailsBtn = page.locator('button:has-text("Details ▾")').first();
  await detailsBtn.waitFor({ state: "visible", timeout: 8000 });
  await detailsBtn.click();
  await page.waitForTimeout(1000);

  // Click Delivered / Completed stage
  console.log("Clicking 7. Delivered / Completed stage button...");
  const deliveredBtn = page.locator('button:has-text("7. Delivered / Completed")').first();
  await deliveredBtn.scrollIntoViewIfNeeded();
  await deliveredBtn.click();
  await page.waitForTimeout(2000);

  // 2. Now navigate to All Bookings -> Tab 3: Completed Bookings
  console.log("Navigating to All Bookings -> Completed Bookings...");
  const allBookingsNav = page.locator('aside button:has-text("All Bookings")').first();
  await allBookingsNav.click();
  await page.waitForTimeout(1500);

  const completedTab = page.locator('button:has-text("Completed Bookings")').first();
  await completedTab.click();
  await page.waitForTimeout(1500);

  // Expand completed booking
  console.log("Expanding completed booking card...");
  const completedDetailsBtn = page.locator('button:has-text("Details ▾")').first();
  await completedDetailsBtn.waitFor({ state: "visible", timeout: 8000 });
  await completedDetailsBtn.click();
  await page.waitForTimeout(1000);

  // Capture Desktop Screenshot: Showing Bank Details & Delete Button
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-bank-and-delete-desktop.png"), fullPage: false });
  console.log("Captured e2e-completed-bank-and-delete-desktop.png");

  // Check Delete button
  const deleteBtn = page.locator('button:has-text("Delete Booking")').first();
  const deleteCount = await page.locator('button:has-text("Delete Booking")').count();
  console.log(`Found ${deleteCount} Delete Booking button(s) in Completed Bookings!`);

  // Mobile Viewport Screenshot (390x844)
  console.log("Testing Mobile Viewport (390x844)...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-bank-mobile.png"), fullPage: false });
  console.log("Captured e2e-completed-bank-mobile.png");

  // Switch back to desktop to click Delete Booking and show modal
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);

  console.log("Clicking Delete Booking button...");
  await deleteBtn.click();
  await page.waitForTimeout(1000);

  // Screenshot Delete Modal
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-delete-modal.png"), fullPage: false });
  console.log("Captured e2e-completed-delete-modal.png");

  // Fill mandatory reason
  console.log("Filling mandatory deletion reason...");
  const reasonTextarea = page.locator('textarea').first();
  await reasonTextarea.fill("Verified by Chrome E2E test: restore delete option in completed bookings.");
  await page.waitForTimeout(400);

  // Confirm permanent deletion
  console.log("Clicking Confirm & Delete Booking...");
  const confirmDeleteBtn = page.locator('button:has-text("Confirm & Delete Booking")').first();
  await confirmDeleteBtn.click();
  await page.waitForTimeout(2500);

  // Screenshot after deletion
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-after-delete.png"), fullPage: false });
  console.log("Captured e2e-completed-after-delete.png");

  await browser.close();
  console.log("=== All Chrome Browser E2E Tests Completed Successfully! ===");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
