/* =====================================================================
   Git Playground · AI 模块（配置 / Prompt / 流式传输）
   ---------------------------------------------------------------------
   职责：把"接入真实大模型"所需的全部逻辑收在一处，供控制层（app.js）调用。
     · 配置：读写 localStorage（刷新自动加载）、校验、清除
     · Prompt：把界面运行时状态压成紧凑快照 + 强约束的 system prompt
     · 传输：OpenAI 兼容 /chat/completions 的 SSE 流式解析（含中止 / 看门狗）
     · 离线回退：未配置密钥时仍走内置 mock 回答，保证无网也能演示
   设计约束：本文件不碰对话 DOM —— 气泡渲染由 app.js 负责，传输层只回传
   增量与终态，便于单独替换或测试。
   协议：仅 OpenAI 兼容（POST {endpoint} + Bearer + stream:true）。
   ===================================================================== */
'use strict';
window.VGE = window.VGE || {};

/* ---------------- 常量 ---------------- */
const AI_CFG_KEY  = 'vge.ai.cfg.v1';   /* 带版本号，便于将来迁移 schema */
const AI_HIST_MAX = 6;                 /* 多轮上下文：最近 6 条消息（3 轮） */
const AI_IDLE_MS  = 20000;             /* 看门狗：20s 内无任何增量即中止 */
const AI_TEST_MS  = 12000;             /* 「测试连接」超时 */
/* 这里原来还有一个本机后端的同源转发入口（POST /api/ai/stream，由
   server/node/server.js 转发给厂商，从而完全绕开跨域）。已经拆掉：
   那个后端的存在，代价是"想试一下 AI 就必须先 node 起服务"，而直接双击
   index.html 反而会弹一条警告教你去起服务。现在只有浏览器直连一条路，
   和 chapter_1.html 的做法一致。
   跨域仍然是一种可能：页面若以 file:// 打开，Origin 是 null，有些厂商（或公司网络里的
   中间层）会把它拦掉。但那属于个别情况 —— 实测 DeepSeek 直连是通的，所以不在界面上
   预先警告，只在真的连不上时由 ai.errNet 提一句。 */

/* 服务商预设：endpoint 为完整的 chat/completions 路径。
   留"自定义"给其它 OpenAI 兼容服务（vLLM / One-API / 各家国产模型…）。 */
const AI_PRESETS = {
  deepseek:   { endpoint:'https://api.deepseek.com/chat/completions',      model:'deepseek-flash' },
  openrouter: { endpoint:'https://openrouter.ai/api/v1/chat/completions', model:'deepseek/deepseek-chat' },
  ollama:     { endpoint:'http://localhost:11434/v1/chat/completions',     model:'qwen2.5:7b' },
  custom:     { endpoint:'', model:'' },
};

/* ---------------- 模块状态 ---------------- */
let aiCfg = null;              /* 内存中的当前配置（来源为 localStorage） */
let aiHist = [];               /* 多轮上下文：[{role, content}] */
let aiAbortCtl = null;         /* 正在进行的流式请求 */
let aiBusyFlag = false;
let aiSeq = 0;                 /* 请求代次：新旧请求交叠时，只有最新一代能改写 busy */

/* =====================================================================
   一 · 配置读写
   ===================================================================== */
function aiBlankCfg(){
  return { preset:'deepseek', endpoint:AI_PRESETS.deepseek.endpoint, model:AI_PRESETS.deepseek.model,
           apiKey:'', maxTokens:256, temperature:0.3 };
}
/* 归一化：任何来源（localStorage / 表单）的值都要过这一关，脏数据不进内存 */
function aiNormalize(raw){
  const c = Object.assign(aiBlankCfg(), raw || {});
  c.endpoint = String(c.endpoint || '').trim();
  c.model    = String(c.model    || '').trim();
  c.apiKey   = String(c.apiKey   || '').trim();
  c.maxTokens = Math.min(1024, Math.max(64, parseInt(c.maxTokens, 10) || 256));
  const t = parseFloat(c.temperature);
  c.temperature = isNaN(t) ? 0.3 : Math.min(2, Math.max(0, t));
  /* 旧版本存下的配置里带 viaBackend 字段。转发已经拆掉，这个字段不再有人读 ——
     留着不清理也无害（归一化只取上面列出的那几个键），所以不做迁移、不动 localStorage，
     用户存过的 endpoint / key / model 原样继续可用。 */
  if(!AI_PRESETS[c.preset]) c.preset = 'custom';
  return c;
}
function aiLoadConfig(){
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(AI_CFG_KEY) || 'null'); }
  catch(e){ console.warn('[Git Playground] Failed to parse the AI config; falling back to defaults:', e); }
  aiCfg = aiNormalize(raw);
  return aiCfg;
}
function aiSaveConfig(patch){
  aiCfg = aiNormalize(Object.assign({}, aiConfig(), patch || {}));
  try{
    localStorage.setItem(AI_CFG_KEY, JSON.stringify(aiCfg));
    return true;
  }catch(e){
    console.warn('[Git Playground] Could not save the AI config (localStorage unavailable):', e);
    return false;
  }
}
function aiClearConfig(){
  aiAbort();
  aiCfg = aiBlankCfg();
  aiHist = [];
  try{ localStorage.removeItem(AI_CFG_KEY); }
  catch(e){ console.warn('[Git Playground] Could not clear the AI config:', e); }
  return aiCfg;
}
function aiConfig(){ return aiCfg || aiLoadConfig(); }
function aiIsReady(c){
  c = c || aiConfig();
  return !!(c.endpoint && c.apiKey && c.model);
}
const aiIsValidEndpoint = u => /^https?:\/\/\S+$/i.test(String(u || '').trim());
const aiBusy = () => aiBusyFlag;

/* =====================================================================
   二 · Prompt 组装
   ---------------------------------------------------------------------
   长度控制分三层，缺一层都拦不住模型话痨：
     ① system prompt 的硬约束（可量化：≤60 汉字）
     ② max_tokens 硬闸门
     ③ 状态快照只给结论性事实，不喂原始输出
   ===================================================================== */

/* i18n-scan:off —— 从这里到下面的 i18n-scan:on 之间的中文字符串**不是界面文案**：
   它们是发给模型的 prompt 与状态快照，永远不会显示在页面上。
   快照故意写成中文（信息密度高、模型理解稳定），回答语言由 prompt 第 7 条指定，
   所以英文界面下回答依然是英文。扫描器跳过这一段，避免把"内部输入"误判成漏翻译。 */
/* 强约束 system prompt。{lang} 随界面语言走，避免中文界面回英文答案。 */
function aiSystemPrompt(){
  const lang = VGE.i18n.code() === 'en-US' ? 'English' : '简体中文';
  return [
    '你是「Git Playground」这个 Git 沙盒里的助教。学习者在终端里亲手敲 git 命令，',
    '对话框很窄，只放得下 1~3 行字。',
    '',
    '回复硬性要求：',
    '1. 只回答被问的那一件事：先给结论或命令，再用最多一句话说理由。',
    '2. 全文不超过 60 个汉字（英文不超过 35 个词）。宁可少说，绝不凑字数。',
    '3. 禁止开场白（"好的""当然""这是个好问题"）、禁止总结段、禁止重复问题。',
    '4. 禁止标题、列表、表格、分割线、表情符号。命令用行内 `code`；确实需要多条命令时才换行。',
    '5. 只依据下方【当前状态】给出的事实说话（分支名、提交数、文件名、暂存区）；',
    '   状态里没有的一律不要编造，不确定就直说"当前状态里看不到"。',
    '6. 多轮对话中只有最后一条【当前状态】有效，忽略历史消息里的旧状态。',
    '7. 用' + lang + '回答。',
    '8. 问题超出 Git 范围时，一句话说明并把话题拉回 Git。',
    /* 这一条是这次新加的，也是**最要紧**的一条。
       原来 prompt 里写着"把话题拉回当前练习"、还允许引用"步骤号"，
       而课程面板已经删除 —— 模型于是会催"该做第 3 步了""接着执行 git add"，
       指向一套用户根本看不见的流程。看不见的东西不许提。 */
    '9. 这个界面**没有课程、没有步骤、没有既定流程**。不要主动安排"下一步做什么"，',
    '   不要催促进度，不要假设学习者正处在某个教学环节；被问到才回答，答完就停。',
  ].join('\n');
}

/* 把"当前界面"的运行时状态压成紧凑文本块。
   刻意不发：终端完整输出、提交图全量节点、文件内容 —— 体积大且对回答无帮助。 */
function aiStateText(){
  const L = [];
  /* ⚠ 这里刻意**不**发课程 / 步骤上下文，也不发"当前模式"。
     原来会发这四行：
       模式：教学模式
       教程：1/5「初始化仓库」
       当前步骤：第 1/13 步「初始化仓库」（阶段=操作）
       系统建议命令：git init
       该步目标：把这个文件夹变成 Git 仓库
     课程面板（任务指南卡片）已经删除，这些步骤在界面上**根本不存在**，
     而模型看得见它们 —— 于是会一本正经地催"该做第 3 步了"，用户一脸茫然。
     看不见的东西不要喂给模型：现在只剩下仓库自身的客观状态。 */

  /* 仓库状态 */
  if(!repo || !repo.init){
    L.push('仓库：尚未 git init（没有任何提交，也没有分支）');
  }else{
    L.push('仓库已初始化：是');
    L.push('HEAD → ' + repo.HEAD + ' ｜ 已有分支：' + (Object.keys(repo.branches).join(', ') || '无'));
    const cs = repo.commits || [];
    L.push('提交数：' + cs.length);
    const recent = cs.slice(-3).map(c => c.id + ' "' + c.msg + '"' + (c.isMerge ? '(合并提交)' : '') + ' ← ' + c.branch);
    if(recent.length) L.push('最近提交：' + recent.join(' ｜ '));
    const S = staged(), U = unstaged();
    L.push('暂存区：' + (S.length ? S.length + ' 个文件（' + S.slice(0, 6).map(f => f.p).join('、') + '）' : '空'));
    L.push('未暂存：' + (U.length ? U.length + ' 个文件（' + U.slice(0, 6).map(f => f.p).join('、') + '）' : '无'));
    L.push('合并冲突：' + (repo.merging
      ? (repo.merging.open.length ? repo.merging.open.join('、') : '已全部解决，待提交')
      : '无'));
    const lg = (repo.log || []).slice(-6).map(e => e.raw + (e.ok ? ' ✓' : ' ✗'));
    if(lg.length) L.push('最近命令：' + lg.join(' → '));
  }

  return L.join('\n');
}

function aiUserContent(question){
  return '【当前状态】\n' + aiStateText() + '\n\n【学习者提问】\n' + question;
}
/* i18n-scan:on —— 内部输入到此结束，下面是界面文案 */
function aiMessages(userContent){
  return [{ role:'system', content:aiSystemPrompt() }]
    .concat(aiHist.slice(-AI_HIST_MAX))
    .concat([{ role:'user', content:userContent }]);
}

/* =====================================================================
   三 · 流式传输（OpenAI 兼容 SSE）
   ===================================================================== */

/* 取增量正文。兼容 delta.content；
   DeepSeek-R1 一类会额外下发 delta.reasoning_content（思考过程），必须忽略，
   否则思考内容会灌进这块很窄的对话框。 */
function aiDeltaOf(json){
  const ch = json && json.choices && json.choices[0];
  if(!ch) return '';
  const d = ch.delta || ch.message || {};
  return typeof d.content === 'string' ? d.content : '';
}
/* 把厂商错误体转成可读文本 */
function aiErrText(status, body){
  let msg = '';
  try{
    const j = JSON.parse(body);
    msg = (j.error && (j.error.message || j.error.type)) || j.message || '';
  }catch(e){ /* 非 JSON 错误体，退化为原文截断 */ }
  if(!msg && body) msg = String(body).slice(0, 200);
  return { status:status, msg:msg };
}
function aiAbort(){
  if(aiAbortCtl){ try{ aiAbortCtl.abort(); }catch(e){ /* 已结束 */ } }
}

/* 发往模型的消息体。直连与转发共用一份，保证两条路径行为完全一致。 */
function aiBody(c, messages, stream, maxTokens){
  return { model:c.model, stream:!!stream, max_tokens:maxTokens, temperature:c.temperature,
           messages:messages };
}
/* 唯一的出口：直连厂商端点。回来的就是 OpenAI 兼容的 JSON / SSE。
   （原来这里还有一条"交给本机后端同源转发"的分支，已删除 —— 见文件头的说明。）
   注意 Authorization 头 + application/json 的组合会让浏览器先发一个 OPTIONS 预检，
   所以厂商除了要回 Access-Control-Allow-Origin，还得能正确应答 OPTIONS。 */
function aiRequest(c, messages, opts){
  const o = opts || {}, body = aiBody(c, messages, o.stream, o.maxTokens);
  return fetch(c.endpoint, {
    method:'POST', signal:o.signal,
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + c.apiKey },
    body:JSON.stringify(body),
  });
}
/* 非 2xx 的翻译：厂商自己的错误体（OpenAI 风格），按状态码走文案。
   （原来还要分辨"本机后端拒绝转发"这一种来源，那条路已经不存在了。） */
async function aiErrFrom(res, c){
  const body = await res.text().catch(() => '');
  return aiErrText(res.status, body);
}

/* 发起一次流式问答。
   handlers: { onDelta(text) }（可选，仅用于逐字渲染）
   返回：{ok:true} | {ok:false, reason:'off'|'aborted'|'empty'|'error', err?, partial?} */
async function aiAsk(question, handlers){
  const c = aiConfig();
  if(!aiIsReady(c)) return { ok:false, reason:'off' };

  aiAbort();                                     /* 同一时刻只允许一条流 */
  const h = handlers || {};
  const ac = new AbortController();
  const mySeq = ++aiSeq;
  aiAbortCtl = ac;
  aiBusyFlag = true;

  const userContent = aiUserContent(question);
  let idle = null, timedOut = false, raw = '';
  /* 看门狗只掐自己这一条流：不能走 aiAbort()，否则本请求被新请求顶替后，
     迟到的看门狗会把正在跑的新请求一起掐掉。 */
  const kickWatchdog = () => {
    clearTimeout(idle);
    idle = setTimeout(() => { timedOut = true; try{ ac.abort(); }catch(e){ /* 已结束 */ } }, AI_IDLE_MS);
  };

  try{
    kickWatchdog();
    const res = await aiRequest(c, aiMessages(userContent), {
      stream:true, maxTokens:c.maxTokens, signal:ac.signal,
    });

    if(!res.ok){
      return { ok:false, reason:'error', err: await aiErrFrom(res, c) };
    }

    /* 极旧浏览器没有流式读取：退回一次性渲染，功能不缺失 */
    if(!res.body || !res.body.getReader){
      const txt = await res.text();
      let one = '';
      try{ one = aiDeltaOf(JSON.parse(txt)); }catch(e){ /* 保持空串 */ }
      if(one && h.onDelta) h.onDelta(one);
      return one ? { ok:true } : { ok:false, reason:'empty' };
    }

    const reader = res.body.getReader(), dec = new TextDecoder();
    /* 让"中止信号"与"读取"赛跑：规范要求 abort 时 read() 必须报错，但不去赌实现细节 ——
       这样点「停止」一定立刻结束本次请求，不会把 busy 卡死、按钮永远停在"停止"。 */
    const abortSignal = new Promise(res => {
      if(ac.signal.aborted) res();
      else ac.signal.addEventListener('abort', res, { once:true });
    });
    let buf = '';
    for(;;){
      const readP = reader.read();
      readP.catch(() => {});            /* 中止后这次读取会报错，先标记为已处理，避免无谓的 unhandled rejection */
      const r = await Promise.race([readP, abortSignal]);
      if(ac.signal.aborted){
        try{ reader.cancel(); }catch(e){ /* 流已关闭 */ }
        return finish(raw);
      }
      if(!r || r.done) break;
      kickWatchdog();
      /* stream:true 必须带上 —— 否则多字节汉字落在 chunk 边界上会解码成乱码 */
      buf += dec.decode(r.value, { stream:true });

      let nl;
      while((nl = buf.indexOf('\n')) >= 0){
        const line = buf.slice(0, nl).replace(/\r$/, '').trim();
        buf = buf.slice(nl + 1);
        if(!line || line.charAt(0) === ':') continue;      /* 空行 / SSE 注释心跳 */
        if(line.indexOf('data:') !== 0) continue;          /* event: 等其它字段 */
        const payload = line.slice(5).trim();
        if(payload === '[DONE]') return finish(raw);
        let j;
        try{ j = JSON.parse(payload); }catch(e){ continue; }  /* 半截行，等下一个 chunk */
        const t = aiDeltaOf(j);
        if(t){ raw += t; if(h.onDelta) h.onDelta(t); }
      }
    }
    return finish(raw);
  }catch(e){
    if(ac.signal.aborted){
      if(timedOut) return { ok:false, reason:'error', err:{ status:0, timeout:true, msg:'' } };
      return { ok:false, reason:'aborted', partial:!!raw };
    }
    /* 带上实际请求的地址与错误名：只报"无法连接接口"等于什么都没说，
       使用者无法判断是端点填错了、网络不通、还是被代理/扩展拦了。真错误也打到控制台。 */
    console.error('[Git Playground] AI request failed:', c.endpoint, e);
    return { ok:false, reason:'error', err:{
      status:0, endpoint:c.endpoint,
      name:(e && e.name) ? e.name : '', msg:(e && e.message) ? e.message : String(e),
    } };
  }finally{
    clearTimeout(idle);
    /* 只有最新一代请求才能复位 busy：否则被顶替的旧请求收尾时会把
       新一代的状态错误地改成"空闲"。 */
    if(aiSeq === mySeq) aiBusyFlag = false;
    if(aiAbortCtl === ac) aiAbortCtl = null;
  }

  /* 收尾：只有拿到正文的成功轮次才写进多轮上下文 */
  function finish(text){
    /* 用户已中止 / 看门狗已触发时，即便底层流恰好跑完也不报成功 ——
       中止必须确定性地反映为"已停止"，而不是偶尔变成"完成"。 */
    if(ac.signal.aborted){
      return timedOut ? { ok:false, reason:'error', err:{ status:0, timeout:true, msg:'' } }
                      : { ok:false, reason:'aborted', partial:!!text };
    }
    if(!text) return { ok:false, reason:'empty' };
    aiHist = aiHist
      .concat([{ role:'user', content:userContent }, { role:'assistant', content:text }])
      .slice(-AI_HIST_MAX);
    return { ok:true };
  }
}

/* 「测试连接」：发一条最小非流式请求，把真实错误暴露出来。
   必须走与实际提问**同一条**传输路径 —— 否则测试通过、提问失败，
   这个按钮就失去了排查价值（早先正是这样：直连被拦，测试却什么都看不出来）。 */
async function aiTest(patch){
  const c = aiNormalize(Object.assign({}, aiConfig(), patch || {}));
  if(!aiIsValidEndpoint(c.endpoint)) return { ok:false, code:'endpoint' };
  if(!c.apiKey) return { ok:false, code:'key' };
  if(!c.model)  return { ok:false, code:'model' };

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), AI_TEST_MS);
  const t0 = Date.now();
  try{
    const res = await aiRequest(c, [{ role:'user', content:'ping' }], {
      stream:false, maxTokens:16, signal:ac.signal,
    });
    if(!res.ok){
      const e = await aiErrFrom(res, c);
      return { ok:false, code:'http', status:res.status, msg:e.msg || '' };
    }
    /* 这条 ping 走的是**非流式**（stream:false）—— 实测有用例是流式被单独拦、
       非流式却能通，所以它成功不等于提问一定成功；失败则一定是通的路径有问题。 */
    return { ok:true, model:c.model, ms:Date.now() - t0 };
  }catch(e){
    return { ok:false, code: ac.signal.aborted ? 'timeout' : 'net',
             msg:(e && e.message) ? e.message : String(e) };
  }finally{ clearTimeout(to); }
}

const aiResetHistory = () => { aiHist = []; };

/* =====================================================================
   四 · 离线回退（未配置密钥时的内置回答）
   ---------------------------------------------------------------------
   保留它是有意的：这是课程演示原型，打开的人未必有 key，
   没有网络也必须能完整走一遍教学流程。
   ===================================================================== */
function aiMockAnswer(question, ctx){
  const q = question, T = VGE.i18n.t.bind(VGE.i18n);
  /* 「下一步该做什么」这一支原来会念出**当前那一步**的标题、目标与建议命令。
     课程引擎已经删除，没有"第几步"可言了 —— 改成一句不排流程的通用建议：
     依据只剩仓库自身的状态，这也是唯一还站得住的东西。
     （合作模式那几支一并删除：world / DEV / aheadBehind 都不存在了。） */
  if(/该做什么|下一步|接下来|怎么办|what should|next|do now/i.test(q)) return T('ai.freeform');
  if(/rebase/.test(q)) return T('ai.rebase');
  if(/reset|hard|危险/.test(q)) return T('ai.reset');
  if(/暂存|staging|add/.test(q)) return T('ai.staging');
  if(/merge|合并|冲突|conflict/.test(q)) return T('ai.merge');
  if(/branch|分支/.test(q)) return T('ai.branch', { branches:Object.keys(repo.branches).join(T('ai.listSep')), head:esc(repo.HEAD) });
  if(/commit|提交/.test(q)) return T('ai.commit', { n:repo.commits.length });
  return T('ai.fallback');
}

/* =====================================================================
   导出
   ===================================================================== */
VGE.ai = {
  /* 配置 */
  loadConfig:aiLoadConfig, saveConfig:aiSaveConfig, clearConfig:aiClearConfig,
  config:aiConfig, isReady:aiIsReady, isValidEndpoint:aiIsValidEndpoint,
  PRESETS:AI_PRESETS,
  /* 会话 */
  ask:aiAsk, abort:aiAbort, test:aiTest, busy:aiBusy, resetHistory:aiResetHistory,
  IDLE_MS:AI_IDLE_MS,
  /* Prompt / 上下文（导出便于调试与外部复用） */
  /* messages(问题) 返回真正会发出去的消息数组（system + 历史 + 含状态快照的本轮）。
     注意不是 messages(已拼好的内容) —— 对外只暴露"传问题"这一个直观签名。 */
  systemPrompt:aiSystemPrompt, stateText:aiStateText,
  messages: q => aiMessages(aiUserContent(q)),
  /* 离线回退 */
  provider:'mock', answer:aiMockAnswer,
};
