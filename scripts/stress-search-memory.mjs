const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8787/?key=stock554828";
const rounds = Number(process.env.SEARCH_STRESS_ROUNDS || 10000);
const queries = ["2330", "台積電", "TSMC", "5425", "台半", "MOS", "MOSFET", "GB300", "DDR5", "TrendForce", "AI Server", "ETF 0050"];

function apiUrl(path, params = {}) {
  const url = new URL(path, baseUrl);
  const key = new URL(baseUrl).searchParams.get("key");
  if (key) url.searchParams.set("key", key);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url;
}

async function timedFetch(path, params) {
  const startedAt = performance.now();
  const response = await fetch(apiUrl(path, params));
  const payload = await response.json();
  return { status: response.status, ok: response.ok && payload.success !== false, ms: performance.now() - startedAt, payload };
}

const startMemory = process.memoryUsage();
const serverBefore = await timedFetch("/api/master/status", {});
const startedAt = performance.now();
let ok = 0;
let failed = 0;
let totalMs = 0;
let cacheHits = 0;

for (let i = 0; i < rounds; i++) {
  const query = queries[i % queries.length];
  const result = await timedFetch("/api/search/suggestions", { q: query });
  totalMs += result.ms;
  if (result.ok) ok += 1;
  else failed += 1;
  if (result.payload?.data?.metadata?.cacheHit) cacheHits += 1;
}

if (global.gc) {
  global.gc();
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const endMemory = process.memoryUsage();
const serverAfter = await timedFetch("/api/master/status", {});
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: new URL(baseUrl).origin,
  rounds,
  ok,
  failed,
  totalMs: Number(totalMs.toFixed(3)),
  avgMs: Number((totalMs / rounds).toFixed(4)),
  elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
  cacheHitRate: Number((cacheHits / rounds).toFixed(4)),
  memory: {
    start: startMemory,
    end: endMemory,
    rssDeltaBytes: endMemory.rss - startMemory.rss,
    heapUsedDeltaBytes: endMemory.heapUsed - startMemory.heapUsed,
    gcAvailable: Boolean(global.gc),
  },
  serverMemory: {
    start: serverBefore.payload?.data?.serverRuntime?.memoryUsage || null,
    end: serverAfter.payload?.data?.serverRuntime?.memoryUsage || null,
    rssDeltaBytes:
      serverAfter.payload?.data?.serverRuntime?.memoryUsage && serverBefore.payload?.data?.serverRuntime?.memoryUsage
        ? serverAfter.payload.data.serverRuntime.memoryUsage.rss - serverBefore.payload.data.serverRuntime.memoryUsage.rss
        : null,
    heapUsedDeltaBytes:
      serverAfter.payload?.data?.serverRuntime?.memoryUsage && serverBefore.payload?.data?.serverRuntime?.memoryUsage
        ? serverAfter.payload.data.serverRuntime.memoryUsage.heapUsed - serverBefore.payload.data.serverRuntime.memoryUsage.heapUsed
        : null,
    rateLimitMax: serverAfter.payload?.data?.serverRuntime?.rateLimitMax || null,
  },
  passed: failed === 0,
};

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
