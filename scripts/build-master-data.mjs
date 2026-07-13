import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");

const urls = {
  twseListed: "https://openapi.twse.com.tw/v1/opendata/t187ap03_L",
  tpexListed: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O",
  twseDayAll: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
};

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

const updateScope = args.get("scope") || args.get("incremental") || "all";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksum(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function fetchJson(name, url) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("OpenAPI format changed: expected array");
    return {
      data,
      status: {
        name,
        url,
        ok: true,
        recordCount: data.length,
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    return {
      data: null,
      status: {
        name,
        url,
        ok: false,
        error: String(error?.message || error),
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function toIsoDate(value) {
  const text = String(value || "").replace(/\D/g, "");
  if (text.length !== 8) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function aliasObject(alias, source = "source_field", confidence = 0.85) {
  const clean = String(alias || "").trim();
  if (!clean) return null;
  return { alias: clean, source, confidence };
}

function uniqueAliases(aliases) {
  const map = new Map();
  for (const item of aliases) {
    if (!item?.alias) continue;
    const key = normalizeText(item.alias);
    const existing = map.get(key);
    if (!existing || Number(item.confidence || 0) > Number(existing.confidence || 0)) map.set(key, item);
  }
  return [...map.values()];
}

function stockSearchWeight(stockNo, market, isETF) {
  if (isETF) return stockNo === "0050" ? 78 : 55;
  const blueChips = new Set(["2330", "2454", "2317", "2308", "2382", "2412", "2303", "2881", "2882", "1303", "2002"]);
  if (blueChips.has(stockNo)) return 100;
  if (market === "TWSE") return 68;
  if (market === "TPEx") return 58;
  return 40;
}

function industryName(codeOrName) {
  const text = String(codeOrName || "").trim();
  const industryMap = {
    "01": "水泥工業",
    "02": "食品工業",
    "03": "塑膠工業",
    "04": "紡織纖維",
    "05": "電機機械",
    "06": "電器電纜",
    "08": "玻璃陶瓷",
    "10": "鋼鐵工業",
    "11": "橡膠工業",
    "12": "汽車工業",
    "14": "建材營造",
    "15": "航運業",
    "16": "觀光餐旅",
    "17": "金融保險",
    "18": "貿易百貨",
    "20": "其他業",
    "21": "化學工業",
    "22": "生技醫療",
    "23": "油電燃氣業",
    "24": "半導體業",
    "25": "電腦及週邊設備業",
    "26": "光電業",
    "27": "通信網路業",
    "28": "電子零組件業",
    "29": "電子通路業",
    "30": "資訊服務業",
    "31": "其他電子業",
    "32": "文化創意業",
    "33": "農業科技業",
    "34": "電子商務",
    "35": "綠能環保",
    "36": "數位雲端",
    "37": "運動休閒",
    "38": "居家生活"
  };
  return industryMap[text] || text || "未分類";
}

function listedRecord(row, manualAliases) {
  const stockNo = String(row["公司代號"] || "").trim();
  if (!/^\d{4}[A-Z]?$/.test(stockNo)) return null;
  const companyId = `TWSE-${stockNo}`;
  const companyName = String(row["公司名稱"] || "").trim();
  const shortName = String(row["公司簡稱"] || companyName || stockNo).trim();
  const englishName = String(row["英文簡稱"] || "").trim();
  const aliases = uniqueAliases([
    aliasObject(shortName),
    aliasObject(companyName),
    aliasObject(englishName, "official_english_name", 0.9),
    ...(manualAliases[companyId] || []),
  ]);
  return {
    companyId,
    stockNo,
    companyName,
    englishName,
    shortName,
    aliases,
    market: "TWSE",
    marketSegment: "上市",
    industry: industryName(row["產業別"]),
    subIndustry: null,
    isETF: false,
    status: "listed",
    listingDate: toIsoDate(row["上市日期"]),
    website: normalizeWebsite(row["網址"]),
    searchWeight: stockSearchWeight(stockNo, "TWSE", false),
    popularityWeight: stockSearchWeight(stockNo, "TWSE", false),
    data_source: "TWSE OpenAPI t187ap03_L",
    source_url: urls.twseListed,
  };
}

function tpexRecord(row, manualAliases) {
  const stockNo = String(row.SecuritiesCompanyCode || "").trim();
  if (!/^\d{4}$/.test(stockNo)) return null;
  const companyId = `TPEx-${stockNo}`;
  const companyName = String(row.CompanyName || "").trim();
  const shortName = String(row.CompanyAbbreviation || companyName || stockNo).trim();
  const englishName = String(row.Symbol || "").trim().replace(/\s+/g, " ");
  const aliases = uniqueAliases([
    aliasObject(shortName),
    aliasObject(companyName),
    aliasObject(englishName, "official_english_symbol", 0.86),
    ...(manualAliases[companyId] || []),
  ]);
  return {
    companyId,
    stockNo,
    companyName,
    englishName,
    shortName,
    aliases,
    market: "TPEx",
    marketSegment: "上櫃",
    industry: industryName(row.SecuritiesIndustryCode),
    subIndustry: null,
    isETF: false,
    status: "listed",
    listingDate: toIsoDate(row.DateOfListing),
    website: normalizeWebsite(row.WebAddress),
    searchWeight: stockSearchWeight(stockNo, "TPEx", false),
    popularityWeight: stockSearchWeight(stockNo, "TPEx", false),
    data_source: "TPEx OpenAPI mopsfin_t187ap03_O",
    source_url: urls.tpexListed,
  };
}

function etfRecord(row, manualAliases) {
  const stockNo = String(row.Code || "").trim();
  if (!/^00\d{2,3}[A-Z]?$/.test(stockNo)) return null;
  const companyId = `TWSE-${stockNo}`;
  const shortName = String(row.Name || stockNo).trim();
  const aliases = uniqueAliases([aliasObject(shortName), ...(manualAliases[companyId] || [])]);
  return {
    companyId,
    stockNo,
    companyName: shortName,
    englishName: "",
    shortName,
    aliases,
    market: "TWSE",
    marketSegment: "ETF",
    industry: "ETF",
    subIndustry: null,
    isETF: true,
    status: "listed",
    listingDate: null,
    website: null,
    searchWeight: stockSearchWeight(stockNo, "TWSE", true),
    popularityWeight: stockSearchWeight(stockNo, "TWSE", true),
    data_source: "TWSE OpenAPI STOCK_DAY_ALL",
    source_url: urls.twseDayAll,
  };
}

function normalizeWebsite(value) {
  const text = String(value || "").trim();
  if (!text || text === "－") return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function addRef(map, key, ref) {
  const clean = normalizeText(key);
  if (!clean) return;
  if (!map.has(clean)) map.set(clean, new Set());
  map.get(clean).add(ref);
}

function searchableFields(doc) {
  return [
    doc.stockNo,
    doc.name,
    doc.companyName,
    doc.shortName,
    doc.englishName,
    doc.industry,
    doc.category,
    ...(doc.aliases || []).map((item) => item.alias || item),
  ].filter(Boolean);
}

function prefixesFor(value) {
  const text = normalizeText(value);
  const out = [];
  for (let i = 1; i <= Math.min(16, text.length); i++) out.push(text.slice(0, i));
  return out;
}

function gramsFor(value) {
  const text = normalizeText(value).replace(/\s+/g, "");
  const out = new Set();
  if (text.length <= 2) {
    if (text) out.add(text);
    return [...out];
  }
  for (let i = 0; i < text.length - 1; i++) out.add(text.slice(i, i + 2));
  for (let i = 0; i < text.length - 2; i++) out.add(text.slice(i, i + 3));
  return [...out];
}

function buildTrie(prefixKeys) {
  const root = {};
  for (const key of prefixKeys) {
    let node = root;
    for (const char of key) {
      node[char] ||= {};
      node = node[char];
    }
    node.$ = 1;
  }
  return root;
}

function setToSortedArrayMap(map) {
  return Object.fromEntries([...map.entries()].map(([key, set]) => [key, [...set].sort()]));
}

function buildSearchIndex({ stocks, topics, products, companies, versionChecksum }) {
  const documents = {};
  const exact = new Map();
  const prefix = new Map();
  const fuzzy = new Map();
  const industries = new Map();

  for (const stock of stocks) {
    const type = stock.isETF ? "etf" : "stock";
    const ref = stock.companyId;
    documents[ref] = {
      id: ref,
      type,
      stockNo: stock.stockNo,
      companyId: stock.companyId,
      name: stock.shortName || stock.companyName,
      companyName: stock.companyName,
      englishName: stock.englishName,
      aliases: stock.aliases,
      market: stock.market,
      marketSegment: stock.marketSegment,
      industry: stock.industry,
      isETF: stock.isETF,
      searchWeight: stock.searchWeight,
      popularityWeight: stock.popularityWeight,
    };
    for (const field of searchableFields(stock)) {
      addRef(exact, field, ref);
      for (const key of prefixesFor(field)) addRef(prefix, key, ref);
      for (const gram of gramsFor(field)) addRef(fuzzy, gram, ref);
    }
    if (stock.industry) {
      const industryId = `industry-${normalizeText(stock.industry)}`;
      industries.set(industryId, {
        id: industryId,
        type: "industry",
        name: stock.industry,
        aliases: [{ alias: stock.industry, source: "stock_industry", confidence: 0.8 }],
        popularityWeight: 45,
      });
    }
  }

  for (const item of [...products, ...topics, ...companies, ...industries.values()]) {
    const id = item.productId || item.topicId || item.companyId || item.id;
    const type = item.productId ? "product" : item.topicId ? "topic" : item.type === "research_source" ? "company" : item.type || "industry";
    documents[id] = {
      id,
      type,
      name: item.name || item.localName,
      localName: item.localName || null,
      category: item.category || null,
      aliases: item.aliases || [],
      website: item.website || null,
      searchWeight: item.searchWeight || item.popularityWeight || 50,
      popularityWeight: item.popularityWeight || 50,
      confidence: item.confidence ?? 0.7,
    };
    for (const field of searchableFields(documents[id])) {
      addRef(exact, field, id);
      for (const key of prefixesFor(field)) addRef(prefix, key, id);
      for (const gram of gramsFor(field)) addRef(fuzzy, gram, id);
    }
  }

  return {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    sourceChecksum: versionChecksum,
    documentCount: Object.keys(documents).length,
    documents,
    exactMap: setToSortedArrayMap(exact),
    prefixIndex: setToSortedArrayMap(prefix),
    trieIndex: buildTrie(prefix.keys()),
    fuzzyIndex: setToSortedArrayMap(fuzzy),
    scoring: {
      exactStockNo: 1000,
      containedStockNo: 990,
      containedProductTopicOrCompanyName: 900,
      exactStockName: 920,
      alias: 860,
      englishName: 780,
      etf: 700,
      trustedManualAlias: 940,
      topic: 620,
      product: 640,
      industry: 540,
      fuzzy: 250,
      popularityWeight: "added after match type; never outranks exact matches",
      recentSearchBoost: "reserved for user history",
    },
  };
}

async function main() {
  const startedAt = Date.now();
  const manualAliases = await readJson("manual-aliases.json", {});
  const topics = await readJson("master-topic.json", []);
  const products = await readJson("master-product.json", []);
  const companies = await readJson("master-company.json", []);
  const previousStocks = await readJson("master-stock.json", []);

  const [twse, tpex, dayAll] = await Promise.all([
    updateScope === "etf" ? Promise.resolve({ data: null, status: { name: "twse-listed", skipped: true } }) : fetchJson("twse-listed", urls.twseListed),
    updateScope === "etf" ? Promise.resolve({ data: null, status: { name: "tpex-listed", skipped: true } }) : fetchJson("tpex-listed", urls.tpexListed),
    updateScope === "stock" ? Promise.resolve({ data: null, status: { name: "twse-etf", skipped: true } }) : fetchJson("twse-etf", urls.twseDayAll),
  ]);

  let stocks = updateScope === "etf" ? previousStocks.filter((item) => !item.isETF) : [];
  if (twse.data) stocks.push(...twse.data.map((row) => listedRecord(row, manualAliases)).filter(Boolean));
  if (tpex.data) stocks.push(...tpex.data.map((row) => tpexRecord(row, manualAliases)).filter(Boolean));
  if ((updateScope === "stock" || (!twse.data && !tpex.data)) && previousStocks.length) {
    const previousNonEtf = previousStocks.filter((item) => !item.isETF);
    const existing = new Set(stocks.map((item) => item.companyId));
    stocks.push(...previousNonEtf.filter((item) => !existing.has(item.companyId)));
  }
  if (dayAll.data) {
    const existing = new Set(stocks.map((item) => item.companyId));
    const etfs = dayAll.data.map((row) => etfRecord(row, manualAliases)).filter(Boolean).filter((item) => !existing.has(item.companyId));
    stocks.push(...etfs);
  } else if (previousStocks.length) {
    const existing = new Set(stocks.map((item) => item.companyId));
    stocks.push(...previousStocks.filter((item) => item.isETF && !existing.has(item.companyId)));
  }

  stocks = [...new Map(stocks.map((item) => [item.companyId, item])).values()].sort((a, b) => a.companyId.localeCompare(b.companyId));

  const recordCount = {
    total: stocks.length,
    twse: stocks.filter((item) => item.market === "TWSE" && !item.isETF).length,
    tpex: stocks.filter((item) => item.market === "TPEx").length,
    etf: stocks.filter((item) => item.isETF).length,
    alias: stocks.reduce((sum, item) => sum + (item.aliases?.length || 0), 0),
    product: products.length,
    topic: topics.length,
    company: companies.length,
  };
  const versionChecksum = checksum({ stocks, topics, products, companies });
  const sourceStatus = [twse.status, tpex.status, dayAll.status];
  const version = {
    schemaVersion: "1.0.0",
    buildVersion: "phase2-master-data-search-1",
    generatedAt: new Date().toISOString(),
    recordCount,
    stale: sourceStatus.some((item) => item && item.ok === false),
    sourceStatus,
    checksum: versionChecksum,
    incrementalUpdate: {
      supported: true,
      scope: updateScope,
      note: "First version supports stock-only or etf-only refresh by reusing the unchanged section from the previous master file.",
    },
    buildTimeMs: Date.now() - startedAt,
  };
  const index = buildSearchIndex({ stocks, topics, products, companies, versionChecksum });

  await writeJson("master-stock.json", stocks);
  await writeJson("master-version.json", version);
  await writeJson("search-index.json", index);

  const indexBytes = Buffer.byteLength(JSON.stringify(index));
  console.log(
    JSON.stringify(
      {
        ok: true,
        scope: updateScope,
        recordCount,
        checksum: versionChecksum,
        buildTimeMs: version.buildTimeMs,
        indexBytes,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
