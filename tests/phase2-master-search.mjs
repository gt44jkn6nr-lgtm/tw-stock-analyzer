import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const token = "stock554828";
const port = await freePort();
const base = `http://127.0.0.1:${port}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(pathname, params = {}, expectedStatus = 200) {
  const url = new URL(pathname, base);
  url.searchParams.set("key", token);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  const payload = await response.json();
  assert(response.status === expectedStatus, `${pathname} expected ${expectedStatus}, got ${response.status}: ${payload.error}`);
  return payload;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 30000) {
        clearInterval(timer);
        reject(new Error("server did not start"));
        return;
      }
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.ok) {
          clearInterval(timer);
          resolve();
        }
      } catch {
        if (child.exitCode != null) {
          clearInterval(timer);
          reject(new Error(`server exited with ${child.exitCode}`));
        }
      }
    }, 300);
  });
}

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function benchIndex(index, queries, rounds = 1000) {
  const started = performance.now();
  let hits = 0;
  for (let i = 0; i < rounds; i++) {
    const q = normalize(queries[i % queries.length]);
    const refs = new Set([...(index.exactMap[q] || []), ...(index.prefixIndex[q] || [])]);
    hits += refs.size;
  }
  return {
    rounds,
    hits,
    totalMs: performance.now() - started,
    avgMs: (performance.now() - started) / rounds,
  };
}

const server = spawn(process.execPath, ["server.mjs"], {
  cwd: rootDir,
  env: { ...process.env, PORT: String(port), ACCESS_TOKEN: token },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});

try {
  await waitForServer(server);

  const status = await api("/api/master/status");
  const counts = status.data.recordCount;
  assert(status.data.checksum && status.data.checksum.length === 64, "master checksum missing");
  assert(counts.total > 2000, "master total count too low");
  assert(counts.twse > 900, "TWSE count too low");
  assert(counts.tpex > 700, "TPEx count too low");
  assert(counts.etf > 50, "ETF count too low");
  assert(status.data.incrementalUpdate?.supported === true, "incremental update interface missing");

  const master = await api("/api/master", { limit: 5000 });
  const stocks = master.data.items;
  for (const stockNo of ["2330", "5425", "8105"]) {
    const row = stocks.find((item) => item.stockNo === stockNo);
    assert(row, `${stockNo} missing from master`);
    assert(row.companyId && row.marketSegment && Array.isArray(row.aliases), `${stockNo} master fields incomplete`);
  }

  const searchCases = [
    ["2330", "stock", "2330"],
    ["台積電", "stock", "2330"],
    ["TSMC", "stock", "2330"],
    ["5425", "stock", "5425"],
    ["台半", "stock", "5425"],
    ["8105", "stock", "8105"],
    ["MOSFET", "product", null],
    ["GB300", "topic", null],
    ["DDR5", "product", null],
    ["TrendForce", "company", null],
    ["AI Server", "topic", null],
  ];
  for (const [query, expectedType, expectedStock] of searchCases) {
    const result = await api("/api/search", { q: query });
    assert(result.data.metadata.searchTimeMs >= 0, `${query} missing searchTimeMs`);
    const first = result.data.results[0];
    assert(first, `${query} returned no results`);
    assert(first.type === expectedType || result.data.results.some((item) => item.type === expectedType), `${query} expected ${expectedType}`);
    if (expectedStock) assert(result.data.results.some((item) => item.stockNo === expectedStock), `${query} expected stock ${expectedStock}`);
  }

  const none = await api("/api/search", { q: "9999" });
  assert(!none.data.results.some((item) => item.stockNo === "9999"), "9999 should not produce fake stock");
  await api("/api/financial", { stockNo: "9999" }, 404);
  await api("/api/timeline", { stockNo: "9999" }, 404);

  const suggestions233 = await api("/api/search/suggestions", { q: "233" });
  assert(suggestions233.data.results.length <= 10, "suggestions must cap at 10");
  assert(suggestions233.data.results.some((item) => item.stockNo === "2330"), "233 prefix should include 2330");
  const suggestionsTai = await api("/api/search/suggestions", { q: "台" });
  assert(suggestionsTai.data.results.length <= 10, "mobile suggestions must cap at 10");
  assert(suggestionsTai.data.results.some((item) => item.name?.includes("台") || item.companyName?.includes("台")), "台 prefix suggestions missing");

  const index = JSON.parse(await fs.readFile(path.join(rootDir, "data", "search-index.json"), "utf8"));
  assert(index.trieIndex && index.exactMap && index.prefixIndex && index.fuzzyIndex, "index maps missing");
  const bench = benchIndex(index, ["2330", "台", "MOSFET", "GB300", "DDR5", "TSMC"], 1000);
  assert(bench.avgMs < 1, `1000 search benchmark too slow: ${bench.avgMs}ms`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", (msg) => {
    if (["error"].includes(msg.type())) console.log(`browser console ${msg.type()}: ${msg.text()}`);
  });
  await page.goto(`${base}/?key=${token}`, { waitUntil: "domcontentloaded" });
  await page.fill("#globalSearch", "MOS");
  await page.waitForSelector("#globalSearchSuggestions:not([hidden])");
  const suggestionCount = await page.locator(".search-suggestion").count();
  assert(suggestionCount <= 10, "UI suggestion count exceeds 10");
  await page.click("#globalSearchButton");
  await page.waitForSelector("#globalSearchResults:not([hidden])");
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
  assert(overflow === 0, `mobile horizontal overflow ${overflow}`);
  await browser.close();

  console.log(
    JSON.stringify(
      {
        ok: true,
        counts,
        checksum: status.data.checksum,
        indexBytes: Buffer.byteLength(JSON.stringify(index)),
        benchmark: { rounds: bench.rounds, avgMs: Number(bench.avgMs.toFixed(4)), hits: bench.hits },
      },
      null,
      2,
    ),
  );
} finally {
  server.kill();
  if (/Unhandled|TypeError|ReferenceError|SyntaxError/i.test(serverLog)) {
    console.error(serverLog);
  }
}
