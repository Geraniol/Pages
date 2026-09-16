/* =====================================================================
   Git Playground v4 · 可调布局
   ---------------------------------------------------------------------
   4 个拖拽点：
     · 2 条列分隔线 —— 决定 左栏宽度 / 右栏宽度（中间栏吃掉剩余空间）
     · 2 条行分隔线 —— 决定 左栏 / 中栏「被定高的那张卡」的高度
       （原来还有第 3 条给右栏：那张卡上下两张、上面一张定高。
        任务指南卡片删除后右栏只剩 AI 助手一张、吃掉整列，
        没有可调的边界了，row2 手柄随之取消。）

   左栏的行分隔线拖的是**工作区**（这一列的**第二张**卡），和中/右栏相反：
   中/右栏是"第一张卡取固定高度、第二张吃掉剩余"，左栏是"文件树吃掉剩余、
   工作区固定高度"（见 cards.css 的 #wsCard），这样文件树再长也压不掉工作区。
   所以它不能复用 --row-left 百分比那套，单独用 --ws-h（px）承载。

   ---- 为什么用绝对定位的覆盖层，而不是插进网格/弹性流 ----
   列宽本来由 .main 的 grid-template-columns 决定、卡高由各自的 flex 决定。
   往网格里插分隔线会打乱原有的轨道数与响应式断点，往 .col 里插 flex 项会平白
   多出两份 gap。改成「覆盖在边界上的命中区」后，内置布局一行都不用动：
   自定义布局失效时（窄屏 / 重置后）就是原样。

   移动端：≤1080px 时分隔线隐藏、自定义变量整体不生效，回到内置单列。
   ===================================================================== */
'use strict';
window.VGE = window.VGE || {};

(function(){

const STORE_KEY = 'vge.layout.v1';
/* 半屏（堆叠）模式的行比例，独立存。
   ⚠ 键名从 v1 提到 v2：行数从三变二（任务指南卡片删除），存下来的三元比例
   跟新的两行骨架没有对应关系 —— 沿用旧键名会读到一份"少一行"的坏值。
   换键等于让老数据自然作废，回到默认的均分，不用写迁移。 */
const STORE_STACK = 'vge.layout.stack.v2';
const GRID_QUERY = '(min-width:1081px)';     /* 与 responsive.css 的断点一致 */
const STACK_QUERY = '(max-width:1080px)';    /* 同一个断点的另一半 */

/* 边界。默认值不写死 —— 第一次拖动时从"当前实际渲染出来的宽度"取，
   这样无论 CSS 里的默认比例怎么改，起拖点都不会跳变。 */
const LIMITS = { colL:[200, 620], colR:[210, 700], mid:320, row:[22, 88],
                 ws:[112, 560] };   /* 工作区高度（px）：112 = 卡头 38 + 内边距 20 + 统计条 50 出头 */
/* 文件树至少要留的高度：卡头 38 + 图例 28 + 两行文件 44 + 内边距，再给点余量。
   拖工作区的上限由它现算 —— 不写死百分比，窗口一矮才不会把文件树挤没。 */
const TREE_MIN = 150;

let L = null;                 /* 桌面：{ colL, colR, rows:[mid, right], ws } */
let S = null;                 /* 半屏：{ rows:[r1,r2,r3] }，单位是 fr 比例 */
let raf = null;

const isGrid = () => window.matchMedia(GRID_QUERY).matches;
const isStack = () => window.matchMedia(STACK_QUERY).matches;
const STACK_MIN = 80;                        /* 每行最小高度（px），拖动时夹住 */
const STACK_FR = [0.25, 8];                  /* 存下来的 fr 比例上下限，防止坏值 */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function load(){
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }catch(e){ /* 忽略 */ }
  if(!raw || typeof raw !== 'object') return null;
  const n = {
    colL: Number(raw.colL), colR: Number(raw.colR),
    rows: Array.isArray(raw.rows) ? raw.rows.map(Number) : [],
    ws: Number(raw.ws),
  };
  /* 旧版本存的是 3 元 [左, 中, 右]；左栏的行值换成 --ws-h（px）之后这两个百分比
     已经没有对应关系，读进来时丢掉第 0 项做迁移，
     这样老的 localStorage 不会因为长度不符被判成坏值、把用户的自定义布局整个丢掉。 */
  if(n.rows.length === 3) n.rows = n.rows.slice(1);
  if(!isFinite(n.colL) || !isFinite(n.colR) || n.rows.length !== 2 || n.rows.some(r => !isFinite(r))) return null;
  n.colL = clamp(n.colL, LIMITS.colL[0], LIMITS.colL[1]);
  n.colR = clamp(n.colR, LIMITS.colR[0], LIMITS.colR[1]);
  n.rows = n.rows.map(r => clamp(r, LIMITS.row[0], LIMITS.row[1]));
  /* ws 是后加的字段：老数据（或从没拖过工作区的人）没有它 → 留 null，
     由 cards.css 的 --ws-h 兜底值决定默认高度。 */
  n.ws = (isFinite(n.ws) && n.ws > 0) ? clamp(n.ws, LIMITS.ws[0], LIMITS.ws[1]) : null;
  return n;
}
function save(){
  if(!L) return;
  /* 兜底：坏值宁可不存，也别把一份 NaN 布局持久化下来。
     ws 允许是 null（还没拖过工作区），不算坏值。 */
  if(!isFinite(L.colL) || !isFinite(L.colR) || L.rows.some(r => !isFinite(r))) return;
  if(L.ws != null && !(isFinite(L.ws) && L.ws > 0)) return;
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(L)); }catch(e){ /* 隐私模式 */ }
}

/* ---------------- 半屏（堆叠）两行：读写与应用 ---------------- */
function loadStack(){
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(STORE_STACK) || 'null'); }catch(e){ /* 忽略 */ }
  /* 只认两行。三行的老数据（键名已经换成 v2）在这里也一并挡掉，
     省得哪天真读到一份三元的比例去喂两行的网格。 */
  if(!raw || !Array.isArray(raw.rows) || raw.rows.length !== 2) return null;
  const rows = raw.rows.map(Number);
  if(rows.some(r => !isFinite(r) || r <= 0)) return null;
  return { rows: rows.map(r => clamp(r, STACK_FR[0], STACK_FR[1])) };
}
function saveStack(){
  if(!S) return;
  if(S.rows.some(r => !isFinite(r) || r <= 0)) return;      /* 坏值宁可不存 */
  try{ localStorage.setItem(STORE_STACK, JSON.stringify(S)); }catch(e){ /* 隐私模式 */ }
}
function applyStack(){
  const root = document.documentElement;
  if(!S){
    ['--st-r1','--st-r2','--st-r3'].forEach(n => root.style.removeProperty(n));
    return;
  }
  S.rows.forEach((r, i) => root.style.setProperty('--st-r' + (i + 1), r + 'fr'));
  /* 行数从三变二之后 --st-r3 不该再存在。旧版本（或旧 localStorage 迁移途中）
     留下的行内变量会一直挂在 <html> 上，而 responsive.css 的 grid-template-rows
     已经只读两个变量 —— 它不会生效，但留着会让下次排查的人以为还有第三行。 */
  root.style.removeProperty('--st-r3');
}
/* 半屏下真正参与分配的两张卡：提交图 / 行 2 里当前显示的那块（终端或 AI）。
   原来中间还有一张任务指南卡，那张卡删除后它整块不再存在 —— 这里也**不能**
   再"查到几张算几张"：调用方是按位置取 [0]、[1] 的，少一张就会把终端当成第二行。 */
function stackCards(){
  const graph = document.querySelector('#colMid > .graph-card');
  const bottom = document.body.classList.contains('stack-ai')
    ? document.getElementById('aiCard') : document.getElementById('termCard');
  const list = [graph, bottom].filter(Boolean);
  return list.length === 2 ? list : null;
}
/* 量当前两行高度 → fr 比例（作为第一次拖动的起点，不写死默认值） */
function measureStackCurrent(){
  const cards = stackCards(); if(!cards) return null;
  const h = cards.map(el => el.getBoundingClientRect().height);
  if(h.some(x => !(x > 0))) return null;
  const unit = Math.min.apply(null, h);
  return { rows: h.map(x => Math.round(x / unit * 1000) / 1000) };
}
/* 拖「提交图 | 下格」这一条边界：只动这两行，一行涨多少另一行就落多少。
   两行骨架只有这一条边界，所以只认 st0 —— st1 的手柄已经不再生成（见 makeSplitters）。 */
function dragStack(id, y){
  if(id !== 'st0') return;
  const cards = stackCards(); if(!cards) return;
  if(!S) S = measureStackCurrent();
  if(!S) return;
  const r = cards.map(el => el.getBoundingClientRect());
  let h = r.map(x => x.height);
  const total = h[0] + h[1];
  if(!(total > 0)) return;
  const v = clamp(y - r[0].top, STACK_MIN, h[0] + h[1] - STACK_MIN);
  h = [v, h[0] + h[1] - v];
  const unit = Math.min.apply(null, h);
  S = { rows: h.map(x => Math.round(clamp(x / unit, STACK_FR[0], STACK_FR[1]) * 1000) / 1000) };
  applyStack();
}

/* ---------------- 应用变量 ---------------- */
function apply(){
  const root = document.documentElement;
  if(!L){ root.style.removeProperty('--col-l'); root.style.removeProperty('--col-r');
          root.style.removeProperty('--row-mid'); root.style.removeProperty('--row-right');
          applyWsVar();
          document.body.classList.remove('layout-custom'); return; }
  /* 行百分比取"按当前窗口夹过"的值：存的值可能在更小的窗口里放不下 */
  const rows = effectiveRows() || L.rows;
  root.style.setProperty('--col-l', L.colL + 'px');
  root.style.setProperty('--col-r', L.colR + 'px');
  root.style.setProperty('--row-mid',   rows[0] + '%');
  /* --row-right 现在是个**没人读**的变量：它原来是右栏「任务指南定高 / AI 吃掉剩余」
     那条规则（body.layout-custom #guideCard）的入参，任务指南卡片删除后右栏只剩
     一张 AI 助手卡、恒为 flex:1 1 auto，没有任何规则再引用它。
     这里照写不误是**故意的**：L.rows 仍是二元数组（localStorage 的 vge.layout.v1
     存的就是两个数），把它砍成一元要再写一次迁移，而多写一个用不上的 CSS 变量
     没有任何副作用。真要把那张卡加回来时，这条链路是通的。 */
  root.style.setProperty('--row-right', rows[1] + '%');
  applyWsVar();
  document.body.classList.add('layout-custom');
}

/* 工作区高度（左栏第二张卡）：
   · 只在桌面三栏下吃用户拖出来的值 —— 半屏浮层里两张卡叠在一个 max-height 受限的
     浮层里，套用桌面拖出来的 500px 会把文件树挤没，那边一律回落到 CSS 默认值；
   · 上限按当前窗口现算（文件树至少留 TREE_MIN），窗口变矮时自动收回来。 */
function effectiveWs(){
  if(!L || !(L.ws > 0)) return null;
  const main = document.querySelector('.main');
  const col = main ? main.querySelectorAll(':scope > .col')[0] : null;
  const H = col ? col.getBoundingClientRect().height : 0;
  if(!(H > 0)) return Math.round(clamp(L.ws, LIMITS.ws[0], LIMITS.ws[1]));
  const cs = window.getComputedStyle(col);
  const gap = parseFloat(cs.rowGap || cs.gap) || 0;
  const max = Math.max(H - TREE_MIN - gap, LIMITS.ws[0]);
  return Math.round(clamp(L.ws, LIMITS.ws[0], Math.min(LIMITS.ws[1], max)));
}
function applyWsVar(){
  const root = document.documentElement;
  const ws = (L && isGrid()) ? effectiveWs() : null;
  if(ws == null){ root.style.removeProperty('--ws-h'); return; }
  const v = ws + 'px';
  if(root.style.getPropertyValue('--ws-h') !== v) root.style.setProperty('--ws-h', v);
}

/* ---------------- 分隔线：绝对定位覆盖在边界上 ---------------- */
function makeSplitters(){
  const main = document.querySelector('.main');
  if(!main || main.querySelector('.split')) return;
  /* row2 = 右栏那两张卡之间的边界（任务指南 / AI 助手），随任务指南卡片一起取消：
     右栏现在只有一张卡，边界落在列底、拖了也没有任何东西可调。
     st1 同理：半屏下只剩"提交图 | 下格"一条边界。 */
  [['col0','col'],['col1','col'],['row0','row'],['row1','row'],
   ['st0','row']].forEach(([id, kind]) => {
    const el = document.createElement('div');
    el.className = 'split split-' + kind;
    el.dataset.split = id;
    el.setAttribute('role', 'separator');
    el.setAttribute('aria-label', kind === 'col' ? 'resize columns' : 'resize rows');
    main.appendChild(el);
  });
}
function positionSplitters(){
  const main = document.querySelector('.main');
  if(!main) return;
  const splitters = main.querySelectorAll('.split');
  if(!splitters.length) return;

  /* 半屏：只显示"行之间"的手柄（两行骨架只剩一根），位置取下格卡片的顶边 ——
     也就是第一张卡的底边。 */
  if(isStack()){
    /* 这个分支在 reclampRows() 之前就 return 了，--ws-h 得自己交还：
       否则桌面拖到 311px 的工作区会跟着进浮层，把文件树挤掉一大截。 */
    applyWsVar();
    const cards = stackCards();
    const mr2 = main.getBoundingClientRect();
    for(let i = 0; i < 1; i++){
      const el = main.querySelector('.split[data-split="st' + i + '"]');
      if(!el || !cards) continue;
      /* 显式 block：.split 的基础样式是 display:none，桌面那套靠媒体查询打开，
         半屏这边没有对应的媒体查询，必须自己给值（置空会退回 none）。 */
      el.style.display = 'block';
      const cr = cards[i].getBoundingClientRect();
      const y = cr.bottom;
      el.style.left = Math.round(cr.left - mr2.left) + 'px';
      el.style.top = Math.round(y - mr2.top - 3) + 'px';
      el.style.width = Math.round(cr.width) + 'px';
      el.style.height = '7px';
    }
    splitters.forEach(el => { if(!/^st\d+$/.test(el.dataset.split)) el.style.display = 'none'; });
    return;
  }
  if(!isGrid()){ splitters.forEach(el => { el.style.display = 'none'; }); return; }
  /* 切回宽屏时必须把半屏那根显式收起：它带着行内 display:block，
     不清掉的话行内样式会压过媒体查询，留在页面上（位置还是半屏时的旧坐标）。 */
  splitters.forEach(el => { el.style.display = /^st\d+$/.test(el.dataset.split) ? 'none' : ''; });

  /* 窗口一变，同样的百分比可能就放不下了（列变矮 → 其余卡片的最小高度占比变大）。
     这里顺手按当前窗口重新夹一遍行值：只写 CSS 变量，不改 L，
     所以窗口再变大时用户原来的意图还能恢复。 */
  reclampRows();

  const mr = main.getBoundingClientRect();
  const cols = Array.prototype.slice.call(main.querySelectorAll(':scope > .col'));

  /* 手柄一律画在「CSS 真正调节的那条边界」上，并让它中心落在边界处。
     两条踩过的坑，都别再犯：
       1) 不能拿 nextElementSibling 当"下一个块"。中栏是 [提交图, devbar, 终端]，
          而 devbar 只在合作模式显示 —— 隐藏元素 getBoundingClientRect() 全为 0，
          于是 (first.bottom + 0)/2 把手柄扔到首卡高度的一半（实测偏差 -164px）。
          CSS 调节的是 #colMid > .graph-card 这一张卡，所以边界就是"首卡底边"。
       2) 不要画在"两列之间的空隙中心"。拖拽映射把光标位置直接换算成尺寸，
          画在空隙中心会恒定差半个 gap（实测 ~6px），拖起来手柄不跟手。 */
  for(let i = 0; i < 2; i++){
    const el = main.querySelector('.split[data-split="col' + i + '"]');
    const a = cols[i], b = cols[i + 1];
    if(!el || !a || !b) continue;
    const x = i === 0 ? a.getBoundingClientRect().right : b.getBoundingClientRect().left;
    el.style.left = Math.round(x - mr.left - 3) + 'px';
    el.style.top = '0px';
    el.style.width = '7px';
    el.style.height = Math.round(mr.height) + 'px';
  }
  /* 行分隔线：每列「被 CSS 定高的那张卡」的底边。
     第 0 列（左栏）被定高的是**第二张**卡（工作区），但它的底边在列底 ——
     可拖的边界仍然等于"第一张卡（文件树）的底边"，所以公式跟中栏一模一样。
     ⚠ 只列左栏和中栏：右栏只剩 AI 助手一张卡、吃掉整列，没有可拖的边界
     （row2 手柄已在 makeSplitters 里取消，这里再画一次就等于凭空多出一根）。 */
  for(const i of [0, 1]){
    const el = main.querySelector('.split[data-split="row' + i + '"]');
    const col = cols[i];
    if(!el || !col) continue;
    /* 冲突面板激活时工作区是 :has(.confl-hd){flex:1 1 auto;height:auto}，
       高度不再由 --ws-h 决定 —— 手柄留着就是个"拖了没反应"的陷阱，直接收起。 */
    if(i === 0 && col.querySelector('#wsCard .confl-hd')){ el.style.display = 'none'; continue; }
    const cards = Array.prototype.filter.call(col.children, c => c.classList.contains('card'));
    const first = cards[0];
    if(!first) continue;
    const y = first.getBoundingClientRect().bottom;
    el.style.left = Math.round(col.getBoundingClientRect().left - mr.left) + 'px';
    el.style.top = Math.round(y - mr.top - 3) + 'px';
    el.style.width = Math.round(col.getBoundingClientRect().width) + 'px';
    el.style.height = '7px';
  }
}
/* main 的 padding 不属于网格轨道 —— 拖拽换算必须用内容盒，
   否则边界会恒定落在光标右侧一个 padding 的距离（12px）。 */
function contentBox(el){
  const b = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);
  const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
  const pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
  return { left:b.left + pl, right:b.right - pr, top:b.top + pt, bottom:b.bottom - pb,
           width:b.width - pl - pr, height:b.height - pt - pb };
}
/* 合并到一帧里执行，避免拖拽时每个事件都触发一次布局读取 */
function schedulePosition(){
  if(raf) return;
  raf = (window.requestAnimationFrame || (fn => setTimeout(fn, 16)))(() => {
    raf = null;
    positionSplitters();
  });
}

/* 某列「首卡最多能占多少 %」。
   不能写死 88%：被压下去的那些卡片有自己的最小高度（终端 296px、AI 卡片 196px），
   拖过头会让整列比 .main 还高 —— .main 不裁剪，于是页面出现滚动条，
   视口随之变窄、三栏重排，看起来就是"拖到底时布局在跳"。
   所以上限现算：列高减去"其余元素至少要占的高度"（含它们之间的 gap）。 */
function rowMaxPct(col, first){
  const H = col.getBoundingClientRect().height;
  if(!(H > 0)) return LIMITS.row[1];
  const cs = window.getComputedStyle(col);
  const gap = parseFloat(cs.rowGap || cs.gap) || 0;
  let need = 0, n = 0;
  Array.prototype.forEach.call(col.children, el => {
    if(el === first) return;
    /* display:none 的子元素根本不是 flex item，也就没有 gap */
    if(window.getComputedStyle(el).display === 'none') return;
    n++;
    /* 卡片按它的 min-height（没有就是 0）；非卡片（身份条之类）是 flex:none，按实际高度 */
    const min = parseFloat(window.getComputedStyle(el).minHeight) || 0;
    need += (el.classList.contains('card') ? min : el.getBoundingClientRect().height);
  });
  need += gap * n;
  const firstMin = parseFloat(window.getComputedStyle(first).minHeight) || 0;
  const usable = Math.max(H - need, firstMin);
  return clamp(Math.round(usable / H * 1000) / 10, LIMITS.row[0], LIMITS.row[1]);
}
/* 某列里"被 CSS 定高的那张卡"（行分隔线就是调它的高度） */
function firstCardOf(col){
  return Array.prototype.filter.call(col.children, c => c.classList.contains('card'))[0] || null;
}
/* 渲染用的行百分比：存下来的值可能在更小的窗口里超限，这里按当前窗口再夹一次。
   刻意不改写 L —— 窗口变大后，用户原来的意图还能恢复。 */
function effectiveRows(){
  if(!L) return null;
  const main = document.querySelector('.main');
  if(!main) return L.rows.slice();
  const cols = Array.prototype.slice.call(main.querySelectorAll(':scope > .col'));
  /* L.rows[0] 对应中栏（cols[1]），L.rows[1] 对应右栏（cols[2]） */
  return L.rows.map((v, i) => {
    const col = cols[i + 1]; if(!col) return v;
    const first = firstCardOf(col); if(!first) return v;
    return Math.min(v, rowMaxPct(col, first));
  });
}

/* 把三个行变量按"当前窗口允许的最大值"重写一遍。
   只在值真的变了才写，避免每帧都让样式失效。 */
function reclampRows(){
  if(!L) return;
  const rows = effectiveRows();
  if(!rows) return;
  const root = document.documentElement;
  ['--row-mid','--row-right'].forEach((name, i) => {
    const v = rows[i] + '%';
    if(root.style.getPropertyValue(name) !== v) root.style.setProperty(name, v);
  });
  applyWsVar();          /* 工作区高度同样要跟着窗口重新夹（含"切到半屏就交还给默认值"） */
}

/* 量出当前三列宽度与每列首卡高度，作为自定义布局的起点 */
function measureCurrent(){
  const main = document.querySelector('.main');
  const cols = main ? Array.prototype.slice.call(main.querySelectorAll(':scope > .col')) : [];
  const wsCard = document.getElementById('wsCard');
  const out = { colL:246, colR:492, rows:[50, 58], ws:null };   /* 行值只有中栏 / 右栏两个 */
  if(cols.length === 3){
    out.colL = Math.round(cols[0].getBoundingClientRect().width) || out.colL;
    out.colR = Math.round(cols[2].getBoundingClientRect().width) || out.colR;
    /* 中栏默认 50%：提交图与终端各占一半（见 graph.css）。
       这里只在"量不到真实高度"时兜底（jsdom / 首帧），正常情况下取实测值。 */
    const DEFAULTS = [50, 58];
    out.rows = [1, 2].map((ci, k) => {
      const col = cols[ci];
      const cards = Array.prototype.filter.call(col.children, c => c.classList.contains('card'));
      const first = cards[0];
      const h = col.getBoundingClientRect().height;
      if(!first || !h) return DEFAULTS[k];
      const pct = first.getBoundingClientRect().height / h * 100;
      return (isFinite(pct) && pct > 0) ? Math.round(pct * 10) / 10 : DEFAULTS[k];
    });
  }
  /* 第一次拖动时以"当前渲染出来的工作区高度"为起点（不写死 210），
     这样 CSS 默认值改了、或者用户刚拖过，起拖点都不会跳变。 */
  if(wsCard){
    const h = Math.round(wsCard.getBoundingClientRect().height);
    if(h > 0) out.ws = h;
  }
  return out;
}

/* ---------------- 拖拽 ---------------- */
function onDown(ev){
  const el = ev.currentTarget;
  const id = el.dataset.split;
  if(!id) return;
  ev.preventDefault();
  try{ el.setPointerCapture(ev.pointerId); }catch(e){ /* 老浏览器 */ }
  document.body.classList.add('resizing');
  /* 第一次拖动即视为"启用自定义布局"：以当前渲染尺寸为起点（不是写死的默认值） */
  if(isStack()){ if(!S) S = measureStackCurrent(); }
  else if(!L) L = measureCurrent();

  const move = e => { dragTo(id, e.clientX, e.clientY); };
  const up = e => {
    try{ el.releasePointerCapture(ev.pointerId); }catch(err){ /* 已释放 */ }
    document.body.classList.remove('resizing');
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    save();
    if(isStack()) saveStack();
    schedulePosition();
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
function dragTo(id, x, y){
  const main = document.querySelector('.main');
  if(!main) return;
  /* 坐标必须是有限数：某些合成事件（或测距失败）会给出 undefined，
     那会一路算出 NaN 并写进 CSS 变量与 localStorage，把布局彻底弄坏。 */
  if(!isFinite(x) || !isFinite(y)) return;
  /* 半屏模式调的是三行高度，跟列宽无关，直接走另一套 */
  if(id === 'st0' || id === 'st1'){ dragStack(id, y); schedulePosition(); return; }
  const mb = contentBox(main);        /* 用内容盒：main 的 padding 不属于网格轨道 */
  if(id === 'col0' || id === 'col1'){
    /* 左栏贴着左边、右栏贴着右边；中间栏保证一个下限，否则会被挤没 */
    const maxSide = mb.width - LIMITS.mid - 24;      /* 两条 12px 的 gap */
    if(id === 'col0') L.colL = Math.round(clamp(x - mb.left, LIMITS.colL[0], Math.min(LIMITS.colL[1], maxSide - LIMITS.colR[0])));
    else              L.colR = Math.round(clamp(mb.right - x, LIMITS.colR[0], Math.min(LIMITS.colR[1], maxSide - LIMITS.colL[0])));
  }else{
    const ci = Number(id.slice(3));              /* 手柄名里的数字 = 列序号（0|1|2） */
    const col = main.querySelectorAll(':scope > .col')[ci];
    if(!col) return;
    const cr = col.getBoundingClientRect();     /* .col 无 padding，border-box 即内容盒 */
    if(ci === 0){
      /* 左栏：拖的是**工作区**（第二张卡）的高度，从列底往上量 ——
         和下面那套"第一张卡占百分之几"正好相反，所以不能共用。
         ⚠ 必须再减一个 gap：手柄画在文件树底边上，而工作区的顶边在它下面 12px（列间距）。
           不减的话起拖瞬间就会跳高一个 gap，之后也一直比手指多 12px（不跟手）。 */
      const cs = window.getComputedStyle(col);
      const gap = parseFloat(cs.rowGap || cs.gap) || 0;
      const max = Math.max(cr.height - TREE_MIN - gap, LIMITS.ws[0]);
      L.ws = Math.round(clamp(cr.bottom - y - gap, LIMITS.ws[0], Math.min(LIMITS.ws[1], max)));
    }else{
      /* 上限现算：拖到这里时，同一列其余卡片仍能保住各自的最小高度 */
      const first = firstCardOf(col);
      const maxPct = first ? rowMaxPct(col, first) : LIMITS.row[1];
      L.rows[ci - 1] = Math.round(clamp((y - cr.top) / cr.height * 100, LIMITS.row[0], maxPct) * 10) / 10;
    }
  }
  apply();
  schedulePosition();
}

/* ---------------- 对外 ---------------- */
function init(){
  makeSplitters();
  L = load();
  S = loadStack();
  apply(); applyStack();
  positionSplitters();
  const main = document.querySelector('.main');
  document.querySelectorAll('.split').forEach(el => el.addEventListener('pointerdown', onDown));
  window.addEventListener('resize', schedulePosition);
  /* ResizeObserver 能覆盖"卡片内容变化导致高度变化"的情况；
     jsdom 没有它，退化为 window resize + 每次 renderAll。 */
  if(typeof ResizeObserver === 'function' && main){
    try{ new ResizeObserver(schedulePosition).observe(main); }catch(e){ /* 忽略 */ }
  }
}
function reset(){
  L = null; S = null;
  try{ localStorage.removeItem(STORE_KEY); localStorage.removeItem(STORE_STACK); }catch(e){ /* 隐私模式 */ }
  apply(); applyStack();
  schedulePosition();
}
/* 供 renderAll 调用：内容变化会改变卡片高度，分隔线要跟着走 */
function refresh(){ schedulePosition(); }
const current = () => (L ? JSON.parse(JSON.stringify(L)) : null);
const isCustom = () => !!L;
const currentStack = () => (S ? JSON.parse(JSON.stringify(S)) : null);
const isStackCustom = () => !!S;

VGE.layout = {
  init: init, reset: reset, refresh: refresh,
  current: current, isCustom: isCustom,
  currentStack: currentStack, isStackCustom: isStackCustom,
};

})();
