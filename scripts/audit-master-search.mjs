import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const reportDir = path.join(rootDir, "docs", "reports", "phase2-master-data-search");

function nowIso() {
  return new Date().toISOString();
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
}

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function bytes(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value));
}

function formatBytes(value) {
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value > 1024) return `${(value / 1024).toFixed(2)} KB`;
  return `${value} B`;
}

function duplicateValues(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(key, [...(map.get(key) || []), item]);
  }
  return [...map.entries()].filter(([, rows]) => rows.length > 1);
}

function dataQualityReport(stocks) {
  const twse = stocks.filter((item) => item.market === "TWSE" && !item.isETF);
  const tpex = stocks.filter((item) => item.market === "TPEx" && !item.isETF);
  const etfs = stocks.filter((item) => item.isETF);
  const sample = [...twse.slice(0, 50), ...tpex.slice(0, 50), ...etfs];
  const duplicateStockNo = duplicateValues(stocks.filter((item) => !item.isETF), (item) => item.stockNo).map(([stockNo, rows]) => ({
    stockNo,
    companyIds: rows.map((item) => item.companyId),
  }));
  const duplicateCompanyId = duplicateValues(stocks, (item) => item.companyId).map(([companyId, rows]) => ({ companyId, count: rows.length }));
  const duplicateCompanyName = duplicateValues(stocks.filter((item) => !item.isETF), (item) => normalize(item.companyName)).map(([companyName, rows]) => ({
    companyName,
    companyIds: rows.map((item) => item.companyId),
  }));
  const aliasIssues = [];
  for (const item of sample) {
    const aliases = item.aliases || [];
    const duplicated = duplicateValues(aliases, (alias) => normalize(alias.alias)).map(([alias, rows]) => ({ alias, count: rows.length }));
    if (duplicated.length) aliasIssues.push({ companyId: item.companyId, stockNo: item.stockNo, duplicated });
  }
  const marketIssues = sample
    .filter((item) => {
      if (item.isETF) return item.marketSegment !== "ETF" || item.industry !== "ETF";
      if (item.market === "TWSE") return item.marketSegment !== "上市";
      if (item.market === "TPEx") return item.marketSegment !== "上櫃";
      return true;
    })
    .map((item) => ({ companyId: item.companyId, stockNo: item.stockNo, market: item.market, marketSegment: item.marketSegment, isETF: item.isETF }));
  const etfIssues = etfs
    .filter((item) => item.isETF !== true || item.marketSegment !== "ETF" || item.industry !== "ETF")
    .map((item) => ({ companyId: item.companyId, stockNo: item.stockNo, marketSegment: item.marketSegment, industry: item.industry, isETF: item.isETF }));
  const requiredFieldIssues = sample
    .filter((item) => !item.companyId || !item.stockNo || !item.companyName || !item.shortName || !item.market || !item.marketSegment || !Array.isArray(item.aliases))
    .map((item) => item.companyId || item.stockNo);

  const checks = [
    { name: "50 TWSE sample available", passed: twse.length >= 50, detail: `${twse.length} TWSE records` },
    { name: "50 TPEx sample available", passed: tpex.length >= 50, detail: `${tpex.length} TPEx records` },
    { name: "all ETF sampled", passed: etfs.length > 0 && sample.filter((item) => item.isETF).length === etfs.length, detail: `${etfs.length} ETF records` },
    { name: "non-ETF stockNo unique", passed: duplicateStockNo.length === 0, detail: `${duplicateStockNo.length} duplicates` },
    { name: "companyId unique", passed: duplicateCompanyId.length === 0, detail: `${duplicateCompanyId.length} duplicates` },
    { name: "alias unique within sampled records", passed: aliasIssues.length === 0, detail: `${aliasIssues.length} sampled records with duplicate aliases` },
    { name: "same company not duplicated", passed: duplicateCompanyName.length === 0, detail: `${duplicateCompanyName.length} duplicate company names` },
    { name: "market classification correct in sample", passed: marketIssues.length === 0, detail: `${marketIssues.length} issues` },
    { name: "ETF not identified as common stock", passed: etfIssues.length === 0, detail: `${etfIssues.length} issues` },
    { name: "required fields present", passed: requiredFieldIssues.length === 0, detail: `${requiredFieldIssues.length} sampled issues` },
  ];
  return {
    generatedAt: nowIso(),
    scope: { twseSample: 50, tpexSample: 50, etfSample: etfs.length },
    counts: { twse: twse.length, tpex: tpex.length, etf: etfs.length, sampled: sample.length },
    checks,
    issues: { duplicateStockNo, duplicateCompanyId, duplicateCompanyName, aliasIssues, marketIssues, etfIssues, requiredFieldIssues },
    passed: checks.every((item) => item.passed),
  };
}

function refsForGrams(index, q) {
  const compact = q.replace(/\s+/g, "");
  const grams = new Set();
  if (compact.length <= 2) grams.add(compact);
  for (let i = 0; i < compact.length - 1; i++) grams.add(compact.slice(i, i + 2));
  for (let i = 0; i < compact.length - 2; i++) grams.add(compact.slice(i, i + 3));
  const counts = new Map();
  for (const gram of grams) {
    for (const ref of index.fuzzyIndex?.[gram] || []) counts.set(ref, (counts.get(ref) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= Math.max(1, Math.min(2, grams.size)))
    .sort((a, b) => b[1] - a[1])
    .map(([ref]) => ref);
}

function matchBasis(doc, q) {
  if (doc.stockNo && normalize(doc.stockNo) === q) return "stockNo_exact";
  if (doc.name && normalize(doc.name) === q) return "name_exact";
  if (doc.companyName && normalize(doc.companyName) === q) return "company_exact";
  if (doc.englishName && normalize(doc.englishName) === q) return "english_exact";
  if ((doc.aliases || []).some((item) => normalize(item.alias || item) === q)) return "alias_exact";
  return "index_match";
}

function scoreDoc(doc, q, matchType) {
  const exactStockNo = doc.stockNo && normalize(doc.stockNo) === q;
  const exactName = doc.name && normalize(doc.name) === q;
  const containedStockNo = doc.stockNo && q.includes(normalize(doc.stockNo));
  const containedName = doc.name && q.includes(normalize(doc.name));
  const containedAlias = (doc.aliases || []).some((item) => {
    const alias = normalize(item.alias || item);
    return alias.length >= 3 && q.includes(alias);
  });
  const exactAlias = (doc.aliases || []).some((item) => normalize(item.alias || item) === q);
  const trustedManualAlias = (doc.aliases || []).some((item) => normalize(item.alias || item) === q && item.source === "manual_alias" && Number(item.confidence || 0) >= 0.95);
  const exactEnglish = doc.englishName && normalize(doc.englishName) === q;
  let score = 0;
  if (exactStockNo) score += 1000;
  else if (containedStockNo) score += 990;
  else if (trustedManualAlias) score += 940;
  else if (exactName) score += 920;
  else if ((doc.type === "product" || doc.type === "topic" || doc.type === "company") && (containedName || containedAlias)) score += 900;
  else if (exactAlias) score += 860;
  else if (exactEnglish) score += 780;
  else if (doc.type === "etf") score += 700;
  else if (doc.type === "product") score += 640;
  else if (doc.type === "topic") score += 620;
  else if (doc.type === "industry") score += 540;
  else if (matchType === "prefix") score += 430;
  else if (matchType === "fuzzy") score += 250;
  else score += 300;
  score += Number(doc.searchWeight || 0);
  score += Number(doc.popularityWeight || 0) * 0.15;
  return score;
}

function searchIndex(index, query, limit = 20) {
  const q = normalize(query);
  const candidates = new Map();
  const add = (refs, type) => {
    for (const ref of refs || []) {
      const doc = index.documents[ref];
      if (!doc) continue;
      const score = scoreDoc(doc, q, type);
      const current = candidates.get(ref);
      if (!current || score > current.score) candidates.set(ref, { ...doc, matchType: type, matchBasis: matchBasis(doc, q), score });
    }
  };
  add(index.exactMap?.[q] || [], "exact");
  add(index.prefixIndex?.[q] || [], "prefix");
  add(refsForGrams(index, q), "fuzzy");
  return [...candidates.values()].sort((a, b) => b.score - a.score || String(a.stockNo || a.name).localeCompare(String(b.stockNo || b.name))).slice(0, limit);
}

function buildSearchCases(stocks, products, topics, companies) {
  const curated = [
    { query: "TSMC", expectedId: "TWSE-2330", rule: "rank1" },
    { query: "台積電", expectedId: "TWSE-2330", rule: "rank1" },
    { query: "2330", expectedId: "TWSE-2330", rule: "rank1" },
    { query: "聯發", expectedId: "TWSE-2454", rule: "rank1" },
    { query: "MTK", expectedId: "TWSE-2454", rule: "rank1" },
    { query: "MOS", expectedId: "product-mosfet", rule: "rank1" },
    { query: "MOSFET", expectedId: "product-mosfet", rule: "top3" },
    { query: "台", expectedId: "TWSE-2330", rule: "top10" },
    { query: "5425", expectedId: "TPEx-5425", rule: "rank1" },
    { query: "台半", expectedId: "TPEx-5425", rule: "rank1" },
    { query: "8105", expectedId: "TWSE-8105", rule: "rank1" },
    { query: "GB300", expectedId: "topic-gb300", rule: "top3" },
    { query: "DDR5", expectedId: "product-ddr5", rule: "top3" },
    { query: "TrendForce", expectedId: "INFO-TRENDFORCE", rule: "rank1" },
    { query: "AI Server", expectedId: "topic-ai-server", rule: "rank1" },
    { query: "companies benefiting from MOSFET", expectedId: "product-mosfet", rule: "top10" },
    { query: "find DDR5 stocks", expectedId: "product-ddr5", rule: "top10" },
    { query: "AI Server supply chain", expectedId: "topic-ai-server", rule: "top10" },
    { query: "GB300 theme", expectedId: "topic-gb300", rule: "top10" },
    { query: "TrendForce report", expectedId: "INFO-TRENDFORCE", rule: "top10" },
    { query: "ETF 0050", expectedId: "TWSE-0050", rule: "top10" },
  ];
  const blueChipIds = ["TWSE-2330", "TWSE-2454", "TWSE-2317", "TWSE-2308", "TWSE-2382", "TWSE-2303", "TWSE-2881", "TWSE-1303", "TWSE-2002"];
  const selectedStocks = [
    ...blueChipIds.map((id) => stocks.find((item) => item.companyId === id)).filter(Boolean),
    ...stocks.filter((item) => !item.isETF && item.market === "TWSE").slice(0, 70),
    ...stocks.filter((item) => !item.isETF && item.market === "TPEx").slice(0, 50),
    ...stocks.filter((item) => item.isETF).slice(0, 30),
  ];
  const generated = [];
  for (const stock of selectedStocks) {
    generated.push({ query: stock.stockNo, expectedId: stock.companyId, rule: "rank1" });
    if (stock.shortName) generated.push({ query: stock.shortName, expectedId: stock.companyId, rule: "top3" });
    const alias = (stock.aliases || []).find((item) => normalize(item.alias) !== normalize(stock.shortName) && normalize(item.alias) !== normalize(stock.companyName));
    if (alias) generated.push({ query: alias.alias, expectedId: stock.companyId, rule: "top5" });
  }
  for (const product of products) generated.push({ query: product.name, expectedId: product.productId, rule: "top5" });
  for (const topic of topics) generated.push({ query: topic.name, expectedId: topic.topicId, rule: "top5" });
  for (const company of companies) generated.push({ query: company.name, expectedId: company.companyId, rule: "top3" });
  const map = new Map();
  for (const item of [...curated, ...generated]) {
    const key = `${normalize(item.query)}|${item.expectedId}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].slice(0, 220);
}

function searchAccuracyReport({ stocks, products, topics, companies, index }) {
  const cases = buildSearchCases(stocks, products, topics, companies);
  const startedAt = performance.now();
  const results = cases.map((item) => {
    const hits = searchIndex(index, item.query, 20);
    const rank = hits.findIndex((hit) => hit.id === item.expectedId) + 1;
    const threshold = item.rule === "rank1" ? 1 : item.rule === "top3" ? 3 : item.rule === "top5" ? 5 : item.rule === "top10" ? 10 : 20;
    return {
      ...item,
      rank: rank || null,
      passed: rank > 0 && rank <= threshold,
      topResults: hits.slice(0, 5).map((hit) => ({ id: hit.id, name: hit.name, type: hit.type, stockNo: hit.stockNo || null, score: Math.round(hit.score * 100) / 100 })),
    };
  });
  const elapsedMs = performance.now() - startedAt;
  const failed = results.filter((item) => !item.passed);
  return {
    generatedAt: nowIso(),
    caseCount: cases.length,
    passedCount: results.length - failed.length,
    failedCount: failed.length,
    accuracy: Number(((results.length - failed.length) / results.length).toFixed(4)),
    elapsedMs: Number(elapsedMs.toFixed(3)),
    avgSearchMs: Number((elapsedMs / results.length).toFixed(4)),
    criticalCases: results.slice(0, 15),
    failed,
    passed: failed.length === 0 && cases.length >= 200,
  };
}

function architectureMetricsReport({ stocksRaw, versionRaw, indexRaw, stocks, version, index }) {
  const startLoad = performance.now();
  JSON.parse(stocksRaw);
  JSON.parse(indexRaw);
  const loadTimeMs = performance.now() - startLoad;
  const memoryBefore = process.memoryUsage();
  const benchQueries = ["2330", "台積電", "TSMC", "5425", "台半", "MOS", "MOSFET", "GB300", "DDR5", "TrendForce", "AI Server", "台"];
  const startedAt = performance.now();
  let hits = 0;
  for (let i = 0; i < 1000; i++) hits += searchIndex(index, benchQueries[i % benchQueries.length], 20).length;
  const searchElapsed = performance.now() - startedAt;
  const memoryAfter = process.memoryUsage();
  const simulatedApiStart = performance.now();
  const simulatedApiPayload = {
    masterStatus: {
      schemaVersion: version.schemaVersion,
      recordCount: version.recordCount,
      checksum: version.checksum,
    },
    sampleSearch: searchIndex(index, "TSMC", 20),
  };
  const apiTimeMs = performance.now() - simulatedApiStart;
  return {
    generatedAt: nowIso(),
    masterDataSizeBytes: bytes(stocksRaw),
    masterDataSize: formatBytes(bytes(stocksRaw)),
    searchIndexSizeBytes: bytes(indexRaw),
    searchIndexSize: formatBytes(bytes(indexRaw)),
    buildTimeMs: version.buildTimeMs,
    loadTimeMs: Number(loadTimeMs.toFixed(3)),
    searchTime: {
      rounds: 1000,
      totalMs: Number(searchElapsed.toFixed(3)),
      avgMs: Number((searchElapsed / 1000).toFixed(4)),
      hits,
    },
    apiTime: {
      simulatedMasterSearchMs: Number(apiTimeMs.toFixed(4)),
      payloadBytes: bytes(simulatedApiPayload),
      note: "Preview should replace this with live endpoint timing against Render.",
    },
    memoryUsage: {
      before: memoryBefore,
      after: memoryAfter,
      rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
      heapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
    },
    cache: {
      expectedStrategy: "Master Data and Search Index are loaded into process memory and reused per request.",
      expectedHitRateAfterWarmup: 1,
      previewValidationRequired: true,
    },
  };
}

function technicalDebtReport({ metrics }) {
  return {
    generatedAt: nowIso(),
    items: [
      {
        id: "TD-001",
        severity: "high",
        title: "server.mjs is becoming a platform bottleneck",
        reason: "Routing, data fetching, scoring, financial modeling, timeline, search, and static serving are concentrated in one file.",
        impact: "Feature velocity will drop and regression risk will rise as Supply Chain Intelligence and AI Search are added.",
        recommendation: "Split into modules: routes, services, repositories, search, master-data, timeline, financial, and shared source metadata.",
        priority: 1,
      },
      {
        id: "TD-002",
        severity: "high",
        title: "Generated Master/Search JSON is committed as large artifacts",
        reason: `Current search index is ${metrics.searchIndexSize}; future announcements/news/supply-chain events will expand it quickly.`,
        impact: "Repository size, code review noise, deployment slug size, and merge conflicts will worsen.",
        recommendation: "Move generated artifacts to build cache or object storage, keep source seeds and deterministic builder in git.",
        priority: 2,
      },
      {
        id: "TD-003",
        severity: "medium",
        title: "Search ranking is deterministic but not yet relevance-trained",
        reason: "Weights are rule-based and do not yet use click feedback, user intent, or domain-specific synonym expansion.",
        impact: "Long-tail searches may be correct but not ideal as topics, products, and news grow.",
        recommendation: "Introduce query evaluation sets, click telemetry, and a versioned ranking profile before AI Search.",
        priority: 3,
      },
      {
        id: "TD-004",
        severity: "medium",
        title: "Master Data update is manual",
        reason: "The builder supports incremental scope, but no scheduled job or stale alert exists yet.",
        impact: "Listings, ETF changes, renamed companies, or delistings can become stale without operational discipline.",
        recommendation: "Add scheduled refresh, diff report, source failure alerting, and approval gate for changed identifiers.",
        priority: 4,
      },
      {
        id: "TD-005",
        severity: "medium",
        title: "Frontend is still a large imperative app file",
        reason: "Global Search was added into existing app.js, which already owns charts, timeline, financial UI, alerts, and watchlist.",
        impact: "UI behavior will become hard to test and accessibility improvements will be slower.",
        recommendation: "Modularize frontend by feature and introduce a small state/store layer before Portfolio and AI Chat.",
        priority: 5,
      },
    ],
    questions: {
      biggestDebt: "server.mjs and public/app.js are now too broad for a long-lived AI research platform.",
      nextBestStep: "Stabilize Master Data in Preview, then extract Master/Search services before Phase 3 expands relation data.",
      twoDayRefactorTop3: [
        "Extract server modules and route handlers.",
        "Move generated search artifacts out of normal code review flow or add generated-file review policy.",
        "Create shared source metadata and error contracts used by all APIs.",
      ],
      betterProductDesign: "Make Global Search the command center: query results should route into stocks, topics, products, events, and eventually AI answers, not only a topbar utility.",
    },
  };
}

function crossModuleValidationReport({ serverSource, appSource }) {
  const checks = [
    {
      name: "Financial validates stock through Master Data",
      passed: /url\.pathname === "\/api\/financial"[\s\S]*?await requireMasterStock\(stockNo\)/.test(serverSource),
      detail: "/api/financial calls requireMasterStock before buildFinancialSummary",
    },
    {
      name: "Timeline validates stock through Master Data",
      passed: /url\.pathname === "\/api\/timeline"[\s\S]*?await requireMasterStock\(stockNo\)/.test(serverSource),
      detail: "/api/timeline calls requireMasterStock before buildTimeline",
    },
    {
      name: "Price and technical analysis validate stock through Master Data",
      passed: /url\.pathname === "\/api\/twse"[\s\S]*?await requireMasterStock\(stockNo\)/.test(serverSource),
      detail: "/api/twse calls requireMasterStock before fetchStock",
    },
    {
      name: "AI summary validates stock through Master Data",
      passed: /url\.pathname === "\/api\/ai-summary"[\s\S]*?await requireMasterStock\(stockNo\)/.test(serverSource),
      detail: "/api/ai-summary calls requireMasterStock before buildAiSummaryResponse",
    },
    {
      name: "Search uses Search Index and Master Data warmup",
      passed: /url\.pathname === "\/api\/search"[\s\S]*?await loadMasterData\(\)[\s\S]*?runSearch/.test(serverSource),
      detail: "/api/search loads Master Data and queries Search Index",
    },
    {
      name: "Universe API returns Master Data instead of legacy stockUniverse",
      passed: /url\.pathname === "\/api\/universe"[\s\S]*?const master = await loadMasterData\(\)[\s\S]*?master\.stocks/.test(serverSource),
      detail: "/api/universe responds with master.stocks",
    },
    {
      name: "Watchlist stores companyId",
      passed: /companyId: item\.companyId \|\| master\?\.companyId/.test(appSource) && /companyId: master\?\.companyId/.test(appSource),
      detail: "watchlist normalization and add flow persist companyId",
    },
  ];
  return {
    generatedAt: nowIso(),
    checks,
    passed: checks.every((item) => item.passed),
    note: "This is a static architecture gate. Preview validation must also verify live API behavior.",
  };
}

function apiConsistencyReport({ serverSource }) {
  const expectedEnvelope = ["success", "data", "error", "data_source", "published_at", "fetched_at", "reporting_period", "is_estimated", "confidence", "source_url"];
  const endpoints = [
    "/api/health",
    "/api/version",
    "/api/master/status",
    "/api/master",
    "/api/search",
    "/api/search/suggestions",
    "/api/search/history",
    "/api/search/popular",
    "/api/search/recent",
    "/api/universe",
    "/api/twse",
    "/api/ai-summary",
    "/api/financial",
    "/api/timeline",
    "/api/timeline/sources",
    "/api/dashboard",
    "/api/revenue-radar",
    "/api/industry-quotes",
  ];
  function routeUsesSendSuccess(endpoint) {
    const direct = `url.pathname === "${endpoint}"`;
    const index = serverSource.indexOf(direct);
    if (index < 0) return false;
    const nextRoute = serverSource.indexOf('if (url.pathname === "', index + direct.length);
    const block = serverSource.slice(index, nextRoute > index ? nextRoute : index + 3000);
    return block.includes("sendSuccess(");
  }
  const checks = endpoints.map((endpoint) => ({
    endpoint,
    passed: routeUsesSendSuccess(endpoint),
    detail: "Route uses sendSuccess envelope; errors flow through sendError/classifyError.",
  }));
  const metadataChecks = [
    { name: "sendSuccess emits success/data/error", passed: /success: true[\s\S]*data[\s\S]*error: null/.test(serverSource) },
    { name: "sendError emits success/data/error", passed: /success: false[\s\S]*data: null[\s\S]*error: message/.test(serverSource) },
    { name: "responseMeta includes source metadata", passed: expectedEnvelope.slice(3).every((field) => serverSource.includes(`${field}:`)) },
    { name: "search metadata includes timing and cache fields", passed: /searchTimeMs[\s\S]*matchedCount[\s\S]*exactCount[\s\S]*fuzzyCount[\s\S]*cacheHit/.test(serverSource) },
  ];
  return {
    generatedAt: nowIso(),
    expectedEnvelope,
    endpoints,
    checks,
    metadataChecks,
    passed: checks.every((item) => item.passed) && metadataChecks.every((item) => item.passed),
    note: "Preview validation must replace this static gate with live response samples for all endpoints.",
  };
}

function architectureHealthReport({ metrics, technicalDebt, crossModule, apiConsistency, searchAccuracy }) {
  return {
    generatedAt: nowIso(),
    biggestStrength: "Master Data now provides a shared identity layer for stock, ETF, product, topic, and source-company search.",
    biggestDebt: technicalDebt.questions.biggestDebt,
    biggestRisk: "The generated local JSON index is acceptable now, but event/news/supply-chain indexing can outgrow process memory and repository review flow.",
    nextBestDirection: "Build Preview with live quality metrics, then split Master/Search into services before starting Supply Chain Intelligence.",
    healthSignals: {
      crossModuleMasterData: crossModule.passed,
      apiConsistency: apiConsistency.passed,
      searchAccuracy: searchAccuracy.passed,
      masterDataSize: metrics.masterDataSize,
      searchIndexSize: metrics.searchIndexSize,
      avgSearchMs: metrics.searchTime.avgMs,
    },
  };
}

function releaseReport({ version, searchAccuracy, dataQuality, metrics }) {
  return {
    generatedAt: nowIso(),
    releaseName: "Phase 2.5 Master Data + Global Search Preview Candidate",
    branch: "phase2-master-data-search",
    version: {
      appVersion: "1.4.0-phase2-master-search-dev",
      masterBuildVersion: version.buildVersion,
      checksum: version.checksum,
    },
    features: [
      "Master Data as shared company identity layer",
      "Global Search API and suggestions",
      "Search Index with exact, prefix, trie, and fuzzy maps",
      "Watchlist companyId migration",
      "Preview quality gates, ADRs, and reports",
    ],
    fixes: [
      "Manual alias ranking now outranks less relevant exact-name matches where appropriate.",
      "Product prefix ranking is more stable for MOS/MOSFET queries.",
      "Global Search accessibility includes ARIA and keyboard behavior.",
    ],
    breakingChanges: [],
    migration: [
      "Existing watchlist localStorage remains supported and is upgraded with companyId on load.",
      "Existing API consumers should continue using the standard success/data/error envelope.",
    ],
    knownIssues: [
      "Search history/recent endpoints are placeholders until account sync exists.",
      "Generated search artifacts are committed and should move to a better artifact strategy later.",
      "Natural-language search is keyword-index based, not AI reasoning yet.",
    ],
    rollback: "Do not merge main if Preview fails. If already merged, redeploy production commit 316ab5e33e9f4719c6611e2f1043b231513e0867.",
    qualitySummary: {
      dataQuality: dataQuality.passed,
      searchAccuracy: `${searchAccuracy.passedCount}/${searchAccuracy.caseCount}`,
      masterDataSize: metrics.masterDataSize,
      searchIndexSize: metrics.searchIndexSize,
    },
  };
}

function roadmapReport() {
  return {
    generatedAt: nowIso(),
    phases: [
      { phase: "Phase 1", status: "completed", summary: "AI dashboard, technical analysis, watchlist, alerts, source metadata, security baseline." },
      { phase: "Phase 2.1", status: "completed", summary: "Financial data and EPS model with actual/model separation." },
      { phase: "Phase 2.2", status: "completed", summary: "Official news/company announcement/timeline foundation." },
      { phase: "Phase 2.5", status: "preview-ready", summary: "Master Data + Global Search platform foundation. Preview validation pending." },
      { phase: "Phase 3", status: "not-started", summary: "Supply Chain Intelligence. Blocked until Master Data Preview is accepted." },
    ],
    technicalDebt: [
      "Split server.mjs and public/app.js before large Phase 3 expansion.",
      "Move generated artifacts to a durable artifact strategy.",
      "Add live API schema validation and Preview performance baselines.",
    ],
    knownLimits: [
      "No AI natural-language answer layer yet.",
      "No account-backed recent/history search.",
      "No supply-chain events in Search Index yet.",
    ],
  };
}

function mdTable(rows, columns) {
  return [
    `| ${columns.map((item) => item.label).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((col) => String(row[col.key] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");
}

async function writeReport(name, json, markdown) {
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(reportDir, `${name}.md`), markdown, "utf8");
}

function dataQualityMarkdown(report) {
  return `# Data Quality Report

Generated at: ${report.generatedAt}

## Scope

- TWSE sample: ${report.scope.twseSample} / ${report.counts.twse}
- TPEx sample: ${report.scope.tpexSample} / ${report.counts.tpex}
- ETF sample: ${report.scope.etfSample} / ${report.counts.etf}

## Checks

${mdTable(report.checks, [
  { key: "name", label: "Check" },
  { key: "passed", label: "Passed" },
  { key: "detail", label: "Detail" },
])}

## Result

${report.passed ? "PASS" : "FAIL"}
`;
}

function searchAccuracyMarkdown(report) {
  return `# Search Accuracy Report

Generated at: ${report.generatedAt}

- Cases: ${report.caseCount}
- Passed: ${report.passedCount}
- Failed: ${report.failedCount}
- Accuracy: ${(report.accuracy * 100).toFixed(2)}%
- Avg search time: ${report.avgSearchMs} ms

## Critical Cases

${mdTable(report.criticalCases.map((item) => ({ ...item, top1: item.topResults[0] ? `${item.topResults[0].id} ${item.topResults[0].name}` : "" })), [
  { key: "query", label: "Query" },
  { key: "expectedId", label: "Expected" },
  { key: "rule", label: "Rule" },
  { key: "rank", label: "Rank" },
  { key: "passed", label: "Passed" },
  { key: "top1", label: "Top Result" },
])}

## Failed Cases

${report.failed.length ? mdTable(report.failed.map((item) => ({ ...item, top1: item.topResults[0] ? `${item.topResults[0].id} ${item.topResults[0].name}` : "" })), [
  { key: "query", label: "Query" },
  { key: "expectedId", label: "Expected" },
  { key: "rule", label: "Rule" },
  { key: "rank", label: "Rank" },
  { key: "top1", label: "Top Result" },
]) : "None"}

## Result

${report.passed ? "PASS" : "FAIL"}
`;
}

function architectureMetricsMarkdown(report) {
  return `# Architecture Metrics Report

Generated at: ${report.generatedAt}

| Metric | Value |
| --- | --- |
| Master Data Size | ${report.masterDataSize} |
| Search Index Size | ${report.searchIndexSize} |
| Build Time | ${report.buildTimeMs} ms |
| Load Time | ${report.loadTimeMs} ms |
| Search Time | ${report.searchTime.avgMs} ms avg / ${report.searchTime.rounds} rounds |
| API Time | ${report.apiTime.simulatedMasterSearchMs} ms simulated |
| Cache Hit Rate | Expected ${report.cache.expectedHitRateAfterWarmup} after warmup |
| RSS Delta | ${formatBytes(report.memoryUsage.rssDeltaBytes)} |
| Heap Used Delta | ${formatBytes(report.memoryUsage.heapUsedDeltaBytes)} |

Note: Preview validation must collect live Render endpoint timing and memory behavior; this local report establishes the branch baseline.
`;
}

function technicalDebtMarkdown(report) {
  return `# Technical Debt Report

Generated at: ${report.generatedAt}

${mdTable(report.items, [
  { key: "id", label: "ID" },
  { key: "severity", label: "Severity" },
  { key: "title", label: "Title" },
  { key: "priority", label: "Priority" },
])}

## Details

${report.items
  .map(
    (item) => `### ${item.id} ${item.title}

- Severity: ${item.severity}
- Reason: ${item.reason}
- Impact: ${item.impact}
- Recommendation: ${item.recommendation}
- Priority: ${item.priority}
`,
  )
  .join("\n")}

## Four Platform Questions

1. Biggest technical debt: ${report.questions.biggestDebt}
2. Next best step: ${report.questions.nextBestStep}
3. Two-day refactor top three:
${report.questions.twoDayRefactorTop3.map((item) => `   - ${item}`).join("\n")}
4. Better product design: ${report.questions.betterProductDesign}
`;
}

function crossModuleMarkdown(report) {
  return `# Cross Module Validation Report

Generated at: ${report.generatedAt}

${mdTable(report.checks, [
  { key: "name", label: "Check" },
  { key: "passed", label: "Passed" },
  { key: "detail", label: "Detail" },
])}

Result: ${report.passed ? "PASS" : "FAIL"}

${report.note}
`;
}

function apiConsistencyMarkdown(report) {
  return `# API Consistency Report

Generated at: ${report.generatedAt}

## Expected Envelope

${report.expectedEnvelope.map((item) => `- ${item}`).join("\n")}

## Endpoint Checks

${mdTable(report.checks, [
  { key: "endpoint", label: "Endpoint" },
  { key: "passed", label: "Passed" },
  { key: "detail", label: "Detail" },
])}

## Metadata Checks

${mdTable(report.metadataChecks, [
  { key: "name", label: "Check" },
  { key: "passed", label: "Passed" },
])}

Result: ${report.passed ? "PASS" : "FAIL"}

${report.note}
`;
}

function architectureHealthMarkdown(report) {
  return `# Architecture Health Report

Generated at: ${report.generatedAt}

| Area | Summary |
| --- | --- |
| Biggest architecture strength | ${report.biggestStrength} |
| Biggest technical debt | ${report.biggestDebt} |
| Biggest risk | ${report.biggestRisk} |
| Next best direction | ${report.nextBestDirection} |

## Health Signals

| Signal | Value |
| --- | --- |
| Cross-module Master Data | ${report.healthSignals.crossModuleMasterData} |
| API consistency | ${report.healthSignals.apiConsistency} |
| Search accuracy | ${report.healthSignals.searchAccuracy} |
| Master Data size | ${report.healthSignals.masterDataSize} |
| Search Index size | ${report.healthSignals.searchIndexSize} |
| Avg search time | ${report.healthSignals.avgSearchMs} ms |
`;
}

function releaseMarkdown(report) {
  return `# Release Report

Generated at: ${report.generatedAt}

## Version

- Release: ${report.releaseName}
- Branch: ${report.branch}
- App version: ${report.version.appVersion}
- Master build version: ${report.version.masterBuildVersion}
- Checksum: ${report.version.checksum}

## Features

${report.features.map((item) => `- ${item}`).join("\n")}

## Fixes

${report.fixes.map((item) => `- ${item}`).join("\n")}

## Breaking Changes

${report.breakingChanges.length ? report.breakingChanges.map((item) => `- ${item}`).join("\n") : "None"}

## Migration

${report.migration.map((item) => `- ${item}`).join("\n")}

## Known Issues

${report.knownIssues.map((item) => `- ${item}`).join("\n")}

## Rollback

${report.rollback}

## Quality Summary

| Metric | Value |
| --- | --- |
| Data Quality | ${report.qualitySummary.dataQuality} |
| Search Accuracy | ${report.qualitySummary.searchAccuracy} |
| Master Data Size | ${report.qualitySummary.masterDataSize} |
| Search Index Size | ${report.qualitySummary.searchIndexSize} |
`;
}

function roadmapMarkdown(report) {
  return `# Roadmap

Generated at: ${report.generatedAt}

## Phases

${mdTable(report.phases, [
  { key: "phase", label: "Phase" },
  { key: "status", label: "Status" },
  { key: "summary", label: "Summary" },
])}

## Technical Debt

${report.technicalDebt.map((item) => `- ${item}`).join("\n")}

## Known Limits

${report.knownLimits.map((item) => `- ${item}`).join("\n")}
`;
}

const startedAt = performance.now();
const [stocksRaw, versionRaw, indexRaw, productsRaw, topicsRaw, companiesRaw] = await Promise.all([
  fs.readFile(path.join(dataDir, "master-stock.json"), "utf8"),
  fs.readFile(path.join(dataDir, "master-version.json"), "utf8"),
  fs.readFile(path.join(dataDir, "search-index.json"), "utf8"),
  fs.readFile(path.join(dataDir, "master-product.json"), "utf8"),
  fs.readFile(path.join(dataDir, "master-topic.json"), "utf8"),
  fs.readFile(path.join(dataDir, "master-company.json"), "utf8"),
]);
const stocks = JSON.parse(stocksRaw);
const version = JSON.parse(versionRaw);
const index = JSON.parse(indexRaw);
const products = JSON.parse(productsRaw);
const topics = JSON.parse(topicsRaw);
const companies = JSON.parse(companiesRaw);

const dataQuality = dataQualityReport(stocks);
const searchAccuracy = searchAccuracyReport({ stocks, products, topics, companies, index });
const architectureMetrics = architectureMetricsReport({ stocksRaw, versionRaw, indexRaw, stocks, version, index });
const technicalDebt = technicalDebtReport({ metrics: architectureMetrics });
const [serverSource, appSource] = await Promise.all([
  fs.readFile(path.join(rootDir, "server.mjs"), "utf8"),
  fs.readFile(path.join(rootDir, "public", "app.js"), "utf8"),
]);
const crossModule = crossModuleValidationReport({ serverSource, appSource });
const apiConsistency = apiConsistencyReport({ serverSource });
const architectureHealth = architectureHealthReport({ metrics: architectureMetrics, technicalDebt, crossModule, apiConsistency, searchAccuracy });
const release = releaseReport({ version, searchAccuracy, dataQuality, metrics: architectureMetrics });
const roadmap = roadmapReport();
const summary = {
  generatedAt: nowIso(),
  elapsedMs: Number((performance.now() - startedAt).toFixed(3)),
  reports: {
    dataQuality: dataQuality.passed,
    searchAccuracy: searchAccuracy.passed,
    crossModule: crossModule.passed,
    apiConsistency: apiConsistency.passed,
    architectureMetrics: true,
    technicalDebt: true,
    architectureHealth: true,
    release: true,
    roadmap: true,
  },
  previewGatePassed: dataQuality.passed && searchAccuracy.passed && crossModule.passed && apiConsistency.passed,
  outputDir: reportDir,
};

await writeReport("data-quality-report", dataQuality, dataQualityMarkdown(dataQuality));
await writeReport("search-accuracy-report", searchAccuracy, searchAccuracyMarkdown(searchAccuracy));
await writeReport("architecture-metrics-report", architectureMetrics, architectureMetricsMarkdown(architectureMetrics));
await writeReport("technical-debt-report", technicalDebt, technicalDebtMarkdown(technicalDebt));
await writeReport("cross-module-validation-report", crossModule, crossModuleMarkdown(crossModule));
await writeReport("api-consistency-report", apiConsistency, apiConsistencyMarkdown(apiConsistency));
await writeReport("architecture-health-report", architectureHealth, architectureHealthMarkdown(architectureHealth));
await writeReport("release-report", release, releaseMarkdown(release));
await writeReport("roadmap", roadmap, roadmapMarkdown(roadmap));
await fs.writeFile(path.join(rootDir, "docs", "ROADMAP.md"), roadmapMarkdown(roadmap), "utf8");
await writeReport("preview-quality-summary", summary, `# Phase 2.5 Preview Quality Summary

Generated at: ${summary.generatedAt}

| Report | Passed |
| --- | --- |
| Data Quality | ${summary.reports.dataQuality} |
| Search Accuracy | ${summary.reports.searchAccuracy} |
| Cross Module Validation | ${summary.reports.crossModule} |
| API Consistency | ${summary.reports.apiConsistency} |
| Architecture Metrics | ${summary.reports.architectureMetrics} |
| Technical Debt | ${summary.reports.technicalDebt} |
| Architecture Health | ${summary.reports.architectureHealth} |
| Release Report | ${summary.reports.release} |
| Roadmap | ${summary.reports.roadmap} |

Preview gate: ${summary.previewGatePassed ? "PASS" : "FAIL"}
`);

console.log(JSON.stringify(summary, null, 2));
if (!summary.previewGatePassed) process.exit(1);
