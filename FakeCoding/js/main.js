/* FakeCoding - main controller
 *
 * Language modules register themselves on window.FakeCoding and must provide:
 *   id, label, filename, icon, spec
 *   create(rng, opts) -> { begin(), unit(budget), end() }
 *
 *   begin()        -> string[]            file preamble (includes, defines)
 *   unit(budget)   -> string[]            one self-contained block, exactly budget lines
 *   end()          -> string[]            optional trailing lines
 *
 * Units are complete on their own (a function, a class), so the file can be cut
 * anywhere between units without breaking the braces.
 */
(function () {
  'use strict';

  const FC = window.FakeCoding = window.FakeCoding || {};
  FC.langs = FC.langs || {};
  FC.register = function (lang) { FC.langs[lang.id] = lang; };

  const U = FC.util = {};

  /* ---------------------------------------------------------------- random */

  U.hashSeed = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  U.mulberry32 = function (a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.makeRng = function (seed) {
    const next = U.mulberry32(U.hashSeed(String(seed)));
    const r = {
      next,
      float: (a, b) => a + next() * (b - a),
      int: (a, b) => a + Math.floor(next() * (b - a + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      shuffle: (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      }
    };
    return r;
  };

  /* ---------------------------------------------------------------- naming */

  const NOUNS = [
    'user', 'order', 'session', 'cache', 'token', 'buffer', 'packet', 'request',
    'response', 'payload', 'index', 'cursor', 'handle', 'frame', 'worker', 'queue',
    'task', 'config', 'metric', 'sample', 'batch', 'chunk', 'route', 'policy',
    'record', 'entry', 'node', 'edge', 'graph', 'state', 'event', 'stream',
    'socket', 'channel', 'region', 'shard', 'replica', 'manifest', 'checksum',
    'digest', 'offset', 'limit', 'retry', 'backoff', 'timeout', 'deadline',
    'lease', 'lock', 'guard', 'pool', 'arena', 'heap', 'stack', 'ring',
    'table', 'map', 'tree', 'filter', 'span', 'trace', 'log', 'tag',
    'label', 'version', 'schema', 'field', 'column', 'row', 'key', 'value',
    'pair', 'tuple', 'vector', 'matrix', 'segment', 'page', 'block', 'sector',
    'path', 'mount', 'volume', 'device', 'driver', 'adapter', 'bridge', 'proxy',
    'gateway', 'router', 'peer', 'host', 'port', 'address', 'ticket', 'claim',
    'grant', 'scope', 'role', 'group', 'tenant', 'account', 'profile', 'message',
    'thread', 'comment', 'post', 'feed', 'item', 'product', 'price', 'cart',
    'invoice', 'payment', 'refund', 'ledger', 'balance', 'transfer', 'wallet',
    'nonce', 'stake', 'reward', 'epoch', 'slot', 'round', 'vote', 'quorum',
    'leader', 'term', 'commit', 'snapshot', 'backup', 'partition', 'query',
    'plan', 'scan', 'seek', 'join', 'sort', 'merge', 'fold', 'count',
    'sum', 'diff', 'patch', 'build', 'deploy', 'health', 'probe', 'alert',
    'threshold', 'budget', 'quota', 'rate', 'window', 'bucket', 'burst', 'latency',
    'throughput', 'jitter', 'skew', 'drift', 'delta', 'scale', 'factor', 'ratio',
    'weight', 'bias', 'loss', 'step', 'feature', 'layer', 'head', 'vocab',
    'embed', 'mask', 'beam', 'logits', 'prob', 'entropy'
  ];

  const VERBS = [
    'build', 'load', 'parse', 'resolve', 'apply', 'flush', 'commit', 'update',
    'validate', 'encode', 'decode', 'merge', 'split', 'fetch', 'store', 'compute',
    'render', 'handle', 'dispatch', 'collect', 'normalize', 'reduce', 'expand',
    'bind', 'attach', 'detach', 'open', 'close', 'read', 'write', 'seek',
    'sync', 'reset', 'drain', 'scan', 'probe', 'retry', 'schedule', 'cancel',
    'acquire', 'release', 'allocate', 'reserve', 'rollback', 'restore', 'migrate',
    'publish', 'subscribe', 'consume', 'produce', 'emit', 'listen', 'connect',
    'accept', 'reject', 'route', 'forward', 'evict', 'refresh', 'expire',
    'rotate', 'sign', 'verify', 'encrypt', 'decrypt', 'hash', 'compare', 'match',
    'filter', 'group', 'aggregate', 'project', 'transform', 'flatten', 'chunk',
    'batch', 'enqueue', 'dequeue', 'push', 'pop', 'peek', 'lock', 'unlock',
    'wait', 'notify', 'signal', 'sleep', 'tick', 'advance', 'rewind', 'track',
    'record', 'report', 'summarize', 'estimate', 'infer', 'predict', 'score',
    'rank', 'select', 'prune', 'grow', 'shrink', 'resize', 'pad', 'trim',
    'strip', 'escape', 'quote', 'format', 'print', 'warn', 'recover', 'abort',
    'pause', 'resume', 'start', 'stop', 'init', 'finalize', 'dispose', 'create',
    'clone', 'copy', 'move', 'swap', 'reverse', 'shift', 'fill', 'clear',
    'touch', 'stat', 'mount', 'ping', 'handshake', 'negotiate', 'authenticate',
    'authorize', 'revoke', 'audit', 'throttle', 'meter', 'settle', 'reconcile'
  ];

  const ADJS = [
    'active', 'pending', 'stale', 'dirty', 'empty', 'full', 'ready', 'idle',
    'busy', 'closed', 'open', 'valid', 'invalid', 'local', 'remote', 'primary',
    'secondary', 'cached', 'expired', 'queued', 'dropped', 'accepted', 'rejected',
    'synced', 'locked', 'shared', 'private', 'public', 'internal', 'external',
    'raw', 'parsed', 'encoded', 'decoded', 'compressed', 'signed', 'verified',
    'trusted', 'unknown', 'default', 'custom', 'global', 'fast', 'slow',
    'small', 'large', 'first', 'last', 'next', 'prev', 'current', 'target',
    'source', 'dest', 'input', 'output', 'base', 'upper', 'lower', 'left',
    'right', 'front', 'back', 'inner', 'outer', 'top', 'bottom', 'root',
    'leaf', 'parent', 'child', 'client', 'server', 'master', 'backup', 'shadow',
    'mirror', 'temp', 'final', 'draft', 'stable', 'legacy', 'modern', 'new'
  ];

  U.NOUNS = NOUNS;
  U.VERBS = VERBS;
  U.ADJS = ADJS;

  U.cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };

  U.createNamer = function (rng, style) {
    const used = new Set();
    const cap = U.cap;
    const join = (a, b) => (style === 'snake' ? a + '_' + b : a + cap(b));

    function unique(w) {
      let x = w;
      let k = 2;
      while (used.has(x)) { x = w + k; k++; }
      used.add(x);
      return x;
    }

    return {
      fn: function () {
        for (let i = 0; i < 16; i++) {
          const w = join(rng.pick(VERBS), rng.pick(NOUNS));
          if (!used.has(w)) { used.add(w); return w; }
        }
        return unique(join('process', 'data'));
      },
      varName: function () {
        const w = style === 'snake'
          ? rng.pick(ADJS) + '_' + rng.pick(NOUNS)
          : rng.pick(ADJS) + cap(rng.pick(NOUNS));
        return unique(w);
      },
      noun: function () { return unique(rng.pick(NOUNS)); },
      cls: function () {
        return unique(cap(rng.pick(ADJS)) + cap(rng.pick(NOUNS)));
      },
      constName: function () {
        return unique((rng.pick(ADJS) + '_' + rng.pick(NOUNS)).toUpperCase());
      }
    };
  };

  /* ------------------------------------------------------------- line util */

  /* Pad a block to exactly `budget` lines. Only blank lines are ever removed,
   * so a closing brace can never be dropped to hit the target. */
  U.padTo = function (lines, budget, rng) {
    while (lines.length < budget) {
      const hi = lines.length - 1;
      const pos = hi > 2 ? rng.int(2, hi) : lines.length;
      lines.splice(pos, 0, '');
    }
    while (lines.length > budget) {
      const idx = lines.lastIndexOf('');
      if (idx < 0) break;
      lines.splice(idx, 1);
    }
    return lines;
  };

  /* ------------------------------------------------------------ highlight */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ESC[c]; }); }

  function tokenize(text, spec) {
    let out = '';
    let i = 0;
    const n = text.length;

    function push(cls, s) {
      out += cls ? '<span class="t-' + cls + '">' + esc(s) + '</span>' : esc(s);
    }

    while (i < n) {
      const c = text[i];

      if (c === ' ' || c === '\t') {
        let j = i + 1;
        while (j < n && (text[j] === ' ' || text[j] === '\t')) j++;
        push(null, text.slice(i, j));
        i = j;
        continue;
      }

      if (spec.blockComment && text.startsWith(spec.blockComment[0], i)) {
        let end = text.indexOf(spec.blockComment[1], i + spec.blockComment[0].length);
        end = end === -1 ? n : end + spec.blockComment[1].length;
        push('cmt', text.slice(i, end));
        i = end;
        continue;
      }

      if (spec.lineComment && text.startsWith(spec.lineComment, i)) {
        push('cmt', text.slice(i));
        break;
      }

      if (c === '@' && spec.decorator && /[A-Za-z_]/.test(text[i + 1] || '')) {
        let j = i + 1;
        while (j < n && /[\w.]/.test(text[j])) j++;
        push('dec', text.slice(i, j));
        i = j;
        continue;
      }

      if (c === '"' || c === "'" || (c === '`' && spec.template !== false)) {
        if (c === '"' && text.startsWith('"""', i)) {
          let end = text.indexOf('"""', i + 3);
          end = end === -1 ? n : end + 3;
          push('str', text.slice(i, end));
          i = end;
          continue;
        }
        let j = i + 1;
        while (j < n) {
          if (text[j] === '\\') { j += 2; continue; }
          if (text[j] === c) { j++; break; }
          j++;
        }
        j = Math.min(j, n);
        push('str', text.slice(i, j));
        i = j;
        continue;
      }

      if (c >= '0' && c <= '9') {
        let j = i + 1;
        while (j < n) {
          const ch = text[j];
          if (/[0-9a-fA-FxX._]/.test(ch)) { j++; continue; }
          if ((ch === '+' || ch === '-') && /[eE]/.test(text[j - 1])) { j++; continue; }
          break;
        }
        push('num', text.slice(i, j));
        i = j;
        continue;
      }

      if (/[A-Za-z_$]/.test(c)) {
        let j = i + 1;
        while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j++;
        const w = text.slice(i, j);
        let cls;
        if ((spec.literals && spec.literals.has(w)) || spec.keywords.has(w)) cls = 'kw';
        else if (spec.types && spec.types.has(w)) cls = 'type';
        else if (spec.selfWords && spec.selfWords.has(w)) cls = 'self';
        else {
          let k = j;
          while (k < n && text[k] === ' ') k++;
          cls = text[k] === '(' ? 'fn' : 'var';
        }
        push(cls, w);
        i = j;
        continue;
      }

      if ('+-*/%=<>!&|^~?'.indexOf(c) !== -1) {
        let j = i + 1;
        while (j < n && '+-*/%=<>!&|^~?'.indexOf(text[j]) !== -1) j++;
        push('op', text.slice(i, j));
        i = j;
        continue;
      }

      push('punct', c);
      i++;
    }
    return out;
  }

  U.highlight = function (line, spec) {
    if (!spec) return esc(line);

    if (spec.hashLine) {
      const m = line.match(/^(\s*)#\s*(\w+)([\s\S]*)$/);
      if (m && spec.hashLine.has(m[2])) {
        let rest = m[3];
        let html;
        const h = rest.match(/^(\s*)(<[^>]*>)([\s\S]*)$/);
        if (h) {
          html = esc(h[1]) + '<span class="t-str">' + esc(h[2]) + '</span>' + tokenize(h[3], spec);
        } else {
          html = tokenize(rest, spec);
        }
        return esc(m[1]) + '<span class="t-pre">#' + m[2] + '</span>' + html;
      }
    }
    return tokenize(line, spec);
  };

  /* ---------------------------------------------------------------- registry */

  const MANIFEST = [
    { id: 'c', label: 'C' },
    { id: 'python', label: 'Python' },
    { id: 'js', label: 'JavaScript' }
  ];

  const langCache = {};

  /* Exposed so the generator can be exercised without a DOM (node harness). */
  FC.build = function (lang, seed, opts) {
    const rng = U.makeRng(seed);
    const g = lang.create(rng, opts);
    return { rng: rng, gen: g };
  };

  function loadLang(id) {
    if (FC.langs[id]) return Promise.resolve(FC.langs[id]);
    if (langCache[id]) return langCache[id];

    langCache[id] = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'js/lang/' + id + '.js';
      s.async = true;
      s.onload = function () {
        if (FC.langs[id]) resolve(FC.langs[id]);
        else reject(new Error('模块未注册: ' + id));
      };
      s.onerror = function () {
        reject(new Error('无法加载 js/lang/' + id + '.js'));
      };
      document.head.appendChild(s);
    });
    return langCache[id];
  }

  /* --------------------------------------------------------------------- UI */

  if (typeof document === 'undefined') return;

  const el = {
    lang: document.getElementById('lang'),
    mode: document.getElementById('mode'),
    length: document.getElementById('length'),
    lengthOut: document.getElementById('lengthOut'),
    lengthField: document.getElementById('lengthField'),
    speed: document.getElementById('speed'),
    speedOut: document.getElementById('speedOut'),
    speedField: document.getElementById('speedField'),
    seed: document.getElementById('seed'),
    comments: document.getElementById('comments'),
    run: document.getElementById('run'),
    copy: document.getElementById('copy'),
    download: document.getElementById('download'),
    clear: document.getElementById('clear'),
    meta: document.getElementById('meta'),
    filename: document.getElementById('filename'),
    fileicon: document.getElementById('fileicon'),
    follow: document.getElementById('follow'),
    viewport: document.getElementById('viewport'),
    code: document.getElementById('code'),
    status: document.getElementById('status'),
    statLines: document.getElementById('statLines'),
    statSeed: document.getElementById('statSeed'),
    statLang: document.getElementById('statLang'),
    dot: document.querySelector('.dot')
  };

  let currentLang = null;
  let currentSpec = null;
  let plain = [];
  let gutterEl = null;
  let linesEl = null;
  let mode = 'fixed';
  let streaming = false;
  let timer = null;
  let pending = [];
  let gen = null;
  let rng = null;
  let usedSeed = '';
  let langToken = 0;
  let generation = 0;
  let totalLines = 0;

  const STREAM_KEEP = 500;

  function setStatus(text) { el.status.textContent = text; }
  function setMeta(text) { el.meta.textContent = text; }

  function resetOutput() {
    el.code.innerHTML = '';
    gutterEl = document.createElement('div');
    gutterEl.className = 'gutter';
    linesEl = document.createElement('div');
    linesEl.className = 'lines';
    el.code.appendChild(gutterEl);
    el.code.appendChild(linesEl);
    plain = [];
    totalLines = 0;
    el.statLines.textContent = '0 行';
  }

  function trimStream() {
    while (plain.length > STREAM_KEEP) {
      if (gutterEl.firstChild) gutterEl.removeChild(gutterEl.firstChild);
      if (linesEl.firstChild) linesEl.removeChild(linesEl.firstChild);
      plain.shift();
    }
  }

  function appendLines(arr) {
    const fg = document.createDocumentFragment();
    const fl = document.createDocumentFragment();

    for (let i = 0; i < arr.length; i++) {
      const text = arr[i];
      plain.push(text);
      totalLines += 1;

      const ln = document.createElement('div');
      ln.className = 'ln';
      ln.textContent = String(totalLines);
      fg.appendChild(ln);

      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = U.highlight(text, currentSpec);
      fl.appendChild(row);
    }

    gutterEl.appendChild(fg);
    linesEl.appendChild(fl);

    if (streaming) trimStream();

    el.statLines.textContent = plain.length + ' 行';

    if (el.follow.checked) {
      el.viewport.scrollTop = el.viewport.scrollHeight;
    }
  }

  function setCaret(on) {
    const old = linesEl && linesEl.querySelector('.caret');
    if (old) old.parentNode.removeChild(old);
    if (!on || !linesEl) return;
    const rows = linesEl.children;
    if (!rows.length) return;
    const caret = document.createElement('span');
    caret.className = 'caret';
    rows[rows.length - 1].appendChild(caret);
  }

  function setBusy(busy) {
    el.run.textContent = busy ? '停止' : '生成';
    el.run.classList.toggle('primary', !busy);
    el.run.classList.toggle('danger', busy);
    el.dot.classList.toggle('on', busy);
  }

  /* ------------------------------------------------------------- generation */

  function buildGenerator(seed, opts) {
    rng = U.makeRng(seed);
    usedSeed = seed;
    gen = currentLang.create(rng, opts);
    return gen;
  }

  /* Trim a file preamble at a blank-line boundary so the request length never
   * cuts through an include block, struct or object literal. */
  function fitHead(head, target) {
    const max = Math.max(3, Math.floor(target / 2));
    if (head.length <= max) return head.slice();

    let cut = -1;
    for (let i = 0; i < head.length && i < max; i++) {
      if (head[i].trim() === '') cut = i;
    }

    if (cut < 0) {
      cut = 0;
      for (let i = 0; i < head.length && i < max; i++) {
        if (!/[{([]\s*$/.test(head[i])) cut = i;
      }
    }

    const out = head.slice(0, cut + 1);
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    out.push('');
    return out.slice(0, max);
  }

  function fixedGenerate() {
    const target = parseInt(el.length.value, 10);
    const seed = el.seed.value.trim() || String(Math.floor(Math.random() * 1e9));
    const opts = { lines: target, comments: el.comments.checked, stream: false };

    const t0 = performance.now();
    const g = buildGenerator(seed, opts);

    const fullTail = g.end ? g.end() : [];
    const head = fitHead(g.begin(), target);
    const minBody = 8;

    let tail = fullTail.slice();
    if (head.length + tail.length + minBody > target) tail = [];

    const bodyTarget = target - tail.length;
    const out = head.slice();

    while (out.length < bodyTarget) {
      const remaining = bodyTarget - out.length;
      if (remaining < 6) {
        while (out.length < bodyTarget) out.push('');
        break;
      }
      const budget = Math.min(remaining, rng.int(10, 28));
      const unit = g.unit(budget);
      if (!unit || !unit.length) { out.push(''); continue; }
      for (let i = 0; i < unit.length; i++) out.push(unit[i]);
    }

    for (let i = 0; i < tail.length; i++) out.push(tail[i]);
    if (out.length > target) out.length = target;

    resetOutput();
    appendLines(out);
    setCaret(false);

    const dt = performance.now() - t0;
    setStatus('完成');
    setMeta(out.length + ' 行 · ' + currentLang.label + ' · seed ' + seed + ' · ' + dt.toFixed(1) + ' ms');
    el.statSeed.textContent = 'seed ' + seed;
  }

  function streamStart() {
    stopStream(false);

    const seed = el.seed.value.trim() || String(Math.floor(Math.random() * 1e9));
    const opts = { lines: Infinity, comments: el.comments.checked, stream: true };

    buildGenerator(seed, opts);
    resetOutput();
    setBusy(true);
    setStatus('生成中...');
    setMeta('持续生成 · ' + currentLang.label + ' · seed ' + seed);
    el.statSeed.textContent = 'seed ' + seed;

    appendLines(gen.begin());
    pending = [];
    streaming = true;
    schedule();
  }

  function schedule() {
    if (!streaming) return;

    if (!pending.length) {
      pending = gen.unit(rng.int(7, 18));
    }

    const line = pending.shift();
    appendLines([line]);
    setCaret(true);

    const speed = parseInt(el.speed.value, 10);
    timer = setTimeout(schedule, Math.round(1000 / speed));
  }

  function stopStream(updateUi) {
    if (timer) { clearTimeout(timer); timer = null; }
    streaming = false;
    pending = [];
    if (updateUi !== false) {
      setBusy(false);
      setStatus(plain.length ? '已停止 · ' + plain.length + ' 行' : '就绪');
      setCaret(false);
    } else {
      setBusy(false);
    }
  }

  /* --------------------------------------------------------------- actions */

  function generate() {
    if (!currentLang) return;
    if (streaming) stopStream(false);
    const token = ++generation;
    if (mode === 'fixed') {
      fixedGenerate();
    } else {
      streamStart();
    }
    return token;
  }

  function toggleRun() {
    if (streaming) {
      stopStream();
      return;
    }
    generate();
  }

  async function switchLang() {
    const token = ++langToken;
    stopStream(false);
    const id = el.lang.value;
    setStatus('加载 ' + id + '...');

    try {
      const lang = await loadLang(id);
      if (token !== langToken) return;
      currentLang = lang;
      currentSpec = lang.spec;
      el.filename.textContent = lang.filename;
      el.fileicon.textContent = lang.icon;
      el.statLang.textContent = lang.label;
      resetOutput();
      setCaret(false);
      setStatus('就绪');
      setMeta('尚未生成');
      el.statSeed.textContent = 'seed -';
    } catch (err) {
      if (token !== langToken) return;
      currentLang = null;
      setStatus(err.message);
      setMeta('语言模块加载失败');
    }
  }

  function copyText() {
    const text = plain.join('\n');
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setStatus('已复制 ' + plain.length + ' 行');
      }, fallbackCopy);
    } else {
      fallbackCopy();
    }

    function fallbackCopy() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setStatus('已复制 ' + plain.length + ' 行'); }
      catch (e) { setStatus('复制失败'); }
      document.body.removeChild(ta);
    }
  }

  function downloadFile() {
    if (!plain.length) return;
    const name = (currentLang && currentLang.filename) || 'output.txt';
    const blob = new Blob([plain.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setStatus('已下载 ' + name);
  }

  function clearAll() {
    stopStream(false);
    resetOutput();
    setCaret(false);
    setStatus('就绪');
    setMeta('尚未生成');
    el.statSeed.textContent = 'seed -';
  }

  /* ----------------------------------------------------------------- setup */

  MANIFEST.forEach(function (m) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    el.lang.appendChild(opt);
  });

  el.mode.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    if (btn.dataset.mode !== mode && streaming) stopStream();
    mode = btn.dataset.mode;
    Array.prototype.forEach.call(el.mode.children, function (b) {
      b.classList.toggle('active', b === btn);
    });
    el.lengthField.classList.toggle('hidden', mode !== 'fixed');
    el.speedField.classList.toggle('hidden', mode !== 'stream');
  });

  el.length.addEventListener('input', function () {
    el.lengthOut.textContent = el.length.value;
  });

  el.speed.addEventListener('input', function () {
    el.speedOut.textContent = el.speed.value + ' 行/秒';
  });

  el.run.addEventListener('click', toggleRun);
  el.copy.addEventListener('click', copyText);
  el.download.addEventListener('click', downloadFile);
  el.clear.addEventListener('click', clearAll);
  el.lang.addEventListener('change', switchLang);

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      toggleRun();
    }
  });

  el.lengthOut.textContent = el.length.value;
  el.speedOut.textContent = el.speed.value + ' 行/秒';
  resetOutput();
  switchLang();
})();
