/* ═══════════════════════════════════════════
   AI Discussion — app
   Two OpenAI-compatible models talking to each other.
   Static: works from file:// and from any static host.
   ═══════════════════════════════════════════ */
(function () {
'use strict';

/* ─────────── constants ─────────── */
var STORAGE_KEY   = 'aiconv.v1';
var MAX_RETRY     = 2;                 // failed turn is dropped and retried up to 2×
var RETRY_DELAYS  = [1000, 2500];      // backoff before retry #1 / #2
var EMPTY_TURN    = ' ';               // A's opening user message (a lone space: empty content 400s on some APIs)
var PROBE_TIMEOUT = 20000;

/* ─────────── tiny helpers ─────────── */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
function t(key, vars) { return window.I18N.t(key, vars); }
function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function icon(id, cls) {
  return '<svg class="ic ' + (cls || '') + '"><use href="#i-' + id + '"/></svg>';
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

function abortError() { var e = new Error('aborted'); e.name = 'AbortError'; return e; }
function isAbort(e) { return !!e && (e.name === 'AbortError'); }
function errText(e) {
  var m = (e && e.message) ? e.message : String(e);
  return clip(m, 400);
}

/* ─────────── markdown ─────────── */
function initMarked() {
  if (!window.marked) return;
  try {
    var r = new window.marked.Renderer();
    /* models can emit raw HTML — never trust it */
    r.html = function (token) {
      var raw = (typeof token === 'string') ? token : ((token && token.text) || '');
      return escapeHtml(raw);
    };
    r.link = function (token) {
      var text = this.parser.parseInline(token.tokens);
      var href = token.href || '';
      if (/^\s*(javascript|data|vbscript):/i.test(href)) href = '#';
      return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
    };
    window.marked.setOptions({ gfm: true, breaks: true, renderer: r });
  } catch (e) { /* fall back to defaults */ }
}

function md(text) {
  var plain = '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>';
  if (!text) return '';
  if (!window.marked) return plain;
  try { return window.marked.parse(text); } catch (e) { return plain; }
}

/* ═══════════ state ═══════════ */
var SYS_ID = '__sys';       // data-mid of the system-prompt block

var state = { ui: { lang: null, theme: null, width: null, activeTopicId: null }, topics: [] };
var runtimes = new Map();   // topicId -> { busy, pauseRequested, abort }   (never persisted)
var liveViews = new Map();  // messageId -> live stream view               (never persisted)
var saveTimer = null;
var confirmResolve = null;
var bootNotice = null;

function getTopic(id) {
  for (var i = 0; i < state.topics.length; i++) if (state.topics[i].id === id) return state.topics[i];
  return null;
}
function msgById(tp, id) {
  if (!tp) return null;
  for (var i = 0; i < tp.messages.length; i++) if (tp.messages[i].id === id) return tp.messages[i];
  return null;
}
function activeTopic() { return state.ui.activeTopicId ? getTopic(state.ui.activeTopicId) : null; }
function sortedTopics() {
  return state.topics.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
}
function rt(id) {
  var r = runtimes.get(id);
  if (!r) { r = { busy: false, pauseRequested: false, abort: null }; runtimes.set(id, r); }
  return r;
}
function isRunning(id) { var r = runtimes.get(id); return !!(r && r.busy); }

function normCfg(c) {
  c = c || {};
  return {
    endpoint: typeof c.endpoint === 'string' ? c.endpoint : '',
    apiKey:   typeof c.apiKey   === 'string' ? c.apiKey   : '',
    model:    typeof c.model    === 'string' ? c.model    : ''
  };
}

function normalizeTopic(raw) {
  var dropped = 0;
  var msgs = [];
  var src = (raw && raw.messages) || [];
  for (var i = 0; i < src.length; i++) {
    var m = src[i];
    if (!m || typeof m.content !== 'string') continue;
    /* only completed turns are ever written to storage; anything else is a relic of an interrupted write */
    if (m.status !== 'done') { dropped++; continue; }
    msgs.push({
      id: m.id || uid(),
      role: m.role === 'B' ? 'B' : 'A',
      content: m.content,
      reasoning: typeof m.reasoning === 'string' ? m.reasoning : '',
      status: 'done',
      ts: m.ts || Date.now(),
      ms: Number(m.ms) || 0
    });
  }
  return {
    dropped: dropped,
    topic: {
      id: (raw && raw.id) || uid(),
      name: (raw && typeof raw.name === 'string' && raw.name) ? raw.name : t('topic.defaultName'),
      createdAt: (raw && raw.createdAt) || Date.now(),
      maxRounds: Number(raw && raw.maxRounds) > 0 ? Math.floor(Number(raw.maxRounds)) : 0,
      config: {
        modelA: normCfg(raw && raw.config && raw.config.modelA),
        modelB: normCfg(raw && raw.config && raw.config.modelB),
        sameAsA: !!(raw && raw.config && raw.config.sameAsA)
      },
      systemPrompt: (raw && typeof raw.systemPrompt === 'string') ? raw.systemPrompt : '',
      messages: msgs
    }
  };
}

function load() {
  var raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
  if (raw) {
    try {
      var p = JSON.parse(raw);
      if (p && typeof p === 'object') {
        if (p.ui && typeof p.ui === 'object') {
          state.ui.lang = (p.ui.lang === 'zh' || p.ui.lang === 'en') ? p.ui.lang : null;
          state.ui.theme = (p.ui.theme === 'light' || p.ui.theme === 'dark') ? p.ui.theme : null;
          state.ui.width = (p.ui.width === 'wide' || p.ui.width === 'narrow') ? p.ui.width : null;
          state.ui.activeTopicId = p.ui.activeTopicId || null;
        }
        var droppedTotal = 0;
        (Array.isArray(p.topics) ? p.topics : []).forEach(function (rt0) {
          var n = normalizeTopic(rt0);
          droppedTotal += n.dropped;
          state.topics.push(n.topic);
        });
        /* stored as a key, not as text: the language is resolved later in init() */
        if (droppedTotal > 0) bootNotice = 'notice.interrupted';
      }
    } catch (e) { console.warn('[aiconv] corrupt storage, starting fresh', e); }
  }
  var found = state.ui.activeTopicId && getTopic(state.ui.activeTopicId);
  if (!found) state.ui.activeTopicId = state.topics.length ? sortedTopics()[0].id : null;
}

function snapshot() {
  return {
    ui: state.ui,
    topics: state.topics.map(function (tp) {
      return {
        id: tp.id, name: tp.name, createdAt: tp.createdAt,
        maxRounds: tp.maxRounds, config: tp.config, systemPrompt: tp.systemPrompt,
        /* only completed turns are durable — a half-streamed turn is never restored */
        messages: tp.messages.filter(function (m) { return m.status === 'done'; })
      };
    })
  };
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot())); }
  catch (e) { console.warn('[aiconv] save failed', e); }
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () { saveTimer = null; save(); }, 400);
}

/* ═══════════ api ═══════════ */
function apiUrl(endpoint) {
  var u = String(endpoint || '').trim().replace(/\s+/g, '');
  if (!u) return '';
  u = u.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(u)) return u;
  if (/\/v\d+$/i.test(u)) return u + '/chat/completions';
  if (/\/completions$/i.test(u)) return u;
  return u + '/v1/chat/completions';
}
function cfgFor(tp, speaker) {
  var c = (speaker === 'B' && tp.config.sameAsA) ? tp.config.modelA
        : (speaker === 'A' ? tp.config.modelA : tp.config.modelB);
  return normCfg(c);
}
function cfgReady(c) { return !!(c.endpoint.trim() && c.model.trim()); }

function asText(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map(function (p) {
      if (typeof p === 'string') return p;
      return (p && (p.text || p.content)) || '';
    }).join('');
  }
  if (typeof v === 'object') return v.text || '';
  return '';
}
function pickReasoning(d) {
  return asText(d.reasoning_content) || asText(d.reasoning) || asText(d.thinking);
}

function authHeaders(cfg) {
  var h = { 'Content-Type': 'application/json' };
  var key = (cfg.apiKey || '').trim();
  if (key) h['Authorization'] = 'Bearer ' + key;
  return h;
}

/**
 * Stream one completion. `onDelta(kind, text)` with kind = 'reasoning' | 'content'.
 * Works with any OpenAI-compatible /chat/completions SSE endpoint; falls back to
 * parsing a plain (non-streamed) JSON body if the server ignores `stream`.
 */
async function streamChat(cfg, messages, signal, onDelta) {
  var url = apiUrl(cfg.endpoint);
  var res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(cfg),
      signal: signal,
      body: JSON.stringify({ model: (cfg.model || '').trim(), messages: messages, stream: true })
    });
  } catch (e) {
    if (signal && signal.aborted) throw abortError();
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(String(e && e.message)))
      throw new Error(t('error.network') + ' → ' + url);
    throw e;
  }

  if (!res.ok) {
    var detail = '';
    try { detail = await res.text(); } catch (_) {}
    throw new Error('HTTP ' + res.status + (detail ? ' · ' + clip(detail, 300) : ''));
  }

  var raw = '';
  var frames = 0;
  var finished = false;

  function consume(json) {
    if (json && json.error) throw new Error(clip(typeof json.error === 'string' ? json.error : JSON.stringify(json.error), 300));
    var ch = json && json.choices && json.choices[0];
    if (!ch) return;
    var d = ch.delta || ch.message || {};
    var think = pickReasoning(d);
    if (think) onDelta('reasoning', think);
    var body = asText(d.content);
    if (body) onDelta('content', body);
  }

  function handleBlock(block) {
    var touched = false;
    var lines = block.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === ':') continue;
      if (line.indexOf('data:') !== 0) continue;
      var payload = line.slice(5).trim();
      if (!payload) continue;
      if (payload === '[DONE]') { finished = true; return true; }
      var json;
      try { json = JSON.parse(payload); } catch (_) { continue; }
      touched = true;
      consume(json);
    }
    return touched;
  }

  if (!res.body || !res.body.getReader) {
    var whole = await res.json().catch(function () { return null; });
    if (whole) consume(whole);
    return;
  }

  var reader = res.body.getReader();
  var dec = new TextDecoder('utf-8');
  var buf = '';
  try {
    while (!finished) {
      var chunk = await reader.read();
      if (chunk.done) break;
      var piece = dec.decode(chunk.value, { stream: true });
      if (frames === 0) raw += piece;   // only kept for the non-streaming fallback below
      buf += piece.replace(/\r\n/g, '\n');
      var idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        var block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (handleBlock(block)) frames++;
        if (finished) break;
      }
    }
    if (!finished && buf.trim()) { if (handleBlock(buf)) frames++; }
  } finally {
    try { reader.cancel(); } catch (_) {}
  }

  /* server ignored stream:true and returned one JSON document */
  if (frames === 0 && raw.trim()) {
    try { consume(JSON.parse(raw)); }
    catch (e) {
      if (e && e.name === 'SyntaxError') throw new Error(t('error.badResponse') + ' · ' + clip(raw, 200));
      throw e;
    }
  }
}

/** Minimal non-streaming request used by the settings "test" button. */
async function probe(cfg) {
  var url = apiUrl(cfg.endpoint);
  var headers = authHeaders(cfg);
  var base = { model: (cfg.model || '').trim(), messages: [{ role: 'user', content: 'hi' }], stream: false };

  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, PROBE_TIMEOUT);
  try {
    var res = await fetch(url, {
      method: 'POST', headers: headers, signal: ctrl.signal,
      body: JSON.stringify(Object.assign({ max_tokens: 1 }, base))
    });
    if (!res.ok) {
      var txt = '';
      try { txt = await res.text(); } catch (_) {}
      /* reasoning models often reject max_tokens — retry once without it */
      if (/max_tokens|max_completion_tokens|unsupported|not supported|invalid/i.test(txt)) {
        res = await fetch(url, { method: 'POST', headers: headers, signal: ctrl.signal, body: JSON.stringify(base) });
        if (res.ok) return true;
        try { txt = await res.text(); } catch (_) {}
      }
      throw new Error('HTTP ' + res.status + (txt ? ' · ' + clip(txt, 200) : ''));
    }
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(t('error.timeout'));
    if (/failed to fetch|networkerror|load failed/i.test(String(e && e.message)))
      throw new Error(t('error.network') + ' → ' + url);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════ conversation assembly ═══════════ */
function buildMessages(tp, speaker) {
  var sys = (tp.systemPrompt || '').trim();
  var out = [];
  if (sys) out.push({ role: 'system', content: sys });

  var done = tp.messages.filter(function (m) { return m.status === 'done'; });

  if (speaker === 'A') {
    /* A opens on an empty user turn; afterwards its own turns are `assistant` and B's are `user` */
    out.push({ role: 'user', content: EMPTY_TURN });
    done.forEach(function (m) {
      out.push({ role: m.role === 'A' ? 'assistant' : 'user', content: m.content });
    });
  } else {
    /* B sees A's turns as `user` and its own as `assistant`; the empty opening turn is not shown to B */
    done.forEach(function (m) {
      out.push({ role: m.role === 'A' ? 'user' : 'assistant', content: m.content });
    });
    if (!out.some(function (m) { return m.role === 'user'; })) {
      out.push({ role: 'user', content: EMPTY_TURN });
    }
  }
  return out;
}

function nextSpeaker(tp) {
  var last = tp.messages[tp.messages.length - 1];
  return (last && last.role === 'A') ? 'B' : 'A';
}

/** Drop turns that never completed (errored, or interrupted by a reload). */
function purgeFailed(tp, id) {
  var before = tp.messages.length;
  tp.messages = tp.messages.filter(function (m) { return m.status === 'done'; });
  var n = before - tp.messages.length;
  if (n > 0) {
    notify('info', t('notice.interrupted'), 4000);
    if (state.ui.activeTopicId === id) renderMessages();
  }
  return n > 0;
}

/* ═══════════ streaming view ═══════════ */
function scrollToEnd(force) {
  var list = $('#messages');
  if (!list) return;
  var near = list.scrollHeight - list.scrollTop - list.clientHeight < 140;
  if (near || force) list.scrollTop = list.scrollHeight;
}
function fmtMs(ms) { return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms'; }

function createStreamView(msg) {
  var wrap = document.createElement('div');
  wrap.className = 'msg msg-' + msg.role;
  wrap.setAttribute('data-mid', msg.id);

  var head = document.createElement('div');
  head.className = 'msg-head';
  var nm = document.createElement('span');
  nm.textContent = t(msg.role === 'A' ? 'msg.modelA' : 'msg.modelB');
  head.appendChild(nm);
  var meta = document.createElement('span');
  meta.className = 'msg-meta';
  head.appendChild(meta);
  wrap.appendChild(head);

  var body = document.createElement('div');
  body.className = 'msg-body';
  wrap.appendChild(body);

  var thinking = null, tbody = null;
  var reasonText = '', contentText = '';
  var rafR = 0, rafC = 0, closed = false;

  function ensureThinking() {
    if (thinking) return;
    thinking = document.createElement('details');
    thinking.className = 'thinking';
    thinking.open = true;
    var sum = document.createElement('summary');
    sum.innerHTML = icon('chevron-right');
    var lbl = document.createElement('span');
    lbl.textContent = t('msg.thinking');
    sum.appendChild(lbl);
    thinking.appendChild(sum);
    tbody = document.createElement('div');
    tbody.className = 'thinking-body';
    thinking.appendChild(tbody);
    wrap.insertBefore(thinking, body);
  }
  function paintReasoning() {
    rafR = 0;
    if (!tbody) return;
    tbody.textContent = reasonText;
    tbody.scrollTop = tbody.scrollHeight;
  }
  function paintContent() {
    rafC = 0;
    body.innerHTML = md(contentText) + '<span class="caret"></span>';
    scrollToEnd();
  }

  var view = {
    id: msg.id,
    el: wrap,
    pushReasoning: function (d) {
      ensureThinking();
      reasonText += d;
      if (!rafR) rafR = requestAnimationFrame(paintReasoning);
    },
    pushContent: function (d) {
      contentText += d;
      /* reasoning has served its purpose the moment the answer starts */
      if (!closed && thinking && thinking.open) { thinking.open = false; closed = true; }
      if (!rafC) rafC = requestAnimationFrame(paintContent);
    },
    finish: function (ms) {
      if (rafR) { cancelAnimationFrame(rafR); rafR = 0; }
      if (rafC) { cancelAnimationFrame(rafC); rafC = 0; }
      if (thinking && contentText) thinking.open = false;
      body.innerHTML = md(contentText) || '<p class="msg-broken">—</p>';
      if (ms) meta.textContent = fmtMs(ms);
      scrollToEnd();
    },
    destroy: function () {
      if (rafR) { cancelAnimationFrame(rafR); rafR = 0; }
      if (rafC) { cancelAnimationFrame(rafC); rafC = 0; }
      wrap.remove();
    }
  };
  return view;
}

function renderStaticMessage(m) {
  var wrap = document.createElement('div');
  wrap.className = 'msg msg-' + m.role;
  wrap.setAttribute('data-mid', m.id);

  var head = document.createElement('div');
  head.className = 'msg-head';
  var nm = document.createElement('span');
  nm.textContent = t(m.role === 'A' ? 'msg.modelA' : 'msg.modelB');
  head.appendChild(nm);
  if (m.ms) {
    var meta = document.createElement('span');
    meta.className = 'msg-meta';
    meta.textContent = fmtMs(m.ms);
    head.appendChild(meta);
  }
  wrap.appendChild(head);

  if (m.reasoning) {
    var d = document.createElement('details');
    d.className = 'thinking';
    var s = document.createElement('summary');
    s.innerHTML = icon('chevron-right');
    var l = document.createElement('span');
    l.textContent = t('msg.thinking');
    s.appendChild(l);
    d.appendChild(s);
    var b = document.createElement('div');
    b.className = 'thinking-body';
    b.textContent = m.reasoning;
    d.appendChild(b);
    wrap.appendChild(d);
  }

  var body = document.createElement('div');
  body.className = 'msg-body';
  body.innerHTML = md(m.content);
  wrap.appendChild(body);
  return wrap;
}

/* ═══════════ turn + loop ═══════════ */
async function runTurn(topicId, speaker) {
  var r = rt(topicId);
  var attempt = 0;

  for (;;) {
    var tp = getTopic(topicId);
    if (!tp) throw abortError();

    var cfg = cfgFor(tp, speaker);
    var payload = buildMessages(tp, speaker);          // assembled before the placeholder is pushed
    var msg = { id: uid(), role: speaker, content: '', reasoning: '', status: 'streaming', ts: Date.now(), ms: 0 };
    tp.messages.push(msg);

    var view = createStreamView(msg);
    liveViews.set(msg.id, view);
    if (state.ui.activeTopicId === topicId) {
      if (tp.messages.length === 1) {
        /* the very first reply freezes the system prompt — rebuild so the block turns read-only */
        renderMessages();
      } else {
        $('#messages').appendChild(view.el);
        syncAnchors();
        scrollToEnd(true);
      }
    }

    var ctrl = new AbortController();
    r.abort = ctrl;
    var t0 = now();

    try {
      await streamChat(cfg, payload, ctrl.signal, function (kind, delta) {
        if (kind === 'reasoning') { msg.reasoning += delta; view.pushReasoning(delta); }
        else { msg.content += delta; view.pushContent(delta); }
      });

      if (!msg.content && !msg.reasoning) throw new Error(t('error.emptyResponse'));

      msg.status = 'done';
      msg.ms = Math.round(now() - t0);
      view.finish(msg.ms);
      liveViews.delete(msg.id);
      r.abort = null;
      save();
      return;
    } catch (err) {
      /* the failed turn is discarded — partial output never survives */
      view.destroy();
      liveViews.delete(msg.id);
      var i = tp.messages.indexOf(msg);
      if (i >= 0) tp.messages.splice(i, 1);
      r.abort = null;
      if (state.ui.activeTopicId === topicId) {
        /* losing the last message unlocks the prompt again */
        if (tp.messages.length === 0) renderMessages();
        else syncAnchors();
      }

      if ((ctrl.signal && ctrl.signal.aborted) || isAbort(err)) throw abortError();

      if (attempt < MAX_RETRY) {
        notify('retry', t('notice.retrying', { n: attempt + 1, total: MAX_RETRY }), 3000);
        await sleep(RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]);
        attempt++;
        continue;
      }

      var fatal = new Error(errText(err));
      fatal.speaker = speaker;
      throw fatal;
    }
  }
}

async function runTopic(id) {
  var tp = getTopic(id);
  if (!tp) return;
  var r = rt(id);
  if (r.busy) return;

  if (!cfgReady(cfgFor(tp, 'A')) || !cfgReady(cfgFor(tp, 'B'))) {
    notify('error', t('notice.notConfigured'), 5200);
    return;
  }

  r.busy = true;
  r.pauseRequested = false;
  syncTopicItem(id);
  if (state.ui.activeTopicId === id) updateRunButton();

  var speaker = 'A';
  try {
    for (;;) {
      var cur = getTopic(id);
      if (!cur || !runtimes.has(id)) break;
      if (r.pauseRequested) break;

      /* clear anything left over from a previous failure before continuing */
      if (purgeFailed(cur, id)) save();

      if (cur.maxRounds > 0 && cur.messages.length >= cur.maxRounds) {
        notify('info', t('notice.maxRounds', { n: cur.maxRounds }), 4600);
        break;
      }

      speaker = nextSpeaker(cur);
      await runTurn(id, speaker);

      save();
      if (state.ui.activeTopicId === id) updateRoundCounter();
    }
  } catch (err) {
    if (!isAbort(err)) {
      r.pauseRequested = true;
      var who = t(speaker === 'B' ? 'msg.modelB' : 'msg.modelA');
      notify('error', t('notice.turnFailed', { model: who }) + ' — ' + errText(err), 0);
    }
  } finally {
    r.busy = false;
    r.abort = null;
    syncTopicItem(id);
    if (state.ui.activeTopicId === id) updateRunButton();
    save();
  }
}

function pauseTopic(id) {
  var r = rt(id);
  r.pauseRequested = true;     // the in-flight turn finishes; no further turn is sent
  syncTopicItem(id);
  if (state.ui.activeTopicId === id) updateRunButton();
}
function toggleTopicRun(id) {
  if (isRunning(id)) pauseTopic(id);
  else runTopic(id);
}

/* ═══════════ notices ═══════════ */
function notify(kind, text, ttl) {
  var box = $('#notices');
  if (!box) return null;
  var el = document.createElement('div');
  el.className = 'notice notice-' + kind;
  var iconId = kind === 'error' ? 'circle-alert' : (kind === 'retry' ? 'loader' : 'badge-check');
  el.innerHTML = icon(iconId) + '<span class="notice-text"></span>' +
                 '<button type="button" class="icon-btn sm">' + icon('x') + '</button>';
  el.querySelector('.notice-text').textContent = text;

  var close = function () { el.remove(); };
  el.querySelector('button').addEventListener('click', close);

  if (kind === 'retry') { var old = box.querySelector('.notice-retry'); if (old) old.remove(); }
  if (kind === 'error') {
    var errs = box.querySelectorAll('.notice-error');
    if (errs.length >= 3) errs[0].remove();
  }
  box.appendChild(el);
  if (ttl) setTimeout(close, ttl);
  return el;
}

/* ═══════════ rendering ═══════════ */
function updateDot(dot, tp) {
  var cls = 'dot', key = 'dot.empty';
  if (isRunning(tp.id)) { cls += ' is-running'; key = 'dot.running'; }
  else if (tp.messages.length) { cls += ' is-paused'; key = 'dot.paused'; }
  dot.className = cls;
  dot.title = t(key);
}

function mkAction(act, iconId, titleKey) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn sm';
  b.setAttribute('data-act', act);
  b.innerHTML = icon(iconId);
  b.title = t(titleKey);
  return b;
}

function makeTopicItem(tp) {
  var running = isRunning(tp.id);
  var el = document.createElement('div');
  el.className = 'topic-item' + (state.ui.activeTopicId === tp.id ? ' active' : '');
  el.setAttribute('data-id', tp.id);

  var dot = document.createElement('span');
  el.appendChild(dot);

  var name = document.createElement('span');
  name.className = 'topic-name';
  name.textContent = tp.name || t('topic.defaultName');
  el.appendChild(name);

  var actions = document.createElement('div');
  actions.className = 'topic-actions';
  actions.appendChild(mkAction('rename', 'square-pen', 'topic.rename'));
  actions.appendChild(mkAction('toggle', running ? 'pause' : 'play', running ? 'topic.pause' : 'topic.resume'));
  actions.appendChild(mkAction('export', 'share', 'topic.export'));
  actions.appendChild(mkAction('dup', 'copy-plus', 'topic.duplicate'));
  actions.appendChild(mkAction('del', 'trash', 'topic.delete'));
  el.appendChild(actions);

  updateDot(dot, tp);

  el.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act]') : null;
    if (btn) { e.stopPropagation(); handleTopicAction(btn.getAttribute('data-act'), tp.id); return; }
    if (el.querySelector('.topic-input')) return;
    selectTopic(tp.id);
  });

  return el;
}

function renderSidebar() {
  var list = $('#topic-list');
  if (!list) return;
  list.innerHTML = '';
  sortedTopics().forEach(function (tp) { list.appendChild(makeTopicItem(tp)); });
}

function syncTopicItem(id) {
  var el = $('.topic-item[data-id="' + id + '"]');
  if (!el) return;
  var tp = getTopic(id);
  if (!tp) return;
  var dot = el.querySelector('.dot');
  if (dot) updateDot(dot, tp);
  var btn = el.querySelector('[data-act="toggle"]');
  if (btn) {
    var running = isRunning(id);
    var use = btn.querySelector('use');
    if (use) use.setAttribute('href', running ? '#i-pause' : '#i-play');
    btn.title = t(running ? 'topic.pause' : 'topic.resume');
  }
}

function renderMessages() {
  var tp = activeTopic();
  var list = $('#messages');
  if (!tp || !list) return;
  list.innerHTML = '';
  list.appendChild(makeSystemBlock(tp));
  tp.messages.forEach(function (m) {
    var lv = liveViews.get(m.id);
    list.appendChild(lv ? lv.el : renderStaticMessage(m));
  });
  var ta = $('#system-prompt');
  if (ta) autoGrow(ta);
  syncAnchors();
  list.scrollTop = list.scrollHeight;
}

/** The prompt is frozen the moment the topic has its first completed reply. */
function promptLocked(tp) { return tp.messages.length > 0; }

function makeSystemBlock(tp) {
  var locked = promptLocked(tp);
  var box = document.createElement('div');
  box.className = 'sys-block';
  box.setAttribute('data-mid', SYS_ID);

  var head = document.createElement('div');
  head.className = 'sys-head';
  if (locked) {
    head.innerHTML = icon('lock');
    head.title = t('sys.locked');
  }
  var lbl = document.createElement('span');
  lbl.textContent = t('sys.title');
  head.appendChild(lbl);
  box.appendChild(head);

  var body = (tp.systemPrompt || '').trim();

  if (locked) {
    var p = document.createElement('div');
    p.className = 'sys-text' + (body ? '' : ' is-empty');
    p.textContent = body || '—';
    box.appendChild(p);
  } else {
    var ta = document.createElement('textarea');
    ta.className = 'sys-input';
    ta.id = 'system-prompt';
    ta.rows = 1;
    ta.spellcheck = false;
    ta.placeholder = t('prompt.placeholder');
    ta.value = tp.systemPrompt || '';
    ta.addEventListener('input', function () {
      var cur = activeTopic();
      if (!cur || promptLocked(cur)) return;   // never writes once locked
      cur.systemPrompt = this.value;
      autoGrow(this);
      scheduleSave();
    });
    box.appendChild(ta);
  }
  return box;
}

/* ─── history anchor rail ─── */
function anchorLabel(el, tp) {
  var mid = el.getAttribute('data-mid');
  if (mid === SYS_ID) return { label: t('sys.title'), text: excerpt(tp.systemPrompt) };
  var m = msgById(tp, mid);
  return m ? { label: m.role, text: excerpt(m.content) } : null;
}
function excerpt(s) {
  var x = String(s || '').replace(/\s+/g, ' ').replace(/^[#>*\-\s]+/, '').trim();
  return x.length > 60 ? x.slice(0, 60) + '…' : x;
}
function makeAnchor() {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'anchor';
  return b;
}
/** Keep one tick per block in the scroll area, in document order. */
function syncAnchors() {
  var list = $('#messages'), rail = $('#anchors');
  if (!list || !rail) return;
  var want = list.children.length;
  while (rail.children.length > want) rail.removeChild(rail.lastChild);
  while (rail.children.length < want) rail.appendChild(makeAnchor());
  var n = rail.children.length;
  var tp = activeTopic();
  for (var i = 0; i < n; i++) {
    var a = rail.children[i];
    a.setAttribute('data-idx', i);
    a.classList.toggle('edge', i === 0 || i === n - 1);
    /* index 0 is the system prompt, so the shading counts off from there */
    a.classList.toggle('major', i % 5 === 0);
    /* the tick has no text, so the rail needs a spoken label for keyboard/AT users */
    var info = tp ? anchorLabel(list.children[i], tp) : null;
    a.setAttribute('aria-label', info ? info.label + ': ' + (info.text || '') : '');
  }
  /* a lone system block is not worth an outline */
  rail.hidden = n < 2;
}
function anchorTarget(a) {
  var list = $('#messages');
  var i = parseInt(a.getAttribute('data-idx'), 10);
  return (list && isFinite(i) && list.children[i]) || null;
}
function showAnchorTip(a) {
  var tip = $('#anchor-tip');
  var el = anchorTarget(a);
  var tp = activeTopic();
  if (!tip || !el || !tp) return;
  var info = anchorLabel(el, tp);
  if (!info) return;

  tip.textContent = '';
  var b = document.createElement('b');
  b.textContent = info.label;
  tip.appendChild(b);
  tip.appendChild(document.createTextNode(': ' + (info.text || '—')));

  var wrap = $('.messages-wrap').getBoundingClientRect();
  var rail = $('#anchors').getBoundingClientRect();
  var r = a.getBoundingClientRect();
  var top = r.top - wrap.top + r.height / 2;
  tip.style.top = Math.round(Math.max(16, Math.min(top, wrap.height - 16))) + 'px';
  tip.style.left = Math.round(rail.right - wrap.left + 8) + 'px';
  tip.hidden = false;
}
function hideAnchorTip() {
  var tip = $('#anchor-tip');
  if (tip) tip.hidden = true;
}
function jumpToAnchor(a) {
  var list = $('#messages');
  var el = anchorTarget(a);
  if (!list || !el) return;
  var top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
  list.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
}

function updateRoundCounter() {
  var el = $('#round-counter');
  var tp = activeTopic();
  if (!el) return;
  if (!tp || (!tp.messages.length && !tp.maxRounds)) { el.textContent = ''; return; }
  el.textContent = tp.maxRounds > 0 ? (tp.messages.length + ' / ' + tp.maxRounds) : String(tp.messages.length);
}

function updateRunButton() {
  var btn = $('#btn-run');
  var use = $('#run-icon');
  var tp = activeTopic();
  if (!btn || !use) return;
  if (!tp) { btn.hidden = true; return; }
  btn.hidden = false;
  var running = isRunning(tp.id);
  use.setAttribute('href', running ? '#i-pause' : '#i-play');
  btn.title = t(running ? 'run.pause' : 'run.start');
  btn.setAttribute('aria-label', btn.title);
}

function renderMain() {
  var tp = activeTopic();
  var conv = $('#conversation');
  var empty = $('#empty-state');
  if (!tp) {
    conv.hidden = true;
    empty.hidden = false;
    updateRoundCounter();
    return;
  }
  empty.hidden = true;
  conv.hidden = false;
  hideAnchorTip();
  renderMessages();
  updateRunButton();
  updateRoundCounter();
}

function renderAll() { renderSidebar(); renderMain(); }

/* ═══════════ topic actions ═══════════ */
function selectTopic(id) {
  if (state.ui.activeTopicId === id) return;
  state.ui.activeTopicId = id;
  save();
  renderAll();
}

function createTopic() {
  var tp = {
    id: uid(),
    name: t('topic.defaultName'),
    createdAt: Date.now(),
    maxRounds: 0,
    config: {
      modelA: { endpoint: '', apiKey: '', model: '' },
      modelB: { endpoint: '', apiKey: '', model: '' },
      sameAsA: false
    },
    systemPrompt: '',
    messages: []
  };
  state.topics.push(tp);   // note: no updatedAt — topics are ordered by createdAt
  state.ui.activeTopicId = tp.id;
  save();
  renderAll();
  setTimeout(function () { var ta = $('#system-prompt'); if (ta) ta.focus(); }, 0);
}

function handleTopicAction(act, id) {
  if (act === 'rename') startRename(id);
  else if (act === 'toggle') toggleTopicRun(id);
  else if (act === 'export') exportTopic(id);
  else if (act === 'dup') duplicateTopic(id);
  else if (act === 'del') deleteTopic(id);
}

function startRename(id) {
  var el = $('.topic-item[data-id="' + id + '"]');
  var tp = getTopic(id);
  if (!el || !tp) return;
  var nameEl = el.querySelector('.topic-name');
  if (!nameEl) return;

  var input = document.createElement('input');
  input.className = 'topic-input';
  input.value = tp.name;
  el.replaceChild(input, nameEl);
  input.focus();
  input.select();

  var settled = false;
  function commit(ok) {
    if (settled) return;
    settled = true;
    if (ok) {
      tp.name = input.value.trim() || t('topic.defaultName');
      save();
    }
    renderSidebar();
  }
  input.addEventListener('click', function (e) { e.stopPropagation(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  });
  input.addEventListener('blur', function () { commit(true); });
}

function duplicateTopic(id) {
  var src = getTopic(id);
  if (!src) return;
  var copy = {
    id: uid(),
    name: src.name + t('topic.copySuffix'),
    createdAt: Date.now(),
    maxRounds: src.maxRounds,
    config: clone(src.config),
    systemPrompt: src.systemPrompt,
    messages: []
  };
  state.topics.push(copy);
  state.ui.activeTopicId = copy.id;
  save();
  renderAll();
}

async function deleteTopic(id) {
  var tp = getTopic(id);
  if (!tp) return;
  var ok = await confirmDialog({
    title: t('confirm.deleteTopic.title'),
    body: t('confirm.deleteTopic.body', { name: tp.name || t('topic.defaultName') }),
    okText: t('action.delete')
  });
  if (!ok) return;

  var r = runtimes.get(id);
  if (r && r.abort) { try { r.abort.abort(); } catch (_) {} }
  runtimes.delete(id);

  state.topics = state.topics.filter(function (x) { return x.id !== id; });
  if (state.ui.activeTopicId === id) {
    var rest = sortedTopics();
    state.ui.activeTopicId = rest.length ? rest[0].id : null;
  }
  save();
  renderAll();
}

/* ═══════════ export ═══════════ */
var exportState = { topicId: null, format: 'md' };

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function stamp() {
  var d = new Date();
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
}
function safeName(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}


function exportTopic(id) {
  var tp = getTopic(id);
  if (!tp) return;
  if (!tp.messages.length) { notify('info', t('export.empty'), 3600); return; }
  exportState.topicId = id;
  exportState.format = 'md';
  $('#export-reason').checked = true;
  syncExportSeg();
  $('#export-modal').hidden = false;
}

function syncExportSeg() {
  $$('#export-seg .seg-item').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-format') === exportState.format);
  });
  /* the reasoning switch is Markdown-only — JSON always carries it */
  $('#export-opt-row').hidden = exportState.format !== 'md';
}

function buildMarkdown(tp, withReasoning) {
  var a = cfgFor(tp, 'A'), b = cfgFor(tp, 'B');
  var L = [];
  L.push('# ' + (tp.name || t('topic.defaultName')));
  L.push('');
  L.push('- ' + t('export.mdTime') + ': ' + new Date().toLocaleString());
  L.push('- ' + t('msg.modelA') + ': ' + (a.model || '—'));
  L.push('- ' + t('msg.modelB') + ': ' + (b.model || '—'));

  var sys = (tp.systemPrompt || '').trim();
  if (sys) {
    L.push('');
    L.push('## ' + t('sys.title'));
    L.push('');
    L.push('```text');
    L.push(sys);
    L.push('```');
  }

  tp.messages.forEach(function (m) {
    L.push('');
    L.push('## ' + t(m.role === 'A' ? 'msg.modelA' : 'msg.modelB'));
    L.push('');
    if (withReasoning && m.reasoning) {
      L.push('<details><summary>' + t('msg.thinking') + '</summary>');
      L.push('');
      L.push(m.reasoning.trim());
      L.push('');
      L.push('</details>');
      L.push('');
    }
    L.push(m.content.trim());
  });
  L.push('');
  return L.join('\n');
}

function buildJson(tp) {
  var a = cfgFor(tp, 'A'), b = cfgFor(tp, 'B');
  return JSON.stringify({
    topic: tp.name || t('topic.defaultName'),
    exportedAt: new Date().toISOString(),
    systemPrompt: tp.systemPrompt || '',
    models: {
      /* api keys are deliberately never exported */
      A: { endpoint: a.endpoint, model: a.model },
      B: { endpoint: b.endpoint, model: b.model }
    },
    messages: tp.messages.map(function (m) {
      return {
        role: m.role,
        model: (m.role === 'A' ? a.model : b.model) || '',
        reasoning: m.reasoning || '',
        content: m.content,
        ts: m.ts || null,
        ms: m.ms || 0
      };
    })
  }, null, 2);
}

function download(filename, text, mime) {
  var blob = new Blob([text], { type: mime + ';charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
}

function runExport() {
  var tp = getTopic(exportState.topicId);
  $('#export-modal').hidden = true;
  if (!tp) return;
  var base = (safeName(tp.name || t('topic.defaultName')) || 'topic') + '-' + stamp();
  if (exportState.format === 'json') download(base + '.json', buildJson(tp), 'application/json');
  else download(base + '.md', buildMarkdown(tp, $('#export-reason').checked), 'text/markdown');
}

/* ═══════════ confirm dialog ═══════════ */
function confirmDialog(opts) {
  return new Promise(function (resolve) {
    confirmResolve = resolve;
    $('#confirm-title').textContent = opts.title;
    $('#confirm-body').textContent = opts.body;
    var ok = $('#confirm-ok');
    ok.textContent = opts.okText || t('action.confirm');
    $('#confirm-modal').hidden = false;
    setTimeout(function () { ok.focus(); }, 0);
  });
}
function closeConfirm(val) {
  var r = confirmResolve;
  confirmResolve = null;
  $('#confirm-modal').hidden = true;
  if (r) r(val);
}

/* ═══════════ settings ═══════════ */
function setResult(box, kind, text, iconId) {
  box.className = 'test-result show ' + kind;
  box.innerHTML = icon(iconId || (kind === 'ok' ? 'badge-check' : kind === 'err' ? 'circle-alert' : 'loader'));
  var span = document.createElement('span');
  span.textContent = text;
  box.appendChild(span);
}
function clearResult(which) {
  var box = $(which === 'a' ? '#result-a' : '#result-b');
  box.className = 'test-result';
  box.innerHTML = '';
}

function fillSettings() {
  var tp = activeTopic();
  var has = !!tp;
  $('#group-model1').hidden = !has;
  $('#group-model2').hidden = !has;
  $('#group-runtime').hidden = !has;
  if (has) {
    $('#a-endpoint').value = tp.config.modelA.endpoint;
    $('#a-key').value = tp.config.modelA.apiKey;
    $('#a-model').value = tp.config.modelA.model;
    $('#b-endpoint').value = tp.config.modelB.endpoint;
    $('#b-key').value = tp.config.modelB.apiKey;
    $('#b-model').value = tp.config.modelB.model;
    $('#max-rounds').value = tp.maxRounds;
    setSameToggle(tp.config.sameAsA);
  }
  clearResult('a');
  clearResult('b');
  syncLangSeg();
}
function openSettings() {
  fillSettings();
  $('#settings-modal').hidden = false;
}
function closeSettings() { $('#settings-modal').hidden = true; }

function setSameToggle(on) {
  var sw = $('#same-toggle');
  sw.setAttribute('aria-checked', on ? 'true' : 'false');
  ['#b-endpoint', '#b-key', '#b-model', '#test-b'].forEach(function (sel) {
    $(sel).disabled = !!on;
  });
}

function bindCfg(sel, which, field) {
  $(sel).addEventListener('input', function () {
    var tp = activeTopic();
    if (!tp) return;
    tp.config[which][field] = this.value;
    scheduleSave();
  });
}

async function testModel(which) {
  var tp = activeTopic();
  if (!tp) return;
  var btn = $(which === 'a' ? '#test-a' : '#test-b');
  var box = $(which === 'a' ? '#result-a' : '#result-b');
  var cfg = (which === 'b' && !tp.config.sameAsA) ? tp.config.modelB : tp.config.modelA;

  if (!cfgReady(normCfg(cfg))) {
    setResult(box, 'err', t('test.failed', { msg: t('notice.notConfigured') }));
    return;
  }
  btn.disabled = true;
  setResult(box, 'busy', t('test.testing'));
  var t0 = now();
  try {
    await probe(normCfg(cfg));
    setResult(box, 'ok', t('test.passed', { ms: Math.round(now() - t0) }));
  } catch (e) {
    setResult(box, 'err', t('test.failed', { msg: errText(e) }));
  } finally {
    btn.disabled = false;
    if (which === 'b') setSameToggle(activeTopic() ? activeTopic().config.sameAsA : false);
  }
}

/* ═══════════ theme / width / language ═══════════ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  var use = $('#theme-icon');
  /* the icon shows what you switch *to* */
  if (use) use.setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
}

/** 'narrow' keeps a centred reading column; 'wide' uses the whole panel. */
function applyWidth(mode) {
  var m = (mode === 'wide') ? 'wide' : 'narrow';
  document.documentElement.setAttribute('data-width', m);
  var use = $('#width-icon');
  if (use) use.setAttribute('href', m === 'wide' ? '#i-fold-horizontal' : '#i-unfold-horizontal');
  var btn = $('#btn-width');
  if (btn) {
    btn.title = t(m === 'wide' ? 'width.toNarrow' : 'width.toWide');
    btn.setAttribute('aria-label', btn.title);
  }
}

function setLang(next) {
  window.I18N.setLang(next);
  state.ui.lang = next;
  window.I18N.apply(document);
  applyWidth(state.ui.width);   // its tooltip is written by JS, so re-apply it
  save();
  renderAll();
}

function syncLangSeg() {
  var cur = window.I18N.getLang();
  $$('#lang-seg .seg-item').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-lang') === cur);
  });
}

/* ═══════════ wiring ═══════════ */
function wire() {
  $('#btn-new-topic').addEventListener('click', createTopic);
  $('#btn-empty-new').addEventListener('click', createTopic);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-run').addEventListener('click', function () {
    var tp = activeTopic();
    if (tp) toggleTopicRun(tp.id);
  });

  $('#btn-theme').addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    state.ui.theme = next;
    applyTheme(next);
    save();
  });

  $('#btn-width').addEventListener('click', function () {
    state.ui.width = (state.ui.width === 'wide') ? 'narrow' : 'wide';
    applyWidth(state.ui.width);
    save();
  });


  /* history anchor rail */
  var rail = $('#anchors');
  rail.addEventListener('mouseover', function (e) {
    var a = e.target.closest ? e.target.closest('.anchor') : null;
    if (a) showAnchorTip(a);
  });
  rail.addEventListener('mouseout', function (e) {
    var to = e.relatedTarget;
    if (!to || !to.closest || !to.closest('.anchor')) hideAnchorTip();
  });
  rail.addEventListener('scroll', hideAnchorTip);
  rail.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('.anchor') : null;
    if (!a) return;
    hideAnchorTip();
    jumpToAnchor(a);
  });

  /* settings modal */
  $$('#settings-modal [data-close]').forEach(function (n) {
    n.addEventListener('click', closeSettings);
  });
  bindCfg('#a-endpoint', 'modelA', 'endpoint');
  bindCfg('#a-key', 'modelA', 'apiKey');
  bindCfg('#a-model', 'modelA', 'model');
  bindCfg('#b-endpoint', 'modelB', 'endpoint');
  bindCfg('#b-key', 'modelB', 'apiKey');
  bindCfg('#b-model', 'modelB', 'model');

  $('#test-a').addEventListener('click', function () { testModel('a'); });
  $('#test-b').addEventListener('click', function () { testModel('b'); });

  $('#same-toggle').addEventListener('click', function () {
    var tp = activeTopic();
    if (!tp) return;
    tp.config.sameAsA = !tp.config.sameAsA;
    setSameToggle(tp.config.sameAsA);
    save();
  });

  $('#max-rounds').addEventListener('input', function () {
    var tp = activeTopic();
    if (!tp) return;
    var n = parseInt(this.value, 10);
    tp.maxRounds = (isFinite(n) && n > 0) ? n : 0;
    scheduleSave();
    updateRoundCounter();
  });

  $('#btn-clear-config').addEventListener('click', async function () {
    var ok = await confirmDialog({
      title: t('confirm.clearConfig.title'),
      body: t('confirm.clearConfig.body'),
      okText: t('action.confirm')
    });
    if (!ok) return;
    state.topics.forEach(function (tp) {
      tp.config.modelA = { endpoint: '', apiKey: '', model: '' };
      tp.config.modelB = { endpoint: '', apiKey: '', model: '' };
      tp.config.sameAsA = false;
    });
    save();
    fillSettings();
    notify('info', t('notice.configCleared'), 4000);
  });

  $('#btn-clear-all').addEventListener('click', async function () {
    var ok = await confirmDialog({
      title: t('confirm.clearAll.title'),
      body: t('confirm.clearAll.body'),
      okText: t('action.delete')
    });
    if (!ok) return;
    runtimes.forEach(function (r) { if (r.abort) { try { r.abort.abort(); } catch (_) {} } });
    runtimes.clear();
    liveViews.clear();
    state.topics = [];
    state.ui.activeTopicId = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    closeSettings();
    renderAll();
    notify('info', t('notice.allCleared'), 4000);
  });

  /* language */
  $('#lang-seg').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-lang]') : null;
    if (!b) return;
    setLang(b.getAttribute('data-lang'));
    syncLangSeg();
  });

  /* export modal */
  $('#export-seg').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-format]') : null;
    if (!b) return;
    exportState.format = b.getAttribute('data-format');
    syncExportSeg();
  });
  $('#export-go').addEventListener('click', runExport);
  $$('#export-modal [data-close]').forEach(function (n) {
    n.addEventListener('click', function () { $('#export-modal').hidden = true; });
  });

  /* confirm modal */
  $('#confirm-ok').addEventListener('click', function () { closeConfirm(true); });
  $('#confirm-cancel').addEventListener('click', function () { closeConfirm(false); });
  $$('#confirm-modal [data-close]').forEach(function (n) {
    n.addEventListener('click', function () { closeConfirm(false); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('#confirm-modal').hidden) { closeConfirm(false); return; }
    if (!$('#export-modal').hidden) { $('#export-modal').hidden = true; return; }
    if (!$('#settings-modal').hidden) closeSettings();
  });

  window.addEventListener('beforeunload', save);
}

/* ═══════════ boot ═══════════ */
function init() {
  initMarked();
  load();

  window.I18N.setLang(state.ui.lang || window.I18N.detect());
  state.ui.lang = window.I18N.getLang();

  var theme = state.ui.theme;
  if (!theme) {
    theme = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  state.ui.theme = theme;
  applyTheme(theme);

  state.ui.width = state.ui.width || 'narrow';
  applyWidth(state.ui.width);

  window.I18N.apply(document);
  wire();
  fillSettings();
  renderAll();

  if (bootNotice) notify('info', t(bootNotice), 5000);
  save();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
