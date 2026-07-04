import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 8787);
const accessToken = process.env.ACCESS_TOKEN || "";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

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

const parseTaiwanDate = (value) => {
  const [rocYear, month, day] = String(value).split("/").map(Number);
  return `${rocYear + 1911}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

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
    if (prev == null) {
      prev = value;
    } else {
      prev = value * k + prev * (1 - k);
    }
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
    if (i >= period) {
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
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

  if (ma20 != null && last.close > ma20) signals.push("收盤價站上 20 日均線，短線偏強");
  if (ma20 != null && last.close < ma20) signals.push("收盤價跌破 20 日均線，短線偏弱");
  if (ma60 != null && last.close > ma60) signals.push("股價站上 60 日均線，中期趨勢偏多");
  if (ma60 != null && last.close < ma60) signals.push("股價跌破 60 日均線，中期趨勢偏空");
  if (rsi14 != null && rsi14 >= 70) signals.push("RSI 高於 70，短線偏熱");
  if (rsi14 != null && rsi14 <= 30) signals.push("RSI 低於 30，短線偏冷");
  if (macdHist != null && macdHist > 0) signals.push("MACD 柱狀體為正，多方動能延續");
  if (macdHist != null && macdHist < 0) signals.push("MACD 柱狀體為負，空方動能延續");

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

async function fetchTwseMonth(stockNo, date) {
  const url = new URL("https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY");
  url.searchParams.set("date", toYYYYMMDD(date));
  url.searchParams.set("stockNo", stockNo);
  url.searchParams.set("response", "json");
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 stock-analysis-local-tool",
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`TWSE HTTP ${response.status}`);
  return response.json();
}

async function fetchTpexMonth(stockNo, date) {
  const url = new URL("https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock");
  url.searchParams.set("code", stockNo);
  url.searchParams.set("date", toYYYYSlashMMDD(date));
  url.searchParams.set("response", "json");
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 stock-analysis-local-tool",
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`TPEx HTTP ${response.status}`);
  return response.json();
}

async function fetchFinMind(stockNo, months) {
  const start = addMonths(new Date(), -(months + 1));
  const url = new URL("https://api.finmindtrade.com/api/v4/data");
  url.searchParams.set("dataset", "TaiwanStockPrice");
  url.searchParams.set("data_id", stockNo);
  url.searchParams.set("start_date", start.toISOString().slice(0, 10));
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 stock-analysis-local-tool",
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`FinMind HTTP ${response.status}`);
  return response.json();
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
  throw new Error("找不到可用行情資料，請確認股票代號是否正確。");
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
  const cleanRows = rows
    .filter((r) => r.open != null && r.high != null && r.low != null && r.close != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const uniqueRows = [...new Map(cleanRows.map((r) => [r.date, r])).values()];
  if (uniqueRows.length < 35) {
    throw new Error("行情資料不足，請確認股票代號是否正確或拉長查詢月份。");
  }
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
  return {
    stockNo,
    title,
    market: market === "tpex" ? "TPEx" : "TWSE",
    source: market === "tpex" ? "TPEx tradingStock" : "TWSE STOCK_DAY",
    fetchedAt: new Date().toISOString(),
    rows: analysisRows,
    indicators,
    summary: summarize(analysisRows, indicators),
  };
}

async function fetchStockFromFinMind(stockNo, months) {
  const result = await fetchFinMind(stockNo, months);
  const cleanRows = finMindRows(result)
    .filter((r) => r.open != null && r.high != null && r.low != null && r.close != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const uniqueRows = [...new Map(cleanRows.map((r) => [r.date, r])).values()];
  if (uniqueRows.length < 35) {
    throw new Error("FinMind 行情資料不足，請確認股票代號是否正確或拉長查詢月份。");
  }
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
  return {
    stockNo,
    title: `${stockNo} 日成交資訊`,
    market: "TW",
    source: "FinMind TaiwanStockPrice",
    fetchedAt: new Date().toISOString(),
    rows: analysisRows,
    indicators,
    summary: summarize(analysisRows, indicators),
  };
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

let industryQuoteCache = null;
let industryQuoteCacheAt = 0;

const industryQuoteItems = [
  { group: "貴金屬", name: "黃金", symbol: "00635U", note: "黃金 ETF 代理" },
  { group: "貴金屬", name: "白銀", symbol: "00738U", note: "白銀 ETF 代理" },
  { group: "基本金屬", name: "銅", symbol: "00763U", note: "銅 ETF 代理" },
  { group: "基本金屬", name: "鋼鐵/鐵礦", symbol: "2002", note: "中鋼，鋼鐵景氣代理" },
  { group: "農產品", name: "咖啡/食品通膨", symbol: "1216", note: "統一，食品成本代理" },
  { group: "農產品", name: "咖啡/食品通膨", symbol: "1227", note: "佳格，食品成本代理" },
  { group: "橡膠", name: "輪胎/橡膠", symbol: "2105", note: "正新，橡膠成本代理" },
  { group: "橡膠", name: "輪胎/橡膠", symbol: "2103", note: "台橡，合成橡膠代理" },
  { group: "半導體材料", name: "矽晶圓", symbol: "6488", note: "環球晶" },
  { group: "半導體材料", name: "矽晶圓", symbol: "5483", note: "中美晶" },
  { group: "半導體材料", name: "化學材料", symbol: "1773", note: "勝一" },
  { group: "電子材料", name: "銅箔", symbol: "8358", note: "金居，銅箔代理" },
];

function quoteFromStockData(item, data) {
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
    source: data.source,
    type: "proxy",
  };
}

async function fetchIndustryQuotes() {
  const now = Date.now();
  if (industryQuoteCache && now - industryQuoteCacheAt < 5 * 60 * 1000) return industryQuoteCache;
  const items = await Promise.all(
    industryQuoteItems.map(async (item) => {
      try {
        const data = await fetchStock(item.symbol, 3);
        return quoteFromStockData(item, data);
      } catch (error) {
        return { ...item, error: String(error.message || error), type: "proxy" };
      }
    }),
  );
  industryQuoteCache = {
    fetchedAt: new Date().toISOString(),
    note: "金銀銅等以可交易 ETF 或台股代理指標呈現，用來觀察產業報價與成本波動，非所有項目都是現貨報價。",
    items,
  };
  industryQuoteCacheAt = now;
  return industryQuoteCache;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const filePath = path.normalize(path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, fetchedAt: new Date().toISOString() }));
      return;
    }
    if (url.pathname === "/api/twse") {
      if (accessToken && url.searchParams.get("key") !== accessToken) {
        res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Access key required" }));
        return;
      }
      const stockNo = url.searchParams.get("stockNo") || "2330";
      const months = Math.min(Math.max(Number(url.searchParams.get("months") || 12), 3), 36);
      const data = await fetchStock(stockNo, months);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === "/api/industry-quotes") {
      if (accessToken && url.searchParams.get("key") !== accessToken) {
        res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Access key required" }));
        return;
      }
      const data = await fetchIndustryQuotes();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: String(error.message || error) }));
  }
});

server.listen(port, () => {
  console.log(`TW stock analyzer: http://localhost:${port}`);
});
