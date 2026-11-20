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
  if (await pin.isVisible({ timeout: 2000 }).catch(() => false)) {
    await pin.fill("ST@2024");
    await page.locator('button:has-text("Sign In to Command Center")').click();
    await page.waitForTimeout(2000);
  }

  const allBookings = page.locator('aside button:has-text("All Bookings")').first();
  await allBookings.click();
  await page.waitForTimeout(1500);

  // Print all tab texts
  const tabs = await page.locator('main button').allInnerTexts();
  console.log("Main buttons:", tabs.filter(t => t.includes("Ongoing") || t.includes("Pending") || t.includes("Completed")));

  const bodyText = await page.innerText('main');
  console.log("Body text contains ST-BK-2678?", bodyText.includes("ST-BK-2678"));

  // Check overview text
  const overviewNav = page.locator('aside button:has-text("Overview")').first();
  await overviewNav.click();
  await page.waitForTimeout(1000);
  const overviewText = await page.innerText('main');
  console.log("Overview text contains ST-BK-2678?", overviewText.includes("ST-BK-2678"));

  await browser.close();
}

run().catch(console.error);
