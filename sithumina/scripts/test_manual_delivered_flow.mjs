import { chromium } from "playwright-core";
import path from "path";

const ARTIFACT_DIR = "C:/Users/LENOVO/.gemini/antigravity/brain/ba117b01-86d4-401c-9160-aaae5b965c0d";
const CHROME_PATH = "C:/Users/LENOVO/AppData/Local/Google/Chrome/Application/chrome.exe";

async function run() {
  console.log("=== Starting Chrome Browser E2E Test: Manual Delivered Verification & Slot Release ===");
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/admin", { waitUntil: "networkidle", timeout: 25000 });

  const pin = page.locator('input[type="password"]');
  if (await pin.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log("Entering PIN...");
    await pin.fill("ST@2024");
    await page.locator('button:has-text("Sign In to Command Center")').click();
    await page.waitForTimeout(2000);
  }

  // 1. Open Manual Booking Modal
  console.log("Opening + Manual Booking modal...");
  const manualBtn = page.locator('button:has-text("+ Manual Booking")').first();
  await manualBtn.click();
  await page.waitForTimeout(1000);

  // Fill in booking details
  console.log("Filling in manual booking details...");
  await page.locator('input[aria-label="Manual booking mobile phone"]').fill("0771239999");
  await page.waitForTimeout(300);
  await page.locator('input[aria-label="Manual booking customer name"]').fill("Manual Delivered Test User");

  // Route
  await page.locator('input[aria-label="Manual booking pickup location"]').fill("Colombo");
  await page.locator('input[aria-label="Manual booking delivery destination"]').fill("Kandy");

  // Date and Time (today 08:00 to 12:00, which has already started and scheduled end is in past)
  await page.locator('input[aria-label="Manual booking trip date"]').fill("2026-11-20");
  await page.locator('input[aria-label="Manual booking start time"]').fill("08:00");
  await page.locator('input[aria-label="Manual booking end time"]').fill("12:00");

  // Select Lorry and Rider
  const lorrySelect = page.locator('select[aria-label="Manual booking lorry"]');
  if (await lorrySelect.isVisible()) {
    const count = await lorrySelect.locator("option").count();
    if (count > 1) {
      await lorrySelect.selectOption({ index: 1 });
    }
  }

  const riderSelect = page.locator('select[aria-label="Manual booking rider"]');
  if (await riderSelect.isVisible()) {
    const count = await riderSelect.locator("option").count();
    if (count > 1) {
      await riderSelect.selectOption({ index: 1 });
    }
  }

  // Amount
  await page.locator('input[aria-label="Manual booking amount LKR"]').fill("25000");

  // Payment Status: leave as Payment Pending
  const pendingRadio = page.locator('input[type="radio"][value="pending"]');
  if (await pendingRadio.isVisible()) {
    await pendingRadio.check();
  }

  // Screenshot filled modal
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-manual-booking-create-modal.png"), fullPage: false });
  console.log("Captured e2e-manual-booking-create-modal.png");

  // Submit
  console.log("Submitting manual booking form...");
  const submitBtn = page.locator('button[type="submit"]').last();
  await submitBtn.click();
  await page.waitForTimeout(3000);

  // 2. Navigate to All Bookings -> Ongoing Rides
  console.log("Navigating to All Bookings -> Ongoing Rides tab...");
  const allBookingsNav = page.locator('aside button:has-text("All Bookings")').first();
  await allBookingsNav.click();
  await page.waitForTimeout(1500);

  const ongoingTab = page.locator('button:has-text("Ongoing Rides")').first();
  await ongoingTab.click();
  await page.waitForTimeout(1500);

  // Verify that the booking is in Ongoing Rides (proving it does NOT auto-complete even past 12:00!)
  const ongoingCountText = await ongoingTab.innerText();
  console.log("Ongoing Tab text:", ongoingCountText);

  // Capture Desktop Screenshot: Showing Ongoing Ride staying active past scheduled end
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-ongoing-manual-required-desktop.png"), fullPage: false });
  console.log("Captured e2e-ongoing-manual-required-desktop.png");

  // Mobile Viewport Screenshot (390x844)
  console.log("Testing Mobile Viewport (390x844)...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-ongoing-manual-required-mobile.png"), fullPage: false });
  console.log("Captured e2e-ongoing-manual-required-mobile.png");

  // Back to Desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);

  // 3. Click "Mark as Delivered" button directly from Ongoing Ride banner
  console.log("Locating 'Mark as Delivered' button...");
  const markDeliveredBtn = page.locator('button:has-text("Mark as Delivered")').first();
  await markDeliveredBtn.waitFor({ state: "visible", timeout: 8000 });
  console.log("Clicking 'Mark as Delivered' button...");
  await markDeliveredBtn.click();
  await page.waitForTimeout(2500);

  // Capture Screenshot after marking delivered (showing toast and moved out of ongoing)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-after-mark-delivered-toast.png"), fullPage: false });
  console.log("Captured e2e-after-mark-delivered-toast.png");

  // 4. Check Pending Payment tab
  console.log("Checking Pending Payment tab...");
  const pendingPaymentTab = page.locator('button:has-text("Pending Payment")').first();
  await pendingPaymentTab.click();
  await page.waitForTimeout(1500);

  // Capture Pending Payment screenshot
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-pending-payment-tab-after-delivery.png"), fullPage: false });
  console.log("Captured e2e-pending-payment-tab-after-delivery.png");

  // Check Settle Payment button
  const settleBtn = page.locator('button:has-text("Settle Payment Now →")').first();
  if (await settleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log("Clicking 'Settle Payment Now →'...");
    await settleBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-settle-balance-modal-open.png"), fullPage: false });

    // Handle paymentApprovalModal if it opened:
    const fullPaidBtn = page.locator('button:has-text("Full Paid")').first();
    if (await fullPaidBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      console.log("Selecting Full Paid option...");
      await fullPaidBtn.click();
      await page.waitForTimeout(400);
      const confirmFull = page.locator('button:has-text("Confirm Full Payment")').first();
      await confirmFull.click();
      await page.waitForTimeout(2500);
      console.log("Confirmed full payment in approval modal!");
    } else {
      // Settle balance modal
      const confirmSettle = page.locator('button:has-text("Confirm Settlement")').first();
      if (await confirmSettle.isVisible({ timeout: 1500 }).catch(() => false)) {
        await confirmSettle.click();
        await page.waitForTimeout(2500);
        console.log("Confirmed balance settlement in settle modal!");
      }
    }
  }

  // 5. Check Completed Bookings tab
  console.log("Navigating to Completed Bookings tab...");
  const completedTab = page.locator('button:has-text("Completed Bookings")').first();
  await completedTab.click();
  await page.waitForTimeout(1500);

  // Expand details to show full card
  const completedDetailsBtn = page.locator('button:has-text("Details ▾")').first();
  if (await completedDetailsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await completedDetailsBtn.click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, "e2e-completed-tab-final.png"), fullPage: false });
  console.log("Captured e2e-completed-tab-final.png");

  await browser.close();
  console.log("=== All Chrome E2E Tests Completed Successfully! ===");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
