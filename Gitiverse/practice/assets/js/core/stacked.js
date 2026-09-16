/* =====================================================================
   Git Playground v5 · 半屏（堆叠）模式的交互
   ---------------------------------------------------------------------
   窄屏（≤1080px）下三栏改成上/中/下三格，这个文件负责随之而变的三件事：

   1) 左栏折叠 —— "文件与工作区"变成一个浮在提交图左上角的按钮，
      悬停展开、点击固定、关闭按钮/Esc/点外部收起。
      真·浮层而不是原地展开：原地展开会挤掉提交图的高度，而用户要的是
      "宽度不够时也让提交图尽量大"。

   2) 行 3 的终端 ⇄ AI —— 两个面板各有一个图标按钮（在输入框左边），点一下换面板。
      按钮只换图标：终端那张卡上显示 AI 图标（点了去 AI），AI 那张卡上显示终端图标。

   3) 输入即切换（单向）—— 只在终端里生效：**开头不是 git 就切到 AI**，文字原样转填。
      `g`/`gi`/`git` 这种还没敲完的前缀也算 git，留在终端。
      AI 面板里**没有任何自动跳转**：那里是提问的地方，写什么都只是提问内容；
      想回终端就点输入框左边那个按钮。

   全都在半屏模式下才生效：桌面上终端和 AI 各占一栏，没有"切换"可言，
   按钮不显示、打字也不搬运（保持沙盒原本的行为）。
   ===================================================================== */
'use strict';
window.VGE = window.VGE || {};

(function(){

const STACK_Q = '(max-width:1080px)';      /* 与 responsive.css 的断点一致 */
const HOVER_GRACE_MS = 320;                /* 从按钮移到浮层之间的宽限，别一离开就收 */

let pinned = false;                        /* 点击固定：固定后不因移开鼠标而收起 */
let hideTimer = null;

const $ = id => document.getElementById(id);
const isStacked = () => window.matchMedia(STACK_Q).matches;
/* 行 3 当前显示的是哪个（'term' | 'ai'） */
const bottomPanel = () => document.body.classList.contains('stack-ai') ? 'ai' : 'term';

/* ---------------- 1 · 左栏折叠 ---------------- */
function openFiles(){
  cancelHide();
  document.body.classList.add('files-open');
  const b = $('filesToggle'); if(b) b.setAttribute('aria-expanded', 'true');
}
function closeFiles(){
  cancelHide();
  pinned = false;
  document.body.classList.remove('files-open');
  const b = $('filesToggle'); if(b) b.setAttribute('aria-expanded', 'false');
}
function cancelHide(){ if(hideTimer){ clearTimeout(hideTimer); hideTimer = null; } }
function scheduleHide(){
  cancelHide();
  if(pinned) return;
  hideTimer = setTimeout(()=>{ hideTimer = null; closeFiles(); }, HOVER_GRACE_MS);
}

function bindFiles(){
  const btn = $('filesToggle'), box = $('colLeft'), close = $('filesClose');
  if(!btn || !box) return;

  btn.addEventListener('pointerenter', ()=>{ if(isStacked()) openFiles(); });
  btn.addEventListener('pointerleave', ()=>{ if(isStacked()) scheduleHide(); });
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    if(!isStacked()) return;               /* 桌面下按钮本来就不显示，兜底 */
    if(pinned || document.body.classList.contains('files-open')) closeFiles();
    else { pinned = true; openFiles(); }
  });
  /* 键盘可达：聚焦到按钮时也算"要看"，Tab 走开后由 pointerleave 同款宽限收起 */
  btn.addEventListener('focus', ()=>{ if(isStacked()) openFiles(); });
  btn.addEventListener('blur', ()=>{ if(isStacked() && !pinned) scheduleHide(); });

  /* 浮层本身：指针在里面时别收 */
  box.addEventListener('pointerenter', cancelHide);
  box.addEventListener('pointerleave', ()=>{ if(isStacked()) scheduleHide(); });

  if(close) close.addEventListener('click', ev => { ev.stopPropagation(); closeFiles(); });

  /* 固定状态下点浮层之外 → 收起 */
  document.addEventListener('pointerdown', ev => {
    if(!pinned || !document.body.classList.contains('files-open')) return;
    if(box.contains(ev.target) || btn.contains(ev.target)) return;
    closeFiles();
  });
  document.addEventListener('keydown', ev => {
    if(ev.key === 'Escape' && document.body.classList.contains('files-open')) closeFiles();
  });
}

/* ---------------- 2 · 行 3：终端 ⇄ AI ---------------- */
/* 切到目标面板并让它的输入框接管焦点。过渡只有 opacity + visibility（不位移），
   这里等淡入走完再聚焦 —— 对一个 visibility:hidden 的元素调 focus() 是无效的。 */
function showBottom(which){
  if(!isStacked()) return;
  document.body.classList.toggle('stack-ai', which === 'ai');
  syncTip();
  focusSoon(which === 'ai' ? $('aiInput') : $('cmdInput'));
}
/* 聚焦目标输入框：轮询到成功为止（上限约 400ms）。
   踩过的坑：刚切过去时目标卡仍是 visibility:hidden（visibility 的过渡在 t=0 还是 hidden，
   要等下一帧样式结算才翻成 visible），这期间 focus() 是**静默失败**的 ——
   焦点还留在刚被隐藏的那个输入框上，用户接着敲的字就全进了隐藏框。
   rAF 也不行：rAF 回调跑在样式结算之前（实测 16ms 时仍取不到焦点）。
   所以老老实实每 16ms 试一次，成功即停。 */
function focusSoon(el){
  if(!el) return;
  let tries = 0;
  const tick = () => {
    try{ el.focus(); }catch(e){ /* 忽略 */ }
    if(document.activeElement === el) return;
    if(++tries > 25) return;
    setTimeout(tick, 16);
  };
  tick();
}
function caretToEnd(el){
  try{ const n = el.value.length; el.setSelectionRange(n, n); }catch(e){ /* 非文本框 */ }
}
/* 把文字并进目标输入框：已有草稿就接在后面，别把人正在写的东西冲掉。
   不过"刚刚才搬过一次"说明这是同一次切换的续写（切过去的头几毫秒里，
   焦点还没落到目标框上，后续按键可能仍打在原来那个框里、于是又触发一次搬运），
   这种情况直接相接，不能插空格 —— 否则 "什么是" 会变成 "什 么 是"。 */
const CONTINUE_MS = 400;
let lastMoveAt = 0;
function mergeInto(el, text, at){
  const cur = el.value.replace(/\s+$/, '');
  const cont = (at - lastMoveAt) < CONTINUE_MS;      /* 同一次切换内的续写 */
  el.value = cur ? (cont ? cur + text : cur + ' ' + text) : text;
  lastMoveAt = at;
  caretToEnd(el);
}

/* ---------- 输入即切换：只认开头是不是 git ----------
   `g` / `gi` / `git` / `git xxx` 都算"还在敲 git 命令"，留在终端；
   其余非空内容一律转填到 AI。反过来 AI 里打头是 git 就转填回终端。

   两个方向都会顺手做一次规范化：
   · 转去 AI 时删掉开头的 `ai`（那是"我要去 AI"的令牌，不是问题内容）；
   · 转去终端时如果只写了 `git`，补一个空格，光标停在后面继续敲子命令。 */
const GIT_HEADING = /^\s*g(i(t)?)?\s*$/i;      /* 还没敲完的 git：g / gi / git (+空格) */
const GIT_START   = /^\s*git\b/i;              /* 已经是 git 命令了 */
const AI_TOKEN    = /^\s*ai\b[ \t]*/i;         /* 开头的 ai 令牌 */

/* 刚切到 AI 时，用户可能还在敲开头那个 `ai` 令牌（逐字进来，切过去的瞬间往往只有 `a`）。
   这段窗口内只要输入框里还只是"a / ai / ai 空格"这种半截令牌，就把它吃掉；
   一旦内容定格成别的东西就停止干预。 */
let stripToken = false;
const TOKEN_PARTIAL = /^\s*a(i(\s)?)?$/i;      /* a / ai / ai+空格：还只是那个令牌本身 */
/* 只在"令牌完整、后面确实跟了内容"时才删掉它。
   半截状态（`a`、`ai`、`ai `）要继续盯着：逐字输入时令牌是一个字一个字进来的，
   过早清掉会把 `a` 抹掉、剩下的 `i` 就再也认不出来了。 */
function eatAiToken(){
  if(!stripToken) return;
  const ai = $('aiInput'); if(!ai) return;
  const v = ai.value;
  if(TOKEN_PARTIAL.test(v)) return;              /* 还是令牌本身 → 继续盯 */
  const m = /^\s*ai\b[ 	]*/.exec(v);
  if(m && m[0].length < v.length){               /* 令牌后面跟了内容 → 删掉令牌 */
    ai.value = v.slice(m[0].length);
    caretToEnd(ai);
    stripToken = false;
    return;
  }
  stripToken = false;                            /* 内容和令牌无关了，收工 */
}
function switchToAi(text){
  const cmd = $('cmdInput'), ai = $('aiInput');
  if(!cmd || !ai) return false;
  cmd.value = '';
  const raw = String(text || '');
  const q = raw.replace(AI_TOKEN, '').trim();
  if(q) mergeInto(ai, q, Date.now());
  /* 只要对话框里还是"令牌本身 / 令牌+内容"，就继续盯着（逐字进来时常常只有 a） */
  stripToken = TOKEN_PARTIAL.test(ai.value) || /^\s*ai\b/.test(ai.value);
  eatAiToken();
  showBottom('ai');
  caretToEnd(ai);
  return true;
}
/* 终端输入框：打头不是 git 就走。返回是否切了。 */
function onTerminalTyping(){
  const cmd = $('cmdInput');
  if(!cmd) return false;
  const v = cmd.value;
  if(!v.trim()) return false;                  /* 空的不动 */
  if(GIT_HEADING.test(v) || GIT_START.test(v)) return false;
  return switchToAi(v);
}
/* 回车 / 按钮这两条路径的兜底：正常打字时在 input 阶段就已经搬运完了，
   这里主要接住"整段粘贴后直接回车""脚本填值"这类没走 input 的情况。 */
function takeTerminalInput(raw){
  if(!isStacked()) return false;              /* 半屏模式专属：桌面两栏并排，没有"搬运"这回事 */
  const inp = $('cmdInput');
  if(inp && String(raw == null ? '' : raw) !== inp.value) inp.value = String(raw == null ? '' : raw);
  return inp ? onTerminalTyping() : false;
}
/* ---------- 切换按钮 + 悬浮指示 ----------
   按钮在每个面板的输入行里各有一个（终端那张在输入框左边，AI 那张同样），
   各自显示"点一下会去的那边"的图标 —— 所以按钮本身不需要 JS 改图标。
   悬浮指示只有一个，挂在 body 上（卡片 overflow:hidden 会裁掉它）。 */
function setTipFor(target){
  const tip = $('panelTip'); if(!tip) return;
  /* 参数是**目标**面板（按钮点下去会去的那边），不是当前面板 */
  tip.textContent = VGE.i18n.t(target === 'ai' ? 'stack.tipToAi' : 'stack.tipToTerm');
}
/* 当前可见的按钮总是"去另一块"，所以文案要按另一块来取。
   这里踩过一次坑：把当前面板当目标传进去，于是切回终端后提示仍写着"回命令终端"——
   而屏幕上那个按钮明明是去 AI 的。 */
function syncTip(){ setTipFor(bottomPanel() === 'ai' ? 'term' : 'ai'); }
/* 悬浮指示跟着按钮走：显示时读一次位置（fixed 定位，不受容器裁切影响） */
function showTipAt(btn){
  const tip = $('panelTip'); if(!tip || !btn) return;
  tip.classList.add('on');
  const r = btn.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let left = r.left;                                        /* 左对齐按钮 */
  left = Math.max(8, Math.min(left, document.documentElement.clientWidth - w - 8));
  let top = r.bottom + 8;                                   /* 放在按钮下方 */
  if(top + h > document.documentElement.clientHeight - 8) top = r.top - h - 8;
  tip.style.left = Math.round(left) + 'px';
  tip.style.top = Math.round(top) + 'px';
}
function hideTip(){
  const tip = $('panelTip'); if(tip) tip.classList.remove('on');
}
function bindSwitch(){
  document.addEventListener('click', ev => {
    const b = ev.target.closest ? ev.target.closest('.pswitch') : null;
    if(!b || !isStacked()) return;                /* 按钮只在半屏模式下显示 */
    showBottom(b.dataset.panel === 'ai' ? 'ai' : 'term');
  });
  document.addEventListener('mouseover', ev => {
    const b = ev.target.closest ? ev.target.closest('.pswitch') : null;
    if(b && isStacked()) showTipAt(b);
  });
  document.addEventListener('mouseout', ev => {
    const b = ev.target.closest ? ev.target.closest('.pswitch') : null;
    if(b && !b.contains(ev.relatedTarget)) hideTip();
  });
  /* 键盘可达：Tab 聚焦到按钮时同样给出指示 */
  document.addEventListener('focusin', ev => {
    const b = ev.target.closest ? ev.target.closest('.pswitch') : null;
    if(b && isStacked()) showTipAt(b);
  });
  document.addEventListener('focusout', hideTip);
  setTipFor(bottomPanel());
}
/* 语言切换后刷新悬浮指示的文案（按钮的 aria 走 data-i18n，会自动更新） */
function refresh(){ syncTip(); }

/* 宽度回到桌面三栏时把状态清干净：否则 stack-ai 会一直挂在 body 上，
   下次再变窄会"莫名其妙"地停在 AI 面板。 */
function onBreakpoint(){
  if(isStacked()){ syncTip(); return; }
  closeFiles();
  stripToken = false;                       /* 换了模式，令牌窗口作废 */
  hideTip();
  document.body.classList.remove('stack-ai');
  setTipFor('ai');                          /* 桌面下指示不显示，指哪边都无所谓 */
}

function init(){
  bindFiles();
  bindSwitch();
  document.body.classList.remove('stack-ai');   /* 默认给终端 */
  /* 边打字边切：input 事件里做，用户不用回车也不用点击 */
  const ci = $('cmdInput'), ai = $('aiInput');
  if(ci) ci.addEventListener('input', ()=>{ if(isStacked()) onTerminalTyping(); });
  /* AI 输入框**不再**触发任何面板切换（用户明确要求：在 AI 下不自动跳转）。
     这里只做一件事：把转填过来时可能残留的 `ai` 令牌吃掉。 */
  if(ai) ai.addEventListener('input', eatAiToken);
  syncTip();                                /* 默认在终端 → 提示"切到 AI" */
  const mq = window.matchMedia(STACK_Q);
  if(mq.addEventListener) mq.addEventListener('change', onBreakpoint);
  else if(mq.addListener) mq.addListener(onBreakpoint);
}

VGE.stacked = {
  init: init, isStacked: isStacked, bottomPanel: bottomPanel,
  openFiles: openFiles, closeFiles: closeFiles, showBottom: showBottom,
  takeTerminalInput: takeTerminalInput,
  refresh: refresh, setTipFor: setTipFor,
};

})();
