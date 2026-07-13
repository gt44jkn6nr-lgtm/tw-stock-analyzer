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

async function api(path) {
  const url = new URL(path, baseUrl);
  const res = await fetch(url);
  const json = await res.json();
  return { status: res.status, json };
}

const apiChecks = [
  ["/api/financial?stockNo=2330&key=stock554828", "2330 base financial API"],
  ["/api/financial?stockNo=5425&key=stock554828", "5425 TPEx financial API"],
  ["/api/financial?stockNo=8105&key=stock554828", "8105 financial API"],
  ["/api/financial?stockNo=1591&key=stock554828", "1591 missing valuation candidate API"],
];

for (const [pathName, label] of apiChecks) {
  const { status, json } = await api(pathName);
  record(label, status === 200 && json.success === true && json.data?.model?.annual_eps_method, `status=${status}`);
}

const missing = await api("/api/financial?stockNo=9999&key=stock554828");
record("nonexistent stock returns non-200", missing.status === 404 && missing.json.success === false, `status=${missing.status}`);

const negative = await api("/api/financial?stockNo=5425&q2GrossMargin=0.05&q2OperatingExpenseRate=0.5&q3GrossMargin=0.05&q3OperatingExpenseRate=0.5&q4GrossMargin=0.05&q4OperatingExpenseRate=0.5&basePe=20&key=stock554828");
record("negative EPS disables PE fair price", negative.json.data?.model?.scenarios?.base?.fairPrice === null && /不適用/.test(negative.json.data?.model?.scenarios?.base?.fairPriceLabel || ""), negative.json.data?.model?.scenarios?.base?.fairPriceLabel || "");

const badPe = await api("/api/financial?stockNo=5425&basePe=0&key=stock554828");
record("PE zero disables fair price", badPe.json.data?.model?.scenarios?.base?.fairPrice === null && /PE 不適用/.test(badPe.json.data?.model?.scenarios?.base?.fairPriceLabel || ""), badPe.json.data?.model?.scenarios?.base?.fairPriceLabel || "");

const badShares = await api("/api/financial?stockNo=5425&sharesOutstanding=0&key=stock554828");
record("zero shares disables estimate", badShares.json.data?.model?.canEstimate === false, `canEstimate=${badShares.json.data?.model?.canEstimate}`);

const extremeGrowth = await api("/api/financial?stockNo=5425&q2RevenueGrowth=5&q3RevenueGrowth=-5&q4RevenueGrowth=1&key=stock554828");
record("extreme growth is clamped and handled", extremeGrowth.status === 200 && extremeGrowth.json.success === true, `status=${extremeGrowth.status}`);

for (const fixture of ["timeout", "empty", "format"]) {
  const result = await api(`/api/financial?stockNo=5425&fixture=${fixture}&key=stock554828`);
  const expected = fixture === "timeout" ? 504 : fixture === "empty" ? 404 : 502;
  record(`official API ${fixture} fixture`, result.status === expected && result.json.success === false, `status=${result.status}`);
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
await page.locator("#q2RevenueGrowth").fill("5");
await page.locator("#q3RevenueGrowth").fill("10");
await page.locator("#q4RevenueGrowth").fill("15");
await page.locator("#epsPeBase").fill("20");
await page.locator("#epsForm button[type='submit']").click();
await page.waitForTimeout(1500);
const after = await page.locator("#epsScenarios").textContent();
record("EPS model recalculates after user inputs", before !== after);

await page.screenshot({ path: path.join(outDir, "desktop-financial-eps.png"), fullPage: true });

await page.locator("#q2GrossMargin").fill("5");
await page.locator("#q2OpexRate").fill("50");
await page.locator("#q3GrossMargin").fill("5");
await page.locator("#q3OpexRate").fill("50");
await page.locator("#q4GrossMargin").fill("5");
await page.locator("#q4OpexRate").fill("50");
await page.locator("#epsForm button[type='submit']").click();
await page.waitForFunction(() => document.querySelector("#epsScenarios")?.textContent?.includes("本益比法不適用"), null, { timeout: 90000 });
await page.screenshot({ path: path.join(outDir, "desktop-negative-eps.png"), fullPage: true });
record("negative EPS screen shows PE not applicable", true);

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
