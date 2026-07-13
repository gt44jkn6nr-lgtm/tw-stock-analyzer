import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:8787/?key=stock554828";
const outDir = path.resolve("test-results", "phase2-news-timeline");
await fs.mkdir(outDir, { recursive: true });

const results = [];
function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

async function api(pathName) {
  const url = new URL(pathName, baseUrl);
  const res = await fetch(url);
  const json = await res.json();
  return { status: res.status, json };
}

for (const stockNo of ["2330", "5425", "8105", "1591"]) {
  const { status, json } = await api(`/api/timeline?stockNo=${stockNo}&types=all&key=stock554828`);
  const item = json.data?.items?.[0];
  record(`${stockNo} timeline API`, status === 200 && json.success === true && Array.isArray(json.data?.sourceStatus), `status=${status}, items=${json.data?.items?.length ?? 0}`);
  record(`${stockNo} event date fields exist`, !item || ("eventDate" in item && "announcedAt" in item && "publishedAt" in item && "fetchedAt" in item), item?.id || "no item");
  record(`${stockNo} source/model summaries separated`, !item || ("sourceSummary" in item && "normalizedSummary" in item && "modelInterpretation" in item), item?.title || "no item");
}

const missing = await api("/api/timeline?stockNo=9999&key=stock554828");
record("9999 timeline returns 404", missing.status === 404 && missing.json.success === false, `status=${missing.status}`);

const badRange = await api("/api/timeline?stockNo=2330&from=2026-01-02&to=2026-01-01&key=stock554828");
record("from later than to returns 400", badRange.status === 400 && badRange.json.success === false, `status=${badRange.status}`);

const tooLong = await api("/api/timeline?stockNo=2330&from=2020-01-01&to=2026-01-01&key=stock554828");
record("range over 3 years returns 400", tooLong.status === 400 && tooLong.json.success === false, `status=${tooLong.status}`);

const badType = await api("/api/timeline?stockNo=2330&types=<script>&key=stock554828");
record("non-whitelist type returns 400", badType.status === 400 && badType.json.success === false, `status=${badType.status}`);

const duplicate = await api("/api/timeline?stockNo=2330&fixture=duplicate&key=stock554828");
const ids = duplicate.json.data?.items?.map((item) => item.id) || [];
record("duplicate event is shown once", ids.length === new Set(ids).size, `items=${ids.length}`);

const related = await api("/api/timeline?stockNo=2330&fixture=related&key=stock554828");
record("same event from news becomes relatedSources", related.json.data?.items?.some((item) => item.relatedSources?.length), `items=${related.json.data?.items?.length ?? 0}`);

const negation = await api("/api/timeline?stockNo=2330&fixture=negation&key=stock554828");
record("negation is not classified positive", negation.json.data?.items?.[0]?.sentiment !== "positive", negation.json.data?.items?.[0]?.sentiment || "");

const mixed = await api("/api/timeline?stockNo=2330&fixture=mixed&key=stock554828");
record("positive and negative signals classify mixed", mixed.json.data?.items?.[0]?.sentiment === "mixed", mixed.json.data?.items?.[0]?.sentiment || "");

await api("/api/timeline?stockNo=2330&types=material&key=stock554828");
const stale = await api("/api/timeline?stockNo=2330&types=material&fixture=timeout&key=stock554828");
record("official timeout can show stale cache", stale.status === 200 && stale.json.data?.sourceStatus?.some((item) => item.stale || item.fromCache), `status=${stale.status}`);

const noCache = await api("/api/timeline?stockNo=5425&types=material&fixture=timeout&key=stock554828");
record("source timeout without cache does not fake ranking", noCache.status === 200 && Array.isArray(noCache.json.data?.items), `items=${noCache.json.data?.items?.length ?? 0}`);

const financial = await api("/api/timeline?stockNo=2330&types=financial&key=stock554828");
record("financial same quarter appears as one event", (financial.json.data?.items || []).filter((item) => item.eventType === "financial").length <= 1, `items=${financial.json.data?.items?.length ?? 0}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" && !/404/.test(msg.text())) errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.locator("#stockNo").fill("2330");
await page.locator("#queryForm button[type='submit']").click();
await page.locator("#timelinePanel").waitFor({ state: "visible", timeout: 60000 });
await page.waitForFunction(() => !document.querySelector("#timelineMeta")?.textContent?.includes("正在讀取"), null, { timeout: 90000 });
record("desktop timeline visible", await page.locator("#timelinePanel").isVisible());
await page.locator('[data-timeline-type="revenue"]').click();
await page.waitForTimeout(1000);
record("timeline filter button works", /營收|revenue|目前沒有/.test((await page.locator("#timelinePanel").textContent()) || ""));
await page.screenshot({ path: path.join(outDir, "desktop-timeline.png"), fullPage: true });

const htmlText = await page.locator("#timelinePanel").textContent();
record("timeline escapes special characters", !/<script/i.test(htmlText || ""));

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await mobile.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await mobile.locator("#stockNo").fill("5425");
await mobile.locator("#queryForm button[type='submit']").click();
await mobile.locator("#timelinePanel").waitFor({ state: "visible", timeout: 60000 });
await mobile.waitForTimeout(3000);
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
record("mobile timeline has no severe horizontal overflow", overflow <= 12, `overflow=${overflow}`);
await mobile.screenshot({ path: path.join(outDir, "mobile-timeline.png"), fullPage: true });

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
