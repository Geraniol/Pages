/* =====================================================================
   Git Playground · 控制层 + AI + 启动 + 事件绑定
   ---------------------------------------------------------------------
   职责：命令执行 / 回溯、弹窗、离线 AI 回答、启动流程与事件绑定。
   · AI 被独立封装成 VGE.ai（未配密钥时退回内置回答），传输层在 core/ai.js。
   ===================================================================== */
'use strict';
window.VGE = window.VGE || {};

let SUGGEST_CMD = '';
let modalAction = 'reset';   /* 通用确认弹窗当前在执行哪种动作 */

/* 通用确认弹窗的种类表：标题 / 正文 / 确认键文案的 i18n 键集中在此，
   加一种确认只需加一行，不必再抄一份 markup。 */
const CONFIRM_KINDS = {
  reset:          { title:'modal.resetTitle',     body:'modal.reset',          ok:'modal.okReset' },
  clearAI:        { title:'cfg.clearTitle',       body:'cfg.clearBody',        ok:'cfg.clearOk' },
};
/* 原来还有四种：重置团队 / 开启写入模式 / 断开仓库 / 清除导入的课程 ——
   它们分别属于合作模式与本地仓库模式，两种模式都已删除。 */
function openConfirm(kind){
  const k = CONFIRM_KINDS[kind] || CONFIRM_KINDS.reset;
  modalAction = kind;
  $('mTitle').textContent = VGE.i18n.t(k.title);
  $('mBody').innerHTML = VGE.i18n.t(k.body);
  $('mOk').textContent = VGE.i18n.t(k.ok);
  $('mask').classList.add('on');
}
/* 关闭确认框。若有等待中的 T2 确认，一并按「取消」放行，
   否则那条 promise 永远不 resolve，终端会卡在"执行中"。 */
function dismissMask(){
  $('mask').classList.remove('on');
}
/* 原来这里还要 VGE.real.resolveConfirm(false) 放行一条等 T2 确认的 promise
   （本地仓库的写操作要二次确认）。本地仓库模式已删除，那个 promise 也不存在了。 */
/* 建议 chips 依语言生成（随语言切换刷新）。
   只留两条跑得通的通用问法：对话区很窄，问法越多越像菜单，
   而这两条恰好覆盖"我卡住了"和"我看不懂刚发生了什么"两种主要诉求。 */
const suggestions = () => ['sug.q0','sug.q1'].map(k => VGE.i18n.t(k));
function renderSugs(){
  const sg = $('sugs'); if(!sg) return;
  /* chip 是基元类（见 components/buttons.css），sug 只留作 JS/测试的钩子 */
  sg.innerHTML = suggestions().map(s => '<button class="sug chip">' + esc(s) + '</button>').join('');
  sg.querySelectorAll('.sug').forEach(b => b.addEventListener('click', ()=> askAI(b.textContent)));
}

/* ---------------- 执行 / 回溯 ---------------- */
function execInto(raw){
  const br = repo.HEAD, initd = repo.init;
  const r = interpret(raw);
  return { raw:raw, out:r.out, ok:r.ok, br:br, initd:initd };
}
/* 支持 a && b 链式命令：拆成多条独立历史，与真实 shell 一致 */
function splitChain(raw){ return String(raw).split('&&').map(s => s.trim()).filter(Boolean); }
function runCommand(raw){
  raw = String(raw || '').trim(); if(!raw) return;
  /* 真实仓库模式：命令要发给后端执行，不是喂给沙盒模拟引擎 */
  if(cursor < repo.log.length - 1) repo.log = repo.log.slice(0, cursor + 1);
  splitChain(raw).forEach(c => repo.log.push(execInto(c)));
  cursor = repo.log.length - 1;
  renderAll();
}
function rewindTo(i){
  const keep = repo.log.slice();
  resetHash(); primeColors();
  repo = blankRepo(); repo.log = keep;
  for(let k = 0; k <= i; k++){
    const e = execInto(keep[k].raw);
    keep[k].out = e.out; keep[k].ok = e.ok; keep[k].br = e.br; keep[k].initd = e.initd;
  }
  cursor = i; lastSig = '';
  renderAll();
}

/* ---------------- AI 助手（配置 + 流式；传输层见 core/ai.js） ---------------- */
/* 追加一个气泡。返回该元素，流式渲染需要拿到它逐字填充。 */
function chat(html, who){
  const b = $('chat'), d = document.createElement('div');
  d.className = 'bub ' + (who || 'ai'); d.innerHTML = html;
  b.appendChild(d); b.scrollTop = b.scrollHeight;
  return d;
}
function scrollChat(){ const b = $('chat'); if(b) b.scrollTop = b.scrollHeight; }

/* 行内 markdown 的最小还原：只把 `code` 变成 <code>。
   必须在 esc() 之后调用 —— 模型输出一律先当纯文本，不给它注入 HTML 的机会。 */
function mdInline(s){ return String(s).replace(/`([^`\n]+)`/g, '<code>$1</code>'); }

/* 把 HTTP / 网络失败翻译成用户能照做的提示 */
function aiErrHTML(e){
  const T = VGE.i18n.t.bind(VGE.i18n), m = esc((e && e.msg) || '');
  let msg;
  const ep = esc((e && e.endpoint) || '');
  const nm = esc((e && e.name) || '');
  if(e && e.timeout)                msg = T('ai.errTimeout', { n:Math.round(VGE.ai.IDLE_MS / 1000) });
  /* status 0 = 请求根本没拿到响应。绝大多数情况就是被 CORS 挡了或网络不通，
     文案只说这一件事（原来这里会展开讲代理/VPN/证书/中间层改写 Origin，
     那是"后端转发时代"的排查路线，转发已经拆掉，那些路都走不通了）。 */
  else if(!e || e.status === 0)     msg = T('ai.errNet',     { msg:m, endpoint:ep, name:nm });
  else if(e.status === 401 || e.status === 403) msg = T('ai.err401', { code:e.status, msg:m });
  else if(e.status === 404)         msg = T('ai.err404',     { msg:m });
  else if(e.status === 429)         msg = T('ai.err429');
  else if(e.status >= 500)          msg = T('ai.err5xx',     { code:e.status });
  else                              msg = T('ai.errOther',   { code:e.status, msg:m });
  return svgIcon('alert','xs') + ' ' + msg;
}
/* 当前状态的"AI 可读上下文"：纯数据，便于替换成真实 LLM 时的 prompt 组装。
   ⚠ 与 ai.js 的 aiStateText() 同一口径：**不发课程 / 步骤**，也不发模式与身份。
   这里原来带 currentTaskIndex / currentTaskTitle / activeDev —— 课程面板与合作模式
   都已删除，那些字段只会让模型以为界面里还有一套它看不见的流程。
   真正发出去的文本由 ai.js 的 aiStateText() 组装，这个对象是给离线回答器与调试看的。 */
function aiContext(){
  return {
    branch: repo.HEAD, commits: repo.commits.length,
    branches: Object.keys(repo.branches),
    staged: staged().length, unstaged: unstaged().length,
    conflicted: repo.merging ? repo.merging.open : [],
  };
}
/* =====================================================================
   节点详情面板：摘要 + 改动统计 + 改动文件的目录视图；**点某个文件才展开 diff**
   ---------------------------------------------------------------------
   为什么单独弹出、而不是写进 AI 对话气泡：
     · 对话区只有 344px 宽，逐文件 diff 在那里根本没法看；
     · 详情是"查看"行为，不该混进"提问"的记录里，否则翻聊天记录会被详情刷屏。
   为什么点开才给 diff：一次提交动十几个文件时，全部铺开既滚不动也看不出重点；
   先给目录结构 + 统计，想看哪个再展开哪个（diff 也就能按需取，真实仓库不必先拉全量）。
   ===================================================================== */
let nodeDiffProvider = null;   /* (path) => HTML 字符串或 Promise<HTML>，由打开面板的一方提供 */

/* 改动统计：新增 / 修改 / 删除 / 总数 */
function nodeStatsHTML(changes){
  const t = VGE.i18n.t.bind(VGE.i18n), n = { A:0, M:0, D:0 };
  (changes || []).forEach(ch => { if(n[ch.s] !== undefined) n[ch.s]++; });
  return '<div class="node-stats">'
    + '<span class="ns a">+' + n.A + ' ' + esc(t('legend.add')) + '</span>'
    + '<span class="ns m">~' + n.M + ' ' + esc(t('legend.mod')) + '</span>'
    + '<span class="ns d">-' + n.D + ' ' + esc(t('legend.del')) + '</span>'
    + '<span class="ns n">' + esc(t('node.files', { n:(changes || []).length })) + '</span></div>';
}
/* 改动文件的目录视图（只列改动涉及的文件，中间目录自动补齐） */
function nodeTreeHTML(changes){
  const list = changes || [];
  if(!list.length)
    return '<div class="sub" style="margin-top:8px">' + esc(VGE.i18n.t('node.noChanges')) + '</div>';
  const stat = {};
  list.forEach(ch => stat[ch.p] = { states:[{ s:ch.s, staged:false }], s:ch.s, staged:false });
  const files = list.map(ch => ch.p).sort();
  return '<div class="tree node-tree">' + treeHTML(buildTree(files), stat, false, -1) + '</div>';
}

function openNodePanel(html, diffFor){
  const body = $('nodeBody'), mask = $('maskNode');
  if(!body || !mask) return;
  nodeDiffProvider = diffFor || null;
  body.innerHTML = html;
  body.scrollTop = 0;
  /* 文件行绑定用 dataset + 闭包，不拼选择器 —— 路径里可能有引号、反斜杠 */
  body.querySelectorAll('.tnode[data-path]').forEach(row => {
    row.classList.add('clickable');
    row.addEventListener('click', () => toggleNodeFile(row, row.dataset.path));
  });
  paintIcons(body);
  mask.classList.add('on');
}
function closeNodePanel(){
  const mask = $('maskNode');
  if(mask) mask.classList.remove('on');
  nodeDiffProvider = null;
}
/* 展开 / 收起某个文件的 diff（手风琴，互不影响，可同时展开多个） */
async function toggleNodeFile(row, path){
  const next = row.nextElementSibling;
  if(next && next.classList.contains('nodediff')){      /* 已展开 → 收起 */
    next.remove();
    row.classList.remove('open');
    const b = row.querySelector('.nd-stat'); if(b) b.remove();
    return;
  }
  const box = document.createElement('div');
  box.className = 'nodediff';
  box.innerHTML = '<div class="sub">' + esc(VGE.i18n.t('node.diffLoading')) + '</div>';
  row.after(box);
  row.classList.add('open');
  let html = '';
  try{
    html = nodeDiffProvider ? await nodeDiffProvider(path) : '';
  }catch(e){
    html = '<div class="sub">' + esc(String((e && e.message) || e)) + '</div>';
  }
  if(!box.isConnected) return;                          /* 期间已收起 / 面板已关闭 */
  box.innerHTML = html || '<div class="sub">' + esc(VGE.i18n.t('node.diffNone')) + '</div>';
  paintIcons(box);
  /* 行尾补 +n −m，扫一眼就知道哪个文件改动大 */
  const plus = (html.match(/class="l add"/g) || []).length;
  const minus = (html.match(/class="l del"/g) || []).length;
  if(plus || minus){
    const badge = document.createElement('span');
    badge.className = 'nd-stat';
    badge.innerHTML = '<span class="p">+' + plus + '</span><span class="m">−' + minus + '</span>';
    row.appendChild(badge);
  }
}
/* 沙盒模式：两侧内容都在内存里，diff 直接同步算出来。
   注意 diffProvider 的签名统一是 (path) => HTML —— 面板只认路径
   （它手里只有 data-path），变更对象由各模式自己按路径查。 */
function sandboxDiffFor(c, changes){
  const pContent = c.parents.length ? contentOf(repo.byId[c.parents[0]]) : {};
  const byPath = {};
  (changes || []).forEach(ch => { byPath[ch.p] = ch; });
  return path => {
    const ch = byPath[path] || { p:path, s:'M' };
    const before = pContent[path] || '', after = (c.content || {})[path] || '';
    const t = VGE.i18n.t.bind(VGE.i18n);
    const d = diffLines(before, after);
    /* 内容一样时（例如只是改了权限位）给个明确说法，别渲染一个空框 */
    if(!d.some(x => x.t === '+' || x.t === '-'))
      return '<div class="sub">' + esc(t('node.diffNone')) + '</div>';
    const kind = ch.s === 'A' ? t('explain.added') : ch.s === 'D' ? t('legend.del') : t('explain.modified');
    return '<div class="diffbox"><div class="cap">' + svgIcon('fileCode','xs') + esc(path)
      + '<span style="margin-left:auto;color:var(--muted);font-weight:500">' + esc(kind) + '</span></div>'
      + '<div class="dl">' + d.map(x => '<div class="l ' + (x.t === '+' ? 'add' : x.t === '-' ? 'del' : '') + '">'
        + (x.t === '+' ? '+' : x.t === '-' ? '-' : ' ') + ' ' + esc(x.l) + '</div>').join('') + '</div></div>';
  };
}
function explainNode(id){
  const t = VGE.i18n.t.bind(VGE.i18n);
  /* 真实仓库：diff 不在本地（v3 的 content 表真实仓库里没有），改走后端懒加载 */
  if(String(id).indexOf('ref:') === 0){
    const ref = graphRefs().find(r => 'ref:' + r.name === id);
    const remote = ref && ref.remote;
    if(remote){
      openNodePanel(t('explain.origin', { ref: esc(ref.name.slice(7)), tip: esc(ref.tip) }));
    } else {
      const b = ref ? ref.name : String(id).slice(4);
      openNodePanel(t('explain.branch', { name: esc(b), tip: esc(tipOf(b) || '—') }));
    }
    return;
  }
  const c = graphCommitById(id); if(!c) return;
  const remote = !repo.byId[id];
  const refs = refsAt(id);
  let html = t('explain.commitHead', { id: esc(c.id), msg: esc(c.msg) });
  const bits = [
    remote ? t('explain.remote') : t('explain.branchOf', { branch: esc(c.branch) }),
    t('explain.parents', { parents: c.parents.length ? c.parents.map(esc).join(', ') : t('explain.parentNone') }),
    t('explain.snapshot', { n: c.snapshot.length }),
  ];
  if(c.isMerge) bits.push(t('explain.merge'));
  if(refs.length) bits.push(t('explain.refs', { refs: esc(refs.join(', ')) }));
  html += t('explain.sub', { bits: bits.join(' · ') });
  const changes = (c.isMerge && c.parents.length)
    ? (repo.byId[c.parents[1]] ? repo.byId[c.parents[1]].changes : c.changes || [])
    : (c.changes || []);
  /* 统计 + 目录视图；diff 等点了具体文件再算（内容都在内存里，同步返回） */
  html += nodeStatsHTML(changes) + nodeTreeHTML(changes);
  openNodePanel(html, sandboxDiffFor(c, changes));
}

/* 提问入口：未配置密钥走内置离线回答（保证无网也能演示），
   已配置则交给 VGE.ai 走流式，逐字渲染到气泡里。 */
function askAI(q){
  q = String(q || '').trim(); if(!q) return;
  /* 不再给提问气泡加「你 / You」说话人标签：气泡本身靠右靠色已经区分了角色，
     再加一个人称标签既占宽度又多余。 */
  chat(esc(q), 'me');
  if(!VGE.ai.isReady()){
    chat(VGE.ai.answer(q, aiContext()));
    return;
  }
  streamAI(q);
}
/* 流式渲染：先插入空气泡，按增量重绘。每条增量都重新转义整段文本，
   所以模型即使输出 HTML 也只会被当文字显示。回复很短，全量重绘的开销可忽略。 */
function streamAI(q){
  const bub = chat('', 'ai');
  bub.classList.add('stream');
  const caret = document.createElement('span');
  caret.className = 'caret';
  bub.appendChild(caret);

  let raw = '';
  const paint = () => {
    bub.innerHTML = raw ? mdInline(esc(raw))
                        : '<span class="sub">' + esc(VGE.i18n.t('ai.streaming')) + '</span>';
    bub.appendChild(caret);
    scrollChat();
  };
  paint();
  /* 先发起请求再刷新 chrome：aiAsk 在第一个 await 之前就同步置位 busy，
     顺序反过来会让「停止」按钮要等到下一次 renderAll 才出现。 */
  const pending = VGE.ai.ask(q, { onDelta: t => { raw += t; paint(); } });
  renderAiChrome();

  pending.then(r => {
    bub.classList.remove('stream');
    if(caret.parentNode) caret.remove();
    if(r.ok){
      bub.innerHTML = raw ? mdInline(esc(raw)) : esc(VGE.i18n.t('ai.errEmpty'));
      if(!raw) bub.classList.add('err');
    }else if(r.reason === 'aborted'){
      bub.innerHTML = (raw ? mdInline(esc(raw)) : '') + ' <span class="sub">' + esc(VGE.i18n.t('ai.stopped')) + '</span>';
    }else if(r.reason === 'empty'){
      bub.classList.add('err');
      bub.innerHTML = svgIcon('alert','xs') + ' ' + esc(VGE.i18n.t('ai.errEmpty'));
    }else{
      bub.classList.add('err');
      bub.innerHTML = aiErrHTML(r.err);
    }
    paintIcons(bub);
    renderAiChrome();
    scrollChat();
  });
}

/* ---------------- AI 建议 + 命令提示符 ---------------- */
/* 输入框的占位提示：给一条"现在多半用得上"的命令 + 一句为什么。
   ⚠ 这里原来是**按课程步骤**推的（第 N 步建议执行 X）——课程引擎删除后没有"第几步"，
   改为只看仓库自身的状态：有暂存就提交、有改动就 add、都没有就看历史。
   命令一律纯英文：它是要照抄进终端的，中英混排既难复制，也会让同一个预设
   在中英界面下变成两条不同的命令。 */
function updateSuggestion(){
  const inp = $('cmdInput');
  let cmd, why;
  if(!repo.init){
    cmd = 'git init'; why = VGE.i18n.t('sug.noRepo');
  } else if(staged().length){
    cmd = 'git commit -m "update"'; why = VGE.i18n.t('sug.staged');
  } else if(unstaged().length){
    cmd = 'git add .'; why = VGE.i18n.t('sug.unstaged');
  } else {
    cmd = 'git log'; why = VGE.i18n.t('sug.history');
  }
  SUGGEST_CMD = cmd;
  inp.placeholder = cmd + '   — ' + why;
}
/* 页面标题随语言刷新。
   原来这个函数叫 renderModeChrome，除了标题还要做"模式标签高亮"与 appbar 文字 ——
   模式切换、模式按钮、VGE.MODES 都已删除，只剩标题这一件事，名字也跟着改。
   （render.js 的 renderAll 里调用它，两边要一起改。） */
function renderTitle(){
  document.title = VGE.i18n.t('app.title');
}

/* 终端提示符。原来合作模式会在前面拼一段彩色的「谁@」（当前身份），
   身份条已删除；颜色也改用 token，暗色主题下不会糊。 */
function updatePrompt(){
  $('psPrefix').innerHTML = VGE.i18n.t('term.prompt')
    + (repo.init ? ' <span style="color:var(--term-amber)">(' + esc(repo.HEAD) + ')</span>' : '') + ' $';
}

function cfgMsg(text, kind){
  const el = $('aiCfgMsg');
  el.className = 'cfg-msg' + (text ? ' on ' + (kind || '') : '');
  el.innerHTML = text || '';
  if(text) paintIcons(el);
}
function openAiCfg(){
  const c = VGE.ai.config();
  $('aiEndpoint').value = c.endpoint;
  $('aiKey').value      = c.apiKey;
  $('aiModel').value    = c.model;
  $('aiKey').type       = 'password';
  $('aiKeyEye').innerHTML = svgIcon('eye','sm');
  cfgMsg('');
  syncLangSeg();
  /* 这里原来还有一句 syncWriteMode()（刷"只读 / 可写入"滑块的文案）——
     那个滑块与同步函数都随本地仓库模式删除了。留着它会让本函数在
     第一句有效代码之前就抛 ReferenceError，表现是**设置按钮完全没反应**。 */
  openedCfg = { endpoint:c.endpoint, model:c.model };    /* 关面板时比对，决定要不要清对话历史 */
  $('maskCfg').classList.add('on');
  setTimeout(()=>{ $('aiKey').focus(); }, 30);
}
/* 打开面板时的模型 / 接口地址。用来判断"用户是不是真的换了模型"：
   填写即保存之后每个键都触发保存，不能每敲一个字就把对话历史清一次。 */
let openedCfg = null;
/* 关面板（点遮罩 / Esc / 点了外面）时收尾：
   模型或接口地址真的变了才清空对话历史 —— 换模型即换上下文，避免旧状态串台。
   判断放在这里而不是每次自动保存里：否则从 deepseek 改成 deepseek-flash 的过程中，
   中间那串半截名字（d、de、dee…）每一个都会触发一次 resetHistory。 */
function closeAiCfg(){
  $('maskCfg').classList.remove('on');
  const c = VGE.ai.config();
  const changed = openedCfg && (c.model !== openedCfg.model || c.endpoint !== openedCfg.endpoint);
  openedCfg = null;
  if(changed){ VGE.ai.resetHistory(); renderAll(); }
}
/* 从表单读一份配置（未保存也能拿去测试连接） */
function readAiForm(){
  /* 界面上只剩三个输入框；回复上限/温度用配置里的默认值（见 ai.js 的 aiBlankCfg），
     转发固定走本机后端，不再暴露开关。 */
  return {
    endpoint: $('aiEndpoint').value,
    apiKey:   $('aiKey').value,
    model:    $('aiModel').value,
  };
}
/* 校验一份表单：返回第一个错误，没问题返回 null */
function aiFormError(f){
  const T = VGE.i18n.t.bind(VGE.i18n);
  if(!VGE.ai.isValidEndpoint(f.endpoint)) return T('cfg.errEndpoint');
  if(!f.apiKey.trim())                    return T('cfg.errKey');
  if(!f.model.trim())                     return T('cfg.errModel');
  return null;
}
let autoSaveTimer = null;
/* 填写即保存：输入框里每次改动，静默 600ms 之后校验并落盘。
   三条规则：
     · 空表单不报错也不保存 —— 用户可能正把旧值清掉重打，这时候弹红字纯属打扰；
     · 填了但无效 → 红字指出哪一项不对，**保留上一份可用配置**（不落盘坏值）；
     · 全部有效 → 落盘 + 绿字"已自动保存"。
   以前是"改完点保存"，中途关掉面板等于白填；现在关面板就一定是存好的。 */
function autoSaveAiCfg(){
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(()=>{
    const f = readAiForm();
    const blank = !f.endpoint.trim() && !f.apiKey.trim() && !f.model.trim();
    if(blank){ cfgMsg(''); return; }
    const err = aiFormError(f);
    if(err) return cfgMsg(svgIcon('alert','xs') + ' ' + esc(err), 'bad');
    if(!VGE.ai.saveConfig(f)) return cfgMsg(svgIcon('alert','xs') + ' ' + esc(VGE.i18n.t('cfg.errLocal')), 'bad');
    cfgMsg(svgIcon('circleCheck','xs') + ' ' + esc(VGE.i18n.t('cfg.autoSaved')), 'ok');
  }, 600);
}
async function testAiCfg(){
  const btn = $('aiCfgTest');
  btn.disabled = true;
  cfgMsg(esc(VGE.i18n.t('cfg.testing')));
  const r = await VGE.ai.test(readAiForm());
  btn.disabled = false;
  if(r.ok){
    /* 这里原来还会追加一句"经本机后端转发" —— 转发已拆掉，成功就是直连成功。 */
    cfgMsg(svgIcon('circleCheck','xs') + ' '
         + esc(VGE.i18n.t('cfg.testOk', { model:r.model, ms:r.ms })), 'ok');
    return;
  }
  /* 厂商的错误体原样带出来 —— 直连被 CORS 拦时这是唯一线索 */
  const detail = r.code === 'endpoint' ? VGE.i18n.t('cfg.errEndpoint')
               : r.code === 'key'      ? VGE.i18n.t('cfg.errKey')
               : r.code === 'model'    ? VGE.i18n.t('cfg.errModel')
               : r.code === 'timeout'  ? VGE.i18n.t('cfg.testTimeout')
               : (r.status ? r.status + ' · ' : '') + (r.msg || VGE.i18n.t('cfg.testNet'));
  cfgMsg(svgIcon('alert','xs') + ' ' + esc(VGE.i18n.t('cfg.testFail', { msg:detail })), 'bad');
}
function toggleAiKeyEye(){
  const inp = $('aiKey'), show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  $('aiKeyEye').innerHTML = svgIcon(show ? 'eyeOff' : 'eye','sm');
}
/* 语言下拉：选项用各自语言的写法（中文界面「中文 / English」，英文界面「Chinese / English」），
   这样英文界面里不会出现中文字样 —— 与"英文界面不得漏中文"的巡检口径一致。 */
/* 语言滑块：按 VGE.i18n.supported 生成分段按钮，并把药丸滑到当前语言那一格。
   data-cur 决定药丸位置（CSS 里 translateX 一格），.on 决定文字颜色。 */
function syncLangSeg(){
  const seg = $('langSeg'); if(!seg) return;
  const codes = VGE.i18n.supported;
  const label = c => VGE.i18n.t('cfg.lang.' + (c === 'zh-CN' ? 'zh' : 'en'));
  let btns = [...seg.querySelectorAll('.seg-opt')];
  if(btns.length !== codes.length){          /* 语言表变了才重建，避免每次切换都重排 */
    btns.forEach(b => b.remove());
    btns = codes.map(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'seg-opt'; b.dataset.lang = c;
      b.setAttribute('role', 'radio');
      seg.appendChild(b);
      return b;
    });
  }
  btns.forEach((b, i) => {
    b.textContent = label(codes[i]);      /* 选项名随界面语言走（英文界面下写 Chinese） */
    const on = codes[i] === VGE.i18n.current;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  });
  seg.dataset.cur = VGE.i18n.current;
  /* 药丸位置看 data-idx（0 起）—— CSS 只认这个，别再绑具体语言代码，
     否则加第三种语言、或换个控件复用时又要改样式。data-cur 留给"当前值"本身。 */
  seg.dataset.idx = String(Math.max(0, codes.indexOf(VGE.i18n.current)));
}

/* =====================================================================
   启动
   ===================================================================== */
const SEED_CMDS = [
  'git init',
  'git add .',
  'git commit -m "Add project scaffold"',
  'git branch feature',
  'git switch feature',
  'git add .',
  'git commit -m "Add navigation bar"',
  'git switch main',
  'git add .',
  'git commit -m "Update docs and cleanup"',
];
/* 只重置"仓库状态 + 界面"，不动聊天记录 —— 导入课程时要用（见 applyCourseStart）。 */
function resetSandboxState(cmds){
  resetHash(); primeColors(); collapsed.clear();
  repo = blankRepo(); cursor = -1; lastSig = '';
  if(net){ net.destroy(); net = null; }
  (cmds || []).forEach(raw => splitChain(raw).forEach(c => repo.log.push(execInto(c))));
  cursor = repo.log.length - 1;
  renderAll();
}
function boot(seed){
  resetSandboxState(seed);
  $('chat').innerHTML = '';
  chat(VGE.i18n.t('chat.greet'));
  renderAll();
}
function resetSandbox(){
  boot([]);
  chat(VGE.i18n.t('chat.reset'));
}

/* =====================================================================
   事件绑定
   ===================================================================== */
(function bind(){
  const inp = $('cmdInput');
  /* 半屏（堆叠）模式下 `ai …` 不是沙盒命令，而是"切到 AI 助手问这句"。
     交给 core/stacked.js 判断（非堆叠模式下它一律返回 false，行为不变）。 */
  const stackedTakes = v => !!(VGE.stacked && VGE.stacked.takeTerminalInput(v));
  $('runBtn').addEventListener('click', ()=>{
    if(stackedTakes(inp.value)){ inp.value = ''; return; }
    runCommand(inp.value); inp.value = ''; updateSuggestion();
  });
  inp.addEventListener('keydown', e=>{
    if(e.key === 'Enter'){
      if(stackedTakes(inp.value)){ inp.value = ''; updateSuggestion(); return; }
      runCommand(inp.value); inp.value = ''; updateSuggestion();
    }
    else if(e.key === 'Tab' && !inp.value){ e.preventDefault(); inp.value = SUGGEST_CMD; updateSuggestion(); }
    else if(e.key === 'ArrowUp' && !inp.value && repo.log.length){ e.preventDefault(); inp.value = repo.log[cursor >= 0 ? cursor : 0].raw; updateSuggestion(); }
  });

  $('chips').addEventListener('click', e=>{
    const b = e.target.closest('.chip'); if(!b) return;
    inp.value = b.dataset.cmd; inp.focus(); updateSuggestion();
  });

  /* AI：发送键在流式期间变为「停止」 */
  /* AI 输入框没有"搬运/跳转"这回事了：在 AI 里写什么都只是提问（半屏模式也一样），
     回终端请点输入框左边那个切换按钮。 */
  $('aiSend').addEventListener('click', ()=>{
    if(VGE.ai.busy()){ VGE.ai.abort(); return; }
    askAI($('aiInput').value); $('aiInput').value = '';
  });
  $('aiInput').addEventListener('keydown', e=>{
    if(e.key === 'Enter'){ askAI($('aiInput').value); $('aiInput').value = ''; }
  });
  renderSugs();   /* 建议 chips 随语言生成 */

  /* 明暗主题：点了立刻切 + 记住。切换是纯 CSS 的事（改 <html data-theme>），
     不需要重绘任何面板 —— 所有颜色都走 token，属性一变就整体生效。
     与 chapter_1 的 themeBtn 一样，按钮自己的图标由 CSS 按 data-theme 切显隐，
     JS 这边不用管。 */
  $('themeBtn').addEventListener('click', ()=> VGE.theme.toggle());

  /* AI 配置弹窗 */
  $('aiCfgBtn').addEventListener('click', openAiCfg);
  $('aiStatus').addEventListener('click', openAiCfg);
  /* 卡头那枚只读/可写指示灯（#rwStatus）随任务指南卡片一起删除了，
     它原来的点击绑定（点了开设置）也一并去掉，见 render.js 的 syncWriteChip。 */
  $('aiCfgTest').addEventListener('click', testAiCfg);
  $('aiCfgClear').addEventListener('click', ()=> openConfirm('clearAI'));
  $('aiKeyEye').addEventListener('click', toggleAiKeyEye);
  /* 事件委托：分段按钮是 syncLangSeg() 动态生成的 */
  $('langSeg').addEventListener('click', e => {
    const btn = e.target.closest('.seg-opt');
    if(btn && btn.dataset.lang !== VGE.i18n.current) applyLang(btn.dataset.lang);
  });
  /* 重置布局不再往助手消息里发一条 —— 设置类操作的结果在界面上直接可见
     （布局当场变回去），再刷一条聊天只会把对话推走。 */
  $('layoutReset').addEventListener('click', ()=> VGE.layout.reset());
  $('maskCfg').addEventListener('click', e=>{ if(e.target === $('maskCfg')) closeAiCfg(); });
  /* 三个输入框都改成"填写即保存"（页脚不再有取消/保存按钮） */
  ['aiEndpoint','aiKey','aiModel'].forEach(id =>
    $(id).addEventListener('input', autoSaveAiCfg));

  $('gFit').addEventListener('click', ()=>{ hideNodeTip(); net ? doFit(300) : renderGraph(); });
  setDirIcon();
  $('gDir').addEventListener('click', ()=>{
    gDir = gDir === 'LR' ? 'UD' : 'LR';
    setDirIcon();
    hideNodeTip();
    /* 这里**不要**再自己 doFit 一次：下面的 renderGraph() 发现 sig 变了（gDir 是 sig 的一部分）
       会排一次 doFit(280)。两处都排的话，相差 1ms 的两个 fit 动画同时跑、互相抢缩放 ——
       真实仓库下就是"点一下图在乱跳"的直接原因（实测钩住 doFit 得到 [{d:280},{d:300}]）。 */
    if(net) net.setOptions(visOptions());
    renderGraph();
  });

  /* 「当前」定位按钮（#jumpCur）长在任务指南卡头，随卡片一起删除 ——
     它原来做的事是"把课程列表里当前那一步展开并滚到眼前"，
     现在课程列表整块没了，这段绑定没有存在意义。 */
  $('resetBtn').addEventListener('click', ()=>{
    /* 重置按钮现在挂在顶栏（设置按钮左边），是这个界面唯一的"清空沙盒"入口。
       原来它要按当前模式分三路：本地仓库→断开仓库、合作模式→重置团队、
       其余→重置沙盒；模式切换撤掉后只剩教学模式这一路，直接给确认弹窗。 */
    openConfirm('reset');
  });
  $('mCancel').addEventListener('click', dismissMask);
  $('mOk').addEventListener('click', ()=>{
    $('mask').classList.remove('on');
    if(modalAction === 'clearAI'){ VGE.ai.clearConfig(); renderAll(); chat(svgIcon('trash','xs') + ' ' + esc(VGE.i18n.t('cfg.cleared'))); return; }
    /* 只剩一种确认了：重置沙盒。
       （原来还要分派 T2 放行 / 开启写入模式 / 断开仓库 / 清除课程 / 重置团队 —— 全随各自模式删除。） */
    resetSandbox();
  });
  $('mask').addEventListener('click', e=>{ if(e.target === $('mask')) dismissMask(); });
  /* 悬停浮层可交互：指针进浮层取消关闭、离开再计时（只绑一次） */
  VGE.render.initNodeTip();
  /* 节点详情面板：× 按钮 / 点遮罩 / Esc 三种关法（与其它弹窗一致） */
  $('nodeClose').addEventListener('click', closeNodePanel);
  $('maskNode').addEventListener('click', e=>{ if(e.target === $('maskNode')) closeNodePanel(); });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape'){
      dismissMask();
      closeAiCfg();          /* 走统一出口：换过模型时要顺手清对话历史 */
      closeNodePanel();
    }
  });

  window.addEventListener('resize', ()=>{ hideNodeTip(); if(!HAS_VIS) renderGraph(); });
})();

/* 图工具条的方向按钮：图标画的是**当前**排布 —— 两块并排 = 横向，两块上下 = 纵向。
   换图标要连旧 svg 一起清掉：paintIcons 只往空白节点里填，不清就永远停在第一个图标上。 */
function setDirIcon(){
  const el = $('gDir'); if(!el) return;
  const ic = el.querySelector('.ic'); if(!ic) return;
  const want = gDir === 'LR' ? 'layoutArrowRight' : 'layoutArrowDown';
  if(ic.dataset.ic === want) return;
  ic.dataset.ic = want;
  ic.innerHTML = '';
  paintIcons(el);
}

/* ---------- 语言切换 ----------
   入口只有一个：设置面板 →「界面设置」里的语言下拉（顶栏那枚按钮已撤掉，避免两处入口）。
   滑块选项的生成与回显见 syncLangSeg()。 */
function applyLang(code){
  VGE.i18n.setLang(code);                       /* 设 current + 刷 [data-i18n]/[data-i18n-ph] */
  try{ localStorage.setItem(VGE.i18n.STORE_KEY, VGE.i18n.current); }catch(e){ /* 隐私模式 */ }
  document.documentElement.setAttribute('lang', code);
  renderAll();                                  /* 重绘 chrome + 各面板（chrome 走 VGE.i18n.t） */
  syncLangSeg();                                /* 设置面板里的语言滑块跟着当前语言走 */
  /* 底部面板切换那枚悬浮指示的文案是 JS 写的（要随状态变），data-i18n 管不到 */
  if(VGE.stacked) VGE.stacked.refresh();
}
window.__setLang = applyLang;

/* 导出控制层，便于外部扩展 */
VGE.app = {
  runCommand: runCommand, rewindTo: rewindTo, askAI: askAI,
  boot: boot, resetSandbox: resetSandbox, aiContext: aiContext,
  openAiCfg: openAiCfg, openConfirm: openConfirm,
  openNodePanel: openNodePanel, closeNodePanel: closeNodePanel,
  nodeStatsHTML: nodeStatsHTML, nodeTreeHTML: nodeTreeHTML,
};
