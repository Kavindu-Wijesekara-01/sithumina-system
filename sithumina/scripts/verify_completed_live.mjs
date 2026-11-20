import { chromium } from "playwright-core";
import path from "path";

const ARTIFACT_DIR = "C:/Users/LENOVO/.gemini/antigravity/brain/ba117b01-86d4-401c-9160-aaae5b965c0d";
const CHROME_PATH = "C:/Users/LENOVO/AppData/Local/Google/Chrome/Application/chrome.exe";

async function run() {
  console.log("=== Testing Completed Bookings View in Chrome ===");
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/admin", { waitUntil: "networkidle" });
  const pin = page.locator('input[type="password"]');
  if (await pin.isVisible({ timeout: 2000 }).catch(() => false)) {
    await pin.fill("ST@2024");
    await page.locator('button:has-text("Sign In to Command Center")').click();
    await page.waitForTimeout(2000);
  }

  // Go to All Bookings
  const allBookings = page.locator('aside button:has-text("All Bookings")').first();
  await allBookings.click();
  await page.waitForTimeout(1000);

  // Click Completed Bookings tab
  console.log("Clicking Completed Bookings tab...");
  const completedTab = page.locator('button:has-text("Completed Bookings")').first();
  await completedTab.click();
  await page.waitForTimeout(1000);

  // Click the card header or Details ▾ button for the completed card
  const detailsBtn = page.locator('button:has-text("Details ▾")').first();
  console.log("Card Details ▾ button visible?", await detailsBtn.isVisible());
  if (await detailsBtn.isVisible()) {
    await detailsBtn.click();
    await page.waitForTimeout(1000);
  }

  // Print expanded card text
  const mainText = await page.innerText('main');
  console.log("Expanded Card Text Snippet:\n", mainText.substring(0, 1500));

  // Take Desktop Screenshot
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-bank-and-delete-desktop.png"), fullPage: false });
  console.log("Captured e2e-completed-bank-and-delete-desktop.png");

  // Check Delete Booking button
  const deleteBtn = page.locator('button:has-text("Delete Booking")').first();
  const deleteBtnVisible = await deleteBtn.isVisible();
  console.log("Delete Booking button visible in completed card?", deleteBtnVisible);

  if (deleteBtnVisible) {
    console.log("Clicking Delete Booking button...");
    await deleteBtn.click();
    await page.waitForTimeout(800);

    // Capture modal screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-delete-modal.png"), fullPage: false });
    console.log("Captured e2e-completed-delete-modal.png");

    // Close modal with Cancel
    const cancelBtn = page.locator('button:has-text("Cancel")').last();
    await cancelBtn.click();
    await page.waitForTimeout(500);
  }

  // Mobile screenshot - scroll to payment breakdown and delete button
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  const deleteBtnMobile = page.locator('button:has-text("Delete Booking")').first();
  if (await deleteBtnMobile.isVisible()) {
    await deleteBtnMobile.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-bank-mobile.png"), fullPage: false });
  console.log("Captured e2e-completed-bank-mobile.png");

  await browser.close();
  console.log("=== Verification Finished Successfully! ===");
}

run().catch(console.error);
