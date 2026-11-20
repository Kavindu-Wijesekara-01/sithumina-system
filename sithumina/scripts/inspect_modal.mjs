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
    await page.waitForTimeout(2000);
  }

  await page.locator('aside button:has-text("All Bookings")').click();
  await page.waitForTimeout(1000);
  await page.locator('button:has-text("Pending Payment")').click();
  await page.waitForTimeout(1000);

  const settleBtn = page.locator('button:has-text("Settle Payment Now →")').first();
  console.log("Settle button visible?", await settleBtn.isVisible());
  if (await settleBtn.isVisible()) {
    await settleBtn.click();
    await page.waitForTimeout(1000);
    const modalText = await page.locator(".fixed.inset-0.z-50").innerText();
    console.log("Modal text inside open modal:\n", modalText);
    const buttonsInModal = await page.locator(".fixed.inset-0.z-50 button").allInnerTexts();
    console.log("Buttons inside open modal:", buttonsInModal);
  }

  await browser.close();
}

run();
