import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8787);
const accessToken = process.env.ACCESS_TOKEN || "";
const appVersion = "1.1.0-phase1-acceptance";
const frontendVersion = "phase1-acceptance-1";
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
const rateLimitMax = 240;
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
const tpexValuationUrl = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis";
const tpexRevenueUrl = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O";
const tpexIncomeUrl = "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap14_O";

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
    previousMonthRevenue: parseNumber(row["營業收入-上月營收"]),
    previousYearRevenue: parseNumber(row["營業收入-去年當月營收"]),
    mom: parsePercentNumber(row["營業收入-上月比較增減(%)"]),
    yoy: parsePercentNumber(row["營業收入-去年同月增減(%)"]),
    cumulativeRevenue: parseNumber(row["累計營業收入-當月累計營收"]),
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
    quarterRevenue: revenue,
    operatingIncome,
    nonOperatingIncome: parseNumber(row["營業外收入及支出"]),
    netIncome,
    eps,
    operatingMargin: revenue ? operatingIncome / revenue : null,
    netMargin: revenue ? netIncome / revenue : null,
    grossMargin: null,
    grossMarginStatus: "官方端點未提供銷貨成本或毛利欄位，第一小節不估算公告毛利率",
    estimatedShares: eps ? (netIncome * 1000) / eps : null,
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

function defaultEpsModelInputs(income, valuation) {
  const operatingMargin = income?.operatingMargin ?? 0.15;
  const netMargin = income?.netMargin ?? Math.max(0.04, operatingMargin * 0.75);
  const grossMargin = clamp(0.05, 0.75, operatingMargin + 0.12);
  const opexRate = clamp(0.03, 0.65, grossMargin - operatingMargin);
  const basePe = valuation?.peRatio && valuation.peRatio > 0 ? valuation.peRatio : 15;
  return {
    quarterRevenueGrowth: 0,
    grossMargin,
    operatingExpenseRate: opexRate,
    taxRate: 0.2,
    sharesOutstanding: income?.estimatedShares ? Math.round(income.estimatedShares) : null,
    pessimisticPe: Math.max(5, Math.round(basePe * 0.75 * 10) / 10),
    basePe: Math.round(basePe * 10) / 10,
    optimisticPe: Math.round(basePe * 1.25 * 10) / 10,
  };
}

function calculateEpsScenario(baseQuarterRevenueThousand, inputs, peMultiple, growthDelta = 0) {
  const growth = Number(inputs.quarterRevenueGrowth ?? 0) + growthDelta;
  const revenueThousand = baseQuarterRevenueThousand * (1 + growth);
  const grossProfitThousand = revenueThousand * Number(inputs.grossMargin ?? 0);
  const operatingExpenseThousand = revenueThousand * Number(inputs.operatingExpenseRate ?? 0);
  const operatingIncomeThousand = grossProfitThousand - operatingExpenseThousand;
  const taxRate = clamp(0, 0.5, Number(inputs.taxRate ?? 0.2));
  const netIncomeThousand = operatingIncomeThousand * (1 - taxRate);
  const shares = Number(inputs.sharesOutstanding || 0);
  const quarterEps = shares > 0 ? (netIncomeThousand * 1000) / shares : null;
  const annualEps = quarterEps == null ? null : quarterEps * 4;
  return {
    revenue: revenueThousand,
    grossProfit: grossProfitThousand,
    operatingIncome: operatingIncomeThousand,
    netIncome: netIncomeThousand,
    quarterEps,
    annualEps,
    peMultiple,
    fairPrice: annualEps == null ? null : annualEps * peMultiple,
  };
}

function buildEpsModel(revenue, income, valuation, overrides = {}) {
  const defaults = defaultEpsModelInputs(income, valuation);
  const inputs = { ...defaults, ...overrides };
  const baseQuarterRevenue = income?.quarterRevenue || (revenue?.monthlyRevenue ? revenue.monthlyRevenue * 3 : null);
  const canEstimate = baseQuarterRevenue != null && inputs.sharesOutstanding != null;
  const scenarios = canEstimate
    ? {
        pessimistic: calculateEpsScenario(baseQuarterRevenue, inputs, inputs.pessimisticPe, -0.05),
        base: calculateEpsScenario(baseQuarterRevenue, inputs, inputs.basePe, 0),
        optimistic: calculateEpsScenario(baseQuarterRevenue, inputs, inputs.optimisticPe, 0.05),
      }
    : { pessimistic: null, base: null, optimistic: null };
  return {
    is_estimated: true,
    canEstimate,
    inputs,
    baseQuarterRevenue,
    scenarios,
    formula: {
      revenue: "預估季營收 = 基準季營收 * (1 + 使用者季營收成長率 + 情境調整)",
      grossProfit: "毛利 = 預估季營收 * 使用者毛利率",
      operatingIncome: "營業利益 = 毛利 - 預估季營收 * 使用者營業費用率",
      netIncome: "稅後淨利 = 營業利益 * (1 - 使用者稅率)",
      eps: "單季 EPS = 稅後淨利(千元) * 1000 / 流通股數",
      fairPrice: "合理價 = 全年 EPS * 情境本益比",
    },
    metadata: sourceMeta({
      data_source: "站內 EPS 模型預估，基礎資料來源：TWSE／TPEx OpenAPI",
      reporting_period: income?.metadata?.reporting_period || revenue?.metadata?.reporting_period || null,
      is_estimated: true,
      confidence: canEstimate ? 0.48 : 0.2,
      source_url: null,
    }),
  };
}

async function buildFinancialSummary(stockNo, overrides = {}) {
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
    name: income?.companyName || revenue?.companyName || stockMap.get(stockNo)?.name || stockNo,
    actual: {
      revenue,
      profitability: income
        ? {
            quarterRevenue: income.quarterRevenue,
            eps: income.eps,
            cumulativeEps: null,
            grossMargin: income.grossMargin,
            grossMarginStatus: income.grossMarginStatus,
            operatingMargin: income.operatingMargin,
            netMargin: income.netMargin,
            operatingIncome: income.operatingIncome,
            netIncome: income.netIncome,
            freeCashFlow: null,
            freeCashFlowStatus: "第一小節尚未接入現金流量表，避免自行推估自由現金流",
            estimatedShares: income.estimatedShares,
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
  for (let offset = 0; offset < 48; offset++) {
    const date = addMonths(now, -offset);
    const result = await fetcher(stockNo, date).catch(() => null);
    if (rowParser(result).length) return date;
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
  const meta = stockMap.get(stockNo);
  return {
    stockNo,
    name: meta?.name || stockNo,
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
  let twseError;
  let tpexError;
  try {
    return await fetchStockFromMarket(stockNo, months, "twse");
  } catch (error) {
    twseError = error;
  }
  try {
    return await fetchStockFromMarket(stockNo, months, "tpex");
  } catch (error) {
    tpexError = error;
  }
  try {
    return await fetchStockFromFinMind(stockNo, months);
  } catch (finMindError) {
    throw new Error(`${twseError.message} / ${tpexError.message} / ${finMindError.message}`);
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
      const meta = stockMap.get(stockNo);
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
        name: meta?.name || stockNo,
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
    if (url.pathname === "/api/universe") {
      if (!assertAccess(url, res)) return;
      sendSuccess(res, { fetchedAt: new Date().toISOString(), items: stockUniverse }, 200, sourceMeta({ data_source: "server stock universe", confidence: 0.7 }));
      return;
    }
    if (url.pathname === "/api/twse") {
      if (!assertAccess(url, res)) return;
      const stockNo = url.searchParams.get("stockNo") || "2330";
      const months = Math.min(Math.max(Number(url.searchParams.get("months") || 12), 3), 36);
      const data = await fetchStock(stockNo, months);
      sendSuccess(res, data);
      return;
    }
    if (url.pathname === "/api/ai-summary") {
      if (!assertAccess(url, res)) return;
      const stockNo = url.searchParams.get("stockNo") || "2330";
      const { data } = await withCache(cacheKey(url.pathname, url.searchParams), 10 * 60 * 1000, () => buildAiSummaryResponse(stockNo));
      sendSuccess(res, data);
      return;
    }
    if (url.pathname === "/api/financial") {
      if (!assertAccess(url, res)) return;
      const stockNo = url.searchParams.get("stockNo") || "2330";
      const overrides = {
        quarterRevenueGrowth: url.searchParams.has("quarterRevenueGrowth") ? Number(url.searchParams.get("quarterRevenueGrowth")) : undefined,
        grossMargin: url.searchParams.has("grossMargin") ? Number(url.searchParams.get("grossMargin")) : undefined,
        operatingExpenseRate: url.searchParams.has("operatingExpenseRate") ? Number(url.searchParams.get("operatingExpenseRate")) : undefined,
        taxRate: url.searchParams.has("taxRate") ? Number(url.searchParams.get("taxRate")) : undefined,
        sharesOutstanding: url.searchParams.has("sharesOutstanding") ? Number(url.searchParams.get("sharesOutstanding")) : undefined,
        pessimisticPe: url.searchParams.has("pessimisticPe") ? Number(url.searchParams.get("pessimisticPe")) : undefined,
        basePe: url.searchParams.has("basePe") ? Number(url.searchParams.get("basePe")) : undefined,
        optimisticPe: url.searchParams.has("optimisticPe") ? Number(url.searchParams.get("optimisticPe")) : undefined,
      };
      Object.keys(overrides).forEach((key) => overrides[key] == null || Number.isNaN(overrides[key]) ? delete overrides[key] : null);
      const { data } = await withCache(cacheKey(url.pathname, url.searchParams), 10 * 60 * 1000, () => buildFinancialSummary(stockNo, overrides));
      sendSuccess(res, data);
      return;
    }
    if (url.pathname === "/api/dashboard") {
      if (!assertAccess(url, res)) return;
      const { data, cache } = await withCache(cacheKey(url.pathname, url.searchParams), 5 * 60 * 1000, () => buildDashboard());
      sendSuccess(res, data, 200, cache ? sourceMeta({ data_source: "server cache", is_estimated: false, confidence: 0.5 }) : undefined);
      return;
    }
    if (url.pathname === "/api/revenue-radar") {
      if (!assertAccess(url, res)) return;
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
