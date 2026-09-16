/* =====================================================================
   Git Playground · 渲染层
   ---------------------------------------------------------------------
   职责：把 repo 数据渲染成界面（文件树、工作区、提交图、终端、AI 卡片）。
   只读状态、生成 HTML、绑事件，不修改域模型。
   ===================================================================== */
'use strict';
window.VGE = window.VGE || {};

const $ = id => document.getElementById(id);
const MONO_FACE = 'Consolas, Menlo, monospace';
const HAS_VIS = !!(window.vis && window.vis.Network);

/* ---------------- 渲染局部分享状态（全局） ---------------- */
const collapsed = new Set();        /* 折叠的目录 */
let net = null, nodesDS = null, edgesDS = null;
let visOK = true;                   /* vis-network 运行时是否可用（失败则回退 SVG） */
let gDir = 'LR', lastSig = '', fitting = false, tipFor = null;

/* =====================================================================
   A · 文件结构（真实层级 + A/M/D 标签）
   ===================================================================== */
const fileIcon = p => /\.(ts|tsx|js|jsx|css|json)$/.test(p) ? 'fileCode' : 'fileText';

function buildTree(paths){
  const root = { name:'', dir:true, kids:{} };
  paths.forEach(p=>{
    const segs = p.split('/'); let cur = root;
    segs.forEach((s,i)=>{
      const last = i === segs.length - 1;
      if(!cur.kids[s]) cur.kids[s] = { name:s, dir:!last, kids:{}, path:segs.slice(0,i+1).join('/') };
      cur = cur.kids[s];
    });
  });
  return root;
}
function sortKids(node){
  return Object.keys(node.kids).map(k => node.kids[k]).sort((a,b)=>
    a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name));
}
function countFiles(node){
  return sortKids(node).reduce((n,k) => n + (k.dir ? countFiles(k) : 1), 0);
}
function treeHTML(node, stat, showDots, depth){
  let h = '';
  const lockOpen = depth < 0;
  sortKids(node).forEach(k=>{
    if(k.dir){
      const isCol = !lockOpen && collapsed.has(k.path);
      h += '<div class="tnode dir'+(isCol?' collapsed':'')+'" data-dir="'+esc(k.path)+'">'
         +   '<span class="ic chev">'+'<svg viewBox="0 0 24 24">'+IC.chevronDown+'</svg></span>'
         +   svgIcon(isCol ? 'folder' : 'folderOpen','fic')
         +   '<span class="nm">'+esc(k.name)+'</span>'
         +   '<span class="cnt">'+countFiles(k)+'</span>'
         + '</div>'
         + '<div class="tchildren'+(isCol?' hide':'')+'">'+treeHTML(k, stat, showDots, depth+1)+'</div>';
    }else{
      const st = stat[k.path];
      /* 一个路径可能同时有多个状态 —— 真实 Git 里「部分暂存」就是同一文件
         既有已暂存的改动、又有未暂存的改动。v3 的形状是一文件一状态，
         v4 改成列出全部状态，宁可多一个徽标，也不要把状态藏起来。 */
      const states = st ? st.states : [];
      const confl = repo.merging && repo.merging.open.indexOf(k.path) >= 0;
      const badge = confl
        ? '<span class="badge C" title="'+VGE.i18n.t('cf.head')+'">!</span>'
        : states.map(x => '<span class="badge '+x.s+'" title="'
            + (x.staged ? VGE.i18n.t('legend.staged') : VGE.i18n.t('legend.unstaged'))
            + '">'+x.s+'</span>').join('');
      /* data-path 是给"节点详情面板"用的：那里的文件行要能点开看 diff。
         这里只加属性、不加事件，左侧文件树的行为不受影响。 */
      h += '<div class="tnode'+(states.some(x => x.s === 'D') ? ' del' : '')+(confl ? ' confl' : '')
         + '" title="'+esc(k.path)+'" data-path="'+esc(k.path)+'">'
         +   '<span class="ic chev"></span>'
         +   svgIcon(fileIcon(k.name),'fic')
         +   '<span class="nm">'+esc(k.name)+'</span>'
         +   (badge ? '<span style="margin-left:auto"></span>' + badge : '')
         +   (states.length && showDots && !confl
              ? states.map(x => '<span class="sdot '+(x.staged?'staged':'unstaged')+'" title="'
                  + (x.staged ? VGE.i18n.t('legend.staged') : VGE.i18n.t('legend.unstaged'))
                  + '" style="margin-left:5px"></span>').join('')
              : '')
         + '</div>';
    }
  });
  return h;
}
function workStat(){
  const stat = {};
  repo.work.forEach(w => {
    (stat[w.p] = stat[w.p] || { states: [] }).states.push({ s:w.s, staged:w.staged });
  });
  /* 兼容：仍暴露第一个状态为 s / staged，供只关心单状态的既有代码使用 */
  Object.keys(stat).forEach(p => {
    stat[p].s = stat[p].states[0].s;
    stat[p].staged = stat[p].states[0].staged;
  });
  return stat;
}
function renderTree(){
  const box = $('treeBox');
  const hint = VGE.i18n.t('card.treeHint', { br: repo.init ? repo.HEAD : VGE.i18n.t('card.treeEmpty') });
  $('treeHint').textContent = repo.init ? hint : VGE.i18n.t('card.treeEmpty');
  if(!repo.init){
    box.innerHTML = '<div class="tip warn" style="margin:6px 4px">'+svgIcon('alert')
      + '<span>' + VGE.i18n.t('ws.treeNoInit') + '</span></div>';
    paintIcons(box); return;
  }
  const paths = new Set(headSnapshot());
  repo.work.forEach(w => paths.add(w.p));
  if(!paths.size){ box.innerHTML = '<div class="prev-empty" style="padding:10px 6px">' + VGE.i18n.t('ws.treeEmpty') + '</div>'; return; }
  box.innerHTML = '<div class="tree">' + treeHTML(buildTree(Array.from(paths).sort()), workStat(), true, 0) + '</div>';
  paintIcons(box);
  box.querySelectorAll('.tnode.dir').forEach(el=>{
    el.addEventListener('click', ()=>{
      const p = el.dataset.dir;
      collapsed.has(p) ? collapsed.delete(p) : collapsed.add(p);
      renderTree();
    });
  });
}

/* =====================================================================
   B · 工作区提示（含合并冲突面板）
   ===================================================================== */
function renderWorkspace(){
  const box = $('wsBox'), S = staged(), U = unstaged(), tracked = headSnapshot().length;
  const t = VGE.i18n.t.bind(VGE.i18n);
  if(repo.merging){
    const m = repo.merging;
    let h = '<div class="confl-hd">' + svgIcon('alert','sm') + '<b>' + t('cf.head') + '</b>'
      + '<span class="n">' + t('cf.unresolved', { n: m.open.length }) + '</span></div>'
      + '<div class="confl-desc">' + t('cf.desc', { name: esc(m.other) }) + '</div>';
    if(m.open.length){
      m.open.forEach(p=>{
        const mineC = contentOf(repo.byId[m.mine])[p] || '';
        const theirsC = contentOf(repo.byId[m.theirs])[p] || '';
        h += '<div class="cf-file" data-p="'+esc(p)+'">'
          + '<div class="cf-name">'+svgIcon('fileCode','xs')+'<span>'+esc(p)+'</span></div>'
          + '<div class="cf-mk"><span class="h">' + t('cf.headMine') + '</span><span class="t">' + t('cf.headTheirs') + '</span></div>'
          + '<div class="cf-code"><span class="m">'+esc(mineC)+'</span><span class="t">'+esc(theirsC)+'</span></div>'
          + '<div class="cf-btns">'
          + '<button class="cfb btn btn--sm" data-mode="mine" data-p="'+esc(p)+'">' + t('cf.mine') + '</button>'
          + '<button class="cfb btn btn--sm" data-mode="theirs" data-p="'+esc(p)+'">' + t('cf.theirs') + '</button>'
          + '<button class="cfb btn btn--sm both" data-mode="both" data-p="'+esc(p)+'">' + t('cf.both') + '</button>'
          + '</div></div>';
      });
    }
    box.innerHTML = h; paintIcons(box);
    box.querySelectorAll('.cfb').forEach(b =>
      b.addEventListener('click', ()=>{ resolveConflict(b.dataset.p, b.dataset.mode); }));
    return;
  }
  let h = '<div class="stat-row">'
    + '<div class="stat'+(S.length?' hi':'')+'"><div class="v">'+S.length+'</div><div class="k">'+ t('stat.staged') +'</div></div>'
    + '<div class="stat"><div class="v">'+U.length+'</div><div class="k">'+ t('stat.unstaged') +'</div></div>'
    + '<div class="stat"><div class="v">'+tracked+'</div><div class="k">'+ t('stat.tracked') +'</div></div>'
    + '</div>';

  /* 只留统计条与待提交预览。原来还有几块 .tip 提示框（还没有 .git / 已暂存待提交 /
     有改动未暂存 / working tree clean），它们会把这张固定高度的卡顶来顶去；
     而且其中一条的文案是"跟着右边的课程向导走" —— 那张卡片已经删除，
     提示改由终端与 AI 助手承担。 */
  if(S.length){
    h += '<div class="sec-cap" style="margin-top:10px">'+svgIcon('gitCommit','xs')+' ' + t('ws.willContain') + '<span class="n">'+S.length+'</span></div>';
    h += '<div class="prev-list">';
    S.slice(0,7).forEach(f=>{ h += '<div class="r"><span class="badge '+f.s+'">'+f.s+'</span><span>'+esc(f.p)+'</span></div>'; });
    if(S.length > 7) h += '<div class="r" style="color:var(--muted)">' + t('ws.moreFiles', { n: S.length-7 }) + '</div>';
    h += '</div>';
  }
  box.innerHTML = h; paintIcons(box);
}

/* =====================================================================
   C · 提交图（vis-network，失败回退内置 SVG）
   ===================================================================== */
/* 拟合视图的缩放下限：低于它就不再"全览"，改为顶在下限上并对准 HEAD。
   为什么需要：层次布局把线性历史排成**一维**的一条线（实测纵坐标全域恒为 0），
   于是 617×246 的图区里，全览所需缩放随提交数线性下跌 ——
       提交数  2     4     6     8    12    20    40    80   170
       所需比 1.67  0.96  0.67  0.52  0.35  0.22  0.11  0.06  0.026
   170 个提交（team_repo）照单全收地 fit 出去，节点就成了亚像素的一根发丝 ——
   点方向键"像没反应"的直接原因。
   取值 0.2：20 个提交以内（教学 / 协作模式的量级）全览所需缩放都还 ≥ 0.2，
   行为与从前**完全一致**，不会被这条规则碰到；只有几十个提交以上的长历史才会降级成
   "可辨的一段 + 自己拖拽/滚轮往前翻"。想更全局可调小，想要更清楚可调大。
   注意：这只影响自动拟合；用户仍可手动缩小看全貌。 */
const FIT_MIN_SCALE = 0.2;
function doFit(dur){
  if(!net) return;
  const box = $('gnet');
  const w = Math.max(1, box.clientWidth - 26);      /* 留点边距，别让边缘节点贴边被切 */
  const h = Math.max(1, box.clientHeight - 26);
  const pos = net.getPositions(), ids = Object.keys(pos);
  /* 节点自身还有几十像素宽高，用一个常量余量兜住；只为判断"要不要降级"，不必精确 */
  const spanX = ids.length ? Math.max(...ids.map(i => pos[i].x)) - Math.min(...ids.map(i => pos[i].x)) + 90 : 0;
  const spanY = ids.length ? Math.max(...ids.map(i => pos[i].y)) - Math.min(...ids.map(i => pos[i].y)) + 90 : 0;
  const want = ids.length ? Math.min(w / spanX, h / spanY) : 1;
  const anim = dur ? { animation:{ duration:dur } } : { animation:false };

  fitting = true;
  if(want >= FIT_MIN_SCALE){
    net.fit(anim);
  }else{
    /* 全览会缩到看不清 → 顶在下限上，并对准 HEAD 那一端（游离 HEAD 就直接定位到该提交） */
    const anchor = repo.init
      ? (repo.detached ? repo.HEAD : (repo.branches[repo.HEAD] || null))
      : null;
    if(anchor && pos[anchor]) net.focus(anchor, { scale:FIT_MIN_SCALE, animation:anim.animation });
    else net.moveTo({ scale:FIT_MIN_SCALE, animation:anim.animation });
  }
  setTimeout(()=>{ fitting = false; }, (dur || 0) + 150);
}
const refsAt = id => graphRefs().filter(r => r.tip === id).map(r => r.name);
/* 节点标题的截断规则，全图共用一条：
     · 完整 SHA（40 位十六进制）→ 只留前 7 位（与 git --oneline / %h 观感一致，且整串画在节点上会互相重叠）
     · 其它文本（提交信息一类）→ 留前 18 位，超出加省略号
   完整 SHA 仍保留在节点 id、title 属性与详情面板里，不丢信息。
   之前 vis 路径用 18、SVG 回退路径用 15，同一个提交在两种渲染下长度不同，所以收敛到这里。 */
const SHA_FULL = /^[0-9a-f]{40}$/i;
const SHA_SHOW = 7, TITLE_SHOW = 18;
function shortText(s){
  const v = String(s == null ? '' : s);
  if(SHA_FULL.test(v)) return v.slice(0, SHA_SHOW);
  return v.length > TITLE_SHOW ? v.slice(0, TITLE_SHOW) + '…' : v;
}
/* 语义化别名：调用点明确知道传进来的是 SHA，读起来更清楚 */
const shortId = shortText;

/* 根提交（没有父提交）的节点图形：白底 + 琥珀色环 + 环内一点。
   vis 内置的 dot 形状只能画「填充 + 描边」，画不出环内那个点，所以这类节点走
   image 形状 + 这段内联 SVG —— image 形状的标签仍由 vis 正常绘制，和其它节点一致，
   比 ctxRenderer（要自己把标签也画出来，字号/换行都得跟着 vis 内部状态走）稳得多。
   viewBox 固定 24×24，配合 size:11 渲染出来约 22px，与普通节点（r=10）视觉同量级。 */
const ROOT_NODE_SVG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<circle cx="12" cy="12" r="9.2" fill="#ffffff" stroke="#d97706" stroke-width="2.6"/>' +
  '<circle cx="12" cy="12" r="2.9" fill="#d97706"/></svg>');
/* 沙盒里只有一份本地仓库，直接把提交列表交出去。
   （原来这里会把合作模式的共享远端提交并进来，在图上多画一批灰色节点。） */
const graphCommits = () => repo.commits;
function graphRefs(){
  const refs = [];
  Object.keys(repo.branches).forEach(b=>{ const t = tipOf(b); if(!t) return;
    refs.push({ name:b, tip:t, color:(b===repo.HEAD?'#d9762e':branchColor(b)), head:b===repo.HEAD }); });
  return refs;
}
function graphCommitById(id){ return repo.byId[id] || null; }
function graphData(){
  const nodes = [], edges = [];
  const headTip = tipOf(repo.HEAD);
  graphCommits().forEach(c=>{
    const isHead = c.id === headTip;
    const isRoot = !(c.parents || []).length;      /* 没有父提交 = 根提交（第一个节点） */
    /* 节点一律空心（白底），靠**环的颜色与粗细**区分类型，而不是靠填充：
         普通 = 细蓝环（或该分支的颜色）｜ 合并 = 粗绿环 ｜ 根提交 = 琥珀环 + 环内一点
       vis 内置的 dot 只能画"填充 + 描边"，画不出环内的点，所以根提交改用 image 形状
       + 一段内联 SVG；image 形状的标签仍由 vis 正常绘制，和其它节点一致。

       HEAD 不占用"环的颜色"这个通道：环色专职表示提交类型，HEAD 用「更粗的环 +
       琥珀色光晕」表示。否则指向 merge 提交时（合并完 HEAD 就在 merge 上）环会变成琥珀，
       "这是个合并提交"这条信息就没了 —— 而这恰恰是最该看见的一条。 */
    const ring = isRoot ? '#d97706' : (c.isMerge ? '#16a34a' : (c.color || branchColor(c.branch || 'main')));
    nodes.push({
      id:c.id, kind:'commit',
      label:'<b>'+shortId(c.id)+'</b>\n'+shortText(c.msg),
      title:c.id,                        /* 完整 SHA 仍可访问，显示只用前 7 位 */
      shape: isRoot ? 'image' : 'dot',
      image: isRoot ? ROOT_NODE_SVG : undefined,
      /* image 形状按 size*2 描绘（24×24 的 viewBox 里环外半径 9.2）→ size 12 画出来
         环外半径 ≈10px，与 dot 形状的普通节点（r=10）对齐；用 11 会小一圈，肉眼看得出来。 */
      size: isRoot ? 12 : (c.isMerge ? 13 : 10),
      borderWidth:isHead ? 4 : (c.isMerge ? 3.5 : 2.5),
      color:{ background:'#ffffff',
              border:ring,
              /* 悬停只换底色，环色保持类型不变，免得鼠标一上去类型就看错了 */
              highlight:{ background:'#eef3fb', border:ring },
              hover:{ background:'#eef3fb', border:ring } },
      shadow:isHead ? { enabled:true, color:'rgba(217,118,46,.35)', size:12, x:0, y:0 } : { enabled:false }
    });
    (c.parents || []).forEach((p,i)=>{
      edges.push({ from:p, to:c.id, dashes:i > 0,
        color:{ color:i > 0 ? '#b9c6d8' : '#c7d0dd', highlight:'#8fa0ba', hover:'#8fa0ba' },
        width:i > 0 ? 1.8 : 2.2 });
    });
  });
  graphRefs().forEach(r=>{
    nodes.push({
      id:'ref:'+r.name, kind:'ref',
      /* detached HEAD 时引用名本身就是 HEAD，再加前缀会变成 "HEAD → HEAD" */
      label:(r.head && r.name !== 'HEAD' ? 'HEAD → ' : '') + r.name,
      shape:'box', borderWidth:0, margin:{ top:5, bottom:5, left:9, right:9 },
      color:{ background:r.color, border:'transparent',
              highlight:{ background:r.color, border:'transparent' },
              hover:{ background:r.color, border:'transparent' } },
      font:{ multi:false, face:MONO_FACE, size:11, color:'#ffffff', bold:{ color:'#fff' } },
      shadow:{ enabled:true, color:'rgba(16,24,40,.16)', size:6, x:0, y:2 }
    });
    edges.push({ from:r.tip, to:'ref:'+r.name, dashes:[4,3], width:2.2,
      color:{ color:r.color, highlight:r.color, hover:r.color, opacity:0.85 } });
  });
  return { nodes:nodes, edges:edges };
}
function visOptions(){
  return {
    autoResize:true,
    layout:{ improvedLayout:true, hierarchical:{
      enabled:true, direction:gDir, sortMethod:'directed', shakeTowards:'roots',
      levelSeparation:gDir === 'LR' ? 132 : 96,
      nodeSpacing:gDir === 'LR' ? 78 : 132,
      treeSpacing:110, blockShifting:true, edgeMinimization:true, parentCentralization:true } },
    physics:{ enabled:false },
    interaction:{ hover:true, hoverConnectedEdges:false, dragNodes:false,
                  dragView:true, zoomView:true, selectConnectedEdges:false, tooltipDelay:1e6 },
    nodes:{ font:{ multi:'html', face:MONO_FACE, size:11, color:'#4a5568', vadjust:1,
                   bold:{ face:MONO_FACE, size:12, color:'#111827', mod:'bold' } },
            chosen:false },
    edges:{ arrows:{ to:{ enabled:false } }, selectionWidth:0,
            smooth:{ enabled:true, type:'cubicBezier',
                     forceDirection:gDir === 'LR' ? 'horizontal' : 'vertical', roundness:0.55 } }
  };
}
function renderGraph(){
  const engine = HAS_VIS ? 'vis-network' : VGE.i18n.t('graph.engineSvg');
  const dirLabel = gDir === 'LR' ? VGE.i18n.t('graph.lr') : VGE.i18n.t('graph.ud');
  $('gEngine').innerHTML = svgIcon('info','xs') + ' ' + engine + ' · ' + dirLabel;
  paintIcons($('gEngine'));

  /* 顶部徽标：随模式/提交实时变化（此前被遗漏，导致永远停在静态文本） */
  $('graphMeta').textContent = repo.init
    ? VGE.i18n.t('graph.meta', { br: repo.HEAD, n: repo.commits.length, b: Object.keys(repo.branches).length })
    : VGE.i18n.t('graph.metaEmpty');

  if(!repo.commits.length){
    if(net){ net.destroy(); net = null; }
    $('gnet').innerHTML = '<div style="position:absolute;inset:0;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;gap:7px;color:var(--muted);font-size:var(--fs-md);text-align:center;padding:0 24px">'
      + svgIcon('gitCommit','lg') + '<div>' + (repo.init ? VGE.i18n.t('graph.emptyInit') : VGE.i18n.t('graph.emptyNoRepo')) + '</div></div>';
    paintIcons($('gnet'));
    $('gsvg').style.display = 'none';
    return;
  }
  if(!HAS_VIS || !visOK){
    /* 回退 SVG 前把 vis 实例一并销毁：否则 net 仍非 null，容器却被清空，
       于是变成"孤儿实例"—— 它内部的动画/尺寸监听还在跑，而且同一容器再也回不到 vis
       （renderGraph 会走 net 已存在的分支，只在 DataSet 上更新，画在一个空容器上）。 */
    if(net){ try{ net.destroy(); }catch(_){ } net = null; lastSig = ''; }
    renderGraphSVG(); return;
  }

  /* vis-network 初始化/更新包进 try-catch：任何异常都回退 SVG，绝不让 renderAll 中断。
     否则 vis 抛错会停在 renderGraph，导致其后的终端/右栏/AI 全部不更新。 */
  try{
    const data = graphData();
    const sig = JSON.stringify([data.nodes.map(n=>n.id+n.label+n.borderWidth), data.edges.map(e=>e.from+'>'+e.to), gDir]);
    if(!net){
      $('gnet').innerHTML = '';
      nodesDS = new vis.DataSet(data.nodes); edgesDS = new vis.DataSet(data.edges);
      net = new vis.Network($('gnet'), { nodes:nodesDS, edges:edgesDS }, visOptions());
      net.on('hoverNode', e => showNodeTip(e.node));
      net.on('blurNode', scheduleHideNodeTip);   /* 宽限：容指针移进浮层 */
      net.on('dragStart', hideNodeTip);
      net.on('zoom', ()=>{ if(!fitting) hideNodeTip(); });
      net.on('click', e => { hideNodeTip(); if(e.nodes.length) explainNode(e.nodes[0]); });
      net.once('afterDrawing', ()=> doFit(0));
    }else{
      nodesDS.clear(); edgesDS.clear();
      nodesDS.add(data.nodes); edgesDS.add(data.edges);
    }
    if(sig !== lastSig){ lastSig = sig; setTimeout(()=> doFit(280), 30); }
    $('gsvg').style.display = 'none';
  }catch(e){
    console.warn('[Git Playground] vis-network failed to initialise; falling back to SVG:', e);
    visOK = false; lastSig = '';
    if(net){ try{ net.destroy(); }catch(_){ } net = null; }
    renderGraphSVG();
  }
}

/* ---------- 悬停 → 该提交的目录快照 ---------- */
function tipContent(c){
  const stat = {};
  (c.changes || []).forEach(ch => stat[ch.p] = { states:[{ s:ch.s, staged:false }], s:ch.s, staged:false });
  const refs = refsAt(c.id);
  const badge = c.isMerge ? '#16a34a' : (c.id === tipOf(repo.HEAD) ? '#d9762e' : (c.color || '#2563eb'));
  const n = { A:0, M:0, D:0 }; (c.changes || []).forEach(ch => n[ch.s]++);
  const head = '<div class="gtip-h">' + svgIcon(c.isMerge ? 'gitMerge' : 'gitCommit','sm')
    + '<span class="hh" title="' + esc(c.id) + '">' + esc(shortId(c.id)) + '</span>'
    + '<span class="bb" style="background:' + badge + '">' + esc(c.branch) + (c.isMerge ? ' · merge' : '') + '</span></div>'
    + '<div class="gtip-m">' + esc(c.msg) + (refs.length ? '<br><span style="color:var(--muted);font-size:var(--fs-sm)">refs: ' + esc(refs.join(', ')) + '</span>' : '') + '</div>'
    + '<div class="gtip-s">'
    + (n.A ? '<span style="color:var(--ok)">+' + n.A + '</span>' : '')
    + (n.M ? '<span style="color:var(--mod)">~' + n.M + '</span>' : '')
    + (n.D ? '<span style="color:var(--del)">-' + n.D + '</span>' : '') + '</div>';

  /* 沙盒里每个提交都自带完整快照（模型层就是这么建的），所以这里必然有内容。
     原来还有一条"真实仓库首次悬停时向后端懒加载文件清单"的分支，随本地仓库模式删除。 */
  if(!c.snapshot) return head;

  const paths = new Set(c.snapshot);
  (c.changes || []).forEach(ch => { if(ch.s === 'D') paths.add(ch.p); });
  return head
    + '<div class="gtip-s" style="margin-top:-2px"><span>' + svgIcon('folderTree','xs')
    + esc(VGE.i18n.t('graph.snapCount', { n:String(c.snapshot.length) })) + '</span></div>'
    + '<div class="gtip-t"><div class="tree">' + treeHTML(buildTree(Array.from(paths).sort()), stat, false, -1) + '</div></div>'
    + '<div class="gtip-f">' + svgIcon('info','xs') + ' ' + VGE.i18n.t('real.snapFoot') + '</div>';
}
function placeTip(x, y){
  const tip = $('gtip'), W = window.innerWidth, H = window.innerHeight;
  tip.style.visibility = 'hidden'; tip.classList.add('on');
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = x + 24, top = y - th / 2;
  if(left + tw > W - 10) left = x - tw - 24;
  if(left < 10) left = 10;
  top = Math.min(Math.max(10, top), Math.max(10, H - th - 10));
  tip.style.left = Math.round(left) + 'px';
  tip.style.top = Math.round(top) + 'px';
  tip.style.visibility = '';
}
/* force=true 用于「懒加载补齐后原地刷新」：此时 tipFor 已经等于 id，
   不加这个开关就会被下面的去重判断挡掉，内容永远停在"正在读取…"。 */
function showNodeTip(id, pt, force){
  cancelHideNodeTip();      /* 取消上一个节点挂起的关闭，否则它会掐掉这个新浮层 */
  if(String(id).indexOf('ref:') === 0) return hideNodeTip();
  const c = graphCommitById(id); if(!c) return;
  const tip = $('gtip');
  if(force || tipFor !== id){
    tip.innerHTML = tipContent(c); paintIcons(tip); tipFor = id;
  }
  let p = pt;
  if(!p && net){
    const r = $('graphWrap').getBoundingClientRect();
    const d = net.canvasToDOM(net.getPositions([id])[id]);
    p = { x:d.x + r.left, y:d.y + r.top };
  }
  if(!p) return;
  placeTip(p.x, p.y);
}
/* 悬停浮层的关闭宽限期。
   浮层里的目录树是滚动容器，可指针从节点"走"进浮层需要时间 ——
   而 blurNode / mouseleave 是立刻触发的，没有宽限期就永远够不着它，
   表现就是"鼠标一往浮层移过去，浮层先关了"。260ms 足够跨过那点空隙。 */
const TIP_GRACE_MS = 260;
let tipCloseTimer = null;
function cancelHideNodeTip(){
  if(tipCloseTimer){ clearTimeout(tipCloseTimer); tipCloseTimer = null; }
}
function scheduleHideNodeTip(){
  cancelHideNodeTip();
  tipCloseTimer = setTimeout(hideNodeTip, TIP_GRACE_MS);
}
function hideNodeTip(){ cancelHideNodeTip(); $('gtip').classList.remove('on'); tipFor = null; }

/* 浮层自身参与"该不该关"的判断：指针进浮层就取消关闭，离开浮层再重新计时。
   只绑一次（由 app.js 的启动流程调用）。
   注意这里不需要拦截滚轮：vis 的 wheel 绑在它自己的 canvas 元素上，
   浮层是那个 canvas 的兄弟节点，事件冒泡路径（浮层 → .graph-wrap → body）
   到不了 canvas，所以在浮层里滚动就是滚浮层，不会缩放提交图。 */
function initNodeTip(){
  const tip = $('gtip');
  if(!tip || tip.dataset.tipBound === '1') return;
  tip.dataset.tipBound = '1';
  tip.addEventListener('mouseenter', cancelHideNodeTip);
  tip.addEventListener('mouseleave', scheduleHideNodeTip);
}

/* ---------- 回退渲染器：内置 SVG，横向排布 ---------- */
function renderGraphSVG(){
  const svg = $('gsvg'), NS = 'http://www.w3.org/2000/svg';
  $('gnet').innerHTML = ''; svg.style.display = 'block'; svg.innerHTML = '';
  const cs = graphCommits(), lanes = {}, laneOf = b => (b in lanes ? lanes[b] : (lanes[b] = Object.keys(lanes).length));
  cs.forEach(c => laneOf(c.branch));
  const horiz = gDir === 'LR';
  const X = i => horiz ? 62 + i * 128 : 66 + laneOf(cs[i].branch) * 128;
  const Y = i => horiz ? 52 + laneOf(cs[i].branch) * 84 : 46 + i * 74;
  const idx = {}; cs.forEach((c,i) => idx[c.id] = i);
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for(const k in a) e.setAttribute(k, a[k]); return e; };

  cs.forEach((c,i)=>{
    (c.parents || []).forEach((p,k)=>{
      if(!(p in idx)) return;
      const x1 = X(idx[p]), y1 = Y(idx[p]), x2 = X(i), y2 = Y(i), mx = (x1 + x2) / 2;
      svg.appendChild(mk('path', { d:horiz ? 'M'+x1+' '+y1+' C '+mx+' '+y1+', '+mx+' '+y2+', '+x2+' '+y2
                                            : 'M'+x1+' '+y1+' C '+x1+' '+((y1+y2)/2)+', '+x2+' '+((y1+y2)/2)+', '+x2+' '+y2,
        stroke:k > 0 ? '#b9c6d8' : '#c7d0dd', 'stroke-width':k > 0 ? 1.8 : 2.2,
        'stroke-dasharray':k > 0 ? '4 4' : '', fill:'none' }));
    });
  });
  cs.forEach((c,i)=>{
    const x = X(i), y = Y(i), isHead = c.id === tipOf(repo.HEAD);
    const isRoot = !(c.parents || []).length;
    const ring = isRoot ? '#d97706' : (c.isMerge ? '#16a34a' : (c.color || branchColor(c.branch || 'main')));
    const g = mk('g', { style:'cursor:pointer' });
    if(isHead) g.appendChild(mk('circle', { cx:x, cy:y, r:c.isMerge ? 18 : 15, fill:'rgba(217,118,46,.14)' }));
    /* 与 vis 路径同一套规则：一律白底空心，靠环的颜色/粗细区分类型 ——
       普通细环、合并粗绿环、根提交琥珀环 + 环内一点；HEAD 只加粗 + 光晕（不改环色）。 */
    g.appendChild(mk('circle', { cx:x, cy:y, r:c.isMerge ? 12 : 9.5,
      fill:'#fff',
      stroke:ring,
      'stroke-width':isHead ? 4 : (c.isMerge ? 3.5 : 2.5) }));
    if(isRoot) g.appendChild(mk('circle', { cx:x, cy:y, r:c.isMerge ? 3.4 : 2.9, fill:'#d97706' }));
    const t1 = mk('text', { x:x, y:y + 26, 'text-anchor':'middle', 'font-size':11.5, 'font-weight':700,
      'font-family':'Consolas, Menlo, monospace', fill:'#111827' }); t1.textContent = shortId(c.id);
    const t2 = mk('text', { x:x, y:y + 39, 'text-anchor':'middle', 'font-size':10.5,
      'font-family':'Consolas, Menlo, monospace', fill:'#7a86a0' });
    t2.textContent = shortText(c.msg);
    g.appendChild(t1); g.appendChild(t2);
    g.addEventListener('mousemove', ev => showNodeTip(c.id, { x:ev.clientX, y:ev.clientY }));
    g.addEventListener('mouseleave', scheduleHideNodeTip);
    g.addEventListener('click', ()=>{ hideNodeTip(); explainNode(c.id); });
    svg.appendChild(g);
    graphRefs().filter(r => r.tip === c.id).forEach((r,k)=>{
      const lbl = (r.head ? 'HEAD → ' : '') + r.name, w = lbl.length * 6.6 + 14;
      const bx = x - w / 2, by = y - 40 - k * 22;
      svg.appendChild(mk('rect', { x:bx, y:by, width:w, height:18, rx:5, fill:r.color }));
      const tb = mk('text', { x:x, y:by + 12.5, 'text-anchor':'middle', 'font-size':10.5, fill:'#fff',
        'font-family':'Consolas, Menlo, monospace' }); tb.textContent = lbl;
      svg.appendChild(tb);
      svg.appendChild(mk('line', { x1:x, y1:by + 18, x2:x, y2:y - (c.isMerge ? 12 : 10),
        stroke:r.color, 'stroke-width':1.6, 'stroke-dasharray':'3 3' }));
    });
  });
  const w = Math.max(...cs.map((c,i) => X(i))) + 90, h = Math.max(...cs.map((c,i) => Y(i))) + 70;
  svg.setAttribute('viewBox', '0 0 ' + Math.max(w, 320) + ' ' + Math.max(h, 190));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}

/* =====================================================================
   D · 命令终端（新命令在下方 · 悬停回溯）
   ===================================================================== */
/* 提示符。原来还要拼一段"谁@"前缀（合作模式的身份），身份条已删除。
   卡头那句提示也不用再按模式切换（syncTermHint 已删）：沙盒里每一行都能重放，
   静态的 data-i18n="card.termHint" 就是唯一正确的文案。 */
function promptHTML(br, initd){
  return '<span class="pth">visual-git</span>'
       + (initd && br ? ' <span class="br">(' + esc(br) + ')</span>' : '')
       + ' <span class="sig">$</span>';
}
function renderTerminal(){
  const box = $('termOut');
  if(!repo.log.length){
    box.innerHTML = '<div class="term-empty">' + svgIcon('terminal','lg')
      + '<div>' + VGE.i18n.t('term.ready') + '</div></div>';
    paintIcons(box); return;
  }
  const rewound = cursor < repo.log.length - 1;
  box.innerHTML = '';
  repo.log.forEach((e,i)=>{
    const line = document.createElement('div');
    line.className = 'tline' + (i > cursor ? ' past' : '') + (rewound && i === cursor ? ' active' : '');
    let h = '<div class="tcmd"><span class="tprompt">' + promptHTML(e.br, e.initd) + '</span>'
          + '<span class="cmdtext" title="' + VGE.i18n.t('term.hoverCmd') + '">' + esc(e.raw) + '</span>'
          + '<button class="trewind" data-rw="' + i + '">' + svgIcon('cornerUpLeft','xs')
          + (i > cursor ? ' ' + VGE.i18n.t('term.replay') : ' ' + VGE.i18n.t('term.rewind')) + '</button>'
          + '</div>';
    (e.out || []).forEach(o=>{
      if(o.c === 'note') h += '<div class="tout note">' + svgIcon('info','xs') + '<span>' + esc(o.t) + '</span></div>';
      else h += '<div class="tout ' + (o.c || '') + '">' + esc(o.t) + '</div>';
    });
    line.innerHTML = h;
    box.appendChild(line);
  });
  if(rewound){
    const n = document.createElement('div');
    n.className = 'term-note';
    n.innerHTML = svgIcon('cornerUpLeft','xs') + '<span>' + VGE.i18n.t('term.rewound', { n: cursor + 1 }) + ' ' + VGE.i18n.t('term.rewoundTail') + '</span>';
    box.appendChild(n);
  }
  paintIcons(box);
  box.querySelectorAll('.trewind').forEach(b=>{
    b.addEventListener('click', ev=>{
      ev.stopPropagation();
      rewindTo(+b.dataset.rw);
    });
  });
  box.querySelectorAll('.cmdtext').forEach((t,i)=>{
    t.addEventListener('click', ()=>{ $('cmdInput').value = repo.log[i].raw; $('cmdInput').focus(); });
  });
  if(!rewound) box.scrollTop = box.scrollHeight;
  else{
    const el = box.children[cursor];
    if(el) box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2);
  }
}

/* =====================================================================
   J · AI 卡片 chrome：配置状态徽标 + 发送/停止按钮（随语言与流式状态刷新）
   ===================================================================== */
function renderAiChrome(){
  const T = VGE.i18n.t.bind(VGE.i18n);
  const btn = $('aiSend'), st = $('aiStatus'), cog = $('aiCfgBtn');
  const busy = !!(VGE.ai && VGE.ai.busy && VGE.ai.busy());
  const c = (VGE.ai && VGE.ai.config) ? VGE.ai.config() : null;
  const ready = !!(VGE.ai && VGE.ai.isReady && VGE.ai.isReady());

  if(btn){
    btn.classList.toggle('stop', busy);
    btn.innerHTML = svgIcon(busy ? 'x' : 'send', 'sm')
      + ' <span>' + T(busy ? 'btn.stop' : 'btn.send') + '</span>';
  }
  if(st){
    st.classList.toggle('on', ready);
    st.innerHTML = '<span class="dot"></span><span>' + esc(ready ? T('ai.statusOn', { model:c.model }) : T('ai.statusOff')) + '</span>';
    st.title = ready ? T('ai.statusOnTip', { model:c.model, endpoint:c.endpoint }) : T('ai.statusOffTip');
  }
  if(cog) cog.classList.toggle('ready', ready);
}

/* 统一刷新：先刷模式 chrome（标题/仓库名/图标/模式标签），再逐面板重绘，逐项隔离异常 */
function renderAll(){
  const safe = f => { try{ f(); }catch(e){ console.warn('[Git Playground] render:', e); } };
  safe(renderTitle);   /* document.title 随语言刷新 */
  safe(renderTree); safe(renderWorkspace); safe(renderGraph);
  safe(renderTerminal);
  safe(renderSugs);   /* AI 建议 chips 随语言刷新 */
  safe(renderAiChrome);   /* AI 配置徽标 + 发送/停止按钮 */
  safe(updatePrompt); safe(updateSuggestion);
  /* 全量重绘后补刷一次 [data-ic]（覆盖模式驱动图标变化），避免任何静态图标留白 */
  paintIcons(document);
  /* 面板内容变了 → 卡片高度可能变 → 分隔线要跟着挪（不存在时是空操作） */
  safe(() => { if(VGE.layout) VGE.layout.refresh(); });
}

/* 导出 */
VGE.render = {
  renderAll: renderAll, renderTree: renderTree, renderWorkspace: renderWorkspace,
  renderGraph: renderGraph, renderTerminal: renderTerminal,
  renderAiChrome: renderAiChrome,
  graphRefs: graphRefs, graphCommitById: graphCommitById,
  showNodeTip: showNodeTip, hideNodeTip: hideNodeTip, placeTip: placeTip,
  initNodeTip: initNodeTip,
  fitMinScale: FIT_MIN_SCALE
};
