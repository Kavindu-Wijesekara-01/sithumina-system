import { chromium } from "playwright-core";

const CHROME_PATH = "C:/Users/LENOVO/AppData/Local/Google/Chrome/Application/chrome.exe";

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.goto("http://localhost:3000/admin", { waitUntil: "networkidle" });

  const pin = page.locator('input[type="password"]');
  if (await pin.isVisible().catch(() => false)) {
    await pin.fill("ST@2024");
    await page.locator('button:has-text("Sign In to Command Center")').click();
    await page.waitForTimeout(3000);
  }

  // Check what bookings are displayed on Overview
  const cardHeaders = await page.locator('div:has-text("ST-BK-")').allInnerTexts();
  console.log("Card texts with ST-BK-:", cardHeaders.slice(0, 5));

  // Check sidebar counters
  const sidebarButtons = await page.locator("aside button").allInnerTexts();
  console.log("Sidebar buttons:\n", sidebarButtons.join(" | "));

  // Navigate to All Bookings
  await page.locator('aside button:has-text("All Bookings")').click();
  await page.waitForTimeout(2000);

  // Tab text in All Bookings
  const tabTexts = await page.locator('button:has-text("Ongoing Rides"), button:has-text("Pending Payment"), button:has-text("Completed Bookings")').allInnerTexts();
  console.log("Tab texts in All Bookings:", tabTexts);

  await browser.close();
}

run();
