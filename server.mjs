import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const port = Number(process.env.PORT || 8787);
const accessToken = process.env.ACCESS_TOKEN || "";
const appVersion = "1.4.0-phase2-master-search-preview";
const frontendVersion = "phase2-master-search-1";
const deployedAt = new Date().toISOString();
const includedCommits = ["cd3171c", "90aa9b8"];
const gitCommit =
  process.env.RENDER_GIT_COMMIT ||
  (() => {
    try {
      return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: __dirname, encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  })();
const endpointCache = new Map();
const rateWindowMs = 60 * 1000;
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX || 240);
const rateHits = new Map();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const twseStockDayUrl = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY";
const tpexTradingStockUrl = "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock";
const finMindUrl = "https://api.finmindtrade.com/api/v4/data";
const twseValuationUrl = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL";
const twseRevenueUrl = "https://openapi.twse.com.tw/v1/opendata/t187ap05_L";
const twseIncomeUrl = "https://openapi.twse.com.tw/v1/opendata/t187ap14_L";
const twseMaterialInfoUrl = "https://openapi.twse.com.tw/v1/opendata/t187ap04_L";
const twseShareholderUrl = "https://openapi.twse.com.tw/v1/opendata/t187ap38_L";
const tpexValuationUrl = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis";
const tpexRevenueUrl = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O";
const tpexIncomeUrl = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap14_O";
const tpexMaterialInfoUrl = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O";

const stockUniverse = [
  { stockNo: "2330", name: "台積電", industry: "半導體 / 晶圓代工", marketCap: "large" },
  { stockNo: "2303", name: "聯電", industry: "半導體 / 晶圓代工", marketCap: "large" },
  { stockNo: "2404", name: "漢唐", industry: "台積電供應鏈 / 建廠廠務設備", marketCap: "mid" },
  { stockNo: "6139", name: "亞翔", industry: "台積電供應鏈 / 建廠廠務設備", marketCap: "mid" },
  { stockNo: "5536", name: "聖暉*", industry: "台積電供應鏈 / 建廠廠務設備", marketCap: "mid" },
  { stockNo: "4763", name: "材料-KY", industry: "半導體材料 / 特化", marketCap: "mid" },
  { stockNo: "4768", name: "晶呈科技", industry: "半導體材料 / 特化", marketCap: "small" },
  { stockNo: "4770", name: "上品", industry: "半導體材料 / 耗材", marketCap: "small" },
  { stockNo: "6488", name: "環球晶", industry: "半導體材料 / 矽晶圓", marketCap: "large" },
  { stockNo: "5483", name: "中美晶", industry: "半導體材料 / 矽晶圓", marketCap: "mid" },
  { stockNo: "6182", name: "合晶", industry: "半導體材料 / 矽晶圓", marketCap: "small" },
  { stockNo: "2344", name: "華邦電", industry: "記憶體 / DRAM Flash", marketCap: "large" },
  { stockNo: "2408", name: "南亞科", industry: "記憶體 / DRAM", marketCap: "large" },
  { stockNo: "2337", name: "旺宏", industry: "記憶體 / NOR Flash", marketCap: "mid" },
  { stockNo: "2329", name: "華泰", industry: "記憶體 / 封測", marketCap: "small" },
  { stockNo: "8299", name: "群聯", industry: "記憶體 / 控制 IC", marketCap: "mid" },
  { stockNo: "2327", name: "國巨", industry: "被動元件 / MLCC", marketCap: "large" },
  { stockNo: "2492", name: "華新科", industry: "被動元件 / MLCC", marketCap: "mid" },
  { stockNo: "3026", name: "禾伸堂", industry: "被動元件 / MLCC", marketCap: "small" },
  { stockNo: "2478", name: "大毅", industry: "被動元件 / 電阻", marketCap: "small" },
  { stockNo: "6173", name: "信昌電", industry: "被動元件 / MLCC", marketCap: "small" },
  { stockNo: "2481", name: "強茂", industry: "功率元件 / 二極體", marketCap: "mid" },
  { stockNo: "5425", name: "台半", industry: "功率元件 / MOSFET", marketCap: "small" },
  { stockNo: "2342", name: "茂矽", industry: "功率元件 / MOSFET", marketCap: "small" },
  { stockNo: "3707", name: "漢磊", industry: "功率元件 / SiC GaN", marketCap: "small" },
  { stockNo: "8255", name: "朋程", industry: "功率元件 / 車用功率", marketCap: "small" },
  { stockNo: "3037", name: "欣興", industry: "PCB / ABF 載板", marketCap: "large" },
  { stockNo: "3189", name: "景碩", industry: "PCB / ABF 載板", marketCap: "mid" },
  { stockNo: "8046", name: "南電", industry: "PCB / ABF 載板", marketCap: "mid" },
  { stockNo: "2383", name: "台光電", industry: "PCB / 銅箔基板 CCL", marketCap: "large" },
  { stockNo: "6274", name: "台燿", industry: "PCB / 銅箔基板 CCL", marketCap: "mid" },
  { stockNo: "6213", name: "聯茂", industry: "PCB / 銅箔基板 CCL", marketCap: "mid" },
  { stockNo: "8358", name: "金居", industry: "PCB / 銅箔", marketCap: "small" },
  { stockNo: "1802", name: "台玻", industry: "玻璃基板 / 玻璃材料", marketCap: "mid" },
  { stockNo: "3481", name: "群創", industry: "玻璃基板 / 面板與玻璃加工", marketCap: "large" },
  { stockNo: "3149", name: "正達", industry: "玻璃基板 / 玻璃加工", marketCap: "small" },
  { stockNo: "6207", name: "雷科", industry: "玻璃基板 / 設備", marketCap: "small" },
  { stockNo: "1809", name: "中釉", industry: "玻璃基板 / 薄膜材料", marketCap: "small" },
  { stockNo: "4976", name: "佳凌", industry: "玻璃基板 / 光學玻璃", marketCap: "small" },
  { stockNo: "2382", name: "廣達", industry: "AI Server / ODM", marketCap: "large" },
  { stockNo: "3231", name: "緯創", industry: "AI Server / ODM", marketCap: "large" },
  { stockNo: "6669", name: "緯穎", industry: "AI Server / ODM", marketCap: "large" },
  { stockNo: "3017", name: "奇鋐", industry: "AI Server / 散熱", marketCap: "large" },
  { stockNo: "3324", name: "雙鴻", industry: "AI Server / 散熱", marketCap: "mid" },
  { stockNo: "3653", name: "健策", industry: "AI Server / 機構散熱", marketCap: "mid" },
  { stockNo: "2308", name: "台達電", industry: "AI Server / 電源 BBU", marketCap: "large" },
  { stockNo: "6412", name: "群電", industry: "AI Server / 電源", marketCap: "mid" },
  { stockNo: "3455", name: "由田", industry: "半導體設備 / AOI", marketCap: "small" },
  { stockNo: "4908", name: "前鼎", industry: "CPO / 光通訊", marketCap: "small" },
  { stockNo: "3163", name: "波若威", industry: "CPO / 光通訊", marketCap: "small" },
  { stockNo: "3363", name: "上詮", industry: "CPO / 光通訊", marketCap: "small" },
  { stockNo: "1513", name: "中興電", industry: "800VDC HVDC / 電力設備", marketCap: "mid" },
  { stockNo: "1519", name: "華城", industry: "800VDC HVDC / 重電", marketCap: "mid" },
  { stockNo: "1605", name: "華新", industry: "原物料 / 銅與線纜", marketCap: "large" },
  { stockNo: "2002", name: "中鋼", industry: "原物料 / 鋼鐵", marketCap: "large" },
  { stockNo: "1303", name: "南亞", industry: "原物料 / 樹脂與 CCL 上游", marketCap: "large" },
  { stockNo: "2603", name: "長榮", industry: "景氣循環 / 航運", marketCap: "large" },
];

const dashboardUniverse = [
  "2330",
  "2404",
  "6139",
  "4763",
  "6488",
  "2344",
  "2408",
  "2327",
  "2481",
  "5425",
  "3037",
  "2383",
  "1802",
  "3481",
  "2382",
  "3231",
  "3017",
  "2308",
  "1519",
  "1605",
];

const stockMap = new Map(stockUniverse.map((item) => [item.stockNo, item]));
let masterCache = null;
let searchIndexCache = null;
let masterStockNoMap = new Map();
let masterCompanyIdMap = new Map();

const industryQuoteItems = [
  { group: "貴金屬", name: "黃金", symbol: "00635U", note: "黃金 ETF 代理指標" },
  { group: "貴金屬", name: "白銀", symbol: "00738U", note: "白銀 ETF 代理指標" },
  { group: "能源與化工", name: "原油", symbol: "00763U", note: "原油 ETF 代理指標" },
  { group: "金屬", name: "鋼鐵", symbol: "2002", note: "中鋼作為鋼價景氣代理" },
  { group: "食品原物料", name: "咖啡與民生物資", symbol: "1216", note: "統一作為民生物資代理" },
  { group: "橡膠", name: "橡膠輪胎", symbol: "2105", note: "正新作為橡膠景氣代理" },
  { group: "半導體材料", name: "矽晶圓", symbol: "6488", note: "環球晶作為矽晶圓代理" },
  { group: "半導體材料", name: "再生晶圓", symbol: "5483", note: "中美晶作為材料代理" },
  { group: "半導體材料", name: "特化材料", symbol: "4763", note: "材料-KY 作為特化代理" },
  { group: "PCB 材料", name: "銅箔", symbol: "8358", note: "金居作為銅箔代理" },
  { group: "PCB 材料", name: "銅箔基板", symbol: "2383", note: "台光電作為 CCL 代理" },
  { group: "被動元件", name: "MLCC", symbol: "2327", note: "國巨作為 MLCC 代理" },
  { group: "記憶體", name: "DRAM", symbol: "2408", note: "南亞科作為 DRAM 代理" },
  { group: "功率元件", name: "MOSFET", symbol: "5425", note: "台半作為功率元件代理" },
];

const toYYYYMMDD = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const toYYYYSlashMMDD = (d) =>
  `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

const addMonths = (date, delta) => {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  return d;
};

const parseNumber = (value) => {
  if (value === "--" || value === "" || value == null) return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const safePct = (value) => (Number.isFinite(value) ? value : null);

const parsePercentNumber = (value) => {
  const n = parseNumber(value);
  return n == null ? null : n / 100;
};

const clamp = (min, max, value) => Math.max(min, Math.min(max, value));

const parseRocPeriod = (value) => {
  const text = String(value || "");
  if (!/^\d{5,7}$/.test(text)) return text || null;
  const year = Number(text.slice(0, 3)) + 1911;
  const month = text.length >= 5 ? text.slice(3, 5) : "01";
  const day = text.length >= 7 ? text.slice(5, 7) : null;
  return day ? `${year}-${month}-${day}` : `${year}-${month}`;
};

const parseTaiwanDate = (value) => {
  const [rocYear, month, day] = String(value).split("/").map(Number);
  return `${rocYear + 1911}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const sourceMeta = ({
  data_source,
  published_at = null,
  fetched_at = new Date().toISOString(),
  reporting_period = null,
  is_estimated = false,
  confidence = 0.7,
  source_url = null,
} = {}) => ({
  data_source,
  published_at,
  fetched_at,
  reporting_period,
  is_estimated,
  confidence,
  source_url,
});

function securityHeaders(extra = {}) {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
    "content-security-policy":
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; form-action 'self'",
    ...extra,
  };
}

function responseMeta(data, fallback = {}) {
  const meta = data?.metadata || data?.meta || fallback;
  return {
    data_source: meta.data_source || fallback.data_source || null,
    published_at: meta.published_at || fallback.published_at || null,
    fetched_at: meta.fetched_at || data?.fetchedAt || fallback.fetched_at || new Date().toISOString(),
    reporting_period: meta.reporting_period || fallback.reporting_period || null,
    is_estimated: Boolean(meta.is_estimated ?? fallback.is_estimated ?? false),
    confidence: typeof meta.confidence === "number" ? meta.confidence : (fallback.confidence ?? null),
    source_url: meta.source_url || fallback.source_url || null,
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, securityHeaders({ "content-type": "application/json; charset=utf-8" }));
  res.end(JSON.stringify(payload));
}

function sendSuccess(res, data, status = 200, fallbackMeta = {}) {
  const meta = responseMeta(data, fallbackMeta);
  sendJson(res, status, {
    success: true,
    data,
    error: null,
    ...meta,
  });
}

function sendError(res, status, message, fallbackMeta = {}) {
  const meta = responseMeta(null, fallbackMeta);
  console.error(JSON.stringify({ level: "error", status, message, fetched_at: meta.fetched_at }));
  sendJson(res, status, {
    success: false,
    data: null,
    error: message,
    ...meta,
  });
}

function cacheKey(pathname, searchParams) {
  const key = new URLSearchParams(searchParams);
  key.delete("key");
  return `${pathname}?${key.toString()}`;
}

async function withCache(key, ttlMs, producer) {
  const cached = endpointCache.get(key);
  try {
    const data = await producer();
    endpointCache.set(key, { data, cachedAt: new Date().toISOString(), expiresAt: Date.now() + ttlMs });
    return { data, cache: null };
  } catch (error) {
    if (cached?.data) {
      return {
        data: {
          ...cached.data,
          cacheNotice: `外部資料暫時無法取得，使用最近一次成功快取：${cached.cachedAt}`,
        },
        cache: cached,
      };
    }
    throw error;
  }
}

function classifyError(error) {
  const message = String(error?.message || error || "Unknown error");
  if (error?.statusCode) return { status: error.statusCode, message };
  if (/AbortError|timeout/i.test(message)) return { status: 504, message: "外部資料源逾時，請稍後再試" };
  if (/HTTP 429/.test(message)) return { status: 429, message: "外部資料源暫時限流，請稍後再試" };
  if (/HTTP 5\d\d/.test(message)) return { status: 502, message: "外部資料源暫時異常，請稍後再試" };
  if (/找不到|查無|不足|no data|not found/i.test(message)) return { status: 404, message: "查無此股票或資料不足，請確認股票代號" };
  return { status: 502, message: "資料讀取失敗，已保留其他可用功能" };
}

function rateLimit(req, res) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = rateHits.get(ip) || { start: now, count: 0 };
  if (now - record.start > rateWindowMs) {
    record.start = now;
    record.count = 0;
  }
  record.count += 1;
  rateHits.set(ip, record);
  if (record.count > rateLimitMax) {
    sendError(res, 429, "請求過於頻繁，請稍後再試", sourceMeta({ data_source: "server rate limit", confidence: 1 }));
    return false;
  }
  return true;
}

function assertAccess(url, res) {
  if (accessToken && url.searchParams.get("key") !== accessToken) {
    sendError(res, 401, "Access key required", sourceMeta({ data_source: "server access control", confidence: 1 }));
    return false;
  }
  return true;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function readDataJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
  } catch {
    return fallback;
  }
}

async function loadMasterData({ force = false } = {}) {
  if (masterCache && !force) return { ...masterCache, cacheHit: true };
  const [stocks, version, products, topics, companies] = await Promise.all([
    readDataJson("master-stock.json", []),
    readDataJson("master-version.json", null),
    readDataJson("master-product.json", []),
    readDataJson("master-topic.json", []),
    readDataJson("master-company.json", []),
  ]);
  masterStockNoMap = new Map();
  masterCompanyIdMap = new Map();
  for (const item of stocks) {
    if (!item?.stockNo || !item?.companyId) continue;
    const existing = masterStockNoMap.get(String(item.stockNo));
    if (!existing || (existing.isETF && !item.isETF) || (existing.market !== "TWSE" && item.market === "TWSE")) {
      masterStockNoMap.set(String(item.stockNo), item);
    }
    masterCompanyIdMap.set(item.companyId, item);
  }
  masterCache = {
    loadedAt: new Date().toISOString(),
    stocks,
    version,
    products,
    topics,
    companies,
    cacheHit: false,
  };
  return masterCache;
}

async function loadSearchIndex({ force = false } = {}) {
  if (searchIndexCache && !force) return { ...searchIndexCache, cacheHit: true };
  const index = await readDataJson("search-index.json", null);
  if (!index?.documents) throw httpError(503, "Search index is not available. Run npm run build:master-data first.");
  searchIndexCache = {
    loadedAt: new Date().toISOString(),
    index,
    cacheHit: false,
  };
  return searchIndexCache;
}

function masterStockSync(stockNo) {
  return masterStockNoMap.get(String(stockNo || "").trim()) || stockMap.get(String(stockNo || "").trim()) || null;
}

async function requireMasterStock(stockNo) {
  const clean = String(stockNo || "").trim();
  await loadMasterData();
  const item = masterStockNoMap.get(clean);
  if (!item || item.status === "delisted") throw httpError(404, "查無此股票或資料不足，請確認股票代號");
  return item;
}

function searchGroups() {
  return {
    stocks: [],
    etfs: [],
    products: [],
    topics: [],
    industries: [],
    companies: [],
    supplyChainEvents: [],
    announcements: [],
  };
}

function groupKeyForType(type) {
  if (type === "stock") return "stocks";
  if (type === "etf") return "etfs";
  if (type === "product") return "products";
  if (type === "topic") return "topics";
  if (type === "industry") return "industries";
  if (type === "announcement") return "announcements";
  if (type === "supply_chain_event") return "supplyChainEvents";
  return "companies";
}

function matchBasis(doc, q) {
  const exactFields = [
    ["stockNo", doc.stockNo, "stockNo_exact"],
    ["name", doc.name, "name_exact"],
    ["companyName", doc.companyName, "company_exact"],
    ["englishName", doc.englishName, "english_exact"],
  ];
  for (const [, value, basis] of exactFields) {
    if (value && normalizeSearchText(value) === q) return basis;
  }
  if ((doc.aliases || []).some((item) => normalizeSearchText(item.alias || item) === q)) return "alias_exact";
  return "index_match";
}

function scoreSearchDoc(doc, q, matchType) {
  let score = 0;
  const type = doc.type;
  const shortCjkPrefix = q.length === 1 && /[\u3400-\u9fff]/.test(q);
  const exactStockNo = doc.stockNo && normalizeSearchText(doc.stockNo) === q;
  const exactName = doc.name && normalizeSearchText(doc.name) === q;
  const containedStockNo = doc.stockNo && q.includes(normalizeSearchText(doc.stockNo));
  const containedName = doc.name && q.includes(normalizeSearchText(doc.name));
  const containedAlias = (doc.aliases || []).some((item) => {
    const alias = normalizeSearchText(item.alias || item);
    return alias.length >= 3 && q.includes(alias);
  });
  const exactAlias = (doc.aliases || []).some((item) => normalizeSearchText(item.alias || item) === q);
  const exactHighConfidenceTopicAlias =
    type === "topic" &&
    (doc.aliases || []).some((item) => normalizeSearchText(item.alias || item) === q && item.source === "manual_topic" && Number(item.confidence || 0) >= 1);
  const trustedManualAlias = (doc.aliases || []).some(
    (item) => normalizeSearchText(item.alias || item) === q && item.source === "manual_alias" && Number(item.confidence || 0) >= 0.95,
  );
  const exactEnglish = doc.englishName && normalizeSearchText(doc.englishName) === q;
  if (exactStockNo) score += 1000;
  else if (containedStockNo) score += 990;
  else if (trustedManualAlias) score += 940;
  else if (exactName) score += 920;
  else if ((type === "product" || type === "topic" || type === "company") && (containedName || containedAlias)) score += 900;
  else if (exactAlias) score += 860;
  else if (exactEnglish) score += 780;
  else if (type === "etf") score += 700;
  else if (type === "product") score += 640;
  else if (type === "topic") score += 620;
  else if (type === "industry") score += 540;
  else if (matchType === "prefix") score += 430;
  else if (matchType === "fuzzy") score += 250;
  else score += 300;
  if (shortCjkPrefix && matchType === "prefix" && type === "stock") score += 250;
  if (shortCjkPrefix && matchType === "prefix" && type === "etf") score -= 260;
  if (exactHighConfidenceTopicAlias) score += 1;
  score += Number(doc.searchWeight || 0);
  score += Number(doc.popularityWeight || 0) * 0.15;
  return score;
}

function searchTypePriority(type) {
  return { stock: 1, product: 2, topic: 3, etf: 4, industry: 5, company: 6 }[type] || 9;
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

async function runSearch(query, { limit = 20, suggestions = false } = {}) {
  const start = performance.now();
  const { index, cacheHit } = await loadSearchIndex();
  const q = normalizeSearchText(query);
  const max = Math.min(Math.max(Number(limit) || 10, 1), suggestions ? 10 : 50);
  if (!q) {
    return {
      query,
      results: [],
      groups: searchGroups(),
      metadata: { searchTimeMs: 0, matchedCount: 0, exactCount: 0, fuzzyCount: 0, cacheHit },
    };
  }

  const candidates = new Map();
  const addCandidates = (refs, matchType) => {
    for (const ref of refs || []) {
      const doc = index.documents[ref];
      if (!doc) continue;
      const current = candidates.get(ref);
      const score = scoreSearchDoc(doc, q, matchType);
      if (!current || score > current.score) {
        candidates.set(ref, {
          ...doc,
          matchType,
          matchBasis: matchBasis(doc, q),
          score,
        });
      }
    }
  };

  const exactRefs = index.exactMap?.[q] || [];
  addCandidates(exactRefs, "exact");
  addCandidates(index.prefixIndex?.[q] || [], "prefix");
  const fuzzyRefs = refsForGrams(index, q);
  addCandidates(fuzzyRefs, "fuzzy");

  const results = [...candidates.values()]
    .sort((a, b) => b.score - a.score || searchTypePriority(a.type) - searchTypePriority(b.type) || String(a.stockNo || a.name).localeCompare(String(b.stockNo || b.name)))
    .slice(0, max)
    .map((item) => ({
      id: item.id,
      type: item.type,
      stockNo: item.stockNo || null,
      companyId: item.companyId || null,
      name: item.name,
      companyName: item.companyName || null,
      englishName: item.englishName || null,
      market: item.market || null,
      marketSegment: item.marketSegment || null,
      industry: item.industry || item.category || null,
      isETF: Boolean(item.isETF),
      matchType: item.matchType,
      matchBasis: item.matchBasis,
      score: Math.round(item.score * 100) / 100,
      aliases: (item.aliases || []).slice(0, 5),
    }));
  const groups = searchGroups();
  for (const result of results) groups[groupKeyForType(result.type)].push(result);
  return {
    query,
    results,
    groups,
    metadata: {
      searchTimeMs: Math.round((performance.now() - start) * 100) / 100,
      matchedCount: results.length,
      exactCount: results.filter((item) => item.matchType === "exact").length,
      fuzzyCount: results.filter((item) => item.matchType === "fuzzy").length,
      cacheHit,
      indexDocumentCount: index.documentCount,
    },
  };
}

function sma(values, period) {
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values, period) {
  const out = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (prev == null) prev = value;
    else prev = value * k + prev * (1 - k);
    out[i] = i >= period - 1 ? prev : null;
  }
  return out;
}

function rsi(values, period = 14) {
  const out = Array(values.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (i >= period) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function bollinger(values, period = 20, width = 2) {
  const mid = sma(values, period);
  const upper = Array(values.length).fill(null);
  const lower = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = mean + width * sd;
    lower[i] = mean - width * sd;
  }
  return { mid, upper, lower };
}

function macd(values) {
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const line = values.map((_, i) => (ema12[i] == null || ema26[i] == null ? null : ema12[i] - ema26[i]));
  const compact = line.filter((v) => v != null);
  const signalCompact = ema(compact, 9);
  const signal = Array(values.length).fill(null);
  let j = 0;
  for (let i = 0; i < values.length; i++) {
    if (line[i] != null) signal[i] = signalCompact[j++];
  }
  const hist = line.map((v, i) => (v == null || signal[i] == null ? null : v - signal[i]));
  return { line, signal, hist };
}

function latestContinuousPriceSegment(rows) {
  let start = 0;
  for (let i = rows.length - 1; i > 0; i--) {
    const prev = rows[i - 1].close;
    const current = rows[i].close;
    const ratio = prev ? current / prev : 1;
    if (ratio > 2.5 || ratio < 0.4) {
      start = i;
      break;
    }
  }
  const segment = rows.slice(start);
  return segment.length >= 35 ? segment : rows;
}

function summarize(rows, indicators) {
  const last = rows.at(-1);
  const prev = rows.at(-2);
  const i = rows.length - 1;
  const change = prev ? last.close - prev.close : 0;
  const changePct = prev ? change / prev.close : 0;
  const ma20 = indicators.ma20[i];
  const ma60 = indicators.ma60[i];
  const rsi14 = indicators.rsi14[i];
  const macdHist = indicators.macd.hist[i];
  const signals = [];

  if (ma20 != null && last.close > ma20) signals.push("收盤站上 MA20，短線偏多");
  if (ma20 != null && last.close < ma20) signals.push("收盤跌破 MA20，短線偏弱");
  if (ma60 != null && last.close > ma60) signals.push("股價站上 MA60，中期趨勢較穩");
  if (ma60 != null && last.close < ma60) signals.push("股價低於 MA60，中期仍需觀察");
  if (rsi14 != null && rsi14 >= 70) signals.push("RSI 高於 70，短線過熱");
  if (rsi14 != null && rsi14 <= 30) signals.push("RSI 低於 30，短線超賣");
  if (macdHist != null && macdHist > 0) signals.push("MACD 柱狀體為正，多方動能占優");
  if (macdHist != null && macdHist < 0) signals.push("MACD 柱狀體為負，空方動能占優");

  const highs = rows.slice(-60).map((r) => r.high);
  const lows = rows.slice(-60).map((r) => r.low);
  return {
    date: last.date,
    close: last.close,
    change,
    changePct,
    support: Math.min(...lows),
    resistance: Math.max(...highs),
    ma20,
    ma60,
    rsi14,
    macdHist,
    signals,
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 tw-stock-ai-research-platform",
        accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTwseMonth(stockNo, date) {
  const url = new URL(twseStockDayUrl);
  url.searchParams.set("date", toYYYYMMDD(date));
  url.searchParams.set("stockNo", stockNo);
  url.searchParams.set("response", "json");
  return fetchJson(url);
}

async function fetchTpexMonth(stockNo, date) {
  const url = new URL(tpexTradingStockUrl);
  url.searchParams.set("code", stockNo);
  url.searchParams.set("date", toYYYYSlashMMDD(date));
  url.searchParams.set("response", "json");
  return fetchJson(url);
}

async function fetchFinMind(stockNo, months) {
  const start = addMonths(new Date(), -(months + 1));
  const url = new URL(finMindUrl);
  url.searchParams.set("dataset", "TaiwanStockPrice");
  url.searchParams.set("data_id", stockNo);
  url.searchParams.set("start_date", start.toISOString().slice(0, 10));
  return fetchJson(url);
}

let openDataCache = new Map();
const sourceFetchCache = new Map();

async function fetchOpenData(url, ttlMs = 10 * 60 * 1000) {
  const cached = openDataCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await fetchJson(url);
  if (!Array.isArray(data)) throw new Error(`OpenAPI format changed: ${url}`);
  openDataCache.set(url, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

async function findOpenDataRow(stockNo, configs) {
  const errors = [];
  for (const config of configs) {
    try {
      const rows = await fetchOpenData(config.url);
      const row = rows.find((item) => String(item[config.codeKey] || "").trim() === stockNo);
      if (row) return { row, config };
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (errors.length) console.error(JSON.stringify({ level: "warn", stockNo, financialOpenDataErrors: errors }));
  return null;
}

const revenueConfigs = [
  { market: "TWSE", url: twseRevenueUrl, codeKey: "公司代號", source: "TWSE OpenAPI t187ap05_L" },
  { market: "TPEx", url: tpexRevenueUrl, codeKey: "公司代號", source: "TPEx OpenAPI mopsfin_t187ap05_O" },
];

const incomeConfigs = [
  { market: "TWSE", url: twseIncomeUrl, codeKey: "公司代號", epsKey: "基本每股盈餘(元)", yearKey: "年度", source: "TWSE OpenAPI t187ap14_L" },
  { market: "TPEx", url: tpexIncomeUrl, codeKey: "SecuritiesCompanyCode", epsKey: "基本每股盈餘", yearKey: "Year", source: "TPEx OpenAPI mopsfin_t187ap14_O" },
];

const valuationConfigs = [
  { market: "TWSE", url: twseValuationUrl, codeKey: "Code", peKey: "PEratio", pbKey: "PBratio", yieldKey: "DividendYield", source: "TWSE BWIBBU_ALL" },
  { market: "TPEx", url: tpexValuationUrl, codeKey: "SecuritiesCompanyCode", peKey: "PriceEarningRatio", pbKey: "PriceBookRatio", yieldKey: "YieldRatio", source: "TPEx mainboard peratio analysis" },
];

async function fetchLatestRevenueOpenData(stockNo) {
  const found = await findOpenDataRow(stockNo, revenueConfigs);
  if (!found) return null;
  const { row, config } = found;
  return {
    market: config.market,
    companyName: row["公司名稱"] || null,
    industry: row["產業別"] || null,
    monthlyRevenue: parseNumber(row["營業收入-當月營收"]),
    monthlyRevenue_amount: moneyAmount(parseNumber(row["營業收入-當月營收"])),
    previousMonthRevenue: parseNumber(row["營業收入-上月營收"]),
    previousYearRevenue: parseNumber(row["營業收入-去年當月營收"]),
    mom: parsePercentNumber(row["營業收入-上月比較增減(%)"]),
    yoy: parsePercentNumber(row["營業收入-去年同月增減(%)"]),
    cumulativeRevenue: parseNumber(row["累計營業收入-當月累計營收"]),
    cumulativeRevenue_amount: moneyAmount(parseNumber(row["累計營業收入-當月累計營收"])),
    cumulativePreviousYearRevenue: parseNumber(row["累計營業收入-去年累計營收"]),
    cumulativeYoy: parsePercentNumber(row["累計營業收入-前期比較增減(%)"]),
    note: row["備註"] || null,
    metadata: sourceMeta({
      data_source: config.source,
      published_at: parseRocPeriod(row["出表日期"]),
      reporting_period: parseRocPeriod(row["資料年月"]),
      is_estimated: false,
      confidence: 0.9,
      source_url: config.url,
    }),
  };
}

async function fetchLatestIncomeOpenData(stockNo) {
  const found = await findOpenDataRow(stockNo, incomeConfigs);
  if (!found) return null;
  const { row, config } = found;
  const revenue = parseNumber(row["營業收入"]);
  const operatingIncome = parseNumber(row["營業利益"]);
  const netIncome = parseNumber(row["稅後淨利"]);
  const eps = parseNumber(row[config.epsKey]);
  const year = parseNumber(row[config.yearKey]);
  const quarter = parseNumber(row["季別"]);
  const period = year && quarter ? `${year + 1911}Q${quarter}` : null;
  return {
    market: config.market,
    companyName: row["公司名稱"] || row["CompanyName"] || null,
    industry: row["產業別"] || null,
    completedQuarters: quarter || null,
    cumulativeEps: eps,
    quarterRevenue: revenue,
    quarterRevenue_amount: moneyAmount(revenue),
    operatingIncome,
    operatingIncome_amount: moneyAmount(operatingIncome),
    nonOperatingIncome: parseNumber(row["營業外收入及支出"]),
    netIncome,
    netIncome_amount: moneyAmount(netIncome),
    eps,
    operatingMargin: revenue ? operatingIncome / revenue : null,
    netMargin: revenue ? netIncome / revenue : null,
    grossMargin: null,
    grossMarginStatus: "官方端點未提供銷貨成本或毛利欄位，第一小節不估算公告毛利率",
    estimatedShares: eps ? (netIncome * 1000) / eps : null,
    shares: shareAmount(eps ? (netIncome * 1000) / eps : null, "由公告稅後淨利 / EPS 反推，非官方流通股數", parseRocPeriod(row["出表日期"] || row["Date"]), false),
    unit: "新台幣千元，EPS 為元",
    metadata: sourceMeta({
      data_source: config.source,
      published_at: parseRocPeriod(row["出表日期"] || row["Date"]),
      reporting_period: period,
      is_estimated: false,
      confidence: 0.88,
      source_url: config.url,
    }),
  };
}

async function fetchLatestValuationOpenData(stockNo) {
  const found = await findOpenDataRow(stockNo, valuationConfigs);
  if (!found) return null;
  const { row, config } = found;
  return {
    market: config.market,
    peRatio: parseNumber(row[config.peKey]),
    pbRatio: parseNumber(row[config.pbKey]),
    dividendYield: parsePercentNumber(row[config.yieldKey]),
    date: parseRocPeriod(row["Date"]),
    metadata: sourceMeta({
      data_source: config.source,
      published_at: parseRocPeriod(row["Date"]),
      reporting_period: parseRocPeriod(row["Date"]),
      is_estimated: false,
      confidence: 0.88,
      source_url: config.url,
    }),
  };
}

function moneyAmount(rawValue, unit = "千元") {
  const multiplier = unit === "千元" ? 1000 : 1;
  return {
    raw_value: rawValue ?? null,
    unit,
    normalized_value: rawValue == null ? null : rawValue * multiplier,
    normalized_unit: "元",
  };
}

function shareAmount(value, source, asOfDate, isUserOverride = false) {
  return {
    shares_outstanding: value ?? null,
    shares_unit: "股",
    shares_source: source,
    shares_as_of_date: asOfDate ?? null,
    shares_is_user_override: isUserOverride,
  };
}

function normalizeRate(value, fallback, min = -0.95, max = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(min, max, n);
}

function normalizeTaxRate(value, fallback = 0.2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(0, 1, n);
}

function defaultEpsModelInputs(income, valuation) {
  const operatingMargin = income?.operatingMargin ?? 0.15;
  const grossMargin = clamp(0.05, 0.75, operatingMargin + 0.12);
  const opexRate = clamp(0.03, 0.65, grossMargin - operatingMargin);
  const basePe = valuation?.peRatio && valuation.peRatio > 0 ? valuation.peRatio : 15;
  return {
    applyAll: {
      revenueGrowth: 0,
      grossMargin,
      operatingExpenseRate: opexRate,
      taxRate: 0.2,
    },
    quarters: {},
    sharesOutstanding: income?.estimatedShares ? Math.round(income.estimatedShares) : null,
    pessimisticPe: Math.max(5, Math.round(basePe * 0.75 * 10) / 10),
    basePe: Math.round(basePe * 10) / 10,
    optimisticPe: Math.round(basePe * 1.25 * 10) / 10,
  };
}

function quarterInput(inputs, quarter, scenarioGrowthDelta = 0, scenarioMarginDelta = 0) {
  const specific = inputs.quarters?.[`Q${quarter}`] || {};
  return {
    revenueGrowth: normalizeRate(specific.revenueGrowth, inputs.applyAll.revenueGrowth) + scenarioGrowthDelta,
    grossMargin: normalizeRate(specific.grossMargin, inputs.applyAll.grossMargin, -1, 1.5) + scenarioMarginDelta,
    operatingExpenseRate: normalizeRate(specific.operatingExpenseRate, inputs.applyAll.operatingExpenseRate, 0, 1.5),
    taxRate: normalizeTaxRate(specific.taxRate, inputs.applyAll.taxRate),
    source: specific.source || "model_default_or_user_input",
  };
}

function calculateForecastQuarter(baseQuarterRevenueThousand, inputs, quarter, scenarioAdjustments = {}) {
  const q = quarterInput(inputs, quarter, scenarioAdjustments.growthDelta || 0, scenarioAdjustments.marginDelta || 0);
  const revenueThousand = baseQuarterRevenueThousand * (1 + q.revenueGrowth);
  const grossProfitThousand = revenueThousand * q.grossMargin;
  const operatingExpenseThousand = revenueThousand * q.operatingExpenseRate;
  const operatingIncomeThousand = grossProfitThousand - operatingExpenseThousand;
  const netIncomeThousand = operatingIncomeThousand * (1 - q.taxRate);
  const shares = Number(inputs.sharesOutstanding || 0);
  const quarterEps = shares > 0 ? (netIncomeThousand * 1000) / shares : null;
  return {
    quarter: `Q${quarter}`,
    is_estimated: true,
    revenueGrowth: q.revenueGrowth,
    grossMargin: {
      value: q.grossMargin,
      source: q.source === "user_input" ? "使用者假設" : "模型預設假設",
      is_estimated: true,
      is_user_input: q.source === "user_input",
      default_reason: "官方 OpenAPI 未提供毛利率；預設以營業利益率加 12 個百分點作為模型假設，非公司公告毛利率",
    },
    operatingExpenseRate: q.operatingExpenseRate,
    taxRate: q.taxRate,
    revenue: revenueThousand,
    revenue_amount: moneyAmount(revenueThousand),
    grossProfit: grossProfitThousand,
    operatingIncome: operatingIncomeThousand,
    netIncome: netIncomeThousand,
    net_income_amount: moneyAmount(netIncomeThousand),
    quarterEps,
    warnings: [
      q.grossMargin < q.operatingExpenseRate ? "毛利率低於營業費用率，營業利益可能為負" : null,
      operatingIncomeThousand < 0 ? "營業利益為負" : null,
      netIncomeThousand < 0 ? "稅後淨利為負" : null,
      quarterEps != null && quarterEps < 0 ? "EPS 為負" : null,
    ].filter(Boolean),
  };
}

function fairPriceFromPe(annualEps, peMultiple) {
  if (annualEps == null) return { value: null, label: "資料不足" };
  if (annualEps <= 0) return { value: null, label: "本益比法不適用" };
  if (!Number.isFinite(peMultiple) || peMultiple <= 0) return { value: null, label: "PE 不適用" };
  return { value: annualEps * peMultiple, label: null };
}

function peMeta(valuation, inputs, key, defaultMethod) {
  const userProvided = Boolean(inputs.userPeOverrides?.[key]);
  return {
    pe_source: userProvided ? "使用者自訂" : (valuation?.peRatio && valuation.peRatio > 0 ? "目前市場本益比" : "模型預設假設"),
    pe_as_of_date: userProvided ? new Date().toISOString() : (valuation?.metadata?.reporting_period || null),
    pe_is_user_input: userProvided,
    pe_method: userProvided ? "user_input" : defaultMethod,
  };
}

function calculateScenario(label, completedQuarters, actualCumulativeEps, baseQuarterRevenue, inputs, valuation, options) {
  const forecastQuarters = [];
  for (let q = completedQuarters + 1; q <= 4; q++) {
    forecastQuarters.push(calculateForecastQuarter(baseQuarterRevenue, inputs, q, options));
  }
  const forecastEps = forecastQuarters.reduce((sum, q) => sum + (q.quarterEps ?? 0), 0);
  const hasActual = actualCumulativeEps != null && completedQuarters > 0;
  const annualEps = hasActual ? actualCumulativeEps + forecastEps : (forecastQuarters[0]?.quarterEps == null ? null : forecastQuarters[0].quarterEps * 4);
  const isAnnualized = !hasActual;
  const peMultiple = inputs[options.peKey];
  const fair = fairPriceFromPe(annualEps, peMultiple);
  return {
    label,
    actual_completed_quarters: completedQuarters,
    actual_cumulative_eps: hasActual ? actualCumulativeEps : null,
    forecast_quarters: forecastQuarters,
    annual_eps_method: isAnnualized
      ? "年化 EPS，非完整全年預估"
      : `全年預估 EPS = 已公告 ${completedQuarters} 季累計 EPS + ${forecastQuarters.map((q) => q.quarter).join(" + ")} 模型 EPS`,
    is_annualized: isAnnualized,
    annual_eps: annualEps,
    peMultiple,
    ...peMeta(valuation, inputs, options.peKey, options.peMethod),
    fairPrice: fair.value,
    fairPriceLabel: fair.label,
    warnings: [...new Set([
      ...forecastQuarters.flatMap((q) => q.warnings),
      annualEps != null && annualEps <= 0 ? "全年 EPS 為負或零，本益比法不適用" : null,
      !Number.isFinite(peMultiple) || peMultiple <= 0 ? "PE 為 0、負數或非數字，本益比法不適用" : null,
    ].filter(Boolean))],
  };
}

function buildQuarterOverrides(overrides, defaults) {
  const quarters = {};
  for (const quarter of [2, 3, 4]) {
    const qKey = `q${quarter}`;
    const hasSpecific = ["RevenueGrowth", "GrossMargin", "OperatingExpenseRate", "TaxRate"].some((suffix) => overrides[`${qKey}${suffix}`] != null);
    if (hasSpecific) {
      quarters[`Q${quarter}`] = {
        revenueGrowth: overrides[`${qKey}RevenueGrowth`] ?? overrides.quarterRevenueGrowth ?? defaults.applyAll.revenueGrowth,
        grossMargin: overrides[`${qKey}GrossMargin`] ?? overrides.grossMargin ?? defaults.applyAll.grossMargin,
        operatingExpenseRate: overrides[`${qKey}OperatingExpenseRate`] ?? overrides.operatingExpenseRate ?? defaults.applyAll.operatingExpenseRate,
        taxRate: overrides[`${qKey}TaxRate`] ?? overrides.taxRate ?? defaults.applyAll.taxRate,
        source: "user_input",
      };
    }
  }
  return quarters;
}

function buildEpsModel(revenue, income, valuation, overrides = {}) {
  const defaults = defaultEpsModelInputs(income, valuation);
  const userShareOverride = overrides.sharesOutstanding != null;
  const userPeOverrides = {
    pessimisticPe: overrides.pessimisticPe != null,
    basePe: overrides.basePe != null,
    optimisticPe: overrides.optimisticPe != null,
  };
  const inputs = {
    applyAll: {
      revenueGrowth: overrides.quarterRevenueGrowth ?? defaults.applyAll.revenueGrowth,
      grossMargin: overrides.grossMargin ?? defaults.applyAll.grossMargin,
      operatingExpenseRate: overrides.operatingExpenseRate ?? defaults.applyAll.operatingExpenseRate,
      taxRate: overrides.taxRate ?? defaults.applyAll.taxRate,
    },
    quarters: buildQuarterOverrides(overrides, defaults),
    sharesOutstanding: overrides.sharesOutstanding ?? defaults.sharesOutstanding,
    pessimisticPe: overrides.pessimisticPe ?? defaults.pessimisticPe,
    basePe: overrides.basePe ?? defaults.basePe,
    optimisticPe: overrides.optimisticPe ?? defaults.optimisticPe,
    userPeOverrides,
  };
  const completedQuarters = income?.completedQuarters ?? 0;
  const actualCumulativeEps = income?.cumulativeEps ?? null;
  const baseQuarterRevenue = income?.quarterRevenue || (revenue?.monthlyRevenue ? revenue.monthlyRevenue * 3 : null);
  const shares = Number(inputs.sharesOutstanding || 0);
  const canEstimate = baseQuarterRevenue != null && Number.isFinite(shares) && shares > 0;
  const scenarios = canEstimate
    ? {
        pessimistic: calculateScenario("悲觀情境", completedQuarters, actualCumulativeEps, baseQuarterRevenue, inputs, valuation, {
          growthDelta: -0.05,
          marginDelta: -0.02,
          peKey: "pessimisticPe",
          peMethod: valuation?.peRatio ? "current_market_pe_x_0.75" : "fixed_default_pe_11.3",
        }),
        base: calculateScenario("基準情境", completedQuarters, actualCumulativeEps, baseQuarterRevenue, inputs, valuation, {
          growthDelta: 0,
          marginDelta: 0,
          peKey: "basePe",
          peMethod: valuation?.peRatio ? "current_market_pe" : "fixed_default_pe_15",
        }),
        optimistic: calculateScenario("樂觀情境", completedQuarters, actualCumulativeEps, baseQuarterRevenue, inputs, valuation, {
          growthDelta: 0.05,
          marginDelta: 0.02,
          peKey: "optimisticPe",
          peMethod: valuation?.peRatio ? "current_market_pe_x_1.25" : "fixed_default_pe_18.8",
        }),
      }
    : { pessimistic: null, base: null, optimistic: null };
  const shareInfo = shareAmount(
    Number.isFinite(shares) && shares > 0 ? shares : null,
    userShareOverride ? "使用者假設" : "由公告稅後淨利 / EPS 反推，非官方流通股數",
    userShareOverride ? new Date().toISOString() : income?.metadata?.published_at,
    userShareOverride,
  );
  return {
    is_estimated: true,
    canEstimate,
    inputs,
    baseQuarter: {
      name: income?.metadata?.reporting_period || revenue?.metadata?.reporting_period || null,
      revenue: baseQuarterRevenue,
      revenue_amount: moneyAmount(baseQuarterRevenue),
      is_actual: Boolean(income?.quarterRevenue),
      inference_basis: income?.quarterRevenue ? "最近已公告季度財報營業收入" : "最近月營收 * 3 推估基準季",
      source_period: income?.metadata?.reporting_period || revenue?.metadata?.reporting_period || null,
      published_at: income?.metadata?.published_at || revenue?.metadata?.published_at || null,
    },
    shares: shareInfo,
    forecast_quarters: Array.from({ length: Math.max(0, 4 - completedQuarters) }, (_, i) => `Q${completedQuarters + i + 1}`),
    annual_eps_method: scenarios.base?.annual_eps_method || "資料不足，無法計算全年預估 EPS",
    is_annualized: Boolean(scenarios.base?.is_annualized),
    annual_eps: scenarios.base?.annual_eps ?? null,
    scenarios,
    formula: {
      annualEps: "全年預估 EPS = 已公告季度累計 EPS + 尚未公告季度模型 EPS；若無公告累計 EPS，才標示為年化 EPS。",
      revenue: "各季預估營收 = 基準季營收 * (1 + 該季 revenueGrowth + 情境調整)",
      grossProfit: "毛利 = 各季預估營收 * 該季 grossMargin；毛利率為模型假設，非公司公告毛利率。",
      operatingIncome: "營業利益 = 毛利 - 各季預估營收 * 該季 operatingExpenseRate",
      netIncome: "稅後淨利 = 營業利益 * (1 - 該季 taxRate)",
      eps: "單季 EPS = 稅後淨利(千元) * 1000 / 流通股數(股)",
      fairPrice: "合理價 = 全年預估 EPS * 情境本益比；EPS <= 0 或 PE <= 0 時，本益比法不適用。",
    },
    metadata: sourceMeta({
      data_source: "站內 EPS 模型預估，基礎資料來源：TWSE／TPEx OpenAPI",
      reporting_period: income?.metadata?.reporting_period || revenue?.metadata?.reporting_period || null,
      is_estimated: true,
      confidence: canEstimate ? 0.5 : 0.2,
      source_url: null,
    }),
  };
}

async function buildFinancialSummary(stockNo, overrides = {}) {
  if (process.env.ENABLE_TEST_FIXTURES === "1" && overrides.fixture) {
    if (overrides.fixture === "timeout") throw new Error("AbortError timeout");
    if (overrides.fixture === "empty") throw new Error("查無財務資料");
    if (overrides.fixture === "format") throw new Error("OpenAPI format changed: fixture");
  }
  const [revenue, income, valuation] = await Promise.all([
    fetchLatestRevenueOpenData(stockNo).catch((error) => {
      console.error(JSON.stringify({ level: "warn", stockNo, source: "revenue", error: error.message }));
      return null;
    }),
    fetchLatestIncomeOpenData(stockNo).catch((error) => {
      console.error(JSON.stringify({ level: "warn", stockNo, source: "income", error: error.message }));
      return null;
    }),
    fetchLatestValuationOpenData(stockNo).catch((error) => {
      console.error(JSON.stringify({ level: "warn", stockNo, source: "valuation", error: error.message }));
      return null;
    }),
  ]);
  if (!revenue && !income && !valuation) throw new Error("查無財務資料");
  const epsModel = buildEpsModel(revenue, income, valuation, overrides);
  const completenessCount = [revenue, income, valuation].filter(Boolean).length;
  return {
    stockNo,
    name: income?.companyName || revenue?.companyName || masterStockSync(stockNo)?.shortName || stockMap.get(stockNo)?.name || stockNo,
    actual: {
      completed_quarters: income?.completedQuarters ?? 0,
      cumulative_eps: income?.cumulativeEps ?? null,
      shares_outstanding: epsModel.shares.shares_outstanding,
      shares_unit: epsModel.shares.shares_unit,
      shares_source: epsModel.shares.shares_source,
      shares_as_of_date: epsModel.shares.shares_as_of_date,
      shares_is_user_override: epsModel.shares.shares_is_user_override,
      revenue,
      profitability: income
        ? {
            quarterRevenue: income.quarterRevenue,
            quarterRevenue_amount: income.quarterRevenue_amount,
            eps: income.eps,
            completedQuarters: income.completedQuarters,
            cumulativeEps: income.cumulativeEps,
            grossMargin: income.grossMargin,
            grossMarginStatus: income.grossMarginStatus,
            operatingMargin: income.operatingMargin,
            netMargin: income.netMargin,
            operatingIncome: income.operatingIncome,
            operatingIncome_amount: income.operatingIncome_amount,
            netIncome: income.netIncome,
            netIncome_amount: income.netIncome_amount,
            freeCashFlow: null,
            freeCashFlowStatus: "第一小節尚未接入現金流量表，避免自行推估自由現金流",
            estimatedShares: income.estimatedShares,
            shares: income.shares,
            unit: income.unit,
            metadata: income.metadata,
          }
        : null,
      valuation,
    },
    model: epsModel,
    dataSeparation: {
      actualLabel: "已公告數據：TWSE／TPEx OpenAPI 原始公告或交易所統計",
      modelLabel: "模型預估：使用者輸入假設與站內公式試算，不等同公司公告或投資建議",
    },
    metadata: sourceMeta({
      data_source: "TWSE／TPEx OpenAPI + 站內 EPS 模型",
      published_at: income?.metadata?.published_at || revenue?.metadata?.published_at || valuation?.metadata?.published_at || null,
      reporting_period: income?.metadata?.reporting_period || revenue?.metadata?.reporting_period || valuation?.metadata?.reporting_period || null,
      is_estimated: true,
      confidence: completenessCount >= 3 && epsModel.canEstimate ? 0.58 : 0.38,
      source_url: null,
    }),
  };
}

function twseRows(result) {
  const rows = [];
  for (const item of result?.data || []) {
    rows.push({
      date: parseTaiwanDate(item[0]),
      volume: parseNumber(item[1]),
      amount: parseNumber(item[2]),
      open: parseNumber(item[3]),
      high: parseNumber(item[4]),
      low: parseNumber(item[5]),
      close: parseNumber(item[6]),
      change: parseNumber(item[7]),
      trades: parseNumber(item[8]),
    });
  }
  return rows;
}

function tpexRows(result) {
  const table = result?.tables?.[0];
  const rows = [];
  for (const item of table?.data || []) {
    const volume = parseNumber(item[1]);
    const amount = parseNumber(item[2]);
    rows.push({
      date: parseTaiwanDate(item[0]),
      volume: volume == null ? null : volume * 1000,
      amount: amount == null ? null : amount * 1000,
      open: parseNumber(item[3]),
      high: parseNumber(item[4]),
      low: parseNumber(item[5]),
      close: parseNumber(item[6]),
      change: parseNumber(item[7]),
      trades: parseNumber(item[8]),
    });
  }
  return rows;
}

function finMindRows(result) {
  const rows = [];
  for (const item of result?.data || []) {
    rows.push({
      date: item.date,
      volume: parseNumber(item.Trading_Volume),
      amount: parseNumber(item.Trading_money),
      open: parseNumber(item.open),
      high: parseNumber(item.max),
      low: parseNumber(item.min),
      close: parseNumber(item.close),
      change: parseNumber(item.spread),
      trades: parseNumber(item.Trading_turnover),
    });
  }
  return rows;
}

async function findLatestAvailableMonth(stockNo, fetcher, rowParser) {
  const now = new Date();
  const maxLookbackMonths = 18;
  const batchSize = 6;
  for (let offset = 0; offset < maxLookbackMonths; offset += batchSize) {
    const dates = Array.from({ length: Math.min(batchSize, maxLookbackMonths - offset) }, (_, index) => addMonths(now, -(offset + index)));
    const results = await Promise.all(dates.map((date) => fetcher(stockNo, date).then((result) => ({ date, result })).catch(() => ({ date, result: null }))));
    const found = results.find((item) => rowParser(item.result).length);
    if (found) return found.date;
  }
  throw new Error("找不到可用的交易資料月份");
}

function buildStockPayload(stockNo, title, market, source, rows, sourceUrl) {
  const cleanRows = rows
    .filter((r) => r.open != null && r.high != null && r.low != null && r.close != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const uniqueRows = [...new Map(cleanRows.map((r) => [r.date, r])).values()];
  if (uniqueRows.length < 35) throw new Error("交易資料不足，無法計算技術指標");
  const analysisRows = latestContinuousPriceSegment(uniqueRows);
  const closes = analysisRows.map((r) => r.close);
  const indicators = {
    ma5: sma(closes, 5),
    ma20: sma(closes, 20),
    ma60: sma(closes, 60),
    rsi14: rsi(closes, 14),
    bollinger: bollinger(closes, 20, 2),
    macd: macd(closes),
  };
  const meta = masterStockSync(stockNo);
  return {
    stockNo,
    name: meta?.shortName || meta?.name || stockNo,
    companyId: meta?.companyId || null,
    industry: meta?.industry || "未分類",
    title,
    market,
    source,
    fetchedAt: new Date().toISOString(),
    rows: analysisRows,
    indicators,
    summary: summarize(analysisRows, indicators),
    metadata: sourceMeta({
      data_source: source,
      published_at: analysisRows.at(-1)?.date || null,
      reporting_period: analysisRows.at(-1)?.date || null,
      is_estimated: false,
      confidence: 0.9,
      source_url: sourceUrl,
    }),
  };
}

async function fetchStockFromMarket(stockNo, months, market) {
  const fetcher = market === "tpex" ? fetchTpexMonth : fetchTwseMonth;
  const rowParser = market === "tpex" ? tpexRows : twseRows;
  const latest = await findLatestAvailableMonth(stockNo, fetcher, rowParser);
  const payloads = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = addMonths(latest, -offset);
    payloads.push(fetcher(stockNo, date).catch((error) => ({ error: String(error) })));
  }
  const results = await Promise.all(payloads);
  const rows = [];
  let title = "";
  for (const result of results) {
    if (result.title) title = result.title;
    if (result.tables?.[0]?.subtitle) title = result.tables[0].subtitle;
    rows.push(...rowParser(result));
  }
  const source = market === "tpex" ? "TPEx tradingStock" : "TWSE STOCK_DAY";
  const sourceUrl = market === "tpex" ? tpexTradingStockUrl : twseStockDayUrl;
  return buildStockPayload(stockNo, title, market === "tpex" ? "TPEx" : "TWSE", source, rows, sourceUrl);
}

async function fetchStockFromFinMind(stockNo, months) {
  const result = await fetchFinMind(stockNo, months);
  return buildStockPayload(stockNo, `${stockNo} 交易資料`, "TW", "FinMind TaiwanStockPrice", finMindRows(result), finMindUrl);
}

async function fetchStock(stockNo, months = 12) {
  const meta = masterStockSync(stockNo);
  const preferredMarket = meta?.market === "TPEx" ? "tpex" : meta?.market === "TWSE" && !meta?.isETF ? "twse" : null;
  let twseError;
  let tpexError;
  const marketOrder = preferredMarket ? [preferredMarket] : ["twse", "tpex"];
  for (const market of marketOrder) {
    try {
      return await fetchStockFromMarket(stockNo, months, market);
    } catch (error) {
      if (market === "twse") twseError = error;
      if (market === "tpex") tpexError = error;
    }
  }
  try {
    return await fetchStockFromFinMind(stockNo, months);
  } catch (finMindError) {
    throw new Error(`${twseError?.message || "TWSE skipped"} / ${tpexError?.message || "TPEx skipped"} / ${finMindError.message}`);
  }
}

function parseRevenueRows(result) {
  const rows = [];
  for (const item of result?.data || []) {
    const year = item.revenue_year ?? item.year;
    const month = item.revenue_month ?? item.month;
    const date =
      item.date ||
      (year && month ? `${year}-${String(month).padStart(2, "0")}-01` : item.reporting_period || null);
    const revenue = parseNumber(item.revenue ?? item.Revenue ?? item.monthly_revenue);
    if (!date || revenue == null) continue;
    rows.push({
      date,
      revenue,
      reporting_period: date.slice(0, 7),
      published_at: item.date || date,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchRevenue(stockNo, years = 4) {
  const start = addMonths(new Date(), -(years * 12 + 2)).toISOString().slice(0, 10);
  const url = new URL(finMindUrl);
  url.searchParams.set("dataset", "TaiwanStockMonthRevenue");
  url.searchParams.set("data_id", stockNo);
  url.searchParams.set("start_date", start);
  const result = await fetchJson(url);
  const rows = parseRevenueRows(result);
  if (!rows.length) throw new Error("查無月營收資料");
  const byPeriod = new Map(rows.map((row) => [row.reporting_period, row]));
  return rows.map((row, index) => {
    const [year, month] = row.reporting_period.split("-").map(Number);
    const previousMonth = rows[index - 1];
    const previousYear = byPeriod.get(`${year - 1}-${String(month).padStart(2, "0")}`);
    return {
      ...row,
      mom: previousMonth ? row.revenue / previousMonth.revenue - 1 : null,
      yoy: previousYear ? row.revenue / previousYear.revenue - 1 : null,
    };
  });
}

function analyzeRevenue(rows) {
  if (!rows?.length) return null;
  const latest = rows.at(-1);
  const maxAll = Math.max(...rows.map((row) => row.revenue));
  const recent36 = rows.slice(-36);
  const max36 = Math.max(...recent36.map((row) => row.revenue));
  const last3 = rows.slice(-3);
  const consecutiveYoy = last3.length === 3 && last3.every((row) => row.yoy != null && row.yoy > 0);
  const ytd = rows.filter((row) => row.reporting_period.slice(0, 4) === latest.reporting_period.slice(0, 4));
  const prevYtd = rows.filter((row) => {
    const [year, month] = row.reporting_period.split("-").map(Number);
    const [latestYear, latestMonth] = latest.reporting_period.split("-").map(Number);
    return year === latestYear - 1 && month <= latestMonth;
  });
  const ytdRevenue = ytd.reduce((sum, row) => sum + row.revenue, 0);
  const prevYtdRevenue = prevYtd.reduce((sum, row) => sum + row.revenue, 0);
  const ytdYoy = prevYtdRevenue ? ytdRevenue / prevYtdRevenue - 1 : null;
  const tags = [];
  if (latest.revenue >= maxAll) tags.push("月營收創歷史新高");
  if (latest.revenue >= max36) tags.push("月營收創近三年新高");
  if (consecutiveYoy) tags.push("連續三個月年增");
  if (latest.yoy != null && latest.yoy > 0.2) tags.push("年增率大於 20%");
  if (latest.mom != null && latest.mom > 0.2) tags.push("月增率大於 20%");
  if (ytdYoy != null && ytdYoy > 0) tags.push("累計營收轉正");
  return { latest, tags, ytdYoy };
}

const timelineTypes = new Set(["all", "material", "revenue", "financial", "shareholder", "conference", "news"]);
const timelineMaxRangeDays = 366 * 3;
const timelineTtlMs = 20 * 60 * 1000;
const trustedSourceHosts = new Set(["openapi.twse.com.tw", "www.tpex.org.tw", "api.finmindtrade.com"]);

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !trustedSourceHosts.has(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function rocDate(value) {
  const text = String(value || "").replace(/[^\d]/g, "");
  if (!/^\d{5,7}$/.test(text)) return null;
  const year = Number(text.slice(0, 3)) + 1911;
  const month = text.slice(3, 5) || "01";
  const day = text.slice(5, 7) || "01";
  return `${year}-${month}-${day}`;
}

function rocDateTime(dateValue, timeValue) {
  const date = rocDate(dateValue);
  if (!date) return null;
  const text = String(timeValue || "").replace(/[^\d]/g, "").padStart(6, "0").slice(0, 6);
  return `${date}T${text.slice(0, 2)}:${text.slice(2, 4)}:${text.slice(4, 6)}+08:00`;
}

function dateInRange(dateValue, from, to) {
  if (!dateValue) return true;
  return dateValue >= from && dateValue <= to;
}

function truncateText(value, max = 420) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function normalizeTitle(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/[<>]/g, "").trim();
}

function classifyTimelineText(title, detail = "") {
  const text = `${title || ""} ${detail || ""}`;
  const rules = [];
  const negativeWords = ["未", "無", "否認", "延後", "終止", "取消", "尚未", "澄清", "虧損", "減損", "下修", "處分", "違反", "訴訟"];
  const cautionWords = ["不影響", "預計", "可能", "傳聞", "待確認"];
  const positiveWords = ["創新高", "成長", "通過", "取得", "認證", "核准", "擴產", "量產", "新產品", "客戶", "獲利"];
  const negative = negativeWords.filter((word) => text.includes(word));
  const positive = positiveWords.filter((word) => text.includes(word));
  const caution = cautionWords.filter((word) => text.includes(word));
  if (positive.length) rules.push(`positive_keywords:${positive.join(",")}`);
  if (negative.length) rules.push(`negative_or_negation:${negative.join(",")}`);
  if (caution.length) rules.push(`uncertainty_or_limited_impact:${caution.join(",")}`);
  let sentiment = "neutral";
  if (positive.length && negative.length) sentiment = "mixed";
  else if (negative.length) sentiment = "negative";
  else if (positive.length && caution.length) sentiment = "unknown";
  else if (positive.length) sentiment = "positive";
  else if (caution.length) sentiment = "unknown";
  const confidence = sentiment === "neutral" || sentiment === "unknown" ? 0.45 : negative.length && positive.length ? 0.62 : 0.68;
  const basis = [];
  if (sentiment === "neutral") basis.push("程序性或例行揭露，未辨識出明確營運方向訊號");
  if (sentiment === "unknown") basis.push("內容含預計、可能、傳聞、澄清或不影響等語句，影響待確認");
  if (sentiment === "mixed") basis.push("同一事件同時包含正面與負面或否定訊號");
  if (sentiment === "positive") basis.push("內容含成長、認證、核准、量產或創高等正面訊號，未見否定詞");
  if (sentiment === "negative") basis.push("內容含延後、終止、取消、虧損、違規、訴訟或否定訊號");
  return { sentiment, sentimentConfidence: confidence, sentimentBasis: basis, classificationRules: rules };
}

function timelineEvent({
  market,
  stockNo,
  companyName,
  eventType,
  sourceKind = "official",
  sourceName,
  sourceUrl,
  title,
  sourceSummary = null,
  normalizedSummary = null,
  rawExcerpt = null,
  eventDate = null,
  announcedAt = null,
  publishedAt = null,
  reportingPeriod = null,
  officialSequenceNumber = null,
  computedMetrics = null,
  confidence = 0.85,
  isCached = false,
  cacheFetchedAt = null,
  modelInterpretation = null,
  relatedSources = [],
}) {
  const safeTitle = normalizeTitle(title);
  const analysis = classifyTimelineText(safeTitle, `${sourceSummary || ""} ${normalizedSummary || ""}`);
  const idBase = [market, stockNo, eventType, reportingPeriod, officialSequenceNumber, eventDate, announcedAt, safeTitle].filter(Boolean).join("|");
  return {
    id: `${market || "TW"}-${stockNo}-${eventType}-${stableHash(idBase)}`,
    market,
    stockNo,
    companyName,
    eventType,
    sourceKind,
    sourceName,
    sourceUrl: safeSourceUrl(sourceUrl),
    title: safeTitle,
    sourceSummary: truncateText(sourceSummary, 700),
    normalizedSummary: truncateText(normalizedSummary, 700),
    modelInterpretation: modelInterpretation || {
      summary: analysis.sentimentConfidence < 0.5 ? "影響待確認，需等待後續公告或財報資料驗證。" : "站內規則模型依公告文字初步分類，非投資建議。",
      is_estimated: true,
      confidence: analysis.sentimentConfidence,
    },
    rawExcerpt: truncateText(rawExcerpt, 420),
    eventDate,
    announcedAt,
    publishedAt,
    fetchedAt: new Date().toISOString(),
    eventDateSource: eventDate ? "official_field" : null,
    eventDateIsInferred: false,
    reportingPeriod,
    officialSequenceNumber,
    computedMetrics,
    relatedSources,
    isCached,
    cacheFetchedAt,
    confidence,
    ...analysis,
  };
}

async function fetchOpenDataWithStatus(config, options = {}) {
  const cacheKeyValue = config.url;
  const cached = sourceFetchCache.get(cacheKeyValue);
  const now = Date.now();
  const fixture = options.fixture;
  if (cached && cached.expiresAt > now && fixture !== "timeout") {
    return { rows: cached.rows, status: { ...cached.status, fromCache: true, stale: false } };
  }
  try {
    if (fixture === "timeout" && config.fixtureTarget) throw new Error("AbortError: timeline fixture timeout");
    let rows = null;
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        rows = await fetchJson(config.url);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!Array.isArray(rows)) throw new Error(`OpenAPI format changed: ${config.url}`);
    const status = {
      key: config.key,
      sourceName: config.sourceName,
      ok: true,
      stale: false,
      fromCache: false,
      fetchedAt: new Date().toISOString(),
      lastSuccessfulFetch: new Date().toISOString(),
      message: "ok",
    };
    sourceFetchCache.set(cacheKeyValue, { rows, status, expiresAt: now + timelineTtlMs });
    return { rows, status };
  } catch (error) {
    if (cached) {
      return {
        rows: cached.rows,
        status: {
          ...cached.status,
          ok: false,
          stale: true,
          fromCache: true,
          message: `目前顯示快取資料：${cached.status.lastSuccessfulFetch}`,
          error: String(error.message || error),
        },
      };
    }
    return {
      rows: [],
      status: {
        key: config.key,
        sourceName: config.sourceName,
        ok: false,
        stale: false,
        fromCache: false,
        fetchedAt: new Date().toISOString(),
        lastSuccessfulFetch: null,
        message: "來源暫時無資料",
        error: String(error.message || error),
      },
    };
  }
}

function dedupeTimelineEvents(events) {
  const map = new Map();
  const sourceRank = { official: 4, company: 3, news: 2, model: 1 };
  for (const event of events) {
    const key = [
      event.market,
      event.stockNo,
      event.eventType,
      event.reportingPeriod || "",
      event.officialSequenceNumber || "",
      event.eventDate || event.announcedAt?.slice(0, 10) || event.publishedAt?.slice(0, 10) || "",
      stableHash(event.title),
    ].join("|");
    const existing = map.get(key);
    if (!existing) {
      map.set(key, event);
      continue;
    }
    const keep = (sourceRank[event.sourceKind] || 0) > (sourceRank[existing.sourceKind] || 0) ? event : existing;
    const merge = keep === event ? existing : event;
    keep.relatedSources = [
      ...(keep.relatedSources || []),
      {
        sourceKind: merge.sourceKind,
        sourceName: merge.sourceName,
        sourceUrl: merge.sourceUrl,
        title: merge.title,
        publishedAt: merge.publishedAt,
      },
      ...(merge.relatedSources || []),
    ];
    map.set(key, keep);
  }
  return [...map.values()];
}

function parseTimelineParams(url) {
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || addMonths(new Date(`${to}T00:00:00+08:00`), -12).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw Object.assign(new Error("from/to must be YYYY-MM-DD"), { statusCode: 400 });
  }
  if (from > to) throw Object.assign(new Error("from 不得晚於 to"), { statusCode: 400 });
  const rangeDays = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000;
  if (rangeDays > timelineMaxRangeDays) throw Object.assign(new Error("查詢區間第一版最多 3 年"), { statusCode: 400 });
  const typesRaw = (url.searchParams.get("types") || "all").split(",").map((item) => item.trim()).filter(Boolean);
  const invalid = typesRaw.filter((item) => !timelineTypes.has(item));
  if (invalid.length) throw Object.assign(new Error(`非白名單 types: ${invalid.join(",")}`), { statusCode: 400 });
  const types = typesRaw.includes("all") ? new Set(["material", "revenue", "financial", "shareholder", "conference", "news"]) : new Set(typesRaw);
  return { from, to, types };
}

function materialEventsFromRows(rows, config, stockNo, from, to, status) {
  return rows
    .filter((row) => String(row[config.codeKey] || "").trim() === stockNo)
    .map((row) => {
      const eventDate = rocDate(row["事實發生日"]);
      const announcedAt = rocDateTime(row["發言日期"], row["發言時間"]);
      const publishedAt = rocDate(row["出表日期"] || row.Date);
      if (!dateInRange(eventDate || announcedAt?.slice(0, 10) || publishedAt, from, to)) return null;
      return timelineEvent({
        market: config.market,
        stockNo,
        companyName: row[config.nameKey],
        eventType: "material",
        sourceName: config.sourceName,
        sourceUrl: config.url,
        title: row["主旨 "] || row["主旨"],
        sourceSummary: row["主旨 "] || row["主旨"],
        normalizedSummary: `符合條款：${row["符合條款"] || "--"}`,
        rawExcerpt: row["說明"],
        eventDate,
        announcedAt,
        publishedAt,
        officialSequenceNumber: [row["符合條款"], row["發言日期"], row["發言時間"]].filter(Boolean).join("-"),
        confidence: 0.92,
        isCached: status.fromCache,
        cacheFetchedAt: status.lastSuccessfulFetch,
      });
    })
    .filter(Boolean);
}

function revenueEventFromRows(rows, config, stockNo, from, to, status, historyRows = []) {
  const row = rows.find((item) => String(item["公司代號"] || "").trim() === stockNo);
  if (!row) return null;
  const reportingPeriod = parseRocPeriod(row["資料年月"]);
  const publishedAt = rocDate(row["出表日期"]);
  if (!dateInRange(`${reportingPeriod || publishedAt || ""}-01`.slice(0, 10), from, to)) return null;
  const monthlyRevenue = parseNumber(row["營業收入-當月營收"]);
  const sortedHistory = historyRows.slice().sort((a, b) => a.reporting_period.localeCompare(b.reporting_period));
  const currentPeriod = reportingPeriod;
  const current = sortedHistory.find((item) => item.reporting_period === currentPeriod);
  const valuesUntilCurrent = sortedHistory.filter((item) => item.reporting_period <= currentPeriod);
  const maxWindow = (months) => {
    const values = valuesUntilCurrent.slice(-months).map((item) => item.revenue);
    return values.length ? Math.max(...values) : null;
  };
  const maxAll = valuesUntilCurrent.length ? Math.max(...valuesUntilCurrent.map((item) => item.revenue)) : null;
  const metrics = {
    data_source: "站內計算，基礎資料來源：TWSE／TPEx OpenAPI 與 FinMind TaiwanStockMonthRevenue",
    monthlyRevenue,
    mom: parsePercentNumber(row["營業收入-上月比較增減(%)"]),
    yoy: parsePercentNumber(row["營業收入-去年同月增減(%)"]),
    cumulativeYoy: parsePercentNumber(row["累計營業收入-前期比較增減(%)"]),
    isAllTimeHigh: maxAll == null || monthlyRevenue == null ? null : monthlyRevenue >= maxAll,
    isHigh12m: maxWindow(12) == null || monthlyRevenue == null ? null : monthlyRevenue >= maxWindow(12),
    isHigh24m: maxWindow(24) == null || monthlyRevenue == null ? null : monthlyRevenue >= maxWindow(24),
    isHigh36m: maxWindow(36) == null || monthlyRevenue == null ? null : monthlyRevenue >= maxWindow(36),
    comparisonStatus: current ? "computed" : "history_missing",
  };
  return timelineEvent({
    market: config.market,
    stockNo,
    companyName: row["公司名稱"],
    eventType: "revenue",
    sourceName: config.sourceName,
    sourceUrl: config.url,
    title: `${row["公司名稱"] || stockNo} ${reportingPeriod || ""} 月營收公告`,
    sourceSummary: row["備註"] && row["備註"] !== "-" ? row["備註"] : null,
    normalizedSummary: `月營收 ${monthlyRevenue ?? "--"} 千元，MoM ${row["營業收入-上月比較增減(%)"] || "--"}%，YoY ${row["營業收入-去年同月增減(%)"] || "--"}%`,
    rawExcerpt: row["備註"],
    eventDate: null,
    announcedAt: publishedAt ? `${publishedAt}T00:00:00+08:00` : null,
    publishedAt,
    reportingPeriod,
    officialSequenceNumber: reportingPeriod,
    computedMetrics: metrics,
    confidence: 0.9,
    isCached: status.fromCache,
    cacheFetchedAt: status.lastSuccessfulFetch,
  });
}

function financialEventFromData(data, stockNo, from, to) {
  const profit = data?.actual?.profitability;
  if (!profit?.metadata?.reporting_period) return null;
  const reportingPeriod = profit.metadata.reporting_period;
  const publishedAt = profit.metadata.published_at;
  const periodDate = reportingPeriod.replace("Q1", "-03-31").replace("Q2", "-06-30").replace("Q3", "-09-30").replace("Q4", "-12-31");
  if (!dateInRange(publishedAt || periodDate, from, to)) return null;
  return timelineEvent({
    market: data.market || null,
    stockNo,
    companyName: data.name,
    eventType: "financial",
    sourceName: profit.metadata.data_source,
    sourceUrl: profit.metadata.source_url,
    title: `${data.name || stockNo} ${reportingPeriod} 財報資料`,
    sourceSummary: null,
    normalizedSummary: `EPS ${profit.eps ?? "--"}，營益率 ${profit.operatingMargin == null ? "--" : (profit.operatingMargin * 100).toFixed(1) + "%"}，淨利率 ${profit.netMargin == null ? "--" : (profit.netMargin * 100).toFixed(1) + "%"}`,
    eventDate: null,
    announcedAt: publishedAt ? `${publishedAt}T00:00:00+08:00` : null,
    publishedAt,
    reportingPeriod,
    officialSequenceNumber: reportingPeriod,
    computedMetrics: {
      data_source: "站內整合，基礎資料來源：TWSE／TPEx OpenAPI",
      revenue: profit.quarterRevenue ?? null,
      grossMargin: profit.grossMargin ?? null,
      operatingMargin: profit.operatingMargin ?? null,
      netMargin: profit.netMargin ?? null,
      eps: profit.eps ?? null,
      reportingPeriod,
    },
    confidence: 0.88,
  });
}

function shareholderEventsFromRows(rows, config, stockNo, from, to, status) {
  return rows
    .filter((row) => String(row["公司代號"] || "").trim() === stockNo)
    .map((row) => {
      const meetingDate = rocDate(row["股東常(臨時)會日期-日期"]);
      const announcedDate = rocDate(row["公告日期"]);
      if (!dateInRange(meetingDate || announcedDate, from, to)) return null;
      return timelineEvent({
        market: config.market,
        stockNo,
        companyName: row["公司名稱"],
        eventType: "shareholder",
        sourceName: config.sourceName,
        sourceUrl: config.url,
        title: `${row["公司名稱"] || stockNo} 股東${row["股東常(臨時)會日期-常或臨時"] || ""}公告`,
        sourceSummary: null,
        normalizedSummary: `股東會日期：${meetingDate || "--"}，停止過戶：${rocDate(row["停止過戶起訖日期-起"]) || "--"} 至 ${rocDate(row["停止過戶起訖日期-訖"]) || "--"}`,
        eventDate: meetingDate,
        announcedAt: announcedDate ? rocDateTime(row["公告日期"], row["公告時間"]) : null,
        publishedAt: rocDate(row["出表日期"]),
        officialSequenceNumber: [meetingDate, row["種類"]].filter(Boolean).join("-"),
        confidence: 0.86,
        isCached: status.fromCache,
        cacheFetchedAt: status.lastSuccessfulFetch,
      });
    })
    .filter(Boolean);
}

function applyTimelineFixtures(events, fixture, stockNo) {
  if (process.env.ENABLE_TEST_FIXTURES !== "1") return events;
  if (fixture === "duplicate" && events[0]) return [...events, { ...events[0], id: `${events[0].id}-duplicate` }];
  if (fixture === "related" && events[0]) {
    return [
      ...events,
      {
        ...events[0],
        id: `${events[0].id}-news`,
        sourceKind: "news",
        sourceName: "fixture news",
        sourceUrl: null,
      },
    ];
  }
  if (fixture === "negation") {
    return [
      timelineEvent({
        market: "fixture",
        stockNo,
        companyName: stockNo,
        eventType: "material",
        sourceName: "fixture",
        sourceUrl: twseMaterialInfoUrl,
        title: "澄清未取得客戶認證且擴產延後",
        sourceSummary: "測試否定詞分類",
        eventDate: new Date().toISOString().slice(0, 10),
        confidence: 1,
      }),
    ];
  }
  if (fixture === "mixed") {
    return [
      timelineEvent({
        market: "fixture",
        stockNo,
        companyName: stockNo,
        eventType: "revenue",
        sourceName: "fixture",
        sourceUrl: twseRevenueUrl,
        title: "月營收創新高但虧損擴大",
        sourceSummary: "測試正負訊號並存",
        eventDate: new Date().toISOString().slice(0, 10),
        confidence: 1,
      }),
    ];
  }
  return events;
}

async function buildTimeline(stockNo, params, options = {}) {
  const sourceStatus = [];
  const events = [];
  const sourceConfigs = [
    { key: "twse-material", market: "TWSE", url: twseMaterialInfoUrl, sourceName: "TWSE OpenAPI t187ap04_L", codeKey: "公司代號", nameKey: "公司名稱", fixtureTarget: true },
    { key: "tpex-material", market: "TPEx", url: tpexMaterialInfoUrl, sourceName: "TPEx OpenAPI mopsfin_t187ap04_O", codeKey: "SecuritiesCompanyCode", nameKey: "CompanyName", fixtureTarget: true },
    { key: "twse-revenue", market: "TWSE", url: twseRevenueUrl, sourceName: "TWSE OpenAPI t187ap05_L" },
    { key: "tpex-revenue", market: "TPEx", url: tpexRevenueUrl, sourceName: "TPEx OpenAPI mopsfin_t187ap05_O" },
    { key: "twse-shareholder", market: "TWSE", url: twseShareholderUrl, sourceName: "TWSE OpenAPI t187ap38_L" },
  ];

  const historyRows = await fetchRevenue(stockNo, 4).catch(() => []);
  if (params.types.has("material")) {
    for (const config of sourceConfigs.filter((item) => item.key.includes("material"))) {
      const { rows, status } = await fetchOpenDataWithStatus(config, options);
      sourceStatus.push(status);
      events.push(...materialEventsFromRows(rows, config, stockNo, params.from, params.to, status));
    }
  }
  if (params.types.has("revenue")) {
    for (const config of sourceConfigs.filter((item) => item.key.includes("revenue"))) {
      const { rows, status } = await fetchOpenDataWithStatus(config, options);
      sourceStatus.push(status);
      const event = revenueEventFromRows(rows, config, stockNo, params.from, params.to, status, historyRows);
      if (event) events.push(event);
    }
  }
  if (params.types.has("financial")) {
    const financial = await buildFinancialSummary(stockNo).catch((error) => {
      sourceStatus.push({ key: "financial", sourceName: "TWSE/TPEx financial OpenAPI", ok: false, stale: false, message: error.message });
      return null;
    });
    const event = financialEventFromData(financial, stockNo, params.from, params.to);
    if (event) events.push(event);
  }
  if (params.types.has("shareholder")) {
    const config = sourceConfigs.find((item) => item.key === "twse-shareholder");
    const { rows, status } = await fetchOpenDataWithStatus(config, options);
    sourceStatus.push(status);
    events.push(...shareholderEventsFromRows(rows, config, stockNo, params.from, params.to, status));
    sourceStatus.push({ key: "tpex-shareholder", sourceName: "TPEx shareholder meeting OpenAPI", ok: false, stale: false, message: "第一版尚未確認穩定官方端點，未接入" });
  }
  if (params.types.has("conference")) {
    sourceStatus.push({ key: "conference", sourceName: "Investor conference source", ok: false, stale: false, message: "第一版保留可插拔介面，尚未接入穩定官方資料源" });
  }
  if (params.types.has("news")) {
    sourceStatus.push({ key: "news", sourceName: "External news source", ok: false, stale: false, message: "第一版保留可插拔介面，未接入外部新聞正式資料" });
  }

  const fixtureEvents = applyTimelineFixtures(events, options.fixture, stockNo);
  const deduped = dedupeTimelineEvents(fixtureEvents).sort((a, b) => {
    const ad = a.eventDate || a.announcedAt || a.publishedAt || "";
    const bd = b.eventDate || b.announcedAt || b.publishedAt || "";
    return bd.localeCompare(ad);
  });
  const companyName = deduped.find((item) => item.companyName)?.companyName || masterStockSync(stockNo)?.shortName || stockMap.get(stockNo)?.name || stockNo;
  const staleCount = sourceStatus.filter((item) => item.stale).length;
  return {
    stockNo,
    companyName,
    from: params.from,
    to: params.to,
    items: deduped,
    sourceStatus,
    coverage: {
      official: sourceStatus.some((item) => item.ok || item.fromCache),
      company: false,
      news: false,
    },
    cacheNotice: staleCount ? `目前顯示快取資料，${staleCount} 個來源使用最近一次成功快取。` : null,
    metadata: sourceMeta({
      data_source: "TWSE／TPEx OpenAPI + station timeline model",
      reporting_period: `${params.from}..${params.to}`,
      is_estimated: false,
      confidence: sourceStatus.some((item) => item.ok || item.fromCache) ? 0.84 : 0.25,
      source_url: null,
    }),
  };
}

function average(values) {
  const clean = values.filter((value) => value != null && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function technicalSnapshot(data) {
  const rows = data.rows;
  const i = rows.length - 1;
  const last = rows[i];
  const prev = rows[i - 1];
  const ma20 = data.indicators.ma20[i];
  const ma60 = data.indicators.ma60[i];
  const rsi14 = data.indicators.rsi14[i];
  const hist = data.indicators.macd.hist[i];
  const avg20Vol = average(rows.slice(-21, -1).map((row) => row.volume));
  const recentHigh = Math.max(...rows.slice(-61, -1).map((row) => row.high));
  const volumeRatio = avg20Vol ? last.volume / avg20Vol : null;
  const breakout = last.close > recentHigh && (volumeRatio == null || volumeRatio >= 1.2);
  let score = 50;
  if (ma20 != null && last.close > ma20) score += 10;
  if (ma60 != null && last.close > ma60) score += 10;
  if (hist != null && hist > 0) score += 10;
  if (rsi14 != null && rsi14 > 50 && rsi14 < 75) score += 8;
  if (breakout) score += 12;
  if (rsi14 != null && rsi14 >= 80) score -= 8;
  if (prev && last.close < prev.close && volumeRatio != null && volumeRatio > 1.5) score -= 8;
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    breakout,
    volumeRatio,
    reason: breakout ? "收盤突破近 60 日高點且量能放大" : data.summary.signals[0] || "技術面無明顯突破訊號",
  };
}

function buildScoreItem(label, score, basis, meta) {
  return {
    label,
    score,
    included: typeof score === "number",
    basis,
    formula: null,
    metadata: meta,
  };
}

const scoringFormula = [
  {
    key: "revenue",
    label: "營收",
    formula: "若有最新月營收年增率 YoY：score = clamp(20, 95, round(50 + YoY * 100))；無 YoY 時不納入總分。",
  },
  {
    key: "eps",
    label: "EPS 與獲利",
    formula: "第一階段尚未接入季財報 EPS；顯示尚無資料，不納入總分。",
  },
  {
    key: "gross_margin",
    label: "毛利率",
    formula: "第一階段尚未接入財報毛利率；顯示尚無資料，不納入總分。",
  },
  {
    key: "institutional",
    label: "法人籌碼",
    formula: "第一階段尚未接入三大法人買賣超；顯示尚無資料，不納入總分。",
  },
  {
    key: "technical",
    label: "技術面",
    formula: "基準 50；收盤站上 MA20 +10、站上 MA60 +10、MACD 柱狀體為正 +10、RSI 50-75 +8、突破近 60 日高點且量能大於 1.2 倍 +12、RSI >= 80 -8、放量下跌 -8；最後限制在 0-100。",
  },
  {
    key: "news_theme",
    label: "新聞題材",
    formula: "第一階段尚未接入新聞與法說資料；顯示尚無資料，不納入總分。",
  },
  {
    key: "industry_cycle",
    label: "產業景氣",
    formula: "第一階段只有站內分類，沒有客觀景氣數據；顯示尚無資料，不納入總分。",
  },
  {
    key: "valuation",
    label: "估值",
    formula: "第一階段尚未接入本益比、股價淨值比與同業估值；顯示尚無資料，不納入總分。",
  },
];

function buildAiSummary(stockData, revenueRows) {
  const tech = technicalSnapshot(stockData);
  const revenue = analyzeRevenue(revenueRows);
  const priceMeta = stockData.metadata;
  const revenueMeta = revenue?.latest
    ? sourceMeta({
        data_source: "FinMind TaiwanStockMonthRevenue",
        published_at: revenue.latest.published_at,
        reporting_period: revenue.latest.reporting_period,
        is_estimated: false,
        confidence: 0.82,
        source_url: finMindUrl,
      })
    : sourceMeta({
        data_source: "尚未取得",
        is_estimated: false,
        confidence: 0,
        source_url: null,
      });

  const revenueScore =
    revenue?.latest?.yoy == null ? null : Math.max(20, Math.min(95, Math.round(50 + revenue.latest.yoy * 100)));
  const items = [
    buildScoreItem(
      "營收成長",
      revenueScore,
      revenue
        ? `最新月營收 ${revenue.latest.reporting_period}，年增 ${revenue.latest.yoy == null ? "無去年同期" : `${(revenue.latest.yoy * 100).toFixed(1)}%`}，月增 ${revenue.latest.mom == null ? "無前月" : `${(revenue.latest.mom * 100).toFixed(1)}%`}`
        : "目前未取得月營收資料",
      revenueMeta,
    ),
    buildScoreItem("EPS 與獲利", null, "第一階段尚未接入季財報 EPS 資料源，分數不納入總分", sourceMeta({ data_source: "未接入", confidence: 0 })),
    buildScoreItem("毛利率", null, "第一階段尚未接入財報毛利率資料源，分數不納入總分", sourceMeta({ data_source: "未接入", confidence: 0 })),
    buildScoreItem("法人籌碼", null, "第一階段尚未接入三大法人買賣超資料源，分數不納入總分", sourceMeta({ data_source: "未接入", confidence: 0 })),
    buildScoreItem("技術面", tech.score, tech.reason, priceMeta),
    buildScoreItem("新聞與題材", null, "第一階段不抓新聞全文，避免把市場傳聞當成公告", sourceMeta({ data_source: "未接入", confidence: 0 })),
    buildScoreItem("產業景氣", null, `目前只有站內產業分類：${stockData.industry}，尚未接入客觀產業景氣數據，分數不納入總分`, sourceMeta({ data_source: "站內產業分類", is_estimated: true, confidence: 0.25 })),
    buildScoreItem("估值", null, "第一階段尚未接入本益比與股價淨值比，分數不納入總分", sourceMeta({ data_source: "未接入", confidence: 0 })),
  ];
  items.forEach((item, index) => {
    item.formula = scoringFormula[index]?.formula || null;
  });
  const scored = items.filter((item) => typeof item.score === "number");
  const total = scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length) : 0;
  const grade = total >= 80 ? "A" : total >= 65 ? "B" : total >= 50 ? "C" : "D";
  const trendStatus = tech.score >= 65 ? "偏多" : tech.score <= 40 ? "偏空" : "中性";
  const completeness = { scored: scored.length, total: items.length, label: `${scored.length}/${items.length}` };
  const confidence = scored.length >= 6 ? 0.75 : scored.length >= 4 ? 0.58 : scored.length >= 2 ? 0.42 : 0.25;
  const confidenceLabel = confidence >= 0.7 ? "中高" : confidence >= 0.5 ? "中" : "中低";
  const noteworthy = [];
  if (revenue?.tags?.length) noteworthy.push(...revenue.tags);
  if (tech.breakout) noteworthy.push("技術面突破");
  if (!noteworthy.length) noteworthy.push("目前沒有明確異常訊號，適合放入觀察名單");
  const risks = [];
  if (stockData.summary.rsi14 != null && stockData.summary.rsi14 >= 75) risks.push("RSI 偏高，短線可能過熱");
  if (stockData.summary.close < stockData.summary.ma60) risks.push("股價仍低於 MA60，中期趨勢未完全轉強");
  if (!revenue) risks.push("營收資料未取得，基本面判斷信心較低");
  if (!risks.length) risks.push("資料源仍未涵蓋法人、估值與財報細項，需搭配公告確認");
  return {
    stockNo: stockData.stockNo,
    name: stockData.name,
    aiScore: total,
    grade,
    trendStatus,
    scoreCoverage: completeness,
    confidence,
    confidenceLabel,
    oneLineConclusion: `${stockData.name} 目前 AI 綜合評分 ${total}，技術趨勢${trendStatus}，${noteworthy[0]}。`,
    noteworthy,
    risks,
    importantDates: revenue?.latest ? [`最近月營收資料期：${revenue.latest.reporting_period}`] : ["最近月營收資料期：尚未取得"],
    scoreItems: items,
    scoringFormula,
    metadata: sourceMeta({ data_source: "站內模型計算，基礎資料來源：TWSE／TPEx／FinMind", is_estimated: true, confidence }),
  };
}

async function quoteFromStockData(item) {
  const data = await fetchStockFromFinMind(item.symbol, 3);
  const last = data.rows.at(-1);
  const prev = data.rows.at(-2);
  const change = prev ? last.close - prev.close : 0;
  const changePct = prev ? change / prev.close : 0;
  return {
    ...item,
    price: last.close,
    change,
    changePct,
    date: last.date,
    type: "proxy",
    metadata: sourceMeta({
      data_source: data.source,
      published_at: last.date,
      reporting_period: last.date,
      is_estimated: false,
      confidence: 0.72,
      source_url: finMindUrl,
    }),
  };
}

let industryQuoteCache = null;
let industryQuoteCacheAt = 0;

async function fetchIndustryQuotes() {
  const now = Date.now();
  if (industryQuoteCache && now - industryQuoteCacheAt < 5 * 60 * 1000) return industryQuoteCache;
  const items = await Promise.all(
    industryQuoteItems.map(async (item) => {
      try {
        return await quoteFromStockData(item);
      } catch (error) {
        return {
          ...item,
          error: String(error.message || error),
          type: "proxy",
          metadata: sourceMeta({ data_source: "代理指標讀取失敗", confidence: 0 }),
        };
      }
    }),
  );
  industryQuoteCache = {
    fetchedAt: new Date().toISOString(),
    note: "產業報價目前以 ETF 或代表性台股作為代理指標，不等同現貨報價；AI 推論與資料來源分開標示。",
    items,
  };
  industryQuoteCacheAt = now;
  return industryQuoteCache;
}

async function buildDashboard() {
  const fetchedAt = new Date().toISOString();
  const settled = await Promise.allSettled(
    dashboardUniverse.map(async (stockNo) => {
      const data = await fetchStockFromFinMind(stockNo, 8);
      const revenueRows = await fetchRevenue(stockNo, 4).catch(() => []);
      const ai = buildAiSummary(data, revenueRows);
      const revenue = analyzeRevenue(revenueRows);
      const tech = technicalSnapshot(data);
      return { data, ai, revenue, tech };
    }),
  );
  const rows = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => {
      const { data, ai, revenue, tech } = item.value;
      return {
        stockNo: data.stockNo,
        name: data.name,
        industry: data.industry,
        price: data.summary.close,
        changePct: safePct(data.summary.changePct),
        aiScore: ai.aiScore,
        reason: [...(revenue?.tags || []), tech.breakout ? "技術面突破" : ""].filter(Boolean).join("、") || ai.noteworthy[0],
        risk: ai.risks[0],
        dataDate: data.summary.date,
        metadata: data.metadata,
        revenue,
        tech,
      };
    });
  const revenueAnomalies = rows
    .filter((row) => row.revenue?.tags?.length)
    .sort((a, b) => (b.revenue.latest.yoy || 0) - (a.revenue.latest.yoy || 0))
    .slice(0, 8);
  const technicalBreakouts = rows.filter((row) => row.tech.breakout).sort((a, b) => b.tech.score - a.tech.score).slice(0, 8);
  const themes = [...new Map(rows.map((row) => [row.industry.split("/")[0].trim(), 0]))]
    .map(([theme]) => ({
      theme,
      count: rows.filter((row) => row.industry.startsWith(theme)).length,
      avgScore: Math.round(average(rows.filter((row) => row.industry.startsWith(theme)).map((row) => row.aiScore)) || 0),
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 8);
  const quotes = await fetchIndustryQuotes().catch(() => ({ items: [] }));
  const priceEvents = (quotes.items || [])
    .filter((item) => !item.error)
    .sort((a, b) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0))
    .slice(0, 6)
    .map((item) => ({
      item: item.name,
      direction: item.changePct >= 0 ? "上漲" : "下跌",
      changePct: item.changePct,
      source: item.note,
      sourceDate: item.date,
      confidence: item.metadata.confidence,
      aiInference: "以代理指標衡量產業價格或景氣波動，需再比對現貨或公司公告。",
      metadata: item.metadata,
    }));
  return {
    today: new Date().toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }),
    fetchedAt,
    lastUpdatedAt: rows.map((row) => row.dataDate).sort().at(-1) || null,
    dataStatus: rows.length ? "ok" : "partial",
    appVersion,
    gitCommit,
    deployedAt,
    frontendVersion,
    includedCommits,
    universeScope: {
      label: "第一階段核心觀察池",
      count: dashboardUniverse.length,
      listedOrTpex: "上市與上櫃股票皆可能包含，依資料源可取得者納入",
      excludes: "ETF、權證、期貨、選擇權、金融商品代理報價不納入股票排行",
      rankingFormula: "AI 分數優先；營收異常依最新月營收 YoY 排序；技術突破依技術分數排序",
      missingDataPolicy: "缺少交易或營收資料時排除該排行，不補假資料",
    },
    noteworthyStocks: rows.sort((a, b) => b.aiScore - a.aiScore).slice(0, 8),
    revenueAnomalies,
    institutionalAnomalies: {
      status: "not_connected",
      message: "法人買賣超資料源尚未接入；第一階段不產生猜測排行。",
      metadata: sourceMeta({ data_source: "未接入", confidence: 0 }),
    },
    technicalBreakouts,
    priceEvents,
    hotThemes: themes,
    metadata: sourceMeta({ data_source: "站內 API 彙整", is_estimated: true, confidence: 0.62 }),
  };
}

async function buildRevenueRadar(filter = "all") {
  const settled = await Promise.allSettled(
    dashboardUniverse.map(async (stockNo) => {
      const meta = masterStockSync(stockNo);
      const revenueRows = await fetchRevenue(stockNo, 4);
      const revenue = analyzeRevenue(revenueRows);
      if (!revenue) return null;
      const stockData = await fetchStockFromFinMind(stockNo, 4).catch(() => null);
      const priceLag =
        stockData && revenue.latest.yoy != null
          ? revenue.latest.yoy > 0.2 && stockData.summary.changePct != null && stockData.summary.changePct < 0.08
          : false;
      const items = [...revenue.tags];
      if (priceLag) items.push("營收成長但股價尚未明顯上漲");
      const row = {
        stockNo,
        name: meta?.shortName || meta?.name || stockNo,
        industry: meta?.industry || "未分類",
        latestRevenue: revenue.latest.revenue,
        yoy: revenue.latest.yoy,
        mom: revenue.latest.mom,
        ytdYoy: revenue.ytdYoy,
        tags: items,
        price: stockData?.summary.close ?? null,
        priceChangePct: stockData?.summary.changePct ?? null,
        dataDate: revenue.latest.reporting_period,
        metadata: sourceMeta({
          data_source: "FinMind TaiwanStockMonthRevenue",
          published_at: revenue.latest.published_at,
          reporting_period: revenue.latest.reporting_period,
          is_estimated: false,
          confidence: 0.82,
          source_url: finMindUrl,
        }),
      };
      return row;
    }),
  );
  let rows = settled.filter((item) => item.status === "fulfilled" && item.value).map((item) => item.value);
  if (filter !== "all") rows = rows.filter((row) => row.tags.includes(filter));
  return {
    fetchedAt: new Date().toISOString(),
    filter,
    universeScope: {
      label: "第一階段核心觀察池，不是全市場排行",
      scannedStocks: dashboardUniverse,
      scannedCount: dashboardUniverse.length,
      listedOrTpex: "上市與上櫃股票依 FinMind 月營收可取得資料納入",
      excludes: "ETF、權證、期貨、選擇權、金融商品不納入",
      rankingFormula: "符合篩選條件後，以最新月營收年增率 YoY 由高到低排序",
      missingDataPolicy: "缺少月營收或股價資料時排除該條目，不產生假排行",
    },
    filters: [
      "all",
      "月營收創歷史新高",
      "月營收創近三年新高",
      "連續三個月年增",
      "年增率大於 20%",
      "月增率大於 20%",
      "累計營收轉正",
      "營收成長但股價尚未明顯上漲",
      "營收成長且法人開始買超",
    ],
    rows: rows.sort((a, b) => (b.yoy || -9) - (a.yoy || -9)).slice(0, 30),
    unavailableFilters: ["營收成長且法人開始買超"],
    metadata: sourceMeta({ data_source: "FinMind TaiwanStockMonthRevenue + 站內價格資料", is_estimated: true, confidence: 0.68 }),
  };
}

async function buildAiSummaryResponse(stockNo) {
  const stockData = await fetchStock(stockNo, 12);
  const revenueRows = await fetchRevenue(stockNo, 4).catch(() => []);
  return buildAiSummary(stockData, revenueRows);
}

async function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/favicon.ico") {
    res.writeHead(204, securityHeaders());
    res.end();
    return;
  }
  const filePath = path.normalize(path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    const headers = {
      ...securityHeaders(),
      "content-type": mime[path.extname(filePath)] || "application/octet-stream",
      "content-length": body.length,
    };
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!rateLimit(req, res)) return;
    if (url.pathname === "/api/health") {
      sendSuccess(res, { ok: true, fetchedAt: new Date().toISOString() }, 200, sourceMeta({ data_source: "server", confidence: 1 }));
      return;
    }
    if (url.pathname === "/api/version") {
      sendSuccess(
        res,
        {
          appVersion,
          gitCommit,
          deployedAt,
          apiDataUpdatedAt: new Date().toISOString(),
          frontendVersion,
          includedCommits,
          render: {
            serviceId: process.env.RENDER_SERVICE_ID || null,
            serviceName: process.env.RENDER_SERVICE_NAME || null,
            gitBranch: process.env.RENDER_GIT_BRANCH || null,
          },
        },
        200,
        sourceMeta({ data_source: "server runtime", reporting_period: gitCommit, is_estimated: false, confidence: 1 }),
      );
      return;
    }
    if (url.pathname === "/api/master/status") {
      if (!assertAccess(url, res)) return;
      const master = await loadMasterData();
      const search = await loadSearchIndex().catch(() => null);
      sendSuccess(
        res,
        {
          schemaVersion: master.version?.schemaVersion || null,
          buildVersion: master.version?.buildVersion || null,
          generatedAt: master.version?.generatedAt || null,
          recordCount: master.version?.recordCount || { total: master.stocks.length },
          stale: Boolean(master.version?.stale),
          sourceStatus: master.version?.sourceStatus || [],
          checksum: master.version?.checksum || null,
          cache: {
            masterLoadedAt: master.loadedAt,
            masterCacheHit: master.cacheHit,
            searchLoadedAt: search?.loadedAt || null,
            searchCacheHit: search?.cacheHit ?? null,
            indexDocumentCount: search?.index?.documentCount || null,
          },
          incrementalUpdate: master.version?.incrementalUpdate || null,
          serverRuntime: {
            uptimeSec: Math.round(process.uptime()),
            memoryUsage: process.memoryUsage(),
            rateLimitMax,
          },
        },
        200,
        sourceMeta({ data_source: "Master Data memory cache", reporting_period: master.version?.checksum || null, confidence: 0.95 }),
      );
      return;
    }
    if (url.pathname === "/api/master") {
      if (!assertAccess(url, res)) return;
      const master = await loadMasterData();
      const type = url.searchParams.get("type") || "stocks";
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 5000), 1), 5000);
      const payload = {
        fetchedAt: new Date().toISOString(),
        version: master.version,
        type,
        items:
          type === "products"
            ? master.products.slice(0, limit)
            : type === "topics"
              ? master.topics.slice(0, limit)
              : type === "companies"
                ? master.companies.slice(0, limit)
                : master.stocks.slice(0, limit),
        metadata: sourceMeta({ data_source: "Master Data JSON + memory cache", reporting_period: master.version?.checksum || null, confidence: 0.95 }),
      };
      sendSuccess(res, payload);
      return;
    }
    if (url.pathname === "/api/search" || url.pathname === "/api/search/suggestions") {
      if (!assertAccess(url, res)) return;
      await loadMasterData();
      const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
      const limit = url.pathname.endsWith("/suggestions") ? 10 : Number(url.searchParams.get("limit") || 20);
      const data = await runSearch(query, { limit, suggestions: url.pathname.endsWith("/suggestions") });
      sendSuccess(res, data, 200, sourceMeta({ data_source: "Search Index memory cache", reporting_period: data.metadata?.indexDocumentCount || null, confidence: 0.9 }));
      return;
    }
    if (url.pathname === "/api/search/history" || url.pathname === "/api/search/recent") {
      if (!assertAccess(url, res)) return;
      sendSuccess(res, { fetchedAt: new Date().toISOString(), items: [], note: "User-specific search history is reserved for the account sync phase." }, 200, sourceMeta({ data_source: "search history placeholder", confidence: 0.6 }));
      return;
    }
    if (url.pathname === "/api/search/popular") {
      if (!assertAccess(url, res)) return;
      const data = await runSearch("", { limit: 10 });
      const { index } = await loadSearchIndex();
      const items = Object.values(index.documents)
        .sort((a, b) => Number(b.popularityWeight || 0) - Number(a.popularityWeight || 0))
        .slice(0, 10);
      sendSuccess(res, { fetchedAt: new Date().toISOString(), items, metadata: data.metadata }, 200, sourceMeta({ data_source: "Search Index popularityWeight", confidence: 0.75 }));
      return;
    }
    if (url.pathname === "/api/universe") {
      if (!assertAccess(url, res)) return;
      const master = await loadMasterData();
      sendSuccess(res, { fetchedAt: new Date().toISOString(), items: master.stocks }, 200, sourceMeta({ data_source: "Master Data stock universe", confidence: 0.95 }));
      return;
    }
    if (url.pathname === "/api/twse") {
      if (!assertAccess(url, res)) return;
      const stockNo = url.searchParams.get("stockNo") || "2330";
      await requireMasterStock(stockNo);
      const months = Math.min(Math.max(Number(url.searchParams.get("months") || 12), 3), 36);
      const data = await fetchStock(stockNo, months);
      sendSuccess(res, data);
      return;
    }
    if (url.pathname === "/api/ai-summary") {
      if (!assertAccess(url, res)) return;
      const stockNo = url.searchParams.get("stockNo") || "2330";
      await requireMasterStock(stockNo);
      const { data } = await withCache(cacheKey(url.pathname, url.searchParams), 10 * 60 * 1000, () => buildAiSummaryResponse(stockNo));
      sendSuccess(res, data);
      return;
    }
    if (url.pathname === "/api/financial") {
      if (!assertAccess(url, res)) return;
      const stockNo = url.searchParams.get("stockNo") || "2330";
      await requireMasterStock(stockNo);
      const overrides = {
        quarterRevenueGrowth: url.searchParams.has("quarterRevenueGrowth") ? Number(url.searchParams.get("quarterRevenueGrowth")) : undefined,
        grossMargin: url.searchParams.has("grossMargin") ? Number(url.searchParams.get("grossMargin")) : undefined,
        operatingExpenseRate: url.searchParams.has("operatingExpenseRate") ? Number(url.searchParams.get("operatingExpenseRate")) : undefined,
        taxRate: url.searchParams.has("taxRate") ? Number(url.searchParams.get("taxRate")) : undefined,
        sharesOutstanding: url.searchParams.has("sharesOutstanding") ? Number(url.searchParams.get("sharesOutstanding")) : undefined,
        pessimisticPe: url.searchParams.has("pessimisticPe") ? Number(url.searchParams.get("pessimisticPe")) : undefined,
        basePe: url.searchParams.has("basePe") ? Number(url.searchParams.get("basePe")) : undefined,
        optimisticPe: url.searchParams.has("optimisticPe") ? Number(url.searchParams.get("optimisticPe")) : undefined,
        q2RevenueGrowth: url.searchParams.has("q2RevenueGrowth") ? Number(url.searchParams.get("q2RevenueGrowth")) : undefined,
        q2GrossMargin: url.searchParams.has("q2GrossMargin") ? Number(url.searchParams.get("q2GrossMargin")) : undefined,
        q2OperatingExpenseRate: url.searchParams.has("q2OperatingExpenseRate") ? Number(url.searchParams.get("q2OperatingExpenseRate")) : undefined,
        q2TaxRate: url.searchParams.has("q2TaxRate") ? Number(url.searchParams.get("q2TaxRate")) : undefined,
        q3RevenueGrowth: url.searchParams.has("q3RevenueGrowth") ? Number(url.searchParams.get("q3RevenueGrowth")) : undefined,
        q3GrossMargin: url.searchParams.has("q3GrossMargin") ? Number(url.searchParams.get("q3GrossMargin")) : undefined,
        q3OperatingExpenseRate: url.searchParams.has("q3OperatingExpenseRate") ? Number(url.searchParams.get("q3OperatingExpenseRate")) : undefined,
        q3TaxRate: url.searchParams.has("q3TaxRate") ? Number(url.searchParams.get("q3TaxRate")) : undefined,
        q4RevenueGrowth: url.searchParams.has("q4RevenueGrowth") ? Number(url.searchParams.get("q4RevenueGrowth")) : undefined,
        q4GrossMargin: url.searchParams.has("q4GrossMargin") ? Number(url.searchParams.get("q4GrossMargin")) : undefined,
        q4OperatingExpenseRate: url.searchParams.has("q4OperatingExpenseRate") ? Number(url.searchParams.get("q4OperatingExpenseRate")) : undefined,
        q4TaxRate: url.searchParams.has("q4TaxRate") ? Number(url.searchParams.get("q4TaxRate")) : undefined,
        fixture: process.env.ENABLE_TEST_FIXTURES === "1" ? url.searchParams.get("fixture") : undefined,
      };
      Object.keys(overrides).forEach((key) => overrides[key] == null || (typeof overrides[key] === "number" && Number.isNaN(overrides[key])) ? delete overrides[key] : null);
      const { data } = await withCache(cacheKey(url.pathname, url.searchParams), 10 * 60 * 1000, () => buildFinancialSummary(stockNo, overrides));
      sendSuccess(res, data);
      return;
    }
    if (url.pathname === "/api/timeline") {
      if (!assertAccess(url, res)) return;
      const stockNo = url.searchParams.get("stockNo") || "2330";
      const params = parseTimelineParams(url);
      await requireMasterStock(stockNo);
      const fixture = process.env.ENABLE_TEST_FIXTURES === "1" ? url.searchParams.get("fixture") : null;
      const { data } = await withCache(cacheKey(url.pathname, url.searchParams), 10 * 60 * 1000, () => buildTimeline(stockNo, params, { fixture }));
      sendSuccess(res, data);
      return;
    }
    if (url.pathname === "/api/timeline/sources") {
      if (!assertAccess(url, res)) return;
      sendSuccess(
        res,
        {
          fetchedAt: new Date().toISOString(),
          sources: [
            { key: "twse-material", name: "TWSE OpenAPI t187ap04_L", url: twseMaterialInfoUrl, status: sourceFetchCache.get(twseMaterialInfoUrl)?.status || null },
            { key: "tpex-material", name: "TPEx OpenAPI mopsfin_t187ap04_O", url: tpexMaterialInfoUrl, status: sourceFetchCache.get(tpexMaterialInfoUrl)?.status || null },
            { key: "twse-revenue", name: "TWSE OpenAPI t187ap05_L", url: twseRevenueUrl, status: sourceFetchCache.get(twseRevenueUrl)?.status || null },
            { key: "tpex-revenue", name: "TPEx OpenAPI mopsfin_t187ap05_O", url: tpexRevenueUrl, status: sourceFetchCache.get(tpexRevenueUrl)?.status || null },
            { key: "twse-shareholder", name: "TWSE OpenAPI t187ap38_L", url: twseShareholderUrl, status: sourceFetchCache.get(twseShareholderUrl)?.status || null },
            { key: "conference", name: "Investor conference source", url: null, status: { ok: false, message: "第一版尚未接入穩定官方資料源" } },
            { key: "news", name: "External news source", url: null, status: { ok: false, message: "第一版未接入外部新聞正式資料" } },
          ],
          metadata: sourceMeta({ data_source: "server timeline source registry", confidence: 0.8 }),
        },
      );
      return;
    }
    if (url.pathname === "/api/dashboard") {
      if (!assertAccess(url, res)) return;
      await loadMasterData();
      const { data, cache } = await withCache(cacheKey(url.pathname, url.searchParams), 5 * 60 * 1000, () => buildDashboard());
      sendSuccess(res, data, 200, cache ? sourceMeta({ data_source: "server cache", is_estimated: false, confidence: 0.5 }) : undefined);
      return;
    }
    if (url.pathname === "/api/revenue-radar") {
      if (!assertAccess(url, res)) return;
      await loadMasterData();
      const data = await buildRevenueRadar(url.searchParams.get("filter") || "all");
      sendSuccess(res, data);
      return;
    }
    if (url.pathname === "/api/industry-quotes") {
      if (!assertAccess(url, res)) return;
      const data = await fetchIndustryQuotes();
      sendSuccess(res, data, 200, sourceMeta({ data_source: "TWSE/TPEx/FinMind proxy quote calculation", is_estimated: true, confidence: 0.62 }));
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    const classified = classifyError(error);
    sendError(res, classified.status, classified.message, sourceMeta({ data_source: "server error handler", confidence: 0 }));
  }
});

server.listen(port, () => {
  console.log(`TW stock analyzer: http://localhost:${port}`);
});
