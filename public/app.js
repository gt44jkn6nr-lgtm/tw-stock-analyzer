const canvases = {
  price: document.getElementById("priceChart"),
  draw: document.getElementById("drawCanvas"),
  rsi: document.getElementById("rsiChart"),
  macd: document.getElementById("macdChart"),
};

const fmt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("zh-TW", { style: "percent", maximumFractionDigits: 2 });
const moneyFmt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

const watchStorageKey = "tw-stock-watchlist-v2";
const legacyWatchStorageKey = "tw-stock-watchlist-v1";
const notifyStorageKey = "tw-stock-entry-notify-v1";
const drawingStorageKey = "tw-stock-drawings-v1";
const alertRulesKey = "tw-stock-alert-rules-v1";
const alertHistoryKey = "tw-stock-alert-history-v1";

const allIndustry = "全部";
let selectedMajorIndustry = allIndustry;
let selectedSubIndustry = allIndustry;
let currentLoadedStock = "";
let drawEnabled = false;
let activeStroke = null;
let notifyEnabled = localStorage.getItem(notifyStorageKey) === "1";
let lastEntryNotifyKey = "";
let latestChartData = null;
let chartZoom = 1;
let drawingStore = loadDrawingStore();
const drawingStrokes = [];

const builtInWatchlist = [
  { stockNo: "2330", name: "台積電", industry: "半導體 / 晶圓代工" },
  { stockNo: "2404", name: "漢唐", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "6139", name: "亞翔", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "5536", name: "聖暉*", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "4763", name: "材料-KY", industry: "台積電供應鏈 / 特化材料" },
  { stockNo: "4768", name: "晶呈科技", industry: "台積電供應鏈 / 特化材料" },
  { stockNo: "2344", name: "華邦電", industry: "記憶體 / DRAM Flash" },
  { stockNo: "2408", name: "南亞科", industry: "記憶體 / DRAM" },
  { stockNo: "2337", name: "旺宏", industry: "記憶體 / NOR Flash" },
  { stockNo: "2327", name: "國巨", industry: "被動元件 / MLCC" },
  { stockNo: "2492", name: "華新科", industry: "被動元件 / MLCC" },
  { stockNo: "2478", name: "大毅", industry: "被動元件 / 電阻" },
  { stockNo: "2481", name: "強茂", industry: "功率元件 / 二極體" },
  { stockNo: "5425", name: "台半", industry: "功率元件 / MOSFET" },
  { stockNo: "2342", name: "茂矽", industry: "功率元件 / MOSFET" },
  { stockNo: "3707", name: "漢磊", industry: "功率元件 / SiC GaN" },
  { stockNo: "3037", name: "欣興", industry: "PCB / ABF 載板" },
  { stockNo: "3189", name: "景碩", industry: "PCB / ABF 載板" },
  { stockNo: "8046", name: "南電", industry: "PCB / ABF 載板" },
  { stockNo: "2383", name: "台光電", industry: "PCB / 銅箔基板 CCL" },
  { stockNo: "6274", name: "台燿", industry: "PCB / 銅箔基板 CCL" },
  { stockNo: "6213", name: "聯茂", industry: "PCB / 銅箔基板 CCL" },
  { stockNo: "8358", name: "金居", industry: "PCB / 銅箔" },
  { stockNo: "1802", name: "台玻", industry: "玻璃基板 / 玻璃材料" },
  { stockNo: "3481", name: "群創", industry: "玻璃基板 / 面板與玻璃加工" },
  { stockNo: "3149", name: "正達", industry: "玻璃基板 / 玻璃加工" },
  { stockNo: "6207", name: "雷科", industry: "玻璃基板 / 設備" },
  { stockNo: "1809", name: "中釉", industry: "玻璃基板 / 薄膜材料" },
  { stockNo: "4976", name: "佳凌", industry: "玻璃基板 / 光學玻璃" },
  { stockNo: "2382", name: "廣達", industry: "AI Server / ODM" },
  { stockNo: "3231", name: "緯創", industry: "AI Server / ODM" },
  { stockNo: "6669", name: "緯穎", industry: "AI Server / ODM" },
  { stockNo: "3017", name: "奇鋐", industry: "AI Server / 散熱" },
  { stockNo: "2308", name: "台達電", industry: "AI Server / BBU 電源" },
  { stockNo: "4908", name: "前鼎", industry: "CPO / 光通訊" },
  { stockNo: "3163", name: "波若威", industry: "CPO / 光通訊" },
  { stockNo: "1513", name: "中興電", industry: "800VDC HVDC / 電力設備" },
  { stockNo: "1519", name: "華城", industry: "800VDC HVDC / 重電" },
  { stockNo: "1605", name: "華新", industry: "原物料 / 銅與線纜" },
  { stockNo: "2002", name: "中鋼", industry: "原物料 / 鋼鐵" },
  { stockNo: "1303", name: "南亞", industry: "原物料 / 樹脂" },
];

let watchlist = loadWatchlist();
let alertRules = loadJson(alertRulesKey, []);
let alertHistory = loadJson(alertHistoryKey, []);

function keyParam() {
  return new URLSearchParams(location.search).get("key") || "";
}

function apiUrl(path, params = {}) {
  const url = new URL(path, location.origin);
  url.searchParams.set("key", keyParam());
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== "") url.searchParams.set(key, value);
  });
  return `${url.pathname}?${url.searchParams.toString()}`;
}

async function fetchApi(path, params) {
  const response = await fetch(apiUrl(path, params));
  const payload = await response.json();
  if (!response.ok || payload.success === false || payload.error) {
    const error = new Error(payload.error || "資料讀取失敗");
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload.success === true ? payload.data : payload;
}

function loadJson(key, fallback) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { hour12: false });
}

function formatPct(value) {
  return value == null || !Number.isFinite(value) ? "--" : pct.format(value);
}

function formatNumber(value) {
  return value == null || !Number.isFinite(value) ? "--" : fmt.format(value);
}

function trendClass(value) {
  return value >= 0 ? "up" : "down";
}

function metaLine(meta) {
  if (!meta) return "資料來源 --";
  const stale = isStale(meta.fetched_at || meta.published_at);
  return `${meta.data_source || "--"}｜資料期 ${meta.reporting_period || "--"}｜抓取 ${formatDateTime(meta.fetched_at)}${stale ? "｜資料可能過期" : ""}`;
}

function isStale(value, maxDays = 5) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > maxDays * 86400000;
}

function dataBadge(meta) {
  if (!meta) return `<span class="data-badge stale">資料未知</span>`;
  if (meta.confidence === 0) return `<span class="data-badge stale">未接入</span>`;
  if (meta.is_estimated) return `<span class="data-badge estimate">模型預估</span>`;
  return `<span class="data-badge source">公告/來源資料</span>`;
}

function sourceLink(meta) {
  if (!meta?.source_url) return "";
  return `<a class="source-link" href="${escapeHtml(meta.source_url)}" target="_blank" rel="noopener noreferrer">原始來源</a>`;
}

function uniqueWatchlist(items) {
  const map = new Map();
  for (const item of items) {
    if (!item?.stockNo) continue;
    map.set(String(item.stockNo), {
      stockNo: String(item.stockNo),
      name: item.name || String(item.stockNo),
      industry: item.industry || "未分類 / 其他",
    });
  }
  return [...map.values()];
}

function loadWatchlist() {
  const saved = loadJson(watchStorageKey, null) || loadJson(legacyWatchStorageKey, []);
  return uniqueWatchlist([...(Array.isArray(saved) ? saved : []), ...builtInWatchlist]);
}

function saveWatchlist() {
  saveJson(watchStorageKey, watchlist);
}

function industryParts(industry) {
  const [major, ...rest] = String(industry || "未分類 / 其他")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  return { major: major || "未分類", sub: rest.join(" / ") || allIndustry };
}

function majorIndustries() {
  return [allIndustry, ...new Set(watchlist.map((item) => industryParts(item.industry).major))];
}

function subIndustries(major) {
  if (major === allIndustry) return [allIndustry];
  const subs = watchlist.filter((item) => industryParts(item.industry).major === major).map((item) => industryParts(item.industry).sub);
  return [allIndustry, ...new Set(subs)];
}

function itemMatchesSelectedIndustry(item) {
  if (selectedMajorIndustry === allIndustry) return true;
  const parts = industryParts(item.industry);
  return parts.major === selectedMajorIndustry && (selectedSubIndustry === allIndustry || parts.sub === selectedSubIndustry);
}

function renderWatchlist() {
  const tabs = document.getElementById("industryTabs");
  const list = document.getElementById("watchList");
  const currentStock = document.getElementById("stockNo")?.value.trim();
  if (!tabs || !list) return;
  const majors = majorIndustries();
  if (!majors.includes(selectedMajorIndustry)) selectedMajorIndustry = allIndustry;
  const subs = subIndustries(selectedMajorIndustry);
  if (!subs.includes(selectedSubIndustry)) selectedSubIndustry = allIndustry;
  tabs.innerHTML = `
    <div class="industry-row">
      ${majors
        .map(
          (industry) =>
            `<button type="button" class="tab-button ${industry === selectedMajorIndustry ? "active" : ""}" data-major-industry="${escapeHtml(industry)}">${escapeHtml(industry)}</button>`,
        )
        .join("")}
    </div>
    ${
      selectedMajorIndustry === allIndustry
        ? ""
        : `<div class="industry-row sub-row">${subs
            .map(
              (industry) =>
                `<button type="button" class="tab-button sub ${industry === selectedSubIndustry ? "active" : ""}" data-sub-industry="${escapeHtml(industry)}">${escapeHtml(industry)}</button>`,
            )
            .join("")}</div>`
    }
  `;
  const filtered = watchlist.filter(itemMatchesSelectedIndustry);
  list.innerHTML = filtered
    .map(
      (item) => `
        <button type="button" class="watch-card ${item.stockNo === currentStock ? "active" : ""}" data-stock="${escapeHtml(item.stockNo)}">
          <strong>${escapeHtml(item.stockNo)} ${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.industry)}</span>
          <small>點擊載入 K 線</small>
          <b class="watch-remove" data-remove="${escapeHtml(item.stockNo)}">移除</b>
        </button>
      `,
    )
    .join("");
}

function addWatchItem(stockNo, name, industry) {
  const cleanStock = String(stockNo || "").trim();
  if (!cleanStock) return;
  const item = {
    stockNo: cleanStock,
    name: String(name || cleanStock).trim(),
    industry: String(industry || "未分類 / 其他").trim(),
  };
  watchlist = uniqueWatchlist([item, ...watchlist]);
  saveWatchlist();
  renderWatchlist();
}

function loadDrawingStore() {
  return loadJson(drawingStorageKey, {});
}

function saveDrawingStore() {
  saveJson(drawingStorageKey, drawingStore);
}

function drawingKey(stockNo = currentLoadedStock) {
  return stockNo || "default";
}

function saveAnnotationsForStock(stockNo = currentLoadedStock) {
  if (!stockNo) return;
  drawingStore[drawingKey(stockNo)] = drawingStrokes.map((stroke) => ({
    color: stroke.color,
    width: stroke.width,
    points: stroke.points,
  }));
  saveDrawingStore();
}

function loadAnnotationsForStock(stockNo = currentLoadedStock) {
  drawingStrokes.length = 0;
  const saved = drawingStore[drawingKey(stockNo)];
  if (Array.isArray(saved)) {
    saved.forEach((stroke) => drawingStrokes.push(stroke));
  }
  redrawAnnotations();
}

function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const height = Number(canvas.getAttribute("height")) || rect.height;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width: rect.width, height };
}

function visibleData(data) {
  if (!data?.rows?.length) return data;
  const rows = data.rows;
  const visibleCount = Math.max(35, Math.round(rows.length / chartZoom));
  const start = Math.max(0, rows.length - visibleCount);
  const offset = start;
  return {
    ...data,
    rows: rows.slice(start),
    indicators: {
      ma5: data.indicators.ma5.slice(start),
      ma20: data.indicators.ma20.slice(start),
      ma60: data.indicators.ma60.slice(start),
      rsi14: data.indicators.rsi14.slice(start),
      bollinger: {
        upper: data.indicators.bollinger.upper.slice(start),
        lower: data.indicators.bollinger.lower.slice(start),
        mid: data.indicators.bollinger.mid.slice(start),
      },
      macd: {
        line: data.indicators.macd.line.slice(start),
        signal: data.indicators.macd.signal.slice(start),
        hist: data.indicators.macd.hist.slice(start),
      },
    },
    _visibleOffset: offset,
  };
}

function scaleY(values, top, bottom) {
  const clean = values.filter((value) => value != null && Number.isFinite(value));
  let min = Math.min(...clean);
  let max = Math.max(...clean);
  if (!clean.length || min === max) {
    min = (clean[0] || 0) - 1;
    max = (clean[0] || 0) + 1;
  }
  const pad = (max - min) * 0.08 || 1;
  min -= pad;
  max += pad;
  return {
    min,
    max,
    y(value) {
      return bottom - ((value - min) / (max - min)) * (bottom - top);
    },
  };
}

function grid(ctx, width, left, right, top, bottom, yScale, labels = true) {
  ctx.strokeStyle = "rgba(139, 153, 177, .22)";
  ctx.lineWidth = 1;
  ctx.font = "12px Microsoft JhengHei, Arial";
  ctx.fillStyle = "#8b99b1";
  for (let i = 0; i <= 4; i++) {
    const y = top + ((bottom - top) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    if (labels) {
      const value = yScale.max - ((yScale.max - yScale.min) * i) / 4;
      ctx.fillText(fmt.format(value), 6, y + 4);
    }
  }
  ctx.strokeStyle = "rgba(139, 153, 177, .35)";
  ctx.strokeRect(left, top, right - left, bottom - top);
}

function drawLine(ctx, points, rows, color, left, right, yScale, width = 1.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let started = false;
  points.forEach((value, i) => {
    if (value == null) return;
    const x = left + (i / Math.max(rows.length - 1, 1)) * (right - left);
    const y = yScale.y(value);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

function drawPrice(data) {
  const visible = visibleData(data);
  const { ctx, width, height } = setupCanvas(canvases.price);
  const rows = visible.rows;
  const left = width < 520 ? 44 : 60;
  const right = width - 12;
  const top = 12;
  const priceBottom = height * 0.72;
  const volumeTop = priceBottom + 18;
  const bottom = height - 22;
  ctx.clearRect(0, 0, width, height);
  const yScale = scaleY(rows.flatMap((r) => [r.high, r.low]), top, priceBottom);
  grid(ctx, width, left, right, top, priceBottom, yScale, width >= 420);
  const candleWidth = Math.max(2, Math.min(9, ((right - left) / rows.length) * 0.62));
  rows.forEach((r, i) => {
    const x = left + (i / Math.max(rows.length - 1, 1)) * (right - left);
    const up = r.close >= r.open;
    ctx.strokeStyle = up ? "#e25555" : "#18b77c";
    ctx.fillStyle = up ? "#e25555" : "#18b77c";
    ctx.beginPath();
    ctx.moveTo(x, yScale.y(r.high));
    ctx.lineTo(x, yScale.y(r.low));
    ctx.stroke();
    const y1 = yScale.y(Math.max(r.open, r.close));
    const y2 = yScale.y(Math.min(r.open, r.close));
    ctx.fillRect(x - candleWidth / 2, y1, candleWidth, Math.max(1, y2 - y1));
  });
  drawLine(ctx, visible.indicators.ma5, rows, "#57a0ff", left, right, yScale, 1.3);
  drawLine(ctx, visible.indicators.ma20, rows, "#f6a641", left, right, yScale, 1.3);
  drawLine(ctx, visible.indicators.ma60, rows, "#b184ff", left, right, yScale, 1.3);
  drawLine(ctx, visible.indicators.bollinger.upper, rows, "#44d1c2", left, right, yScale, 1);
  drawLine(ctx, visible.indicators.bollinger.lower, rows, "#44d1c2", left, right, yScale, 1);
  const maxVolume = Math.max(...rows.map((r) => r.volume || 0));
  rows.forEach((r, i) => {
    const x = left + (i / Math.max(rows.length - 1, 1)) * (right - left);
    const h = maxVolume ? ((r.volume || 0) / maxVolume) * (bottom - volumeTop) : 0;
    ctx.fillStyle = r.close >= r.open ? "rgba(226,85,85,.36)" : "rgba(24,183,124,.36)";
    ctx.fillRect(x - candleWidth / 2, bottom - h, candleWidth, h);
  });
  ctx.fillStyle = "#8b99b1";
  ctx.font = "12px Microsoft JhengHei, Arial";
  ctx.fillText(rows[0]?.date || "", left, height - 6);
  ctx.fillText(rows.at(-1)?.date || "", Math.max(left, right - 82), height - 6);
}

function drawRsi(data) {
  const visible = visibleData(data);
  const { ctx, width, height } = setupCanvas(canvases.rsi);
  const rows = visible.rows;
  const left = width < 520 ? 34 : 48;
  const right = width - 12;
  const top = 10;
  const bottom = height - 18;
  ctx.clearRect(0, 0, width, height);
  const yScale = { min: 0, max: 100, y(v) { return bottom - ((v - this.min) / (this.max - this.min)) * (bottom - top); } };
  grid(ctx, width, left, right, top, bottom, yScale, width >= 420);
  [30, 70].forEach((v) => {
    ctx.strokeStyle = v === 70 ? "rgba(226,85,85,.6)" : "rgba(24,183,124,.6)";
    ctx.beginPath();
    ctx.moveTo(left, yScale.y(v));
    ctx.lineTo(right, yScale.y(v));
    ctx.stroke();
  });
  drawLine(ctx, visible.indicators.rsi14, rows, "#57a0ff", left, right, yScale, 1.6);
}

function drawMacd(data) {
  const visible = visibleData(data);
  const { ctx, width, height } = setupCanvas(canvases.macd);
  const rows = visible.rows;
  const left = width < 520 ? 34 : 48;
  const right = width - 12;
  const top = 10;
  const bottom = height - 18;
  ctx.clearRect(0, 0, width, height);
  const values = [...visible.indicators.macd.line, ...visible.indicators.macd.signal, ...visible.indicators.macd.hist];
  const yScale = scaleY(values, top, bottom);
  grid(ctx, width, left, right, top, bottom, yScale, width >= 420);
  const zeroY = yScale.y(0);
  ctx.strokeStyle = "rgba(139, 153, 177, .6)";
  ctx.beginPath();
  ctx.moveTo(left, zeroY);
  ctx.lineTo(right, zeroY);
  ctx.stroke();
  const barWidth = Math.max(2, Math.min(9, ((right - left) / rows.length) * 0.62));
  visible.indicators.macd.hist.forEach((v, i) => {
    if (v == null) return;
    const x = left + (i / Math.max(rows.length - 1, 1)) * (right - left);
    ctx.fillStyle = v >= 0 ? "rgba(226,85,85,.52)" : "rgba(24,183,124,.52)";
    ctx.fillRect(x - barWidth / 2, Math.min(zeroY, yScale.y(v)), barWidth, Math.abs(zeroY - yScale.y(v)));
  });
  drawLine(ctx, visible.indicators.macd.line, rows, "#57a0ff", left, right, yScale, 1.4);
  drawLine(ctx, visible.indicators.macd.signal, rows, "#f6a641", left, right, yScale, 1.4);
}

function redrawCharts() {
  if (!latestChartData) return;
  drawPrice(latestChartData);
  drawRsi(latestChartData);
  drawMacd(latestChartData);
  redrawAnnotations();
}

function redrawAnnotations() {
  const canvas = canvases.draw;
  if (!canvas) return;
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  const strokes = activeStroke ? [...drawingStrokes, activeStroke] : drawingStrokes;
  strokes.forEach((stroke) => {
    if (!stroke.points?.length) return;
    ctx.strokeStyle = stroke.color || "#e25555";
    ctx.lineWidth = stroke.width || 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function drawPointFromEvent(event) {
  const rect = canvases.draw.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function setDrawingEnabled(enabled) {
  drawEnabled = enabled;
  document.body.classList.toggle("drawing-enabled", drawEnabled);
  const button = document.getElementById("drawToggle");
  if (button) button.textContent = drawEnabled ? "停止畫線" : "畫線";
}

function clearAnnotations() {
  drawingStrokes.length = 0;
  saveAnnotationsForStock();
  redrawAnnotations();
}

function updateZoomLabel() {
  const label = document.getElementById("zoomLabel");
  if (label) label.textContent = `${chartZoom.toFixed(1)}x`;
}

function setChartZoom(next) {
  chartZoom = Math.max(1, Math.min(8, next));
  updateZoomLabel();
  redrawCharts();
}

function crossedAbove(prevA, currentA, prevB, currentB) {
  return prevA != null && currentA != null && prevB != null && currentB != null && prevA <= prevB && currentA > currentB;
}

function crossedBelow(prevA, currentA, prevB, currentB) {
  return prevA != null && currentA != null && prevB != null && currentB != null && prevA >= prevB && currentA < currentB;
}

function avg(values) {
  const clean = values.filter((value) => value != null && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function analyzeEntrySignals(data) {
  const rows = data.rows;
  const i = rows.length - 1;
  const prev = rows[i - 1];
  const last = rows[i];
  const ma5 = data.indicators.ma5;
  const ma20 = data.indicators.ma20;
  const rsi14 = data.indicators.rsi14;
  const hist = data.indicators.macd.hist;
  const signals = [];
  const recent20 = rows.slice(Math.max(0, i - 20), i);
  const recent60 = rows.slice(Math.max(0, i - 60), i);
  const avgVolume = avg(recent20.map((row) => row.volume));
  const low60 = Math.min(...recent60.map((row) => row.low));
  const high60 = Math.max(...recent60.map((row) => row.high));
  const range60 = high60 - low60 || last.close || 1;
  const bottomPosition = (last.close - low60) / range60;
  const isNearBottom = bottomPosition <= 0.35 || last.low <= low60 * 1.08;
  const volumeRatio = avgVolume ? last.volume / avgVolume : 0;
  const isVolumeBlast = volumeRatio >= 2;
  const candleRange = Math.max(last.high - last.low, 0.01);
  const candleBody = last.close - last.open;
  const bodyRatio = candleBody / candleRange;
  const changePct = prev ? (last.close - prev.close) / prev.close : 0;
  const isLongRedCandle = last.close > last.open && bodyRatio >= 0.55 && changePct >= 0.03;

  if (isNearBottom) signals.push({ label: "接近 60 日低檔區", weight: 1 });
  if (isVolumeBlast) signals.push({ label: `成交量為 20 日均量 ${fmt.format(volumeRatio)} 倍`, weight: 3 });
  if (isLongRedCandle) signals.push({ label: "長紅 K 棒，實體強且漲幅大於 3%", weight: 3 });
  if (isNearBottom && isVolumeBlast && isLongRedCandle) signals.push({ label: "底部爆大量且帶長紅 K 棒", weight: 5 });
  if (crossedAbove(ma5[i - 1], ma5[i], ma20[i - 1], ma20[i])) signals.push({ label: "MA5 黃金交叉 MA20", weight: 2 });
  if (hist[i - 1] != null && hist[i] != null && hist[i - 1] <= 0 && hist[i] > 0) signals.push({ label: "MACD 翻多", weight: 2 });
  if (rsi14[i - 1] != null && rsi14[i] != null && rsi14[i - 1] < 50 && rsi14[i] >= 50) signals.push({ label: "RSI 站回 50", weight: 1 });
  const recentHigh = Math.max(...recent20.map((row) => row.high));
  if (last.close > recentHigh && avgVolume != null && last.volume > avgVolume * 1.3) signals.push({ label: "放量突破 20 日高點", weight: 2 });

  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const support = Math.min(...rows.slice(-20).map((row) => row.low));
  const stopLoss = Math.min(support, ma20[i] || support);
  let state = "等待";
  let className = "entry-wait";
  let message = "尚未符合底部爆大量長紅 K";
  if (isNearBottom && isVolumeBlast && isLongRedCandle) {
    state = "強訊號";
    className = "entry-strong";
    message = "底部爆大量長紅 K 成立，適合列入進場觀察";
  } else if (score >= 4 || (isVolumeBlast && isLongRedCandle)) {
    state = "觀察";
    className = "entry-watch";
    message = "量價有轉強跡象，但底部條件尚未完整";
  }
  return { state, className, message, score, signals, stopLoss, checks: { isNearBottom, isVolumeBlast, isLongRedCandle } };
}

function renderEntrySignals(data) {
  const status = document.getElementById("entryStatus");
  const list = document.getElementById("entrySignals");
  if (!status || !list) return;
  const result = analyzeEntrySignals(data);
  status.textContent = `${result.state}，分數 ${result.score}`;
  const signalItems = result.signals.length
    ? result.signals.map((signal) => `<li>${escapeHtml(signal.label)}</li>`).join("")
    : "<li>尚未出現明確進場訊號</li>";
  list.innerHTML = `
    <div class="entry-card">
      <span class="entry-badge ${result.className}">${escapeHtml(result.state)}</span>
      <strong>${escapeHtml(result.message)}</strong>
      <span>核心條件：底部區、爆大量、長紅 K。</span>
    </div>
    <div class="entry-card">
      <strong>觸發依據</strong>
      <ul>${signalItems}</ul>
    </div>
    <div class="entry-card">
      <strong>風險控管</strong>
      <span>參考停損：${fmt.format(result.stopLoss)}</span>
    </div>
  `;
  const notifyKey = `${data.stockNo}-${data.summary?.date || ""}-${result.score}`;
  if (notifyEnabled && result.score >= 4 && notifyKey !== lastEntryNotifyKey && "Notification" in window && Notification.permission === "granted") {
    lastEntryNotifyKey = notifyKey;
    new Notification(`${data.stockNo} 進場訊號`, { body: result.signals.map((signal) => signal.label).join("、") });
  }
}

function renderSummary(data) {
  const s = data.summary;
  const cls = trendClass(s.change);
  document.getElementById("chartTitle").textContent = `${data.stockNo} ${data.name || ""} 股票分析`;
  document.getElementById("subtitle").textContent = data.title || `${data.stockNo} K 線與技術指標`;
  document.getElementById("dataSourceLine").textContent = metaLine(data.metadata);
  document.getElementById("summary").innerHTML = `
    <div class="metric"><span>資料日期</span><strong>${escapeHtml(s.date)}</strong></div>
    <div class="metric"><span>現價</span><strong>${fmt.format(s.close)}</strong></div>
    <div class="metric"><span>漲跌幅</span><strong class="${cls}">${fmt.format(s.change)} / ${pct.format(s.changePct)}</strong></div>
    <div class="metric"><span>MA20 / MA60</span><strong>${formatNumber(s.ma20)} / ${formatNumber(s.ma60)}</strong></div>
    <div class="metric"><span>RSI / MACD</span><strong>${formatNumber(s.rsi14)} / ${formatNumber(s.macdHist)}</strong></div>
    <div class="metric"><span>支撐 / 壓力</span><strong>${fmt.format(s.support)} / ${fmt.format(s.resistance)}</strong></div>
    <div class="metric signal"><span>技術訊號</span><strong>${escapeHtml(s.signals.slice(0, 2).join("，") || "無明顯訊號")}</strong></div>
  `;
}

function renderAiSummary(data) {
  const el = document.getElementById("aiSummary");
  if (!el) return;
  const gradeClass = data.grade === "A" ? "grade-a" : data.grade === "B" ? "grade-b" : data.grade === "C" ? "grade-c" : "grade-d";
  el.innerHTML = `
    <div class="ai-main">
      <div>
        <span class="eyebrow">個股 AI 摘要</span>
        <h2>${escapeHtml(data.stockNo)} ${escapeHtml(data.name)}｜${escapeHtml(data.trendStatus)}</h2>
        <p>${escapeHtml(data.oneLineConclusion)}</p>
        <p class="coverage-line">資料完整度：${escapeHtml(data.scoreCoverage?.label || "--")}｜可信度：${escapeHtml(data.confidenceLabel || "--")}｜實際納入 ${data.scoreCoverage?.scored ?? 0} 個評分項目</p>
      </div>
      <div class="score-ring ${gradeClass}">
        <strong>${data.aiScore}</strong>
        <span>${escapeHtml(data.grade)} 級</span>
      </div>
    </div>
    <div class="ai-columns">
      <div>
        <h3>值得注意原因</h3>
        <ul>${data.noteworthy.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div>
        <h3>主要風險</h3>
        <ul>${data.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
      <div>
        <h3>近期重要日期</h3>
        <ul>${data.importantDates.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    </div>
    <div class="score-items">
      ${data.scoreItems
        .map(
          (item) => `
        <div class="score-item">
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            ${dataBadge(item.metadata)}
          </div>
          <span class="item-score">${item.score == null ? "未接入" : `${item.score} 分`}</span>
          <p>${escapeHtml(item.basis)}</p>
          <p class="formula-line">${escapeHtml(item.formula || "")}</p>
          <small>${escapeHtml(metaLine(item.metadata))}</small>
          ${sourceLink(item.metadata)}
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderStockRows(items, container, emptyText = "目前沒有符合條件的資料") {
  if (!container) return;
  if (!items?.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  container.innerHTML = `
    <div class="table-head">
      <span>股票</span><span>現價</span><span>漲跌</span><span>AI</span><span>異動原因 / 風險</span><span>日期</span>
    </div>
    ${items
      .map(
        (item) => `
      <button type="button" class="table-row" data-stock="${escapeHtml(item.stockNo)}">
        <span><b>${escapeHtml(item.stockNo)}</b> ${escapeHtml(item.name)}</span>
        <span>${formatNumber(item.price)}</span>
        <span class="${trendClass(item.changePct || 0)}">${formatPct(item.changePct)}</span>
        <span><b>${item.aiScore ?? "--"}</b></span>
        <span>${escapeHtml(item.reason || "--")}<small>${escapeHtml(item.risk || "")}</small><small>${escapeHtml(metaLine(item.metadata))}</small></span>
        <span>${escapeHtml(item.dataDate || "--")}</span>
      </button>
    `,
      )
      .join("")}
  `;
}

function renderCompactStocks(items, container, emptyText) {
  if (!container) return;
  if (!items?.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyText || "目前沒有資料")}</div>`;
    return;
  }
  container.innerHTML = items
    .map(
      (item) => `
      <button type="button" class="compact-item" data-stock="${escapeHtml(item.stockNo)}">
        <span><b>${escapeHtml(item.stockNo)}</b> ${escapeHtml(item.name)}</span>
        <strong class="${trendClass(item.changePct || item.priceChangePct || 0)}">${formatPct(item.changePct ?? item.priceChangePct)}</strong>
        <small>${escapeHtml(item.reason || item.tags?.join("、") || item.tech?.reason || "--")}</small>
      </button>
    `,
    )
    .join("");
}

function renderDashboardAlerts() {
  const container = document.getElementById("dashboardAlerts");
  if (!container) return;
  const latest = alertHistory.slice(0, 6);
  container.innerHTML = latest.length
    ? latest.map((item) => `<div class="alert-item"><strong>${escapeHtml(item.stockNo)} ${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span><small>${formatDateTime(item.createdAt)}</small></div>`).join("")
    : `<div class="empty">尚無提醒紀錄。新增提醒後，觸發紀錄會保留在這裡。</div>`;
}

function renderDashboard(data) {
  document.getElementById("dashboardMeta").textContent = `今日 ${data.today}｜最後更新 ${formatDateTime(data.fetchedAt)}｜價格資料日 ${data.lastUpdatedAt || "--"}`;
  document.getElementById("topDate").textContent = `日期 ${data.today}`;
  document.getElementById("topUpdated").textContent = `最後更新 ${formatDateTime(data.fetchedAt)}`;
  const topStatus = document.getElementById("topStatus");
  topStatus.textContent = data.dataStatus === "ok" ? "資料正常" : "資料部分可用";
  topStatus.className = `status-pill ${data.dataStatus === "ok" ? "ok" : "stale"}`;
  renderStockRows(data.noteworthyStocks, document.getElementById("noteworthyStocks"));
  renderCompactStocks(data.revenueAnomalies, document.getElementById("revenueAnomalyList"), "目前沒有營收異常股票");
  const inst = document.getElementById("institutionalAnomalyList");
  inst.innerHTML = `<div class="empty"><strong>${escapeHtml(data.institutionalAnomalies.message)}</strong><small>${escapeHtml(metaLine(data.institutionalAnomalies.metadata))}</small></div>`;
  renderCompactStocks(data.technicalBreakouts, document.getElementById("technicalBreakoutList"), "目前沒有技術突破股票");
  const priceList = document.getElementById("priceEventList");
  priceList.innerHTML = data.priceEvents?.length
    ? data.priceEvents
        .map(
          (item) => `
        <div class="compact-item no-click">
          <span><b>${escapeHtml(item.item)}</b> ${escapeHtml(item.direction)}</span>
          <strong class="${trendClass(item.changePct)}">${formatPct(item.changePct)}</strong>
          <small>來源：${escapeHtml(item.source)}｜AI 推論：${escapeHtml(item.aiInference)}</small>
        </div>
      `,
        )
        .join("")
    : `<div class="empty">目前沒有可讀取的產業報價事件</div>`;
  document.getElementById("themeList").innerHTML = data.hotThemes
    .map((item) => `<div class="theme-chip"><strong>${escapeHtml(item.theme)}</strong><span>${item.count} 檔｜均分 ${item.avgScore}</span></div>`)
    .join("");
  renderDashboardAlerts();
}

function renderVersionStatus(data) {
  const el = document.getElementById("versionStatus");
  if (!el) return;
  el.innerHTML = `
    <div class="version-item"><span>App version</span><strong>${escapeHtml(data.appVersion)}</strong></div>
    <div class="version-item"><span>Git commit hash</span><strong>${escapeHtml(data.gitCommit)}</strong></div>
    <div class="version-item"><span>部署時間</span><strong>${formatDateTime(data.deployedAt)}</strong></div>
    <div class="version-item"><span>API 資料更新時間</span><strong>${formatDateTime(data.apiDataUpdatedAt)}</strong></div>
    <div class="version-item"><span>前端檔案版本</span><strong>${escapeHtml(data.frontendVersion)}</strong></div>
    <div class="version-item"><span>必含提交</span><strong>${escapeHtml((data.includedCommits || []).join(", "))}</strong></div>
  `;
}

async function loadVersionStatus() {
  const data = await fetchApi("/api/version");
  renderVersionStatus(data);
}

async function loadDashboard() {
  const meta = document.getElementById("dashboardMeta");
  if (meta) meta.textContent = "正在讀取今日市場資料";
  const data = await fetchApi("/api/dashboard");
  renderDashboard(data);
}

function renderRevenueRadar(data) {
  const select = document.getElementById("revenueFilter");
  if (select && !select.options.length) {
    select.innerHTML = data.filters.map((filter) => `<option value="${escapeHtml(filter)}">${filter === "all" ? "全部條件" : escapeHtml(filter)}</option>`).join("");
  }
  document.getElementById("revenueRadarMeta").textContent = `更新 ${formatDateTime(data.fetchedAt)}｜${data.rows.length} 筆｜${data.universeScope?.label || ""}｜掃描 ${data.universeScope?.scannedCount || 0} 檔`;
  const list = document.getElementById("revenueRadarList");
  if (!data.rows.length) {
    list.innerHTML = `<div class="empty">目前沒有符合條件的營收異常資料。</div>`;
    return;
  }
  list.innerHTML = `
    <div class="radar-head"><span>股票</span><span>月營收</span><span>年增</span><span>月增</span><span>條件</span><span>資料期</span></div>
    ${data.rows
      .map(
        (row) => `
      <button type="button" class="radar-row" data-stock="${escapeHtml(row.stockNo)}">
        <span><b>${escapeHtml(row.stockNo)}</b> ${escapeHtml(row.name)}<small>${escapeHtml(row.industry)}</small></span>
        <span>${moneyFmt.format(row.latestRevenue / 1000)} 千元</span>
        <span class="${trendClass(row.yoy || 0)}">${formatPct(row.yoy)}</span>
        <span class="${trendClass(row.mom || 0)}">${formatPct(row.mom)}</span>
        <span>${escapeHtml(row.tags.join("、") || "--")}</span>
        <span>${escapeHtml(row.dataDate)}</span>
      </button>
    `,
      )
      .join("")}
  `;
}

async function loadRevenueRadar(filter = document.getElementById("revenueFilter")?.value || "all") {
  document.getElementById("revenueRadarMeta").textContent = "正在讀取營收雷達";
  const data = await fetchApi("/api/revenue-radar", { filter });
  renderRevenueRadar(data);
}

function renderIndustryQuotes(data) {
  const status = document.getElementById("quoteStatus");
  const list = document.getElementById("industryQuotes");
  status.textContent = `${data.items.length} 筆｜更新 ${formatDateTime(data.fetchedAt)}｜${data.note}`;
  list.innerHTML = data.items
    .map((item) => {
      if (item.error) {
        return `<div class="quote-card"><small>${escapeHtml(item.group)}</small><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.symbol)} 讀取失敗</span><small>${escapeHtml(item.error)}</small></div>`;
      }
      return `
        <div class="quote-card">
          <small>${escapeHtml(item.group)} / ${escapeHtml(item.note)}</small>
          <strong>${escapeHtml(item.name)} ${escapeHtml(item.symbol)}</strong>
          <span>價格 ${formatNumber(item.price)}｜<b class="${trendClass(item.change)}">${formatNumber(item.change)} / ${formatPct(item.changePct)}</b></span>
          <span>${escapeHtml(item.date)}｜代理指標</span>
          ${dataBadge(item.metadata)}
          ${sourceLink(item.metadata)}
          <button type="button" data-quote-stock="${escapeHtml(item.symbol)}">看 K 線</button>
        </div>
      `;
    })
    .join("");
}

async function loadIndustryQuotes() {
  document.getElementById("quoteStatus").textContent = "正在讀取產業報價";
  const data = await fetchApi("/api/industry-quotes");
  renderIndustryQuotes(data);
}

function alertTypeLabel(type) {
  const labels = {
    price_above: "股價突破",
    price_below: "跌破價格",
    ma_golden: "均線黃金交叉",
    ma_death: "均線死亡交叉",
    rsi_overbought: "RSI 超買",
    rsi_oversold: "RSI 超賣",
    macd_bull: "MACD 翻多",
    macd_bear: "MACD 翻空",
    volume_spike: "成交量放大",
    revenue_publish: "月營收公告",
    keyword: "新聞關鍵字",
    quote_change: "產業報價變動",
  };
  return labels[type] || type;
}

function renderAlerts() {
  const rules = document.getElementById("alertRules");
  const history = document.getElementById("alertHistory");
  if (rules) {
    rules.innerHTML = alertRules.length
      ? alertRules
          .map(
            (rule) => `
          <div class="alert-item">
            <strong>${escapeHtml(rule.stockNo)} ${escapeHtml(alertTypeLabel(rule.type))}</strong>
            <span>門檻：${escapeHtml(rule.value || "系統判斷")}｜${rule.enabled ? "啟用" : "停用"}</span>
            <small>${formatDateTime(rule.createdAt)}</small>
            <button type="button" data-remove-alert="${escapeHtml(rule.id)}">移除</button>
          </div>
        `,
          )
          .join("")
      : `<div class="empty">尚未設定提醒規則。</div>`;
  }
  if (history) {
    history.innerHTML = alertHistory.length
      ? alertHistory
          .slice(0, 30)
          .map((item) => `<div class="alert-item"><strong>${escapeHtml(item.stockNo)} ${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span><small>${formatDateTime(item.createdAt)}</small></div>`)
          .join("")
      : `<div class="empty">尚無觸發紀錄。</div>`;
  }
  renderDashboardAlerts();
}

function addAlertHistory(entry) {
  const key = `${entry.stockNo}-${entry.ruleId}-${entry.dataDate || ""}-${entry.title}`;
  if (alertHistory.some((item) => item.key === key)) return;
  alertHistory.unshift({ ...entry, key, createdAt: new Date().toISOString() });
  alertHistory = alertHistory.slice(0, 120);
  saveJson(alertHistoryKey, alertHistory);
  renderAlerts();
}

function evaluateAlert(rule, data) {
  const rows = data.rows;
  const i = rows.length - 1;
  const last = rows[i];
  const prev = rows[i - 1];
  const ma5 = data.indicators.ma5;
  const ma20 = data.indicators.ma20;
  const rsi14 = data.indicators.rsi14;
  const hist = data.indicators.macd.hist;
  const value = Number(rule.value);
  const avgVol = avg(rows.slice(-21, -1).map((row) => row.volume));
  const checks = {
    price_above: Number.isFinite(value) && last.close >= value,
    price_below: Number.isFinite(value) && last.close <= value,
    ma_golden: crossedAbove(ma5[i - 1], ma5[i], ma20[i - 1], ma20[i]),
    ma_death: crossedBelow(ma5[i - 1], ma5[i], ma20[i - 1], ma20[i]),
    rsi_overbought: rsi14[i] != null && rsi14[i] >= (Number.isFinite(value) ? value : 70),
    rsi_oversold: rsi14[i] != null && rsi14[i] <= (Number.isFinite(value) ? value : 30),
    macd_bull: hist[i - 1] != null && hist[i] != null && hist[i - 1] <= 0 && hist[i] > 0,
    macd_bear: hist[i - 1] != null && hist[i] != null && hist[i - 1] >= 0 && hist[i] < 0,
    volume_spike: avgVol != null && last.volume / avgVol >= (Number.isFinite(value) ? value : 2),
  };
  if (!checks[rule.type]) return;
  addAlertHistory({
    ruleId: rule.id,
    stockNo: data.stockNo,
    title: alertTypeLabel(rule.type),
    message: `${data.name || data.stockNo} 於 ${last.date} 觸發：現價 ${fmt.format(last.close)}，前日 ${prev ? fmt.format(prev.close) : "--"}`,
    dataDate: last.date,
  });
}

function evaluateAlertsForStock(data) {
  alertRules.filter((rule) => rule.enabled && rule.stockNo === data.stockNo).forEach((rule) => evaluateAlert(rule, data));
}

async function loadAiSummary(stockNo) {
  const el = document.getElementById("aiSummary");
  if (el) el.innerHTML = `<div class="loading">正在產生 AI 摘要</div>`;
  const data = await fetchApi("/api/ai-summary", { stockNo });
  renderAiSummary(data);
}

async function loadStock() {
  const stockNo = document.getElementById("stockNo").value.trim() || "2330";
  const months = document.getElementById("months").value;
  const status = document.getElementById("status");
  status.textContent = "讀取交易資料中";
  status.className = "status-pill";
  const [stockData] = await Promise.all([fetchApi("/api/twse", { stockNo, months }), loadAiSummary(stockNo).catch((error) => {
    const el = document.getElementById("aiSummary");
    if (el) el.innerHTML = `<div class="empty">AI 摘要讀取失敗：${escapeHtml(error.message)}</div>`;
  })]);
  if (currentLoadedStock && currentLoadedStock !== stockNo) saveAnnotationsForStock(currentLoadedStock);
  currentLoadedStock = stockNo;
  loadAnnotationsForStock(stockNo);
  latestChartData = stockData;
  chartZoom = 1;
  updateZoomLabel();
  renderSummary(stockData);
  renderEntrySignals(stockData);
  renderWatchlist();
  redrawCharts();
  evaluateAlertsForStock(stockData);
  status.textContent = `資料完成｜${stockData.source}｜${formatDateTime(stockData.fetchedAt)}`;
  status.className = `status-pill ${isStale(stockData.fetchedAt) ? "stale" : "ok"}`;
}

document.getElementById("queryForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  loadStock().catch((error) => {
    const status = document.getElementById("status");
    status.textContent = error.message;
    status.className = "status-pill stale";
  });
});

document.getElementById("dashboardRefresh")?.addEventListener("click", () => {
  loadDashboard().catch((error) => {
    document.getElementById("dashboardMeta").textContent = error.message;
  });
});

document.getElementById("watchForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  addWatchItem(document.getElementById("watchStock").value, document.getElementById("watchName").value, document.getElementById("watchIndustry").value);
  document.getElementById("watchStock").value = "";
  document.getElementById("watchName").value = "";
  document.getElementById("watchIndustry").value = "";
});

document.getElementById("industryTabs")?.addEventListener("click", (event) => {
  const majorButton = event.target.closest("[data-major-industry]");
  if (majorButton) {
    selectedMajorIndustry = majorButton.dataset.majorIndustry;
    selectedSubIndustry = allIndustry;
    renderWatchlist();
    return;
  }
  const subButton = event.target.closest("[data-sub-industry]");
  if (subButton) {
    selectedSubIndustry = subButton.dataset.subIndustry;
    renderWatchlist();
  }
});

document.body.addEventListener("click", (event) => {
  const removeWatch = event.target.closest("[data-remove]");
  if (removeWatch) {
    event.preventDefault();
    event.stopPropagation();
    watchlist = watchlist.filter((item) => item.stockNo !== removeWatch.dataset.remove);
    saveWatchlist();
    renderWatchlist();
    return;
  }
  const stockTarget = event.target.closest("[data-stock]");
  if (stockTarget) {
    document.getElementById("stockNo").value = stockTarget.dataset.stock;
    location.hash = "#analysis";
    loadStock().catch((error) => {
      document.getElementById("status").textContent = error.message;
    });
  }
});

document.getElementById("industryQuotes")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quote-stock]");
  if (!button) return;
  document.getElementById("stockNo").value = button.dataset.quoteStock;
  location.hash = "#analysis";
  loadStock().catch((error) => {
    document.getElementById("status").textContent = error.message;
  });
});

document.getElementById("quoteRefresh")?.addEventListener("click", () => {
  loadIndustryQuotes().catch((error) => {
    document.getElementById("quoteStatus").textContent = error.message;
  });
});

document.getElementById("revenueFilter")?.addEventListener("change", (event) => {
  loadRevenueRadar(event.target.value).catch((error) => {
    document.getElementById("revenueRadarMeta").textContent = error.message;
  });
});

document.getElementById("alertForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const stockNo = document.getElementById("alertStock").value.trim() || document.getElementById("stockNo").value.trim();
  if (!stockNo) return;
  alertRules.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    stockNo,
    type: document.getElementById("alertType").value,
    value: document.getElementById("alertValue").value.trim(),
    enabled: true,
    createdAt: new Date().toISOString(),
  });
  saveJson(alertRulesKey, alertRules);
  document.getElementById("alertStock").value = "";
  document.getElementById("alertValue").value = "";
  renderAlerts();
  if (latestChartData?.stockNo === stockNo) evaluateAlertsForStock(latestChartData);
});

document.getElementById("alertRules")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-alert]");
  if (!button) return;
  alertRules = alertRules.filter((rule) => rule.id !== button.dataset.removeAlert);
  saveJson(alertRulesKey, alertRules);
  renderAlerts();
});

document.getElementById("drawToggle")?.addEventListener("click", () => setDrawingEnabled(!drawEnabled));
document.getElementById("drawClear")?.addEventListener("click", clearAnnotations);
document.getElementById("zoomIn")?.addEventListener("click", () => setChartZoom(chartZoom * 1.5));
document.getElementById("zoomOut")?.addEventListener("click", () => setChartZoom(chartZoom / 1.5));
document.getElementById("zoomReset")?.addEventListener("click", () => setChartZoom(1));

document.getElementById("notifyToggle")?.addEventListener("click", async () => {
  if (!notifyEnabled && "Notification" in window && Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    notifyEnabled = permission === "granted";
  } else if (!notifyEnabled && "Notification" in window) {
    notifyEnabled = Notification.permission === "granted";
  } else {
    notifyEnabled = false;
  }
  localStorage.setItem(notifyStorageKey, notifyEnabled ? "1" : "0");
  updateNotifyButton();
});

function updateNotifyButton() {
  const button = document.getElementById("notifyToggle");
  if (button) button.textContent = notifyEnabled ? "關閉通知" : "開啟通知";
}

canvases.draw?.addEventListener("pointerdown", (event) => {
  if (!drawEnabled) return;
  event.preventDefault();
  canvases.draw.setPointerCapture?.(event.pointerId);
  activeStroke = {
    color: document.getElementById("drawColor")?.value || "#e25555",
    width: Number(document.getElementById("drawWidth")?.value || 3),
    points: [drawPointFromEvent(event)],
  };
  redrawAnnotations();
});

canvases.draw?.addEventListener("pointermove", (event) => {
  if (!drawEnabled || !activeStroke) return;
  event.preventDefault();
  activeStroke.points.push(drawPointFromEvent(event));
  redrawAnnotations();
});

function finishActiveStroke(event) {
  if (!activeStroke) return;
  event?.preventDefault();
  if (activeStroke.points.length > 1) drawingStrokes.push(activeStroke);
  activeStroke = null;
  saveAnnotationsForStock();
  redrawAnnotations();
}

canvases.draw?.addEventListener("pointerup", finishActiveStroke);
canvases.draw?.addEventListener("pointercancel", finishActiveStroke);
canvases.draw?.addEventListener("pointerleave", finishActiveStroke);

document.querySelector(".draw-surface")?.addEventListener(
  "wheel",
  (event) => {
    if (!latestChartData) return;
    event.preventDefault();
    setChartZoom(event.deltaY < 0 ? chartZoom * 1.15 : chartZoom / 1.15);
  },
  { passive: false },
);

window.addEventListener("resize", () => redrawCharts());

updateNotifyButton();
updateZoomLabel();
renderWatchlist();
renderAlerts();
loadDashboard().catch((error) => {
  document.getElementById("dashboardMeta").textContent = error.message;
});
loadRevenueRadar().catch((error) => {
  document.getElementById("revenueRadarMeta").textContent = error.message;
});
loadIndustryQuotes().catch((error) => {
  document.getElementById("quoteStatus").textContent = error.message;
});
loadVersionStatus().catch((error) => {
  const el = document.getElementById("versionStatus");
  if (el) el.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
loadStock().catch((error) => {
  const status = document.getElementById("status");
  status.textContent = error.message;
  status.className = "status-pill stale";
});
