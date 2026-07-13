import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:8787/?key=stock554828";
const outDir = path.resolve("test-results", "phase1-acceptance");
await fs.mkdir(outDir, { recursive: true });

const viewports = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "mobile-390", width: 390, height: 844, isMobile: true },
  { name: "mobile-412", width: 412, height: 915, isMobile: true },
];

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

async function waitForDashboard(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#dashboard").waitFor({ state: "visible", timeout: 60000 });
  await page.locator("#noteworthyStocks").waitFor({ state: "visible", timeout: 60000 });
}

async function searchStock(page, stockNo, months = "12", expectSuccess = true) {
  await page.locator("#stockNo").fill(stockNo);
  await page.locator("#months").selectOption(months);
  await page.locator("#queryForm button[type='submit']").click();
  if (expectSuccess) {
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("資料完成"), null, { timeout: 90000 });
    await page.waitForFunction(() => document.querySelector("#aiSummary")?.textContent?.includes("資料完整度"), null, { timeout: 90000 });
  } else {
    await page.waitForFunction(() => {
      const text = document.querySelector("#status")?.textContent || "";
      return /查無|不足|失敗|錯誤/.test(text);
    }, null, { timeout: 90000 });
  }
}

async function canvasHasPixels(page, selector) {
  return page.locator(selector).evaluate((canvas) => {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    if (!ctx || width === 0 || height === 0) return false;
    const sample = ctx.getImageData(0, 0, width, height).data;
    for (let i = 3; i < sample.length; i += 4) {
      if (sample[i] !== 0) return true;
    }
    return false;
  });
}

const browser = await chromium.launch({ headless: true });

function isExpectedBrowserNoise(text) {
  return /Failed to load resource: the server responded with a status of 404/.test(text);
}

for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: Boolean(vp.isMobile),
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isExpectedBrowserNoise(msg.text())) consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await waitForDashboard(page);
  record(`${vp.name} open homepage`, true);
  const dashboardVisible = await page.locator("#dashboard h1").isVisible();
  record(`${vp.name} dashboard visible`, dashboardVisible);
  if (vp.isMobile) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    record(`${vp.name} no severe horizontal scroll`, overflow <= 12, `overflow=${overflow}`);
  }
  await page.screenshot({ path: path.join(outDir, `${vp.name}-homepage.png`), fullPage: true });
  record(`${vp.name} no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
  await context.close();
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" && !isExpectedBrowserNoise(msg.text())) errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await waitForDashboard(page);
for (const stock of ["2330", "5425", "8105"]) {
  await searchStock(page, stock, "12", true);
  record(`search ${stock}`, true);
}

for (const months of ["6", "12", "24", "36"]) {
  await searchStock(page, "2330", months, true);
  const title = await page.locator("#chartTitle").textContent();
  record(`range ${months} months`, /2330/.test(title || ""));
}

const pricePixels = await canvasHasPixels(page, "#priceChart");
const rsiPixels = await canvasHasPixels(page, "#rsiChart");
const macdPixels = await canvasHasPixels(page, "#macdChart");
record("MA/Bollinger/K chart canvas rendered", pricePixels);
record("RSI canvas rendered", rsiPixels);
record("MACD canvas rendered", macdPixels);

await page.screenshot({ path: path.join(outDir, "desktop-2330-analysis.png"), fullPage: true });

await searchStock(page, "9999", "12", false);
record("search 9999 friendly error", true, await page.locator("#status").textContent());
await page.screenshot({ path: path.join(outDir, "desktop-9999-error.png"), fullPage: true });

await page.locator("#watchStock").fill("8105");
await page.locator("#watchName").fill("凌巨");
await page.locator("#watchIndustry").fill("驗收 / 自選");
await page.locator("#watchForm button[type='submit']").click();
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("#watchList").waitFor({ state: "visible", timeout: 60000 });
const watchAdded = await page.locator("#watchList").textContent();
record("watchlist add persists after reload", /8105/.test(watchAdded || ""));
await page.locator('[data-remove="8105"]').first().click();
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("#watchList").waitFor({ state: "visible", timeout: 60000 });
const watchRemoved = await page.locator("#watchList").textContent();
record("watchlist delete persists after reload", !/驗收 \/ 自選/.test(watchRemoved || ""));

await page.locator("#alertStock").fill("2330");
await page.locator("#alertType").selectOption("price_above");
await page.locator("#alertValue").fill("1");
await page.locator("#alertForm button[type='submit']").click();
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("#alertRules").waitFor({ state: "visible", timeout: 60000 });
const alertRules = await page.locator("#alertRules").textContent();
record("alert rule persists after reload", /2330/.test(alertRules || ""));

await page.locator("#dashboardRefresh").click();
await page.locator("#quoteRefresh").click();
await page.locator("#drawToggle").click();
await page.locator("#zoomIn").click();
await page.locator("#zoomOut").click();
await page.locator("#zoomReset").click();
record("main buttons clickable", true);
record("page has no severe console errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await context.close();
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
