const canvases = {
  price: document.getElementById("priceChart"),
  draw: document.getElementById("drawCanvas"),
  rsi: document.getElementById("rsiChart"),
  macd: document.getElementById("macdChart"),
};

const fmt = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("zh-TW", { style: "percent", maximumFractionDigits: 2 });
const watchStorageKey = "tw-stock-watchlist-v1";
const notifyStorageKey = "tw-stock-entry-notify-v1";
const allIndustry = "全部";
let selectedIndustry = allIndustry;
let currentLoadedStock = "";
let drawEnabled = false;
let activeStroke = null;
let notifyEnabled = localStorage.getItem(notifyStorageKey) === "1";
let lastEntryNotifyKey = "";
let latestChartData = null;
let chartZoom = 1;
const drawingStrokes = [];

const defaultWatchlist = [
  { stockNo: "2330", name: "台積電", industry: "台積電供應鏈 / 晶圓代工" },

  { stockNo: "2404", name: "漢唐", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "6139", name: "亞翔", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "5536", name: "聖暉*", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "6196", name: "帆宣", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "6640", name: "均華", industry: "台積電供應鏈 / 建廠廠務設備" },

  { stockNo: "4763", name: "材料-KY", industry: "台積電供應鏈 / 特化材料" },
  { stockNo: "4739", name: "康普", industry: "台積電供應鏈 / 特化材料" },
  { stockNo: "1723", name: "中碳", industry: "台積電供應鏈 / 特化材料" },
  { stockNo: "4755", name: "三福化", industry: "台積電供應鏈 / 特化材料" },
  { stockNo: "4768", name: "晶呈科技", industry: "台積電供應鏈 / 特化材料" },
  { stockNo: "4721", name: "美琪瑪", industry: "台積電供應鏈 / 特化材料" },
  { stockNo: "4770", name: "上品", industry: "台積電供應鏈 / 特化材料" },

  { stockNo: "2344", name: "華邦電", industry: "記憶體" },
  { stockNo: "2408", name: "南亞科", industry: "記憶體" },
  { stockNo: "2337", name: "旺宏", industry: "記憶體" },
  { stockNo: "6770", name: "力積電", industry: "記憶體" },
  { stockNo: "8299", name: "群聯", industry: "記憶體" },
  { stockNo: "6239", name: "力成", industry: "記憶體" },
  { stockNo: "3006", name: "晶豪科", industry: "記憶體" },
  { stockNo: "2329", name: "華泰", industry: "記憶體" },

  { stockNo: "2327", name: "國巨", industry: "被動元件" },
  { stockNo: "2492", name: "華新科", industry: "被動元件" },
  { stockNo: "3026", name: "禾伸堂", industry: "被動元件" },
  { stockNo: "2478", name: "大毅", industry: "被動元件" },
  { stockNo: "6173", name: "信昌電", industry: "被動元件" },

  { stockNo: "2481", name: "強茂", industry: "功率元件" },
  { stockNo: "2342", name: "茂矽", industry: "功率元件" },
  { stockNo: "3016", name: "嘉晶", industry: "功率元件" },
  { stockNo: "5425", name: "台半", industry: "功率元件" },
  { stockNo: "3707", name: "漢磊", industry: "功率元件" },
  { stockNo: "8255", name: "朋程", industry: "功率元件" },

  { stockNo: "3037", name: "欣興", industry: "ABF 載板" },
  { stockNo: "3189", name: "景碩", industry: "ABF 載板" },
  { stockNo: "8046", name: "南電", industry: "ABF 載板" },

  { stockNo: "1802", name: "台玻", industry: "玻璃基板 / 面板玻璃" },
  { stockNo: "3481", name: "群創", industry: "玻璃基板 / 面板玻璃" },
  { stockNo: "3149", name: "正達", industry: "玻璃基板 / 面板玻璃" },

  { stockNo: "6207", name: "雷科", industry: "玻璃基板 / 設備材料" },
  { stockNo: "1809", name: "中釉", industry: "玻璃基板 / 設備材料" },
  { stockNo: "4976", name: "佳凌", industry: "玻璃基板 / 設備材料" },

  { stockNo: "2383", name: "台光電", industry: "銅箔基板 / CCL" },
  { stockNo: "6213", name: "聯茂", industry: "銅箔基板 / CCL" },
  { stockNo: "6274", name: "台燿", industry: "銅箔基板 / CCL" },
  { stockNo: "8358", name: "金居", industry: "銅箔基板 / CCL" },
  { stockNo: "5469", name: "瀚宇博", industry: "銅箔基板 / CCL" },
  { stockNo: "2368", name: "金像電", industry: "銅箔基板 / CCL" },

  { stockNo: "6488", name: "環球晶", industry: "半導體材料 / 矽晶圓" },
  { stockNo: "5483", name: "中美晶", industry: "半導體材料 / 矽晶圓" },
  { stockNo: "6182", name: "合晶", industry: "半導體材料 / 矽晶圓" },

  { stockNo: "1773", name: "勝一", industry: "半導體材料 / 化學材料" },

  { stockNo: "1605", name: "華新", industry: "原物料 / 漲價波動" },
  { stockNo: "2002", name: "中鋼", industry: "原物料 / 漲價波動" },
  { stockNo: "1303", name: "南亞", industry: "原物料 / 漲價波動" },
  { stockNo: "6505", name: "台塑化", industry: "原物料 / 漲價波動" },
  { stockNo: "1304", name: "台聚", industry: "原物料 / 漲價波動" },
  { stockNo: "1312", name: "國喬", industry: "原物料 / 漲價波動" },

  { stockNo: "2454", name: "聯發科", industry: "IC 設計" },

  { stockNo: "3455", name: "由田", industry: "小型股 / 題材觀察" },
  { stockNo: "4908", name: "前鼎", industry: "小型股 / 題材觀察" },
  { stockNo: "3163", name: "波若威", industry: "小型股 / 題材觀察" },
  { stockNo: "8088", name: "品安", industry: "小型股 / 題材觀察" },
  { stockNo: "3260", name: "威剛", industry: "小型股 / 題材觀察" },
  { stockNo: "6125", name: "廣運", industry: "小型股 / 題材觀察" },
  { stockNo: "6245", name: "立端", industry: "小型股 / 題材觀察" },
  { stockNo: "4979", name: "華星光", industry: "小型股 / 題材觀察" },

  { stockNo: "2317", name: "鴻海", industry: "電子代工" },
  { stockNo: "2881", name: "富邦金", industry: "金融保險" },
  { stockNo: "2603", name: "長榮", industry: "航運" },
];
const industryMapAdditions = [
  { stockNo: "2330", name: "台積電", industry: "半導體 / 晶圓代工" },
  { stockNo: "2303", name: "聯電", industry: "半導體 / 晶圓代工" },
  { stockNo: "6770", name: "力積電", industry: "半導體 / 晶圓代工與記憶體" },
  { stockNo: "5347", name: "世界", industry: "半導體 / 晶圓代工" },
  { stockNo: "3105", name: "穩懋", industry: "半導體 / 化合物晶圓代工" },

  { stockNo: "2404", name: "漢唐", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "6139", name: "亞翔", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "5536", name: "聖暉*", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "6196", name: "帆宣", industry: "台積電供應鏈 / 建廠廠務設備" },
  { stockNo: "6667", name: "信紘科", industry: "台積電供應鏈 / 廠務與特殊氣體" },
  { stockNo: "6806", name: "森崴能源", industry: "台積電供應鏈 / 綠電與能源" },

  { stockNo: "5443", name: "均豪", industry: "半導體設備 / 檢測與自動化" },
  { stockNo: "6640", name: "均華", industry: "半導體設備 / 先進封裝設備" },
  { stockNo: "3455", name: "由田", industry: "半導體設備 / AOI 檢測" },
  { stockNo: "3131", name: "弘塑", industry: "半導體設備 / 濕製程" },
  { stockNo: "3583", name: "辛耘", industry: "半導體設備 / 再生晶圓與設備" },
  { stockNo: "6187", name: "萬潤", industry: "半導體設備 / 封裝自動化" },
  { stockNo: "6125", name: "廣運", industry: "半導體設備 / 自動化與物流" },
  { stockNo: "2464", name: "盟立", industry: "半導體設備 / 自動化與機器人" },

  { stockNo: "4763", name: "材料-KY", industry: "半導體材料 / 特用化學" },
  { stockNo: "4768", name: "晶呈科技", industry: "半導體材料 / 特用氣體" },
  { stockNo: "4770", name: "上品", industry: "半導體材料 / 耐腐蝕材料" },
  { stockNo: "4755", name: "三福化", industry: "半導體材料 / 濕電子化學品" },
  { stockNo: "1773", name: "勝一", industry: "半導體材料 / 溶劑" },
  { stockNo: "1560", name: "中砂", industry: "半導體材料 / 再生晶圓與鑽石碟" },
  { stockNo: "2338", name: "光罩", industry: "半導體材料 / 光罩" },
  { stockNo: "6488", name: "環球晶", industry: "半導體材料 / 矽晶圓" },
  { stockNo: "5483", name: "中美晶", industry: "半導體材料 / 矽晶圓" },
  { stockNo: "6182", name: "合晶", industry: "半導體材料 / 矽晶圓" },
  { stockNo: "3016", name: "嘉晶", industry: "半導體材料 / 磊晶與功率元件" },

  { stockNo: "3711", name: "日月光投控", industry: "半導體 / 封測" },
  { stockNo: "6239", name: "力成", industry: "半導體 / 封測" },
  { stockNo: "2449", name: "京元電子", industry: "半導體 / 測試" },
  { stockNo: "3264", name: "欣銓", industry: "半導體 / 測試" },
  { stockNo: "8150", name: "南茂", industry: "半導體 / 封測" },
  { stockNo: "6147", name: "頎邦", industry: "半導體 / 驅動 IC 封測" },
  { stockNo: "6271", name: "同欣電", industry: "半導體 / 車用與影像封裝" },

  { stockNo: "2454", name: "聯發科", industry: "IC 設計 / 手機與 ASIC" },
  { stockNo: "2379", name: "瑞昱", industry: "IC 設計 / 網通與音訊" },
  { stockNo: "3661", name: "世芯-KY", industry: "IC 設計 / AI ASIC" },
  { stockNo: "3443", name: "創意", industry: "IC 設計 / ASIC 服務" },
  { stockNo: "3035", name: "智原", industry: "IC 設計 / ASIC 服務" },
  { stockNo: "5274", name: "信驊", industry: "IC 設計 / 伺服器管理晶片" },
  { stockNo: "6415", name: "矽力*-KY", industry: "IC 設計 / 電源管理" },
  { stockNo: "4919", name: "新唐", industry: "IC 設計 / MCU" },
  { stockNo: "6202", name: "盛群", industry: "IC 設計 / MCU" },
  { stockNo: "2436", name: "偉詮電", industry: "IC 設計 / MCU 與電源" },
  { stockNo: "2458", name: "義隆", industry: "IC 設計 / 觸控" },

  { stockNo: "2344", name: "華邦電", industry: "記憶體 / DRAM 與 Flash" },
  { stockNo: "2408", name: "南亞科", industry: "記憶體 / DRAM" },
  { stockNo: "2337", name: "旺宏", industry: "記憶體 / NOR Flash" },
  { stockNo: "8299", name: "群聯", industry: "記憶體 / 控制 IC" },
  { stockNo: "3006", name: "晶豪科", industry: "記憶體 / IC 設計" },
  { stockNo: "2329", name: "華泰", industry: "記憶體 / 封測" },
  { stockNo: "3260", name: "威剛", industry: "記憶體 / 模組" },
  { stockNo: "8271", name: "宇瞻", industry: "記憶體 / 模組" },
  { stockNo: "4967", name: "十銓", industry: "記憶體 / 模組" },
  { stockNo: "8088", name: "品安", industry: "記憶體 / 模組" },
  { stockNo: "5289", name: "宜鼎", industry: "記憶體 / 工控模組" },
  { stockNo: "2451", name: "創見", industry: "記憶體 / 模組" },

  { stockNo: "3037", name: "欣興", industry: "PCB / ABF 載板" },
  { stockNo: "3189", name: "景碩", industry: "PCB / ABF 載板" },
  { stockNo: "8046", name: "南電", industry: "PCB / ABF 載板" },
  { stockNo: "2383", name: "台光電", industry: "PCB / CCL 銅箔基板" },
  { stockNo: "6274", name: "台燿", industry: "PCB / CCL 銅箔基板" },
  { stockNo: "6213", name: "聯茂", industry: "PCB / CCL 銅箔基板" },
  { stockNo: "8358", name: "金居", industry: "PCB / 銅箔" },
  { stockNo: "5469", name: "瀚宇博", industry: "PCB / HDI 與板廠" },
  { stockNo: "2368", name: "金像電", industry: "PCB / AI 伺服器板" },
  { stockNo: "2313", name: "華通", industry: "PCB / HDI 與車用板" },
  { stockNo: "3044", name: "健鼎", industry: "PCB / 多層板" },
  { stockNo: "4958", name: "臻鼎-KY", industry: "PCB / 蘋果與伺服器板" },
  { stockNo: "6191", name: "精成科", industry: "PCB / 多層板" },

  { stockNo: "1802", name: "台玻", industry: "玻璃基板 / 玻纖與玻璃材料" },
  { stockNo: "3481", name: "群創", industry: "玻璃基板 / 面板與先進封裝題材" },
  { stockNo: "3149", name: "正達", industry: "玻璃基板 / 玻璃加工" },
  { stockNo: "6207", name: "雷科", industry: "玻璃基板 / 雷射設備" },
  { stockNo: "1809", name: "中釉", industry: "玻璃基板 / 薄膜與釉料" },
  { stockNo: "4976", name: "佳凌", industry: "玻璃基板 / 光學玻璃加工" },
  { stockNo: "2409", name: "友達", industry: "面板 / 顯示器" },
  { stockNo: "6116", name: "彩晶", industry: "面板 / 顯示器" },

  { stockNo: "2327", name: "國巨", industry: "被動元件 / MLCC" },
  { stockNo: "2492", name: "華新科", industry: "被動元件 / MLCC" },
  { stockNo: "3026", name: "禾伸堂", industry: "被動元件 / 通路與 MLCC" },
  { stockNo: "2478", name: "大毅", industry: "被動元件 / 電阻" },
  { stockNo: "6173", name: "信昌電", industry: "被動元件 / MLCC" },
  { stockNo: "2375", name: "凱美", industry: "被動元件 / 電容" },
  { stockNo: "2472", name: "立隆電", industry: "被動元件 / 鋁電容" },
  { stockNo: "2428", name: "興勤", industry: "被動元件 / 保護元件" },
  { stockNo: "3042", name: "晶技", industry: "被動元件 / 石英元件" },

  { stockNo: "2481", name: "強茂", industry: "功率元件 / 二極體" },
  { stockNo: "5425", name: "台半", industry: "功率元件 / 二極體與 MOSFET" },
  { stockNo: "2342", name: "茂矽", industry: "功率元件 / MOSFET" },
  { stockNo: "3707", name: "漢磊", industry: "功率元件 / 化合物半導體" },
  { stockNo: "8255", name: "朋程", industry: "功率元件 / 車用二極體" },

  { stockNo: "2382", name: "廣達", industry: "AI 伺服器 / ODM" },
  { stockNo: "3231", name: "緯創", industry: "AI 伺服器 / ODM" },
  { stockNo: "6669", name: "緯穎", industry: "AI 伺服器 / ODM" },
  { stockNo: "2356", name: "英業達", industry: "AI 伺服器 / ODM" },
  { stockNo: "2324", name: "仁寶", industry: "AI 伺服器 / ODM" },
  { stockNo: "2317", name: "鴻海", industry: "AI 伺服器 / ODM 與電子代工" },
  { stockNo: "3017", name: "奇鋐", industry: "AI 伺服器 / 散熱" },
  { stockNo: "3324", name: "雙鴻", industry: "AI 伺服器 / 散熱" },
  { stockNo: "3653", name: "健策", industry: "AI 伺服器 / 均熱片與散熱" },
  { stockNo: "2421", name: "建準", industry: "AI 伺服器 / 風扇散熱" },
  { stockNo: "8996", name: "高力", industry: "AI 伺服器 / 水冷與熱交換" },
  { stockNo: "2308", name: "台達電", industry: "AI 伺服器 / 電源與散熱" },
  { stockNo: "6412", name: "群電", industry: "AI 伺服器 / 電源" },
  { stockNo: "3533", name: "嘉澤", industry: "AI 伺服器 / 連接器" },
  { stockNo: "3665", name: "貿聯-KY", industry: "AI 伺服器 / 線束" },
  { stockNo: "3023", name: "信邦", industry: "AI 伺服器 / 線束與連接器" },
  { stockNo: "2392", name: "正崴", industry: "AI 伺服器 / 連接器" },

  { stockNo: "3081", name: "聯亞", industry: "光通訊 / 磊晶" },
  { stockNo: "4979", name: "華星光", industry: "光通訊 / 光模組" },
  { stockNo: "4908", name: "前鼎", industry: "光通訊 / 光模組" },
  { stockNo: "3163", name: "波若威", industry: "光通訊 / 光纖元件" },
  { stockNo: "3363", name: "上詮", industry: "光通訊 / 光纖元件" },
  { stockNo: "3450", name: "聯鈞", industry: "光通訊 / 光模組" },
  { stockNo: "3234", name: "光環", industry: "光通訊 / 光元件" },

  { stockNo: "1513", name: "中興電", industry: "電力與重電 / 變壓器與電網" },
  { stockNo: "1519", name: "華城", industry: "電力與重電 / 變壓器" },
  { stockNo: "1504", name: "東元", industry: "電力與重電 / 馬達與節能" },
  { stockNo: "1605", name: "華新", industry: "原物料 / 銅與電線電纜" },
  { stockNo: "2002", name: "中鋼", industry: "原物料 / 鋼鐵" },
  { stockNo: "1303", name: "南亞", industry: "原物料 / 塑化與 CCL 上游" },
  { stockNo: "6505", name: "台塑化", industry: "原物料 / 油品與塑化" },
  { stockNo: "1304", name: "台聚", industry: "原物料 / 塑化" },
  { stockNo: "1312", name: "國喬", industry: "原物料 / 塑化" },

  { stockNo: "2603", name: "長榮", industry: "航運 / 貨櫃" },
  { stockNo: "2609", name: "陽明", industry: "航運 / 貨櫃" },
  { stockNo: "2615", name: "萬海", industry: "航運 / 貨櫃" },
  { stockNo: "2618", name: "長榮航", industry: "航運 / 航空" },
  { stockNo: "2610", name: "華航", industry: "航運 / 航空" },
  { stockNo: "2881", name: "富邦金", industry: "金融 / 金控" },
  { stockNo: "2882", name: "國泰金", industry: "金融 / 金控" },
  { stockNo: "2886", name: "兆豐金", industry: "金融 / 金控" },
  { stockNo: "2891", name: "中信金", industry: "金融 / 金控" },
];

function uniqueWatchlist(items) {
  const map = new Map();
  for (const item of items) map.set(item.stockNo, item);
  return [...map.values()];
}

const builtInWatchlist = uniqueWatchlist([...defaultWatchlist, ...industryMapAdditions]);
const legacyDefaultStocksToRemove = new Set(["1810", "2456", "3583"]);

let watchlist = loadWatchlist();

function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(watchStorageKey) || "[]");
    if (Array.isArray(saved) && saved.length) {
      const merged = saved.filter((item) => !legacyDefaultStocksToRemove.has(item.stockNo));
      for (const item of builtInWatchlist) {
        const existing = merged.find((savedItem) => savedItem.stockNo === item.stockNo);
        if (!existing) {
          merged.push(item);
        } else {
          existing.name = item.name;
          existing.industry = item.industry;
        }
      }
      localStorage.setItem(watchStorageKey, JSON.stringify(merged));
      return merged;
    }
  } catch {}
  return [...builtInWatchlist];
}

function saveWatchlist() {
  localStorage.setItem(watchStorageKey, JSON.stringify(watchlist));
}

function industries() {
  return [allIndustry, ...new Set(watchlist.map((item) => item.industry || "其他"))];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

function renderWatchlist() {
  const tabs = document.getElementById("industryTabs");
  const list = document.getElementById("watchList");
  const currentStock = document.getElementById("stockNo").value.trim();
  if (!tabs || !list) return;

  if (!industries().includes(selectedIndustry)) selectedIndustry = allIndustry;
  tabs.innerHTML = industries()
    .map((industry) => `<button type="button" class="tab-button ${industry === selectedIndustry ? "active" : ""}" data-industry="${escapeHtml(industry)}">${escapeHtml(industry)}</button>`)
    .join("");

  const visible = selectedIndustry === allIndustry ? watchlist : watchlist.filter((item) => item.industry === selectedIndustry);
  list.innerHTML = visible.length
    ? visible
        .map(
          (item) => `
            <button type="button" class="watch-card ${item.stockNo === currentStock ? "active" : ""}" data-stock="${escapeHtml(item.stockNo)}">
              <strong>${escapeHtml(item.stockNo)}</strong>
              <span>${escapeHtml(item.name || "未命名")}</span>
              <small>${escapeHtml(item.industry || "其他")}</small>
              <span class="watch-remove" data-remove="${escapeHtml(item.stockNo)}">移除</span>
            </button>
          `,
        )
        .join("")
    : `<div class="metric"><span>這個族群還沒有股票</span><strong>可用上方表單新增</strong></div>`;
}

function addWatchItem(stockNo, name, industry) {
  const cleanStock = stockNo.trim();
  if (!cleanStock) return;
  const cleanIndustry = industry || "其他";
  const existing = watchlist.find((item) => item.stockNo === cleanStock);
  if (existing) {
    existing.name = name.trim() || existing.name;
    existing.industry = cleanIndustry;
  } else {
    watchlist.push({ stockNo: cleanStock, name: name.trim(), industry: cleanIndustry });
  }
  selectedIndustry = cleanIndustry;
  saveWatchlist();
  renderWatchlist();
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssHeight = rect.height || Number(canvas.getAttribute("height"));
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: cssHeight };
}

function setupDrawCanvas() {
  if (!canvases.draw) return;
  const rect = canvases.draw.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvases.draw.width = Math.max(1, Math.floor(rect.width * dpr));
  canvases.draw.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvases.draw.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawAnnotations();
}

function drawPointFromEvent(event) {
  const rect = canvases.draw.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function drawStroke(ctx, stroke, width, height) {
  if (!stroke.points.length) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
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
}

function redrawAnnotations() {
  if (!canvases.draw) return;
  const rect = canvases.draw.getBoundingClientRect();
  const ctx = canvases.draw.getContext("2d");
  ctx.clearRect(0, 0, rect.width, rect.height);
  for (const stroke of drawingStrokes) drawStroke(ctx, stroke, rect.width, rect.height);
  if (activeStroke) drawStroke(ctx, activeStroke, rect.width, rect.height);
}

function clearAnnotations() {
  drawingStrokes.length = 0;
  activeStroke = null;
  redrawAnnotations();
}

function setDrawingEnabled(enabled) {
  drawEnabled = enabled;
  document.querySelector(".draw-surface")?.classList.toggle("drawing-enabled", enabled);
  const button = document.getElementById("drawToggle");
  if (button) button.textContent = enabled ? "停止畫線" : "畫線";
}

function sliceIndicatorSet(indicators, start) {
  return {
    ma5: indicators.ma5.slice(start),
    ma20: indicators.ma20.slice(start),
    ma60: indicators.ma60.slice(start),
    rsi14: indicators.rsi14.slice(start),
    bollinger: {
      mid: indicators.bollinger.mid.slice(start),
      upper: indicators.bollinger.upper.slice(start),
      lower: indicators.bollinger.lower.slice(start),
    },
    macd: {
      line: indicators.macd.line.slice(start),
      signal: indicators.macd.signal.slice(start),
      hist: indicators.macd.hist.slice(start),
    },
  };
}

function visibleChartData(data) {
  const total = data.rows.length;
  const minRows = Math.min(total, 30);
  const visibleRows = Math.max(minRows, Math.floor(total / chartZoom));
  const start = Math.max(0, total - visibleRows);
  return {
    ...data,
    rows: data.rows.slice(start),
    indicators: sliceIndicatorSet(data.indicators, start),
  };
}

function updateZoomLabel() {
  const label = document.getElementById("zoomLabel");
  if (label) label.textContent = `${chartZoom.toFixed(chartZoom % 1 ? 1 : 0)}x`;
}

function redrawCharts() {
  if (!latestChartData) return;
  const view = visibleChartData(latestChartData);
  drawPrice(view);
  setupDrawCanvas();
  drawRsi(view);
  drawMacd(view);
  updateZoomLabel();
}

function setChartZoom(nextZoom) {
  chartZoom = Math.min(6, Math.max(1, nextZoom));
  clearAnnotations();
  redrawCharts();
}

function scaleY(values, top, bottom) {
  const clean = values.filter((v) => v != null && Number.isFinite(v));
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const pad = (max - min || max || 1) * 0.08;
  return {
    min: min - pad,
    max: max + pad,
    y(value) {
      return bottom - ((value - this.min) / (this.max - this.min)) * (bottom - top);
    },
  };
}

function grid(ctx, width, height, left, right, top, bottom, yScale, labels = true) {
  ctx.strokeStyle = "#e6ebf2";
  ctx.lineWidth = 1;
  ctx.font = "12px Arial";
  ctx.fillStyle = "#667085";
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
  ctx.strokeStyle = "#cfd7e3";
  ctx.strokeRect(left, top, right - left, bottom - top);
}

function drawLine(ctx, points, rows, color, left, right, yScale, width = 1.5) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let started = false;
  points.forEach((value, i) => {
    if (value == null) return;
    if (value < yScale.min || value > yScale.max) {
      started = false;
      return;
    }
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
  const { ctx, width, height } = setupCanvas(canvases.price);
  const rows = data.rows;
  const left = width < 520 ? 44 : 58;
  const right = width - 12;
  const top = 12;
  const priceBottom = height * 0.72;
  const volumeTop = priceBottom + 18;
  const bottom = height - 22;
  ctx.clearRect(0, 0, width, height);

  const prices = rows.flatMap((r) => [r.high, r.low]);
  const yScale = scaleY(prices, top, priceBottom);
  grid(ctx, width, height, left, right, top, priceBottom, yScale, width >= 420);

  const candleWidth = Math.max(2, Math.min(8, ((right - left) / rows.length) * 0.58));
  rows.forEach((r, i) => {
    const x = left + (i / Math.max(rows.length - 1, 1)) * (right - left);
    const up = r.close >= r.open;
    ctx.strokeStyle = up ? "#d64550" : "#0f9f6e";
    ctx.fillStyle = up ? "#d64550" : "#0f9f6e";
    ctx.beginPath();
    ctx.moveTo(x, yScale.y(r.high));
    ctx.lineTo(x, yScale.y(r.low));
    ctx.stroke();
    const y1 = yScale.y(Math.max(r.open, r.close));
    const y2 = yScale.y(Math.min(r.open, r.close));
    ctx.fillRect(x - candleWidth / 2, y1, candleWidth, Math.max(1, y2 - y1));
  });

  drawLine(ctx, data.indicators.ma5, rows, "#2563eb", left, right, yScale, 1.3);
  drawLine(ctx, data.indicators.ma20, rows, "#ea8a1f", left, right, yScale, 1.3);
  drawLine(ctx, data.indicators.ma60, rows, "#7856d6", left, right, yScale, 1.3);
  drawLine(ctx, data.indicators.bollinger.upper, rows, "#2c9ab7", left, right, yScale, 1);
  drawLine(ctx, data.indicators.bollinger.lower, rows, "#2c9ab7", left, right, yScale, 1);

  const maxVolume = Math.max(...rows.map((r) => r.volume || 0));
  rows.forEach((r, i) => {
    const x = left + (i / Math.max(rows.length - 1, 1)) * (right - left);
    const h = maxVolume ? ((r.volume || 0) / maxVolume) * (bottom - volumeTop) : 0;
    ctx.fillStyle = r.close >= r.open ? "rgba(214,69,80,.38)" : "rgba(15,159,110,.38)";
    ctx.fillRect(x - candleWidth / 2, bottom - h, candleWidth, h);
  });

  ctx.fillStyle = "#667085";
  ctx.font = "12px Arial";
  ctx.fillText(rows[0].date, left, height - 6);
  ctx.fillText(rows.at(-1).date, Math.max(left, right - 76), height - 6);
}

function drawRsi(data) {
  const { ctx, width, height } = setupCanvas(canvases.rsi);
  const rows = data.rows;
  const left = width < 520 ? 34 : 42;
  const right = width - 12;
  const top = 10;
  const bottom = height - 18;
  ctx.clearRect(0, 0, width, height);
  const yScale = { min: 0, max: 100, y(v) { return bottom - ((v - this.min) / (this.max - this.min)) * (bottom - top); } };
  grid(ctx, width, height, left, right, top, bottom, yScale, width >= 420);
  [30, 70].forEach((v) => {
    ctx.strokeStyle = v === 70 ? "rgba(214,69,80,.55)" : "rgba(15,159,110,.55)";
    ctx.beginPath();
    ctx.moveTo(left, yScale.y(v));
    ctx.lineTo(right, yScale.y(v));
    ctx.stroke();
  });
  drawLine(ctx, data.indicators.rsi14, rows, "#154b7b", left, right, yScale, 1.6);
}

function drawMacd(data) {
  const { ctx, width, height } = setupCanvas(canvases.macd);
  const rows = data.rows;
  const left = width < 520 ? 34 : 48;
  const right = width - 12;
  const top = 10;
  const bottom = height - 18;
  ctx.clearRect(0, 0, width, height);
  const values = [...data.indicators.macd.line, ...data.indicators.macd.signal, ...data.indicators.macd.hist];
  const yScale = scaleY(values, top, bottom);
  grid(ctx, width, height, left, right, top, bottom, yScale, width >= 420);
  const zeroY = yScale.y(0);
  ctx.strokeStyle = "#98a2b3";
  ctx.beginPath();
  ctx.moveTo(left, zeroY);
  ctx.lineTo(right, zeroY);
  ctx.stroke();
  const barWidth = Math.max(2, Math.min(8, ((right - left) / rows.length) * 0.58));
  data.indicators.macd.hist.forEach((v, i) => {
    if (v == null) return;
    const x = left + (i / Math.max(rows.length - 1, 1)) * (right - left);
    ctx.fillStyle = v >= 0 ? "rgba(214,69,80,.5)" : "rgba(15,159,110,.5)";
    ctx.fillRect(x - barWidth / 2, Math.min(zeroY, yScale.y(v)), barWidth, Math.abs(zeroY - yScale.y(v)));
  });
  drawLine(ctx, data.indicators.macd.line, rows, "#2563eb", left, right, yScale, 1.4);
  drawLine(ctx, data.indicators.macd.signal, rows, "#ea8a1f", left, right, yScale, 1.4);
}

function crossedAbove(prevA, currentA, prevB, currentB) {
  return prevA != null && currentA != null && prevB != null && currentB != null && prevA <= prevB && currentA > currentB;
}

function average(values) {
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
  const avgVolume = average(recent20.map((row) => row.volume));
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

  if (isNearBottom) {
    signals.push({ label: "位階接近 60 日低檔區", weight: 1 });
  }
  if (isVolumeBlast) {
    signals.push({ label: `爆大量，約為 20 日均量 ${fmt.format(volumeRatio)} 倍`, weight: 3 });
  }
  if (isLongRedCandle) {
    signals.push({ label: "長紅 K 棒，實體占比明顯", weight: 3 });
  }
  if (isNearBottom && isVolumeBlast && isLongRedCandle) {
    signals.push({ label: "底部爆大量長紅 K 主訊號成立", weight: 4 });
  }

  if (crossedAbove(rows[i - 1]?.close, last.close, ma20[i - 1], ma20[i])) {
    signals.push({ label: "收盤站上 MA20", weight: 1 });
  }
  if (crossedAbove(ma5[i - 1], ma5[i], ma20[i - 1], ma20[i])) {
    signals.push({ label: "MA5 上穿 MA20", weight: 2 });
  }
  if (hist[i - 1] != null && hist[i] != null && hist[i - 1] <= 0 && hist[i] > 0) {
    signals.push({ label: "MACD 柱狀體翻正", weight: 2 });
  }
  if (rsi14[i - 1] != null && rsi14[i] != null && rsi14[i - 1] < 50 && rsi14[i] >= 50) {
    signals.push({ label: "RSI 轉強站回 50", weight: 1 });
  }

  const recentHigh = Math.max(...recent20.map((row) => row.high));
  if (last.close > recentHigh && avgVolume != null && last.volume > avgVolume * 1.3) {
    signals.push({ label: "帶量突破 20 日高點", weight: 1 });
  } else if (last.close > recentHigh) {
    signals.push({ label: "突破 20 日高點", weight: 1 });
  }

  if (ma20[i] != null && last.close > ma20[i] && prev?.close > ma20[i - 1]) {
    signals.push({ label: "連續站穩 MA20", weight: 1 });
  }

  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const support = Math.min(...rows.slice(-20).map((row) => row.low));
  const stopLoss = Math.min(support, ma20[i] || support);
  let state = "等待";
  let className = "entry-wait";
  let message = "尚未出現底部爆大量長紅 K";
  if (isNearBottom && isVolumeBlast && isLongRedCandle) {
    state = "強訊號";
    className = "entry-strong";
    message = "底部爆大量長紅 K 成立，適合列入進場觀察";
  } else if (score >= 4 || (isVolumeBlast && isLongRedCandle)) {
    state = "觀察";
    className = "entry-watch";
    message = "量能或長紅已出現，但底部條件尚未完整";
  }
  return { state, className, message, score, signals, stopLoss };
}

function renderEntrySignals(data) {
  const status = document.getElementById("entryStatus");
  const list = document.getElementById("entrySignals");
  if (!status || !list) return;
  const result = analyzeEntrySignals(data);
  status.textContent = `${result.state}，分數 ${result.score}`;
  const signalItems = result.signals.length
    ? result.signals.map((signal) => `<li>${escapeHtml(signal.label)}</li>`).join("")
    : "<li>等待底部爆大量長紅 K</li>";
  list.innerHTML = `
    <div class="entry-card">
      <span class="entry-badge ${result.className}">${escapeHtml(result.state)}</span>
      <strong>${escapeHtml(result.message)}</strong>
      <span>主訊號：底部 + 爆大量 + 長紅 K</span>
    </div>
    <div class="entry-card">
      <strong>觸發條件</strong>
      <ul>${signalItems}</ul>
    </div>
    <div class="entry-card">
      <strong>風控參考</strong>
      <span>參考停損：${fmt.format(result.stopLoss)}</span>
    </div>
  `;

  const notifyKey = `${data.stockNo}-${data.summary?.date || ""}-${result.score}`;
  if (notifyEnabled && result.score >= 4 && notifyKey !== lastEntryNotifyKey && "Notification" in window && Notification.permission === "granted") {
    lastEntryNotifyKey = notifyKey;
    new Notification(`${data.stockNo} 進場強訊號`, { body: result.signals.map((signal) => signal.label).join("、") });
  }
}

function updateNotifyButton() {
  const button = document.getElementById("notifyToggle");
  if (!button) return;
  button.textContent = notifyEnabled ? "關閉提醒" : "開啟提醒";
}

function renderIndustryQuotes(data) {
  const status = document.getElementById("quoteStatus");
  const list = document.getElementById("industryQuotes");
  if (!status || !list) return;
  status.textContent = `${data.items.length} 項，更新 ${new Date(data.fetchedAt).toLocaleString("zh-TW")}`;
  list.innerHTML = data.items
    .map((item) => {
      if (item.error) {
        return `
          <div class="quote-card">
            <small>${escapeHtml(item.group)}</small>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.symbol)} 暫時無法讀取</span>
          </div>
        `;
      }
      const trendClass = item.change >= 0 ? "up" : "down";
      return `
        <div class="quote-card">
          <small>${escapeHtml(item.group)} / ${escapeHtml(item.note)}</small>
          <strong>${escapeHtml(item.name)} ${escapeHtml(item.symbol)}</strong>
          <span>最新 ${fmt.format(item.price)}，<b class="${trendClass}">${fmt.format(item.change)} / ${pct.format(item.changePct)}</b></span>
          <span>${escapeHtml(item.date)} · ${escapeHtml(item.type === "proxy" ? "代理指標" : "現貨")}</span>
          <button type="button" data-quote-stock="${escapeHtml(item.symbol)}">看 K 線</button>
        </div>
      `;
    })
    .join("");
}

async function loadIndustryQuotes() {
  const status = document.getElementById("quoteStatus");
  if (status) status.textContent = "讀取報價中";
  const key = new URLSearchParams(location.search).get("key") || "";
  const response = await fetch(`/api/industry-quotes?key=${encodeURIComponent(key)}`);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "報價讀取失敗");
  renderIndustryQuotes(data);
}

function renderSummary(data) {
  const s = data.summary;
  const trendClass = s.change >= 0 ? "up" : "down";
  document.getElementById("chartTitle").textContent = `${data.stockNo} 技術線圖`;
  document.getElementById("subtitle").textContent = data.title || "輸入股票代號，查看 K 線、均線、RSI、MACD 與布林通道。";
  document.getElementById("summary").innerHTML = `
    <div class="metric"><span>日期</span><strong>${s.date}</strong></div>
    <div class="metric"><span>收盤價</span><strong>${fmt.format(s.close)}</strong></div>
    <div class="metric"><span>漲跌幅</span><strong class="${trendClass}">${fmt.format(s.change)} / ${pct.format(s.changePct)}</strong></div>
    <div class="metric"><span>MA20 / MA60</span><strong>${fmt.format(s.ma20 || 0)} / ${fmt.format(s.ma60 || 0)}</strong></div>
    <div class="metric"><span>RSI / MACD</span><strong>${fmt.format(s.rsi14 || 0)} / ${fmt.format(s.macdHist || 0)}</strong></div>
    <div class="metric"><span>支撐 / 壓力</span><strong>${fmt.format(s.support)} / ${fmt.format(s.resistance)}</strong></div>
    <div class="metric signal"><span>訊號</span><strong>${escapeHtml(s.signals.slice(0, 2).join(" ") || "資料尚未形成明顯訊號")}</strong></div>
  `;
}

async function load() {
  const stockNo = document.getElementById("stockNo").value.trim() || "2330";
  const months = document.getElementById("months").value;
  const key = new URLSearchParams(location.search).get("key") || "";
  const status = document.getElementById("status");
  status.textContent = "讀取上市/上櫃行情中";
  const response = await fetch(`/api/twse?stockNo=${encodeURIComponent(stockNo)}&months=${months}&key=${encodeURIComponent(key)}`);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "讀取失敗");
  if (currentLoadedStock && currentLoadedStock !== stockNo) clearAnnotations();
  currentLoadedStock = stockNo;
  latestChartData = data;
  chartZoom = 1;
  renderSummary(data);
  renderEntrySignals(data);
  renderWatchlist();
  redrawCharts();
  status.textContent = `資料來源：${data.source}，更新時間 ${new Date(data.fetchedAt).toLocaleString("zh-TW")}`;
}

document.getElementById("queryForm").addEventListener("submit", (event) => {
  event.preventDefault();
  load().catch((error) => {
    document.getElementById("status").textContent = error.message;
  });
});

document.getElementById("watchForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  addWatchItem(
    document.getElementById("watchStock").value,
    document.getElementById("watchName").value,
    document.getElementById("watchIndustry").value,
  );
  document.getElementById("watchStock").value = "";
  document.getElementById("watchName").value = "";
});

document.getElementById("industryTabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-industry]");
  if (!button) return;
  selectedIndustry = button.dataset.industry;
  renderWatchlist();
});

document.getElementById("watchList")?.addEventListener("click", (event) => {
  const removeTarget = event.target.closest("[data-remove]");
  if (removeTarget) {
    event.stopPropagation();
    watchlist = watchlist.filter((item) => item.stockNo !== removeTarget.dataset.remove);
    saveWatchlist();
    renderWatchlist();
    return;
  }

  const card = event.target.closest("[data-stock]");
  if (!card) return;
  document.getElementById("stockNo").value = card.dataset.stock;
  renderWatchlist();
  load().catch((error) => {
    document.getElementById("status").textContent = error.message;
  });
});

document.getElementById("industryQuotes")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quote-stock]");
  if (!button) return;
  document.getElementById("stockNo").value = button.dataset.quoteStock;
  load().catch((error) => {
    document.getElementById("status").textContent = error.message;
  });
});

document.getElementById("quoteRefresh")?.addEventListener("click", () => {
  loadIndustryQuotes().catch((error) => {
    document.getElementById("quoteStatus").textContent = error.message;
  });
});

document.getElementById("drawToggle")?.addEventListener("click", () => {
  setDrawingEnabled(!drawEnabled);
});

document.getElementById("drawClear")?.addEventListener("click", () => {
  clearAnnotations();
});

document.getElementById("zoomIn")?.addEventListener("click", () => {
  setChartZoom(chartZoom * 1.5);
});

document.getElementById("zoomOut")?.addEventListener("click", () => {
  setChartZoom(chartZoom / 1.5);
});

document.getElementById("zoomReset")?.addEventListener("click", () => {
  setChartZoom(1);
});

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

canvases.draw?.addEventListener("pointerdown", (event) => {
  if (!drawEnabled) return;
  event.preventDefault();
  canvases.draw.setPointerCapture?.(event.pointerId);
  activeStroke = {
    color: document.getElementById("drawColor")?.value || "#d64550",
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
  redrawAnnotations();
}

canvases.draw?.addEventListener("pointerup", finishActiveStroke);
canvases.draw?.addEventListener("pointercancel", finishActiveStroke);
canvases.draw?.addEventListener("pointerleave", finishActiveStroke);

document.querySelector(".draw-surface")?.addEventListener("wheel", (event) => {
  if (!latestChartData) return;
  event.preventDefault();
  setChartZoom(event.deltaY < 0 ? chartZoom * 1.15 : chartZoom / 1.15);
}, { passive: false });

window.addEventListener("resize", () => redrawCharts());
updateNotifyButton();
updateZoomLabel();
renderWatchlist();
loadIndustryQuotes().catch((error) => {
  const status = document.getElementById("quoteStatus");
  if (status) status.textContent = error.message;
});
load().catch((error) => {
  document.getElementById("status").textContent = error.message;
});
