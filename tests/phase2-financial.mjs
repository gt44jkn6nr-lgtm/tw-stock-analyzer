import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:8787/?key=stock554828";
const outDir = path.resolve("test-results", "phase2-financial");
await fs.mkdir(outDir, { recursive: true });

const results = [];
function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" && !/404/.test(msg.text())) errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.locator("#dashboard").waitFor({ state: "visible", timeout: 60000 });

for (const stockNo of ["2330", "5425"]) {
  await page.locator("#stockNo").fill(stockNo);
  await page.locator("#queryForm button[type='submit']").click();
  await page.waitForFunction(() => document.querySelector("#financialMeta")?.textContent?.includes("模型"), null, { timeout: 90000 });
  const text = await page.locator("#financialPanel").textContent();
  record(`${stockNo} financial panel loaded`, /EPS|合理價|模型/.test(text || ""));
}

const before = await page.locator("#epsScenarios").textContent();
await page.locator("#epsGrowth").fill("10");
await page.locator("#epsGrossMargin").fill("35");
await page.locator("#epsOpexRate").fill("18");
await page.locator("#epsTaxRate").fill("20");
await page.locator("#epsPeBase").fill("20");
await page.locator("#epsForm button[type='submit']").click();
await page.waitForTimeout(1500);
const after = await page.locator("#epsScenarios").textContent();
record("EPS model recalculates after user inputs", before !== after);

await page.screenshot({ path: path.join(outDir, "desktop-financial-eps.png"), fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await mobile.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await mobile.locator("#stockNo").fill("5425");
await mobile.locator("#queryForm button[type='submit']").click();
await mobile.waitForFunction(() => document.querySelector("#financialMeta")?.textContent?.includes("模型"), null, { timeout: 90000 });
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
record("mobile financial panel has no severe horizontal scroll", overflow <= 12, `overflow=${overflow}`);
await mobile.screenshot({ path: path.join(outDir, "mobile-financial-eps.png"), fullPage: true });

record("no severe console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();

const summary = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  passed: results.filter((r) => r.passed).length,
  failed: results.filter((r) => !r.passed).length,
  results,
};
await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
if (summary.failed) process.exitCode = 1;
