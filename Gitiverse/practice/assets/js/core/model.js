/* =====================================================================
   Git Playground · 域模型 + git 命令解释器
   ---------------------------------------------------------------------
   职责：仓库状态模型、git 命令解释、三方合并/冲突、协作远端工具。
   · 经典 script：本文件声明共享状态（repo / cursor）与解释器，
     供 render.js / app.js 直接使用。
   · 这里的 repo 是纯数据，可 JSON 序列化 —— 便于后续接入 AI。
   ===================================================================== */
'use strict';
window.VGE = window.VGE || {};

/* ---------------- 共享运行时状态（全局，其余模块读写） ---------------- */
var repo = null;            /* 当前人的本地仓库 */
var cursor = -1;            /* 终端历史指针 */

var SEED = 0, BC = {};
/* main 固定紫：它是最常驻的那条线，要能一眼从别的分支里挑出来。
   其余分支按出现顺序取**蓝系**调色板（第一格就是蓝）—— 所以默认的 "main + feature"
   恰好是"main 紫、feature 蓝"，多出来的分支继续往后取青 / 橙 / 橄榄 / 洋红，
   不至于所有分支挤成同一个蓝、颜色就不再是身份标识了。
   紫色不再放进调色板，免得某个分支和 main 撞色。 */
const BR_MAIN = '#7c3aed';
const BR_PALETTE = ['#2563eb','#0891b2','#c2410c','#4d7c0f','#be185d'];


function resetHash(){ SEED = 0x2f6f1a3; }
function nextHash(){ SEED = (SEED*1664525 + 1013904223)>>>0; return SEED.toString(16).padStart(8,'0').slice(0,7); }
function branchColor(n){
  if(n === 'main'){ BC.main = BR_MAIN; return BR_MAIN; }
  if(!(n in BC)){
    /* 序号只数"非 main 的分支"：main 不占调色板名额，否则第一个分支会从第二格开始 */
    const used = Object.keys(BC).filter(k => k !== 'main').length;
    BC[n] = BR_PALETTE[used % BR_PALETTE.length];
  }
  return BC[n];
}
function primeColors(){ BC = {}; branchColor('main'); branchColor('feature'); }

/* ---------------- 基础仓库对象 ---------------- */
function blankRepo(){
  return { init:false, commits:[], byId:{}, branches:{}, HEAD:'main',
           work:[], csIndex:0, log:[], merging:null };
}
function tipOf(b){ return repo.branches[b] || null; }
function headCommit(){ const id = tipOf(repo.HEAD); return id ? repo.byId[id] : null; }
function headSnapshot(){ const c = headCommit(); return c ? c.snapshot : []; }
function applyChanges(base, changes){
  const set = new Set(base);
  changes.forEach(c => c.s === 'D' ? set.delete(c.p) : set.add(c.p));
  return Array.from(set).sort();
}
/* 由父提交内容 + 本次改动，计算该提交的完整文件内容表 */
function buildContent(parentContent, changes){
  const c = Object.assign({}, parentContent || {});
  changes.forEach(ch => { if(ch.s === 'D') delete c[ch.p]; else c[ch.p] = ch.content || ''; });
  return c;
}
function loadChangeset(){
  const cs = VGE.CHANGESETS[repo.csIndex % VGE.CHANGESETS.length];
  repo.csIndex++;
  const present = new Set(headSnapshot());
  repo.work = cs.changes
    .filter(c => c.s === 'A' ? !present.has(c.p) : present.has(c.p))
    .map(c => ({ p:c.p, s:c.s, content:c.content, staged:false }));
  if(!repo.work.length && repo.csIndex < VGE.CHANGESETS.length * 2) loadChangeset();
}
const staged   = () => repo.work.filter(w => w.staged);
const unstaged = () => repo.work.filter(w => !w.staged);
/* 祖先集合：用于判断 fast-forward */
function ancestors(id, acc, store){
  acc = acc || new Set(); store = store || repo.byId;
  if(!id || acc.has(id) || !store[id]) return acc;
  acc.add(id);
  (store[id].parents || []).forEach(p => ancestors(p, acc, store));
  return acc;
}

/* ---------------- 内容层：行级 diff 与三方合并 ---------------- */
const contentOf = c => (c && c.content) ? c.content : {};
/* 简单行级 diff（逐行对比，足以展示"改了哪几行"） */
function diffLines(a, b){
  const A = (a || '').split('\n'), B = (b || '').split('\n'), res = [];
  const setB = new Set(B), setA = new Set(A);
  A.forEach(l => { if(!setB.has(l)) res.push({ t:'-', l }); });
  B.forEach(l => { if(!setA.has(l)) res.push({ t:'+', l }); });
  return res.length ? res : [{ t:' ', l:'' }];
}
/* 三方合并返回 { content, conflicts }：两边都改且不同 → 冲突 */
function merge3(base, mine, theirs){
  const keys = new Set([].concat(Object.keys(base||{}) , Object.keys(mine||{}), Object.keys(theirs||{})));
  const content = {}, conflicts = [];
  keys.forEach(p=>{
    const b = (base||{})[p] || '', m = (mine||{})[p] || '', t = (theirs||{})[p] || '';
    if(m === t) content[p] = m;
    else if(m === b) content[p] = t;
    else if(t === b) content[p] = m;
    else { content[p] = '<<<<<<< HEAD\n'+m+'=======\n'+t+'>>>>>>> incoming'; conflicts.push(p); }
  });
  return { content, conflicts };
}
/* 最近公共祖先（沿本地提交图） */
function mergeBase(a, b){
  const A = ancestors(a);
  let cur = b;
  while(cur && !A.has(cur)) cur = (repo.byId[cur].parents || [])[0];
  return cur;
}
/* 合并另一条线到当前分支。有冲突则进入 merging 状态，否则直接生成合并提交 */
function doMerge(out, otherTipId, otherLabel){
  const cur = tipOf(repo.HEAD);
  if(!cur || !otherTipId || cur === otherTipId){ out.push(L('Already up to date.')); return { ok:true, out, clean:true }; }
  const baseId = mergeBase(cur, otherTipId);
  const base = contentOf(baseId ? repo.byId[baseId] : null);
  const mine = contentOf(repo.byId[cur]);
  const theirs = contentOf(repo.byId[otherTipId]);
  const m3 = merge3(base, mine, theirs);
  if(m3.conflicts.length){
    repo.merging = { other:otherLabel, branch:repo.HEAD, mine:cur, theirs:otherTipId, base:baseId,
      open:m3.conflicts.slice(), resolved:{}, fullContent:m3.content,
      staged:false, changes:(repo.byId[otherTipId].changes || []) };
    m3.conflicts.forEach(p => out.push(L('CONFLICT (content): Merge conflict in '+p,'red')));
    out.push(L('Automatic merge failed; fix conflicts and then commit the result.','err'));
    out.push(L('  (right side of the panel: pick keep-mine / keep-theirs / both per file)','dim'));
    /* 这条文案原来住在后端错误码表（api.err.*）里 —— 那张表随 gitapi.js 删除，
       而沙盒引擎自己也要说这句话，于是搬成普通词条。 */
    out.push(NOTE(T('git.merge.bothChanged', { files:m3.conflicts.join(', ') })));
    return { ok:false, out, clean:false };
  }
  const id = nextHash(); const content = m3.content; const snap = Object.keys(content).sort();
  repo.commits.push({ id:id, msg:'Merge branch \''+otherLabel+'\' into '+repo.HEAD, branch:repo.HEAD,
    parents:[cur, otherTipId], isMerge:true, snapshot:snap, content:content,
    changes:(repo.byId[otherTipId].changes || []), color:'#16a34a' });
  repo.byId[id] = repo.commits[repo.commits.length-1]; repo.branches[repo.HEAD] = id;
  out.push(L("Merge made by the 'ort' strategy."));
  out.push(L(' '+snap.length+' file(s) changed.','dim'));
  return { ok:true, out, clean:true };
}
/* 冲突面板点按钮：为某文件选择保留方式，并从"未解决"里移除 */
function resolveConflict(path, mode){
  if(!repo.merging) return;
  const mine = contentOf(repo.byId[repo.merging.mine])[path] || '';
  const theirs = contentOf(repo.byId[repo.merging.theirs])[path] || '';
  const pick = mode === 'mine' ? mine : mode === 'theirs' ? theirs : (mine + theirs);
  repo.merging.fullContent[path] = pick;
  repo.merging.resolved[path] = pick;
  repo.merging.open = repo.merging.open.filter(p => p !== path);
  renderAll();
}
/* 全部冲突解决后，git add 标记合并就绪 */
function stageMerge(out){
  if(repo.merging.open.length){
    out.push(L('U (unmerged)  ' + repo.merging.open[0],'red'));
    out.push(L('Unmerged paths: '+repo.merging.open.length,'err'));
    out.push(NOTE(T('git.commit.nofiles', { n:repo.merging.open.length })));
    return { ok:false };
  }
  repo.merging.staged = true;
  out.push(L('All conflicts fixed but you are still merging.','gr'));
  out.push(L('  (use "git commit" to conclude the merge)','dim'));
  return { ok:true };
}

/* ---------------- 命令解释器 ---------------- */
const L  = (t, c) => ({ t:t, c:c||'' });
const NOTE = t => ({ t:t, c:'note' });
const T  = function(){ return VGE.i18n.t.apply(VGE.i18n, arguments); };
function needRepo(out){
  if(repo.init) return false;
  out.push(L('fatal: not a git repository (or any of the parent directories): .git','err'));
  return true;
}
function fileStatWord(s){ return s === 'A' ? 'new file:  ' : s === 'M' ? 'modified:  ' : 'deleted:   '; }

function interpret(raw){
  const text = String(raw || '').trim();
  const out = [];
  if(!text) return { ok:false, out:[] };
  const parts = text.split(/\s+/);
  const isGit = parts[0] === 'git';
  const cmd = isGit ? (parts[1] || '') : parts[0];
  const argv = isGit ? parts.slice(2) : parts.slice(1);
  const flags = argv.filter(a => a.startsWith('-'));
  const rest  = argv.filter(a => !a.startsWith('-'));
  const quoted = (text.match(/-m\s*["'](.+?)["']/) || [])[1];

  if(!isGit){
    out.push(L(T('git.notgit', { cmd: parts[0] }),'err'));
    out.push(NOTE(T('git.onlygit')));
    return { ok:false, out:out };
  }

  switch(cmd){
    /* ---------------- init ---------------- */
    case 'init': {
      if(repo.init){ out.push(L('Reinitialized existing Git repository in /sandbox/visual-git/.git/')); return { ok:true, out:out }; }
      repo.init = true; repo.HEAD = 'main'; branchColor('main');
      loadChangeset();
      out.push(L('Initialized empty Git repository in /sandbox/visual-git/.git/'));
      out.push(NOTE(T('git.init.note')));
      return { ok:true, out:out };
    }
    /* ---------------- status ---------------- */
    case 'status': {
      if(needRepo(out)) return { ok:false, out:out };
      out.push(L('On branch '+repo.HEAD));
      if(!tipOf(repo.HEAD)) out.push(L('\nNo commits yet'));
      const S = staged(), U = unstaged();
      if(S.length){
        out.push(L('\nChanges to be committed:'));
        out.push(L('  (use "git restore --staged <file>..." to unstage)','dim'));
        S.forEach(f => out.push(L('        '+fileStatWord(f.s)+f.p,'gr')));
      }
      if(U.length){
        out.push(L('\nChanges not staged for commit:'));
        out.push(L('  (use "git add <file>..." to update what will be committed)','dim'));
        U.forEach(f => out.push(L('        '+fileStatWord(f.s)+f.p,'red')));
      }
      if(!S.length && !U.length) out.push(L('\nnothing to commit, working tree clean'));
      return { ok:true, out:out };
    }
    /* ---------------- add ---------------- */
    case 'add': {
      if(needRepo(out)) return { ok:false, out:out };
      if(repo.merging){ const r = stageMerge(out); return { ok:r.ok, out:out }; }
      const target = rest[0] || '';
      if(!target){
        out.push(L('Nothing specified, nothing added.','err'));
        out.push(L("hint: Maybe you wanted to say 'git add .'?",'dim'));
        return { ok:false, out:out };
      }
      const hit = (target === '.' || target === '-A' || target === '*')
        ? repo.work.filter(w => !w.staged)
        : repo.work.filter(w => !w.staged && w.p.indexOf(target) === 0);
      if(!hit.length){
        const known = repo.work.length || headSnapshot().length;
        if(target !== '.' && known){
          out.push(L("fatal: pathspec '"+target+"' did not match any files",'err'));
          return { ok:false, out:out };
        }
        out.push(NOTE(T('git.add.fresh')));
        return { ok:true, out:out };
      }
      hit.forEach(w => w.staged = true);
      const n = { A:0, M:0, D:0 }; hit.forEach(w => n[w.s]++);
      out.push(NOTE(T('git.add.staged', { n:hit.length, a:n.A, m:n.M, d:n.D })));
      return { ok:true, out:out };
    }
    /* ---------------- commit ---------------- */
    case 'commit': {
      if(needRepo(out)) return { ok:false, out:out };
      if(repo.merging){
        if(repo.merging.open.length){
          out.push(L('You have unmerged paths.','err'));
          out.push(L('  (fix conflicts and run "git add" to mark resolution)','dim'));
          out.push(NOTE(T('git.commit.nofiles', { n: repo.merging.open.length })));
          return { ok:false, out:out };
        }
        if(!repo.merging.staged){
          out.push(L('error: Committing is not possible because you have unmerged files.','err'));
          out.push(L("hint: Fix them up in the work tree, and then use 'git add <file>' to mark resolution.",'dim'));
          return { ok:false, out:out };
        }
        if(!quoted && flags.indexOf('-m') < 0){
          out.push(L('hint: ' + T('git.commit.mergemsg'),'dim'));
          return { ok:false, out:out };
        }
        const msg = quoted || 'Merge branch \'' + repo.merging.other + '\' into ' + repo.HEAD;
        const id = nextHash();
        const content = repo.merging.fullContent;
        const snap = Object.keys(content).sort();
        repo.commits.push({ id:id, msg:msg, branch:repo.HEAD,
          parents:[repo.merging.mine, repo.merging.theirs], isMerge:true,
          snapshot:snap, content:content, changes:(repo.merging.changes||[]), color:'#16a34a' });
        repo.byId[id] = repo.commits[repo.commits.length-1];
        repo.branches[repo.HEAD] = id;
        repo.merging = null; repo.work = [];
        out.push(L("Merge made by the 'ort' strategy.","gr"));
        out.push(NOTE(T('git.commit.mergeNote')));
        return { ok:true, out:out };
      }
      const S = staged();
      if(!S.length){
        out.push(L('On branch '+repo.HEAD));
        out.push(L('nothing added to commit but untracked files present','err'));
        out.push(L('hint: ' + T('git.commit.nostaged'),'dim'));
        return { ok:false, out:out };
      }
      if(!quoted && flags.indexOf('-m') < 0){
        out.push(L('hint: ' + T('git.commit.needmsg'),'dim'));
        return { ok:false, out:out };
      }
      const msg = quoted || '(no message)';
      const parentId = tipOf(repo.HEAD);
      const isRoot = !parentId;
      const id = nextHash();
      const snap = applyChanges(parentId ? repo.byId[parentId].snapshot : [], S);
      const content = buildContent(parentId ? repo.byId[parentId].content : {}, S);
      const c = { id:id, msg:msg, branch:repo.HEAD, parents:parentId ? [parentId] : [],
                  isMerge:false, snapshot:snap, content:content, changes:S.map(x=>({p:x.p,s:x.s,content:x.content})),
                  color:branchColor(repo.HEAD) };
      repo.commits.push(c); repo.byId[id] = c; repo.branches[repo.HEAD] = id;
      repo.work = unstaged();
      /* 提交后如果工作区空了，自动铺下一批改动 —— 沙盒得有东西可改才练得下去 */
      if(!repo.work.length) loadChangeset();
      const ins = S.filter(x=>x.s!=='D').length * 17 + 6, del = S.filter(x=>x.s==='D').length * 23;
      out.push(L('['+repo.HEAD+(isRoot?' (root-commit)':'')+' '+id+'] '+msg));
      out.push(L(' '+S.length+' file'+(S.length>1?'s':'')+' changed, '+ins+' insertion(+)'+(del?', '+del+' deletion(-)':''),'dim'));
      return { ok:true, out:out };
    }
    /* ---------------- branch ---------------- */
    case 'branch': {
      if(needRepo(out)) return { ok:false, out:out };
      if(!rest.length){
        Object.keys(repo.branches).forEach(b =>
          out.push(L((b === repo.HEAD ? '* ' : '  ') + b + '  ' + tipOf(b), b === repo.HEAD ? 'gr' : '')));
        if(!Object.keys(repo.branches).length) out.push(NOTE(T('git.branch.none')));
        return { ok:true, out:out };
      }
      const n = rest[0];
      if(repo.branches[n]){ out.push(L("fatal: a branch named '"+n+"' already exists",'err')); return { ok:false, out:out }; }
      const t = tipOf(repo.HEAD);
      if(!t){ out.push(L("fatal: not a valid object name: '"+repo.HEAD+"'",'err'));
              out.push(NOTE(T('git.branch.pointer'))); return { ok:false, out:out }; }
      repo.branches[n] = t; branchColor(n);
      out.push(NOTE(T('git.branch.created', { name:n, tip:t, head:repo.HEAD })));
      return { ok:true, out:out };
    }
    /* ---------------- switch / checkout ---------------- */
    case 'switch': case 'checkout': {
      if(needRepo(out)) return { ok:false, out:out };
      const create = flags.indexOf('-c') >= 0 || flags.indexOf('-b') >= 0;
      const n = rest[0];
      if(!n){ out.push(L('fatal: missing branch name','err')); return { ok:false, out:out }; }
      if(create){
        if(repo.branches[n]){ out.push(L("fatal: a branch named '"+n+"' already exists",'err')); return { ok:false, out:out }; }
        const t = tipOf(repo.HEAD);
        if(!t){ out.push(L("fatal: not a valid object name: '"+repo.HEAD+"'",'err')); return { ok:false, out:out }; }
        repo.branches[n] = t; branchColor(n); repo.HEAD = n;
        out.push(L("Switched to a new branch '"+n+"'"));
        return { ok:true, out:out };
      }
      if(!repo.branches[n]){
        out.push(L("fatal: invalid reference: '"+n+"'",'err'));
        out.push(L('hint: ' + T('git.switch.hint'),'dim'));
        return { ok:false, out:out };
      }
      if(n === repo.HEAD){ out.push(L("Already on '"+n+"'")); return { ok:true, out:out }; }
      repo.HEAD = n;
      out.push(L("Switched to branch '"+n+"'"));
      if(staged().length || unstaged().length) out.push(NOTE(T('git.switch.carry')));
      return { ok:true, out:out };
    }
    /* ---------------- merge ---------------- */
    case 'merge': {
      if(needRepo(out)) return { ok:false, out:out };
      const s = rest[0];
      if(!s){ out.push(L('fatal: ' + T('git.merge.none'),'err')); return { ok:false, out:out }; }
      if(!repo.branches[s]){ out.push(L("merge: "+s+" - not something we can merge",'err')); return { ok:false, out:out }; }
      if(s === repo.HEAD){ out.push(L('Already up to date.')); return { ok:true, out:out }; }
      const other = tipOf(s);
      const cur = tipOf(repo.HEAD);
      if(!cur || !other){ out.push(L('fatal: ' + T('git.merge.nocommit'),'err')); return { ok:false, out:out }; }
      if(ancestors(cur).has(other)){ out.push(L('Already up to date.')); return { ok:true, out:out }; }
      if(ancestors(other).has(cur)){
        repo.branches[repo.HEAD] = other;
        out.push(L('Updating '+cur.slice(0,7)+'..'+other.slice(0,7)));
        out.push(L('Fast-forward','gr'));
        out.push(NOTE(T('git.merge.ff', { head: repo.HEAD })));
        return { ok:true, out:out };
      }
      return doMerge(out, other, s);
    }
    /* ---------------- log ---------------- */
    case 'log': {
      if(needRepo(out)) return { ok:false, out:out };
      if(!repo.commits.length){ out.push(L('fatal: your current branch \''+repo.HEAD+'\' does not have any commits yet','err')); return { ok:false, out:out }; }
      const seen = ancestors(tipOf(repo.HEAD));
      repo.commits.slice().reverse().filter(c => seen.has(c.id)).forEach(c=>{
        const refs = Object.keys(repo.branches).filter(b => tipOf(b) === c.id);
        const tag = refs.length ? ' (' + refs.map(r => (r===repo.HEAD?'HEAD -> ':'')+r).join(', ') + ')' : '';
        out.push(L(c.id + tag + ' ' + c.msg, refs.length ? 'gr' : ''));
      });
      return { ok:true, out:out };
    }
    /* ---------------- 危险 / 未支持 ---------------- */
    case 'reset': case 'rebase': case 'revert': case 'cherry-pick': {
      out.push(L(T('git.unsupported', { cmd:cmd }),'err'));
      out.push(NOTE(T(cmd === 'reset' ? 'git.reset.note' : 'git.rebase.generic', { cmd: cmd })));
      return { ok:false, out:out };
    }
    default:
      out.push(L(T('git.badcmd', { cmd: cmd }),'err'));
      out.push(NOTE(T('git.supported', { cmds: 'init · status · add · commit · branch · switch · merge · log' })));
      return { ok:false, out:out };
  }
}

/* 导出的都是沙盒解释器真正用到的东西。
   原来还导出 buildWorld / devById / activeDev / cloneRepo / countAncestors /
   remoteTip / mark / stepDone / remoteGrow / syncRemoteIntoLocal / aheadBehind ——
   那批全是合作模式的共享远端与身份切换，随合作模式一并删除。 */
VGE.model = {
  interpret: interpret, blankRepo: blankRepo, tipOf: tipOf, headSnapshot: headSnapshot,
  staged: staged, unstaged: unstaged, ancestors: ancestors, branchColor: branchColor,
  resolveConflict: resolveConflict, doMerge: doMerge, diffLines: diffLines,
  loadChangeset: loadChangeset, contentOf: contentOf
};
