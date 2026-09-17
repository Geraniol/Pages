/* ══════════════════════════════════════════════════════════════
   TravelMap · app.js
   逻辑层 —— 固定不变，各城市共用。

   数据来源：window.CITIES（data.js）
   样式来源：main.css 的 CSS 变量（标签色由 JS 读取，单一来源）

   城市由 URL 锚点决定：index.html#gz、index.html#sz
   切换城市 = 改锚点 → hashchange → 重新挂载（不刷新页面）。
   ══════════════════════════════════════════════════════════════ */

(function () {
'use strict';

/* ─────────── lucide 图标 ───────────
   来源 lucide-static v1.47.0（ISC）。仅内联用到的，不引整包。

   这里放的是「由数据或运行时决定」的图标：标签图标、信息小标签、
   官网/来源链接、评价正负面、城市选中勾。
   框架自身静态外观上的图标（如标题旁的下拉箭头）直接写在 index.html 里，
   不必绕到这里来 —— 那样同一图形会有两份定义。 */
const ICONS = {
  "paw-print": `<circle cx="11" cy="4" r="2"/> <circle cx="18" cy="8" r="2"/> <circle cx="20" cy="16" r="2"/> <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>`,
  "ferris-wheel": `<circle cx="12" cy="12" r="2"/> <path d="M12 2v4"/> <path d="m6.8 15-3.5 2"/> <path d="m20.7 7-3.5 2"/> <path d="M6.8 9 3.3 7"/> <path d="m20.7 17-3.5-2"/> <path d="m9 22 3-8 3 8"/> <path d="M8 22h8"/> <path d="M18 18.7a9 9 0 1 0-12 0"/>`,
  "tree-palm": `<path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/> <path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/> <path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35"/> <path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/>`,
  "castle": `<path d="M10 5V3"/> <path d="M14 5V3"/> <path d="M15 21v-3a3 3 0 0 0-6 0v3"/> <path d="M18 3v8"/> <path d="M18 5H6"/> <path d="M22 11H2"/> <path d="M22 9v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9"/> <path d="M6 3v8"/>`,
  "swords": `<path d="m13 19 6-6"/> <path d="M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5"/> <path d="m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586"/> <path d="m16 16 4 4"/> <path d="m19 21 2-2"/> <path d="m5 14 4 4"/> <path d="m5 21-2-2"/> <path d="M7.5 16.5 4 20"/>`,
  "landmark": `<path d="M10 18v-7"/> <path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/> <path d="M14 18v-7"/> <path d="M18 18v-7"/> <path d="M3 22h18"/> <path d="M6 18v-7"/>`,
  "camera": `<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/> <circle cx="12" cy="13" r="3"/>`,
  "microscope": `<path d="M6 18h8"/> <path d="M3 22h18"/> <path d="M14 22a7 7 0 1 0 0-14h-1"/> <path d="M9 14h2"/> <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/> <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>`,
  "telescope": `<path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44"/> <path d="m13.56 11.747 4.332-.924"/> <path d="m16 21-3.105-6.21"/> <path d="M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z"/> <path d="m6.158 8.633 1.114 4.456"/> <path d="m8 21 3.105-6.21"/> <circle cx="12" cy="13" r="2"/>`,
  "octagon-minus": `<path d="M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z"/> <path d="M8 12h8"/>`,
  "book-open-text": `<path d="M12 5v16"/> <path d="M16 13h2"/> <path d="M16 9h2"/> <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/> <path d="M6 13h2"/> <path d="M6 9h2"/>`,
  "shopping-cart": `<path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18"/> <path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25"/> <circle cx="18" cy="20" r="2"/> <circle cx="8" cy="20" r="2"/>`,
  "soup": `<path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/> <path d="M7 21h10"/> <path d="M19.5 12 22 6"/> <path d="M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62"/> <path d="M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62"/> <path d="M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62"/>`,
  /* 界面用 */
  "map-pin": `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/> <circle cx="12" cy="10" r="3"/>`,
  "clock": `<circle cx="12" cy="12" r="10"/> <path d="M12 6v6l4 2"/>`,
  "ticket": `<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/> <path d="M13 5v2"/> <path d="M13 17v2"/> <path d="M13 11v2"/>`,
  "external-link": `<path d="M15 3h6v6"/> <path d="M10 14 21 3"/> <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>`,
  "check": `<path d="M20 6 9 17l-5-5"/>`,
  /* 评价正负面 */
  "thumbs-up": `<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/> <path d="M7 10v12"/>`,
  "thumbs-down": `<path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/> <path d="M17 14V2"/>`
};

/* ─────────── 标签体系 ───────────
   icon → lucide 图标名；color → main.css 里的 CSS 变量名。
   城市数据可用 extraTags 增补，无需改动本文件。 */
const DEFAULT_TAGS = {
  "人文景观": { icon: "castle",         color: "--tag-culture"  },
  "美食":     { icon: "soup",           color: "--tag-food"     },
  "自然风景": { icon: "tree-palm",      color: "--tag-nature"   },
  "博物馆":   { icon: "landmark",       color: "--tag-museum"   },
  "二次元":   { icon: "paw-print",      color: "--tag-acg"      },
  "商场":     { icon: "shopping-cart",  color: "--tag-mall"     },
  "娱乐":     { icon: "ferris-wheel",   color: "--tag-fun"      },
  "书店":     { icon: "book-open-text", color: "--tag-book"     },
  "摄影":     { icon: "camera",         color: "--tag-photo"    },
  "科技":     { icon: "microscope",     color: "--tag-tech"     },
  "天文":     { icon: "telescope",      color: "--tag-astro"    },
  "军事":     { icon: "swords",         color: "--tag-military" },
  "红灯区":   { icon: "octagon-minus",  color: "--tag-redlight" }
};

const DEFAULT_TILES =
  "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";

/* ══════════════ 工具 ══════════════ */

/* 索引：[{ id, name, file }]。城市数据按需从各自的 file 加载。 */
const CITIES = Array.isArray(window.CITIES) ? window.CITIES : [];
const entryOf = id => CITIES.find(c => c.id === id) || null;

const CSSVARS = getComputedStyle(document.documentElement);
const cssVar = n => (CSSVARS.getPropertyValue(n) || "").trim();

let TAGS = DEFAULT_TAGS;                       // 每次挂载按城市重设

const colorOf = t => (TAGS[t] && cssVar(TAGS[t].color)) || "#8a8a9a";
const glyphOf = t => ICONS[(TAGS[t] && TAGS[t].icon) || ""] || "";
const INK  = () => cssVar("--pin-ink")  || "#23232e";
const FILL = () => cssVar("--pin-fill") || "#ffffff";

/* 按「标签名」取图标（内部查 TAGS → icon） */
const iconOnly = t =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"` +
  ` stroke-linecap="round" stroke-linejoin="round">${glyphOf(t)}</svg>`;

/* 按「lucide 图标名」直接取图标。
   和 iconOnly 是两回事：iconOnly 收标签名，rawIcon 收图标名，别混用。 */
const rawIcon = name =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"` +
  ` stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;

/* ─────────── 标记图形 ───────────
   水滴外形 + 深色描边 + 白底；内部一圈按标签等分的彩色环，
   环心是主标签（tags[0]）对应的 lucide 图标。 */
const RING_R = 13, RING_W = 4.5, RING_C = 2 * Math.PI * RING_R;

function pinSVG(tags) {
  const n = (tags && tags.length) || 1;
  const seg = RING_C / n;
  const ring = (tags || []).map((t, i) =>
    `<circle cx="22" cy="21" r="${RING_R}" fill="none" stroke="${colorOf(t)}"` +
    ` stroke-width="${RING_W}"` +
    ` stroke-dasharray="${seg.toFixed(2)} ${(RING_C - seg).toFixed(2)}"` +
    ` stroke-dashoffset="${(-i * seg).toFixed(2)}"` +
    ` transform="rotate(-90 22 21)"/>`).join("");
  return `<svg class="pin" viewBox="0 0 44 58" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<path d="M22 1C10.4 1 1 10.4 1 22c0 13.5 21 33 21 33s21-19.5 21-33C43 10.4 33.6 1 22 1Z"` +
    ` fill="${FILL()}" stroke="${INK()}" stroke-width="3"/>` +
    ring +
    `<g transform="translate(22 21) scale(0.58) translate(-12 -12)" fill="none"` +
    ` stroke="${INK()}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${glyphOf((tags || [])[0])}</g></svg>`;
}

/* ─────────── 链接 ─────────── */
const extIcon = () => rawIcon("external-link");

/* 官网入口：跟在标题后面，不单独占行。列表与详情共用。 */
const siteLink = p => p.url
  ? `<a class="site" href="${p.url}" target="_blank" rel="noopener noreferrer"` +
    ` title="打开官网">官网${extIcon()}</a>`
  : "";

/* 来源链接：列在来源说明下方，可多条 */
const srcLinks = p => (p.srcLinks && p.srcLinks.length)
  ? `<div class="links">` + p.srcLinks.map(l =>
      `<a href="${l.u}" target="_blank" rel="noopener noreferrer">${l.t}${extIcon()}</a>`
    ).join("") + `</div>`
  : "";

/* 卡片上只放最要紧的一小段：取第一个分隔符之前的部分。
   完整值仍在详情面板里，这里不做数据截断，只做展示精简。 */
const brief = (v, seps) =>
  String(v == null ? "" : v).split(new RegExp("[" + seps + "]"))[0].trim();

const metaChip = (icon, text) =>
  `<span class="m">${rawIcon(icon)}<span class="t">${text}</span></span>`;

/* ══════════════ DOM 引用（固定不变） ══════════════ */

const $ = id => document.getElementById(id);
const el = {
  cityName: $("city-name"), cityBtn: $("city-btn"), count: $("count"),
  filters: $("filters"), list: $("list"),
  overlay: $("overlay"), sheet: $("sheet"),
  cityOverlay: $("city-overlay"), citySheet: $("city-sheet")
};

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
  ` stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

function bootError(msg) {
  const box = $("boot-error");
  if (box) { box.textContent = msg; box.hidden = false; }
}

/* ─────────── 城市数据按需加载 ───────────
   每个 data/<id>.js 自行注册到 window.CITY_DATA[<id>]，
   因此并发加载互不覆盖；加载过的缓存下来，切回时不重复请求。 */
const loadedData = {};

function loadCity(entry, ok) {
  if (loadedData[entry.id]) { ok(loadedData[entry.id]); return; }
  const s = document.createElement("script");
  s.src = entry.file;
  s.onload = () => {
    const d = window.CITY_DATA && window.CITY_DATA[entry.id];
    if (!d || !Array.isArray(d.spots)) { bootError("数据格式不对：" + entry.file); return; }
    loadedData[entry.id] = d;
    ok(d);
  };
  s.onerror = () => bootError("加载失败：" + entry.file);
  document.head.appendChild(s);
}

/* ══════════════ 运行时状态 ══════════════ */

let map = null, cityId = null, CITY = null;
let spots = [], markers = {}, markerLayer = null;
const active = new Set();

/* ══════════════ 挂载 ══════════════ */

let mountToken = 0;

/* 切城市：先把旧图拆掉、界面回到初始态，再去取数据 */
function mount(id) {
  const entry = entryOf(id) || CITIES[0];
  if (!entry) { bootError("没有可用的城市数据，请检查 data.js 是否已加载。"); return; }

  if (map) { map.remove(); map = null; }

  cityId = entry.id;
  CITY = null;
  spots = [];
  markers = {};
  active.clear();
  closeDetail();
  closeCityPicker();
  document.body.dataset.view = "map";
  document.querySelectorAll(".tabbar button")
    .forEach(b => b.classList.toggle("on", b.dataset.view === "map"));

  document.title = entry.name || "TravelMap";
  el.cityName.textContent = entry.name || "";
  el.list.innerHTML = "";
  el.filters.innerHTML = "";
  if (el.count) el.count.textContent = "";

  const token = ++mountToken;
  loadCity(entry, data => {
    /* 数据回来时如果又切过城市了，这次结果作废 */
    if (token !== mountToken) return;
    build(entry, data);
  });
}

function build(entry, data) {
  CITY = Object.assign({}, data, { name: entry.name });   // 显示名以索引为准
  spots = data.spots;
  TAGS = Object.assign({}, DEFAULT_TAGS, data.extraTags || {});

  /* 地图 */
  map = L.map("map", { zoomControl: false })
    .setView(CITY.center || [23.113, 113.300], CITY.zoom || 12);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer(CITY.tiles || DEFAULT_TILES, {
    subdomains: ["1", "2", "3", "4"],
    attribution: CITY.attribution || "",
    maxZoom: 18
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);

  /* 标记尺寸取自 main.css 的 --pin-md，高度按图形比例换算 ——
     同一尺寸不在 CSS 与 JS 里各写一份，改 CSS 即可生效。
     图形 viewBox 为 44×58，水滴尖端在底部。 */
  const pinW = Math.round(parseFloat(cssVar("--pin-md")) || 40);
  const pinH = Math.round(pinW * 58 / 44);

  spots.forEach(p => {
    const m = L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div class="pin-wrap">${pinSVG(p.tags || [])}</div>`,
        iconSize: [pinW, pinH],
        iconAnchor: [pinW / 2, pinH - 1]        // 锚在尖端，留 1px
      }),
      title: p.name
    });
    m.bindTooltip(p.name, { direction: "top", offset: [0, -(pinH - 5)], opacity: .95 });
    m.on("click", () => openDetail(p.id));
    markers[p.id] = m;
  });

  renderFilters();
  refresh();
}

/* ══════════════ 筛选与列表 ══════════════ */

function renderFilters() {
  const used = Object.keys(TAGS).filter(t => spots.some(p => (p.tags || []).includes(t)));
  el.filters.innerHTML =
    `<button class="chip all on" data-tag="">全部</button>` +
    used.map(t =>
      `<button class="chip" data-tag="${t}" style="--chip-c:${colorOf(t)}">` +
      `${iconOnly(t)}${t}</button>`).join("");
}

const matched = () =>
  spots.filter(p => active.size === 0 || (p.tags || []).some(t => active.has(t)));

function refresh() {
  const vis = matched();
  markerLayer.clearLayers();
  vis.forEach(p => markerLayer.addLayer(markers[p.id]));
  if (el.count) el.count.textContent = vis.length + " / " + spots.length;
  renderList(vis);
}

function renderList(vis) {
  if (!vis.length) {
    el.list.innerHTML = `<div class="empty">没有符合条件的地点</div>`;
    return;
  }
  el.list.innerHTML = vis.map(p => {
    const feat = !!p.rank;                       // 有 rank 即视为推荐位
    return `
    <div class="card${feat ? " feat" : ""}" data-id="${p.id}">
      <div class="pin-sm">${pinSVG(p.tags || [])}</div>
      <div class="body">
        <div class="head">
          <span class="title">${p.name}</span>
          ${feat ? `<span class="rank">${p.rank}</span>` : ""}
          ${siteLink(p)}
        </div>
        <div class="meta">
          ${metaChip("map-pin", brief(p.area, "·"))}
          ${metaChip("ticket", brief(p.fee, "；;，,"))}
          ${metaChip("clock", brief(p.hours, "（(；;"))}
        </div>
        <p class="intro">${p.intro || ""}</p>
        <div class="dots">${(p.tags || []).map(t =>
          `<i class="dot" style="background:${colorOf(t)}"></i>`).join("")}</div>
      </div>
    </div>`;
  }).join("");
}

/* ══════════════ 详情 ══════════════ */

function openDetail(id) {
  const p = spots.find(x => x.id === id);
  if (!p) return;

  /* 来源分两类，必须在界面上分得清：
     kind="review" —— 检索到的真实评价，来源可查
     kind="facts"  —— 票价/时间/交通等客观信息梳理，不是用户评价 */
  const isReview = p.kind === "review";
  const hasReview = (p.pros && p.pros.length) || (p.cons && p.cons.length);
  const review = hasReview
    ? `<div class="sect">` +
        `<h4>${isReview ? "网络评价" : "特点"}` +
        `<span class="badge ${isReview ? "review" : "facts"}">` +
        `${isReview ? "评价有据" : "客观信息"}</span></h4>` +
        `<div class="review">` +
          (p.pros || []).map(t =>
            `<div class="row pro"><span class="mk">${rawIcon("thumbs-up")}</span>` +
            `<span>${t}</span></div>`).join("") +
          (p.cons || []).map(t =>
            `<div class="row con"><span class="mk">${rawIcon("thumbs-down")}</span>` +
            `<span>${t}</span></div>`).join("") +
        `</div>` +
        `<div class="src ${isReview ? "review" : ""}">` +
          `<b>${isReview ? "来源" : "依据"}</b>` +
          (p.src || (isReview
            ? "来源待补"
            : "票价、开放时间、交通等信息来自官方及公开资料；以上为客观特征梳理，非用户评价。")) +
          srcLinks(p) +
        `</div>` +
      `</div>`
    : "";

  el.sheet.innerHTML =
    `<button class="sheet-close" aria-label="关闭">${CLOSE_ICON}</button>` +
    `<div class="sheet-head">` +
      `<div class="pin-sm">${pinSVG(p.tags || [])}</div>` +
      `<div class="headtext">` +
        `<h2><span>${p.name}</span>${siteLink(p)}</h2>` +
        `<div class="area">${p.area || ""}</div>` +
      `</div>` +
    `</div>` +
    `<div class="sheet-body">` +
      `<div class="tagrow">${(p.tags || []).map(t =>
        `<span class="chip on" style="--chip-c:${colorOf(t)}">${iconOnly(t)}${t}</span>`).join("")}</div>` +
      `<dl class="facts">` +
        `<div><dt>票价</dt><dd>${p.fee || "—"}</dd></div>` +
        `<div><dt>开放时间</dt><dd>${p.hours || "—"}</dd></div>` +
      `</dl>` +
      (p.intro ? `<div class="sect"><h4>简介</h4><p>${p.intro}</p></div>` : "") +
      review +
      (CITY.updated ? `<div class="checked">数据核验 · ${CITY.updated}</div>` : "") +
    `</div>`;

  el.overlay.classList.add("on");

  /* 地图同步定位：关掉详情切回地图时，已经在这个点上 */
  map.setView([p.lat, p.lng], 15);
  if (markers[p.id]) markers[p.id].openTooltip();
}

const closeDetail = () => el.overlay.classList.remove("on");

/* ══════════════ 城市选择 ══════════════ */

function renderCityList() {
  el.citySheet.innerHTML =
    `<button class="sheet-close" aria-label="关闭">${CLOSE_ICON}</button>` +
    `<div class="citysheet-head"><h2>选择城市</h2></div>` +
    `<div class="citylist">` +
      CITIES.map(c => {
        const on = c.id === cityId;
        return `<button class="cityitem${on ? " on" : ""}" data-city="${c.id}">` +
          `<span class="cn">${c.name || c.id}</span>` +
          `<span class="ck">${on ? rawIcon("check") : ""}</span>` +
          `</button>`;
      }).join("") +
    `</div>`;
}

function openCityPicker() { renderCityList(); el.cityOverlay.classList.add("on"); }
const closeCityPicker = () => el.cityOverlay.classList.remove("on");

/* ══════════════ 路由 ══════════════ */

const IDS = CITIES.map(c => c.id);

function readCityId() {
  const m = /^#([a-z0-9]+)$/i.exec(location.hash || "");
  const id = m ? m[1].toLowerCase() : null;
  return (id && entryOf(id)) ? id : (IDS[0] || null);
}

function switchCity(id) {
  if (!entryOf(id)) return;
  closeCityPicker();
  if (id === cityId) return;
  location.hash = id;                 // 触发 hashchange → mount
}

/* ══════════════ 事件绑定（只绑一次，重挂载不会重复） ══════════════ */

el.filters.onclick = e => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  const tag = btn.dataset.tag;
  if (!tag) active.clear();
  else if (active.has(tag)) active.delete(tag);
  else active.add(tag);
  el.filters.querySelectorAll(".chip").forEach(c => {
    const t = c.dataset.tag;
    c.classList.toggle("on", t ? active.has(t) : active.size === 0);
  });
  refresh();
};

el.list.onclick = e => {
  /* 卡片里有官网链接，点链接时不应该顺带把详情也拉起来 */
  if (e.target.closest("a")) return;
  const card = e.target.closest(".card");
  if (card) openDetail(card.dataset.id);
};

el.sheet.onclick = e => { if (e.target.closest(".sheet-close")) closeDetail(); };
el.overlay.onclick = e => { if (e.target === el.overlay) closeDetail(); };

el.cityBtn.onclick = openCityPicker;
el.citySheet.onclick = e => {
  if (e.target.closest(".sheet-close")) { closeCityPicker(); return; }
  const item = e.target.closest(".cityitem");
  if (item) switchCity(item.dataset.city);
};
el.cityOverlay.onclick = e => { if (e.target === el.cityOverlay) closeCityPicker(); };

document.onkeydown = e => {
  if (e.key !== "Escape") return;
  if (el.cityOverlay.classList.contains("on")) closeCityPicker();
  else closeDetail();
};

document.querySelectorAll(".tabbar button").forEach(btn => {
  btn.onclick = () => {
    document.body.dataset.view = btn.dataset.view;
    document.querySelectorAll(".tabbar button")
      .forEach(b => b.classList.toggle("on", b === btn));
    /* 等面板位移动画结束再让地图重算尺寸，否则瓦片会错位 */
    setTimeout(() => map && map.invalidateSize(), 320);
  };
});

window.onhashchange = () => mount(readCityId());
window.onresize = () => map && map.invalidateSize();

/* ══════════════ 启动 ══════════════ */

if (!IDS.length) {
  bootError("没有可用的城市数据，请检查 data.js 是否已在本文件之前加载。");
} else {
  mount(readCityId());
}

/* 供外部调用（调试用） */
window.TravelMap = { mount, switchCity, current: () => cityId };

})();
