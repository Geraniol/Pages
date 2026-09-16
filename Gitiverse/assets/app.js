/* ===========================================================================
 * app.js — framework for the Chapter 1 prototype
 * ---------------------------------------------------------------------------
 * Reads window.CHAPTER_CONTENT (text + data) and window.GitIcons (Lucide
 * sprite) and renders the shell plus one beat at a time.
 *
 * Contains NO user-visible copy of its own — every string comes from the
 * content file. To restyle, edit theme.css / chapter.css; to reword, edit
 * content.en.js; to change behaviour, you are in the right file.
 *
 * THE BEAT MODEL
 *   A page is a list of beats. Exactly one beat is live. Confirming it fades
 *   that beat back (`is-past`) and expands the next underneath, so the page
 *   grows as a story instead of arriving all at once. A beat becomes
 *   confirmable either immediately (`scene`) or when the reader has done
 *   something — picked a file, found five problems, flipped six cards.
 *
 * Sections
 *   1. helpers
 *   2. store        — what survives a reload (theme, record, settings)
 *   3. theme (day / night)
 *   4. progress     — the learning record, and unlock state derived from it
 *   5. the beat host: mount, confirm, advance, back
 *   6. beat renderers (one per `kind:` used in the content file)
 *   7. toast, settings sheet, and the model API
 *   8. Ask AI — the chat panel that can see the current page
 *   9. shell: rail, topbar, footnav, router
 *  10. boot
 * =========================================================================== */

(function () {
  'use strict';

  var C = window.CHAPTER_CONTENT;
  var I = window.GitIcons;

  if (!C || !I) {
    document.body.innerHTML =
      '<p style="padding:2rem;font:15px system-ui">' +
      'Could not start: content.en.js and icons.js must load before app.js.</p>';
    return;
  }

  var PAGES = C.pages;
  var UI = C.ui;

  /* ======================================================= 1. helpers === */

  function q(root, sel) { return root.querySelector(sel); }
  function qa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** Fill {placeholders} in a content string. */
  function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (all, key) {
      return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : all;
    });
  }

  /** Inline Lucide icon markup. */
  function ic(name, size, cls) {
    return I.svg(name, { size: size || 18, cls: cls || '' });
  }

  /** Build a single element from an HTML string. */
  function el(markup) {
    var tpl = document.createElement('template');
    tpl.innerHTML = String(markup).trim();
    return tpl.content.firstElementChild;
  }

  /** requestAnimationFrame with a safe fallback. */
  var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };

  /** Self-stopping interval, so a widget never leaks a timer. */
  function ticker(fn, ms) {
    var id = null;
    return {
      start: function () { if (id === null) id = setInterval(fn, ms); },
      stop: function () { if (id !== null) { clearInterval(id); id = null; } },
      get running() { return id !== null; }
    };
  }

  function scrollTo_(node) {
    if (!node || !node.scrollIntoView) return;
    try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    catch (e) { /* jsdom / very old browsers */ }
  }

  /** Standard verdict banner. */
  function verdictBlock(v, tone) {
    if (!v) return '';
    return '' +
      '<div class="verdict' + (tone ? ' verdict--' + tone : '') + '" role="status">' +
        '<div class="verdict__icon">' + ic(v.icon, 22) + '</div>' +
        '<div>' +
          '<div class="verdict__headline">' + esc(v.headline) + '</div>' +
          '<div class="verdict__text">' + esc(v.text) + '</div>' +
        '</div>' +
      '</div>';
  }

  function questionBar(qbar) {
    if (!qbar) return '';
    return '<div class="question">' + ic(qbar.icon, 19) +
           '<span>' + esc(qbar.text) + '</span></div>';
  }

  function blockLabel(icon, text) {
    return '<span class="blocklabel">' + ic(icon, 14) + '<span>' + esc(text) + '</span></span>';
  }

  /* ========================================================= 2. store === */

  /**
   * Everything that outlives a page load. Kept in localStorage, so the
   * prototype remembers the theme, which steps are finished, and the API
   * settings between visits.
   *
   * NOTE on the API key: localStorage is readable by any script on this
   * origin. That is acceptable for a local prototype talking to a local
   * endpoint, but it is not somewhere a real key should live.
   */
  var Store = (function () {
    var KEY = {
      theme: 'gitcourse.theme',        /* also read by the <head> bootstrap */
      record: 'gitcourse.record',
      settings: 'gitcourse.settings',
      chat: 'gitcourse.chat'
    };

    function read(key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    }
    function write(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }      /* private mode, or quota */
    }
    return { KEY: KEY, read: read, write: write };
  })();

  /* ========================================================= 3. theme === */

  var Theme = (function () {
    var KEY = 'gitcourse.theme';
    var root = document.documentElement;
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function stored() {
      try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
    }
    function save(v) {
      try { window.localStorage.setItem(KEY, v); } catch (e) { /* private mode */ }
    }
    function systemPref() { return media && media.matches ? 'dark' : 'light'; }

    function apply(mode) {
      root.setAttribute('data-theme', mode);
      var btn = document.getElementById('themeBtn');
      if (btn) {
        var label = mode === 'light' ? UI.theme.toDark : UI.theme.toLight;
        btn.setAttribute('title', label);
        btn.setAttribute('aria-label', label);
      }
    }
    function current() { return root.getAttribute('data-theme') || 'light'; }
    function toggle() {
      var next = current() === 'dark' ? 'light' : 'dark';
      save(next);
      apply(next);
    }
    function init() {
      apply(stored() || systemPref());
      if (media && media.addEventListener) {
        media.addEventListener('change', function (e) {
          if (!stored()) apply(e.matches ? 'dark' : 'light');
        });
      }
    }
    function reset() {
      try { window.localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
      apply(systemPref());
    }
    return { init: init, toggle: toggle, apply: apply, current: current, reset: reset };
  })();

  /* ====================================================== 4. progress === */

  /**
   * The learning record: which steps are finished. Unlock state is *derived*
   * from it rather than stored separately — a step is open when the one
   * before it is done — so the two can never drift apart.
   */
  var Progress = (function () {
    var done = {};
    var watchers = [];

    function load() {
      var saved = Store.read(Store.KEY.record, null);
      done = (saved && saved.completed) ? saved.completed : {};
      paint();
    }
    function save() { Store.write(Store.KEY.record, { completed: done }); }

    function mark(pageId) {
      if (done[pageId]) return;
      done[pageId] = true;
      save();
      paint();
      fire();
    }
    function isDone(pageId) { return !!done[pageId]; }
    function clear() { done = {}; save(); paint(); fire(); }

    /** Highest step the reader is allowed into. */
    function furthest() {
      var i = 0;
      while (i + 1 < PAGES.length && isDone(PAGES[i].id)) i++;
      return i;
    }
    function isUnlocked(index) { return index <= furthest(); }

    function onChange(fn) { watchers.push(fn); }
    function fire() { watchers.forEach(function (fn) { fn(); }); }

    function paint() {
      var total = PAGES.length;
      var n = Object.keys(done).length;
      var fill = document.getElementById('railFill');
      if (fill) fill.style.width = (total ? (n / total) * 100 : 0) + '%';

      PAGES.forEach(function (p) {
        var li = document.querySelector('.step[data-page="' + p.id + '"]');
        if (li) li.classList.toggle('is-done', isDone(p.id));
      });
    }

    return {
      load: load, mark: mark, isDone: isDone, clear: clear, paint: paint,
      furthest: furthest, isUnlocked: isUnlocked, onChange: onChange
    };
  })();

  /* ====================================================== 5. beat host == */

  var App = {
    pageIndex: 0,
    entry: null,      /* the live page entry */
    cache: {},        /* pageId -> entry, kept so a revisit resumes */
    stage: null
  };

  /**
   * Reflect the current page in the URL fragment so a refresh (or a shared
   * link) reopens it.
   *
   * NOTE: a document opened straight from disk has an opaque origin, and
   * Chrome rejects history.replaceState there with a SecurityError. That is
   * not worth surfacing — the deep link is a convenience, and it works
   * normally once the prototype is served over http(s).
   */
  function setHash(id) {
    try { window.history.replaceState(null, '', '#' + id); }
    catch (e) { /* file:// — carry on without deep links */ }
  }

  /** Build the (initially empty) entry for a page, or return the cached one. */
  function entryFor(page) {
    if (App.cache[page.id]) return App.cache[page.id];

    /* No heading, kicker or subtitle: the beats are the content, and the
       step rail plus the breadcrumb already say where the reader is. */
    var article = el('<article class="page"><div class="page__body"></div></article>');

    var entry = {
      page: page,
      article: article,
      body: q(article, '.page__body'),
      els: [],        /* one <section class="beat"> per rendered beat */
      ctris: [],      /* the controller each beat renderer returned */
      index: -1,
      store: {}       /* shared scratch space between a page's beats */
    };
    App.cache[page.id] = entry;
    return entry;
  }

  /**
   * Create the <section> for one beat, hand its content area to the matching
   * renderer, and wire the confirm button.
   */
  function mountBeat(entry, index) {
    var beat = entry.page.beats[index];
    var section = el('' +
      '<section class="beat">' +
        '<div class="beat__content"></div>' +
        '<div class="beat__confirm"></div>' +
      '</section>');

    var content = q(section, '.beat__content');
    var slot = q(section, '.beat__confirm');
    var ctrl = {};

    /* The button that closes a step is not the same act as the ones that
       move within it, so it does not read the same: it names the step it
       opens, and it carries a full arrow rather than a chevron. */
    var closesStep = index === entry.page.beats.length - 1 &&
                     App.pageIndex < PAGES.length - 1;
    var closeLabel = closesStep
      ? fill(UI.nextStep, { name: PAGES[App.pageIndex + 1].nav.label })
      : null;
    var closeIcon = closesStep ? 'arrow-right' : 'chevron-right';

    function showConfirm(label) {
      var existing = q(slot, '.btn');
      if (existing) {
        if (label) q(existing, 'span').textContent = label;
        return;
      }
      slot.innerHTML = '<button class="btn btn--primary btn--go" type="button">' +
        '<span>' + esc(label || closeLabel || beat.confirm || UI.confirm) + '</span>' +
        ic(closeIcon, 16) + '</button>';
      q(slot, '.btn').addEventListener('click', confirmBeat);

      /* the job of a "do this" button is done once it has been done —
         demote it so Continue is unmistakably the next action */
      qa(section, '.beat__actions .btn--primary').forEach(function (b) {
        b.classList.remove('btn--primary');
      });
    }

    function showWait() {
      if (!beat.waitHint) { slot.innerHTML = ''; return; }
      slot.innerHTML = '<span class="beat__wait">' + ic('mouse-pointer-click', 14) +
        '<span>' + esc(beat.waitHint) + '</span></span>';
    }

    var api = {
      store: entry.store,
      /** The beat is satisfied — reveal (or relabel) its confirm button. */
      ready: function (label) { showConfirm(label); },
      /** Back to "not satisfied yet", e.g. the quiz's next statement. */
      wait: showWait,
      /** Let a renderer consume the confirm click (multi-step beats). */
      intercept: function (fn) { ctrl.onConfirm = fn; }
    };

    var factory = BEATS[beat.kind];
    if (factory) {
      var inst = factory(content, beat, api) || {};
      if (inst.pause) ctrl.pause = inst.pause;
    } else {
      content.innerHTML = '<p class="hintline">Unknown beat kind: ' + esc(beat.kind) + '</p>';
      api.ready();
    }

    if (!q(slot, '.btn')) showWait();

    entry.els[index] = section;
    entry.ctris[index] = ctrl;
    entry.body.appendChild(section);
    return section;
  }

  function showBeat(entry, index) {
    entry.index = index;
    var section = entry.els[index] || mountBeat(entry, index);
    section.classList.remove('is-past');
    paintPips(entry);
    paintFootnav();
    Chat.refresh();           /* the tutor's "Reading: …" strip */
  }

  /** Drop the beat at `index` (and anything after) so it can be rebuilt. */
  function rewindTo(entry, index) {
    for (var i = index; i < entry.els.length; i++) {
      var node = entry.els[i];
      if (node && node.parentNode) node.parentNode.removeChild(node);
      entry.els[i] = null;
      entry.ctris[i] = null;
    }
    entry.els.length = index;
    entry.ctris.length = index;
  }

  /* The pips live in the footnav, not the page body — they are the only
     positional chrome left inside a page, and they carry no text. */
  function paintPips(entry) {
    qa(document, '.beatpip').forEach(function (pip, i) {
      pip.classList.toggle('is-done', i < entry.index);
      pip.classList.toggle('is-current', i === entry.index);
    });
  }

  /** Confirm the live beat: the renderer may consume the click first. */
  function confirmBeat() {
    var entry = App.entry;
    if (!entry) return;
    var ctrl = entry.ctris[entry.index];
    if (ctrl && ctrl.onConfirm && ctrl.onConfirm() === true) return;
    advanceBeat();
  }

  function advanceBeat() {
    var entry = App.entry;
    var i = entry.index;
    var section = entry.els[i];
    var ctrl = entry.ctris[i];

    /* fade this beat back and take its button away — the reader is done here */
    section.classList.add('is-past');
    q(section, '.beat__confirm').innerHTML = '';
    if (ctrl && ctrl.pause) ctrl.pause();

    if (i < entry.page.beats.length - 1) {
      showBeat(entry, i + 1);
      scrollTo_(entry.els[i + 1]);
      return;
    }

    /* Last beat of the page, and the reader has just confirmed it. That
       click — not merely arriving here — is what finishes the step and
       opens the next one. */
    Progress.mark(entry.page.id);

    if (App.pageIndex < PAGES.length - 1) {
      showPage(App.pageIndex + 1);
      window.scrollTo(0, 0);
    } else {
      /* Chapter 1 is the only chapter built so far. Say so rather than
         silently throwing the reader back to the start. Replaying is still
         available from the button in the top bar. */
      Toast.show(UI.nextChapter, 'lock');
    }
    paintFootnav();
  }

  /** Step back one beat. The target beat is rebuilt so it can be redone. */
  function backBeat() {
    var entry = App.entry;
    if (!entry) return;

    if (entry.index <= 0) {
      if (App.pageIndex > 0) showPage(App.pageIndex - 1);
      return;
    }

    var target = entry.index - 1;
    rewindTo(entry, target);
    showBeat(entry, target);
    scrollTo_(entry.els[target]);
  }

  function showPage(index) {
    if (index < 0 || index >= PAGES.length) return;

    if (!Progress.isUnlocked(index)) {
      Toast.show(UI.lock.toast, 'lock');
      return;
    }

    if (App.entry && App.entry.ctris[App.entry.index] &&
        App.entry.ctris[App.entry.index].pause) {
      App.entry.ctris[App.entry.index].pause();
    }

    var page = PAGES[index];
    var entry = entryFor(page);
    App.pageIndex = index;
    App.entry = entry;

    App.stage.innerHTML = '';
    App.stage.appendChild(entry.article);

    var lastIdx = page.beats.length - 1;
    if (entry.index < 0) {
      showBeat(entry, 0);
    } else if (entry.index === lastIdx && entry.els[lastIdx] &&
               entry.els[lastIdx].classList.contains('is-past')) {
      /* The reader already finished this page. Rewind its final beat so they
         are not greeted by a fully dimmed screen with no way onward. */
      rewindTo(entry, lastIdx);
      showBeat(entry, lastIdx);
    } else {
      paintPips(entry);
    }

    qa(document, '.step').forEach(function (li) {
      li.classList.toggle('is-active', li.getAttribute('data-page') === page.id);
    });
    var crumb = document.getElementById('crumbTitle');
    if (crumb) crumb.textContent = page.nav.label;

    renderFootnav();
    Progress.paint();
    setHash(page.id);
    Chat.refresh();

    document.title = 'Chapter ' + C.meta.number + ' · ' + page.nav.label + ' — ' + UI.brand;
    try { App.stage.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  /**
   * Replay the chapter from the top.
   *
   * Deliberately does NOT touch the learning record: finished steps stay
   * finished and unlocked. Only the on-screen progress through this chapter
   * is rewound. Wiping the record is a separate, deliberate action in the
   * settings panel.
   */
  function restart() {
    if (App.entry && App.entry.ctris[App.entry.index] &&
        App.entry.ctris[App.entry.index].pause) {
      App.entry.ctris[App.entry.index].pause();
    }
    App.cache = {};
    App.entry = null;
    showPage(0);
    window.scrollTo(0, 0);
  }

  /** Throw away every rendered page so the next visit rebuilds it. */
  function clearCache() {
    App.cache = {};
    App.entry = null;
  }

  /* ================================================ 6. beat renderers === */

  var BEATS = {};

  /* -------------------------------------------------------- scene ------ */
  BEATS.scene = function (host, beat, api) {
    host.innerHTML = '' +
      '<div class="scene">' +
        '<div class="scene__icon">' + ic(beat.icon, 30) + '</div>' +
        '<div class="scene__body">' +
          '<p class="scene__text">' + esc(beat.text) + '</p>' +
          (beat.parts
            ? '<div class="scene__rule">' +
                '<div class="template">' +
                  beat.parts.map(function (p, i) {
                    return '<span class="template__part" data-tone="' + esc(p.tone) + '"' +
                           ' style="animation-delay:' + (i * 60) + 'ms">' + esc(p.text) + '</span>';
                  }).join('') +
                '</div>' +
              '</div>'
            : '') +
        '</div>' +
      '</div>';

    api.ready();
    return {};
  };

  /* --------------------------------------------------- fileGuess ------- */
  BEATS.fileGuess = function (host, beat, api) {
    var picked = api.store.picked || null;

    host.innerHTML = '' +
      questionBar(beat.question) +
      '<div class="filegrid">' +
        beat.files.map(function (f) {
          return '' +
            '<button class="file-card" type="button" data-name="' + esc(f.name) + '">' +
              '<span class="file-card__top">' +
                '<span class="file-card__icon">' + ic(f.icon || 'file-text', 16) + '</span>' +
                '<span class="file-card__name">' + esc(f.name) + '</span>' +
              '</span>' +
              '<span class="file-card__meta">' +
                '<span>' + ic('clock', 12) + esc(f.date) + '</span>' +
                '<span>' + ic('database', 12) + esc(f.size) + '</span>' +
              '</span>' +
            '</button>';
        }).join('') +
      '</div>' +
      '<span class="hintline" id="guessHint">' + ic('mouse-pointer-click', 14) +
        '<span>' + esc(beat.hint) + '</span></span>';

    var hint = q(host, '#guessHint');

    function paint() {
      qa(host, '.file-card').forEach(function (card) {
        card.classList.toggle('is-selected', card.getAttribute('data-name') === picked);
      });
      hint.innerHTML = picked
        ? ic('check', 14) + '<span class="is-set">' + esc(fill(beat.picked, { name: picked })) + '</span>'
        : ic('mouse-pointer-click', 14) + '<span>' + esc(beat.hint) + '</span>';
    }

    qa(host, '.file-card').forEach(function (card) {
      card.addEventListener('click', function () {
        picked = card.getAttribute('data-name');
        api.store.picked = picked;
        paint();
        api.ready();
      });
    });

    paint();
    if (picked) api.ready();
    return {};
  };

  /* -------------------------------------------------- answerReveal ----- */
  BEATS.answerReveal = function (host, beat, api) {
    var picked = api.store.picked;

    host.innerHTML = '' +
      '<div class="answer">' +
        '<div class="answer__icon">' + ic(beat.icon, 30) + '</div>' +
        '<div>' +
          '<p class="answer__headline">' + esc(beat.headline) + '</p>' +
          '<p class="answer__text">' +
            esc(picked ? fill(beat.pickedEcho, { name: picked }) : beat.pickedNone) +
          '</p>' +
        '</div>' +
      '</div>' +

      '<ol class="rules">' +
        beat.rules.map(function (r, i) {
          return '' +
            '<li class="rule" style="animation-delay:' + (i * 150) + 'ms">' +
              '<span class="rule__icon">' + ic(r.icon, 18) + '</span>' +
              '<span class="rule__label">' + esc(r.label) + '</span>' +
              '<span class="rule__arrow">' + ic('arrow-right', 16) + '</span>' +
              '<span class="rule__file mono">' + esc(r.file) + '</span>' +
              '<span class="rule__short">' + esc(r.short) + '</span>' +
            '</li>';
        }).join('') +
      '</ol>' +

      verdictBlock(beat.verdict);

    api.ready();
    return {};
  };

  /* ---------------------------------------------------- filePile ------- */
  /* One button, labelled with what the reader is about to see — no
     play/step/reset triad to reason about. Pressing it again replays. */
  BEATS.filePile = function (host, beat, api) {
    var m = beat.machine;
    var spawned = 0;
    var timer = ticker(spawn, 190);

    host.innerHTML = '' +
      '<div class="machine">' +
        '<div class="counter">' +
          '<div class="counter__num" id="fpCount">0</div>' +
          '<div class="counter__label">' + esc(m.counterLabel) + '</div>' +
        '</div>' +
        '<div class="pile" id="fpPile"></div>' +
      '</div>' +
      '<div class="beat__actions">' +
        '<button class="btn btn--primary btn--go" type="button" id="fpGo">' +
          ic('play', 16) + '<span>' + esc(beat.action) + '</span></button>' +
      '</div>';

    var pile = q(host, '#fpPile');
    var counter = q(host, '#fpCount');
    var go = q(host, '#fpGo');
    var finished = false;

    function nameFor(i) {
      var save = m.saves[i];
      return save.date + '_' + m.stem + '_v' + String(save.v).padStart(2, '0') + '.' + m.ext;
    }

    function spawn() {
      if (spawned >= m.saves.length) {
        timer.stop();
        finished = true;
        go.disabled = true;    /* the job is done — leave the button inert */
        api.ready();
        return;
      }
      pile.appendChild(el('<div class="pile__item">' + ic('file-text', 12) +
        '<span>' + esc(nameFor(spawned++)) + '</span></div>'));
      counter.textContent = String(spawned);
      counter.classList.toggle('is-hot', spawned > m.saves.length / 2);
    }

    function run() {
      spawned = 0;
      pile.innerHTML = '';
      counter.textContent = '0';
      counter.classList.remove('is-hot');
      go.disabled = true;
      timer.start();
      spawn();
    }

    go.addEventListener('click', run);
    return {
      pause: function () {
        timer.stop();
        if (!finished) go.disabled = false;   /* interrupted, not completed */
      }
    };
  };

  /* ---------------------------------------------------- painHunt ------- */
  BEATS.painHunt = function (host, beat, api) {
    var found = {};

    host.innerHTML = '' +
      questionBar(beat.prompt) +
      '<span class="blocklabel" id="phCount">' + ic('scan-search', 14) +
        '<span>0 / ' + beat.pains.length + ' ' + esc(beat.foundLabel) + '</span></span>' +
      '<div class="pains">' +
        beat.pains.map(function (p) {
          return '' +
            '<button class="pain" type="button" data-pain="' + esc(p.id) + '">' +
              '<span class="pain__check">' + ic('check', 12) + '</span>' +
              '<span class="pain__icon">' + ic(p.icon, 19) + '</span>' +
              '<span class="pain__label">' + esc(p.label) + '</span>' +
              '<span class="pain__note">' + esc(p.note) + '</span>' +
            '</button>';
        }).join('') +
      '</div>' +
      '<div class="beat__verdict" id="phVerdict"></div>';

    var count = q(host, '#phCount');

    qa(host, '[data-pain]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-pain');
        if (found[id]) return;
        found[id] = true;
        btn.disabled = true;        /* already found — a dead control should say so */
        btn.classList.add('is-found');

        var n = Object.keys(found).length;
        count.innerHTML = ic('scan-search', 14) + '<span>' +
          n + ' / ' + beat.pains.length + ' ' + esc(beat.foundLabel) + '</span>';

        if (n === beat.pains.length) {
          q(host, '#phVerdict').innerHTML = verdictBlock(beat.verdict);
          api.ready();
        }
      });
    });

    return {};
  };

  /* ------------------------------------------------- pipelineRun ------- */
  BEATS.pipelineRun = function (host, beat, api) {
    var TOTAL = beat.stages.length;
    var active = 0;
    var timer = ticker(function () { advance(); }, 1000);

    host.innerHTML = '' +
      '<div class="pipe__track">' +
        '<div class="pipe__rail"></div>' +
        beat.stages.map(function (s, i) {
          return '' +
            '<div class="pipe__stage">' +
              '<div class="pipe__icon">' + ic(s.icon, 23) + '</div>' +
              '<div class="pipe__label">' + esc(s.label) + '</div>' +
              '<div class="pipe__note">' + esc(s.note) + '</div>' +
              (i === TOTAL - 1 ? '<div class="pipe__history" id="prHistory"></div>' : '') +
            '</div>';
        }).join('') +
      '</div>' +
      '<div class="beat__actions">' +
        '<button class="btn btn--primary btn--go" type="button" id="prGo">' +
          ic('play', 16) + '<span>' + esc(beat.action) + '</span></button>' +
      '</div>';

    var rail = q(host, '.pipe__rail');
    var history = q(host, '#prHistory');
    var go = q(host, '#prGo');
    var finished = false;

    function paint() {
      qa(host, '.pipe__stage').forEach(function (st, i) {
        st.classList.toggle('is-lit', i === active - 1);
        st.classList.toggle('is-past', i < active - 1);
      });

      rail.classList.toggle('is-flowing', active > 0 && active < TOTAL);

      history.innerHTML = '';
      if (active >= TOTAL) {
        for (var i = 0; i < 5; i++) {
          if (i) {
            var link = el('<span class="pipe__link"></span>');
            link.style.animationDelay = (i * 130) + 'ms';
            history.appendChild(link);
          }
          var bead = el('<span class="pipe__node"></span>');
          bead.style.animationDelay = (i * 130) + 'ms';
          history.appendChild(bead);
        }
      }
    }

    function advance() {
      if (active >= TOTAL) { finish(); return; }
      active++;
      paint();
      if (active >= TOTAL) finish();
    }
    function finish() {
      timer.stop();
      finished = true;
      go.disabled = true;      /* the job is done — leave the button inert */
      api.ready();
    }
    function run() {
      active = 0;
      paint();
      go.disabled = true;
      timer.start();
      advance();          /* light the first stage straight away */
    }

    go.addEventListener('click', run);
    return {
      pause: function () {
        timer.stop();
        if (!finished) go.disabled = false;   /* interrupted, not completed */
      }
    };
  };

  /* -------------------------------------------------- funnelReveal ----- */
  BEATS.funnelReveal = function (host, beat, api) {
    var last = beat.steps.length - 1;

    host.innerHTML = '' +
      '<div class="funnel">' +
        beat.steps.map(function (s, i) {
          return (i ? '<span class="funnel__arrow">' + ic('arrow-right', 16) + '</span>' : '') +
            '<div class="funnel__step' + (i === last ? ' is-final' : '') + '"' +
              ' style="animation-delay:' + (i * 220) + 'ms">' +
              '<span class="funnel__text">' + esc(s.text) + '</span>' +
              '<span class="funnel__short">' + esc(s.short) + '</span>' +
            '</div>';
        }).join('') +
      '</div>' +
      '<div class="beat__verdict">' + verdictBlock(beat.verdict, 'info') + '</div>';

    api.ready();
    return {};
  };

  /* ----------------------------------------------- capabilityCards ----- */
  BEATS.capabilityCards = function (host, beat, api) {
    var flipped = {};

    host.innerHTML =
      '<div class="caps">' +
        beat.cards.map(function (c) {
          return '' +
            '<div class="cap" data-cap="' + esc(c.id) + '" data-demo="' + esc(c.demo) + '">' +
              '<div class="cap__inner">' +
                '<div class="cap__face cap__face--front" role="button" tabindex="0">' +
                  '<div class="cap__icon">' + ic(c.icon, 29) + '</div>' +
                  '<div class="cap__label">' + esc(c.label) + '</div>' +
                  '<div class="cap__hint">' + ic('mouse-pointer-click', 13) +
                    '<span>' + esc(beat.flipHint) + '</span></div>' +
                '</div>' +
                '<div class="cap__face cap__face--back">' +
                  '<div class="cap__caption">' + esc(c.caption) + '</div>' +
                  '<div class="cap__demo"></div>' +
                  '<div class="cap__backhint">' + esc(beat.backHint) + '</div>' +
                '</div>' +
              '</div>' +
            '</div>';
        }).join('') +
      '</div>';

    function toggle(card) {
      var id = card.getAttribute('data-cap');
      flipped[id] = !flipped[id];
      card.classList.toggle('is-flipped', flipped[id]);

      /* re-inject the demo when the back face appears, so its CSS
         animations replay from the start on every flip */
      if (flipped[id]) q(card, '.cap__demo').innerHTML = demo(card.getAttribute('data-demo'));

      var on = Object.keys(flipped).filter(function (k) { return flipped[k]; }).length;
      if (on === beat.cards.length) api.ready();
    }

    qa(host, '.cap').forEach(function (card) {
      var front = q(card, '.cap__face--front');
      front.addEventListener('click', function () { toggle(card); });
      front.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(card); }
      });
    });

    return {};
  };

  /* --- the six miniature SVG demos drawn inside the flip cards --------- */
  function demo(kind) {
    var open = '<svg viewBox="0 0 120 60" preserveAspectRatio="xMidYMid meet">';
    var close = '</svg>';

    if (kind === 'commits') {
      return open +
        '<path class="d-line" d="M12 30 H108"/>' +
        '<circle class="d-node d-anim-node" cx="20" cy="30" r="6"/>' +
        '<circle class="d-node d-anim-node" cx="45" cy="30" r="6" style="animation-delay:130ms"/>' +
        '<circle class="d-node d-anim-node" cx="70" cy="30" r="6" style="animation-delay:260ms"/>' +
        '<circle class="d-node--accent d-anim-node" cx="96" cy="30" r="7" style="animation-delay:390ms"/>' +
        close;
    }

    if (kind === 'timeline') {
      return open +
        '<path class="d-line" d="M12 44 H108"/>' +
        '<circle class="d-node--muted" cx="22" cy="44" r="5"/>' +
        '<circle class="d-node--muted" cx="50" cy="44" r="5"/>' +
        '<circle class="d-node--muted" cx="78" cy="44" r="5"/>' +
        '<circle class="d-node--accent d-anim-node" cx="104" cy="44" r="6"/>' +
        '<path class="d-line d-line--accent d-anim-draw" d="M104 36 C 104 14, 50 12, 50 34"/>' +
        '<path class="d-fill-accent d-anim-node" d="M50 36 L45 27 L55 27 Z"/>' +
        close;
    }

    if (kind === 'branch') {
      return open +
        '<path class="d-line" d="M10 42 H72"/>' +
        '<path class="d-line d-line--accent d-anim-draw" d="M40 42 C 40 24, 48 16, 62 16"/>' +
        '<path class="d-line d-line--accent" d="M62 16 H96"/>' +
        '<circle class="d-node" cx="18" cy="42" r="5"/>' +
        '<circle class="d-node" cx="40" cy="42" r="5"/>' +
        '<circle class="d-node--accent d-anim-node" cx="62" cy="16" r="5"/>' +
        '<circle class="d-node--accent d-anim-node" cx="80" cy="16" r="5" style="animation-delay:150ms"/>' +
        '<circle class="d-node--accent d-anim-node" cx="96" cy="16" r="5" style="animation-delay:300ms"/>' +
        close;
    }

    if (kind === 'merge') {
      return open +
        '<path class="d-line" d="M16 42 H84"/>' +
        '<path class="d-line" d="M84 42 C 93 42, 93 30, 100 30"/>' +
        '<path class="d-line d-line--info d-anim-draw" d="M38 42 C 38 22, 44 16, 56 16"/>' +
        '<path class="d-line d-line--info" d="M56 16 H76"/>' +
        '<path class="d-line d-line--info d-anim-draw" d="M76 16 C 88 16, 90 30, 100 30" style="animation-delay:200ms"/>' +
        '<circle class="d-node" cx="16" cy="42" r="5"/>' +
        '<circle class="d-node" cx="38" cy="42" r="5"/>' +
        '<circle class="d-node" cx="84" cy="42" r="5"/>' +
        '<circle class="d-node--info d-anim-node" cx="56" cy="16" r="5" style="animation-delay:180ms"/>' +
        '<circle class="d-node--info d-anim-node" cx="76" cy="16" r="5" style="animation-delay:300ms"/>' +
        '<circle class="d-node--accent d-anim-node" cx="102" cy="30" r="7" style="animation-delay:460ms"/>' +
        close;
    }

    if (kind === 'team') {
      return open +
        '<path class="d-line d-anim-draw" d="M32 16 C 50 18, 58 24, 66 29"/>' +
        '<path class="d-line d-anim-draw" d="M32 44 C 50 42, 58 36, 66 31" style="animation-delay:120ms"/>' +
        '<path class="d-line d-line--good d-anim-draw" d="M86 30 H102" style="animation-delay:300ms"/>' +
        '<circle class="d-node--info" cx="22" cy="16" r="8"/>' +
        '<circle class="d-node--info" cx="22" cy="44" r="8"/>' +
        '<circle class="d-node--accent d-anim-node" cx="76" cy="30" r="10" style="animation-delay:220ms"/>' +
        '<circle class="d-node--good d-anim-node" cx="106" cy="30" r="6" style="animation-delay:400ms"/>' +
        close;
    }

    /* automate */
    return open +
      '<circle class="d-line" cx="30" cy="30" r="13"/>' +
      '<circle class="d-line d-line--accent" cx="30" cy="30" r="4"/>' +
      '<path class="d-line" d="M30 17 V10"/><path class="d-line" d="M30 43 V50"/>' +
      '<path class="d-line" d="M17 30 H10"/><path class="d-line" d="M43 30 H50"/>' +
      '<path class="d-line" d="M66 30 H88"/>' +
      '<circle class="d-node--good d-anim-node" cx="100" cy="30" r="11" style="animation-delay:200ms"/>' +
      '<path class="d-line d-line--good d-anim-draw" d="M95 30 l4 4 l7 -9" style="animation-delay:420ms"/>' +
      close;
  }

  /* --------------------------------------------------- bucketSort ------ */
  BEATS.bucketSort = function (host, beat, api) {
    var placed = {};
    var picked = null;

    host.innerHTML = '' +
      questionBar(beat.prompt) +
      '<div class="sortgame__tray" id="bsTray"></div>' +
      '<div class="sortgame__buckets">' +
        beat.buckets.map(function (b) {
          return '' +
            '<div class="bucket" data-bucket="' + esc(b.id) + '">' +
              '<div class="bucket__head">' +
                '<div class="bucket__icon">' + ic(b.icon, 20) + '</div>' +
                '<div>' +
                  '<div class="bucket__title">' + esc(b.title) + '</div>' +
                  '<div class="bucket__sub">' + esc(b.subtitle) + '</div>' +
                '</div>' +
                '<span class="bucket__count" data-count="' + esc(b.id) + '">0</span>' +
              '</div>' +
              '<div class="bucket__body" data-drop="' + esc(b.id) + '"></div>' +
            '</div>';
        }).join('') +
      '</div>' +
      '<div class="beat__verdict" id="bsVerdict"></div>';

    var tray = q(host, '#bsTray');

    /* chips are built once and moved, never rebuilt */
    var chips = {};
    beat.chips.forEach(function (c) {
      /* role + tabindex instead of a real <button>: form controls are
         unreliable drag sources, and this one is dragged by pointer events
         we run ourselves rather than by the browser. */
      var chip = el('' +
        '<div class="chip" role="button" tabindex="0" data-chip="' + esc(c.id) + '">' +
          ic(c.icon, 16) + '<span>' + esc(c.label) + '</span>' +
        '</div>');

      function arm() {
        if (placed[c.id]) return;
        picked = picked === c.id ? null : c.id;
        paintPicked();
      }

      chip.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arm(); }
      });
      chip.addEventListener('click', function () {
        /* A press that turned into a drag still ends with a click on the
           chip; that click must not also toggle the armed state. */
        if (chip.__dragged) { chip.__dragged = false; return; }
        arm();
      });

      chips[c.id] = chip;
      tray.appendChild(chip);
    });

    function paintPicked() {
      beat.chips.forEach(function (c) {
        chips[c.id].classList.toggle('is-picked', picked === c.id);
      });
      qa(host, '.bucket').forEach(function (b) {
        b.classList.toggle('is-target', !!picked);
      });
    }

    function paintCounts() {
      beat.buckets.forEach(function (b) {
        var total = beat.chips.filter(function (c) { return c.bucket === b.id; }).length;
        var n = beat.chips.filter(function (c) {
          return c.bucket === b.id && placed[c.id];
        }).length;
        q(host, '[data-count="' + b.id + '"]').textContent = n + ' / ' + total;
      });
    }

    function place(chipId, bucketId) {
      var data = beat.chips.filter(function (c) { return c.id === chipId; })[0];
      if (!data || placed[chipId]) return;

      var bucketEl = q(host, '.bucket[data-bucket="' + bucketId + '"]');
      var chipEl = chips[chipId];

      if (data.bucket === bucketId) {
        placed[chipId] = true;
        picked = null;
        chipEl.classList.remove('is-picked');
        /* a div cannot be `disabled`, so mark it for assistive tech and let
           `is-locked` (pointer-events: none) take it out of the pointer's
           way — which also means a drop aimed at a placed chip lands on the
           bucket behind it rather than on the chip. */
        chipEl.setAttribute('aria-disabled', 'true');
        chipEl.classList.add('is-right', 'is-locked');
        q(bucketEl, '.bucket__body').appendChild(chipEl);
        bucketEl.classList.add('is-good');
        setTimeout(function () { bucketEl.classList.remove('is-good'); }, 600);
        paintPicked();
        paintCounts();

        if (Object.keys(placed).length === beat.chips.length) {
          q(host, '#bsVerdict').innerHTML = verdictBlock(beat.verdict, 'good');
          api.ready();
        }
      } else {
        chipEl.classList.add('is-wrong');
        bucketEl.classList.add('is-bad');
        setTimeout(function () {
          chipEl.classList.remove('is-wrong');
          bucketEl.classList.remove('is-bad');
        }, 460);
      }
    }

    /* The whole bucket is the target, header included — people aim at the
       heading, which a body-only handler ignored. */
    qa(host, '.bucket').forEach(function (bucketEl) {
      var bucketId = bucketEl.getAttribute('data-bucket');
      bucketEl.addEventListener('click', function () {
        if (picked) place(picked, bucketId);
      });
    });

    /* ------------------------------------------------------- dragging ---
       Pointer events, NOT HTML5 drag-and-drop.

       A native drag is a session the browser owns. Script cannot end one,
       and if anything about the page upsets it mid-flight the session never
       closes: the pointer stays captured, the chip is stuck looking
       dragged, and the page stops responding until it is reloaded. That is
       the freeze this widget kept hitting, and no amount of tidying the
       dragstart handler fixes it, because the failure lives in the browser
       session rather than in our code.

       Pointer events keep the entire gesture in script, where pointerup is
       always delivered and the state can always be unwound. Mouse, pen and
       touch take the same path, and setPointerCapture means moves keep
       arriving even when the pointer leaves the chip. */
    var DRAG_SLOP = 4;                    /* px of travel before it is a drag */

    /** The bucket whose box contains this point, if any. */
    function bucketAt(x, y) {
      var found = null;
      qa(host, '.bucket').forEach(function (b) {
        var r = b.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found = b;
      });
      return found;
    }

    function attachDrag(chip, c) {
      var pointerId = null, startX = 0, startY = 0, live = false, over = null;

      function paintOver(bucketEl) {
        if (over === bucketEl) return;
        if (over) over.classList.remove('is-over');
        over = bucketEl;
        if (over) over.classList.add('is-over');
      }

      function end() {
        if (pointerId !== null) {
          try { chip.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
        }
        pointerId = null;
        live = false;
        chip.classList.remove('is-dragging');
        chip.style.transform = '';
        document.body.classList.remove('is-dragging-chip');
        paintOver(null);
      }

      chip.addEventListener('pointerdown', function (e) {
        if (placed[c.id] || e.button !== 0) return;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        live = false;
        try { chip.setPointerCapture(pointerId); } catch (err) { /* ignore */ }
      });

      chip.addEventListener('pointermove', function (e) {
        if (pointerId === null || e.pointerId !== pointerId) return;
        if (!live) {
          if (Math.abs(e.clientX - startX) < DRAG_SLOP &&
              Math.abs(e.clientY - startY) < DRAG_SLOP) return;
          live = true;
          picked = c.id;
          paintPicked();
          chip.classList.add('is-dragging');
          document.body.classList.add('is-dragging-chip');
        }
        e.preventDefault();               /* no text selection while dragging */
        chip.style.transform =
          'translate(' + (e.clientX - startX) + 'px,' + (e.clientY - startY) + 'px)';
        paintOver(bucketAt(e.clientX, e.clientY));
      });

      /* One exit for the gesture, whichever path reaches it: it settles the
         drag AND finishes the drop, so a release that arrives somewhere
         unexpected still places the chip rather than silently dropping it.
         The `pointerId === null` guard makes the second caller a no-op. */
      function release(e) {
        if (pointerId === null || e.pointerId !== pointerId) return;
        var target = live ? bucketAt(e.clientX, e.clientY) : null;
        var wasLive = live;
        if (wasLive) chip.__dragged = true;      /* swallow the trailing click */
        end();
        if (wasLive && target) place(c.id, target.getAttribute('data-bucket'));
        /* released over nothing: the chip stays armed, so a click finishes it */
      }

      chip.addEventListener('pointerup', release);
      chip.addEventListener('pointercancel', function (e) {
        if (pointerId !== null && e.pointerId === pointerId) end();
      });

      /* Belt and braces. Capture should deliver the release to the chip even
         when the pointer has left it, but if capture is ever lost this still
         ends the gesture instead of stranding it. */
      document.addEventListener('pointerup', release);
    }

    Object.keys(chips).forEach(function (id) {
      attachDrag(chips[id], beat.chips.filter(function (c) { return c.id === id; })[0]);
    });

    paintCounts();
    return {};
  };

  /* ------------------------------------------------------ quizRun ------ */
  BEATS.quizRun = function (host, beat, api) {
    var TOTAL = beat.statements.length;
    var index = 0;
    var answers = [];

    host.innerHTML = '' +
      '<div class="quiz__bar">' +
        '<div class="quiz__pips" id="qzPips"></div>' +
        '<span class="quiz__score" id="qzScore"></span>' +
      '</div>' +
      '<div id="qzCard"></div>' +
      '<div class="beat__verdict" id="qzVerdict"></div>';

    var pips = q(host, '#qzPips');
    var cardSlot = q(host, '#qzCard');

    function paintPips() {
      pips.innerHTML = beat.statements.map(function (s, i) {
        var cls = '';
        if (i < answers.length) cls = answers[i].right ? 'is-right' : 'is-wrong';
        else if (i === index) cls = 'is-current';
        return '<span class="quiz__pip ' + cls + '"><i></i></span>';
      }).join('');
      var right = answers.filter(function (a) { return a.right; }).length;
      q(host, '#qzScore').textContent = right + ' / ' + TOTAL;
    }

    function paintCard() {
      var s = beat.statements[index];
      cardSlot.innerHTML = '' +
        '<div class="quiz-card">' +
          '<div class="quiz-card__icon">' + ic(s.icon, 26) + '</div>' +
          '<div class="quiz-card__text">' + esc(s.text) + '</div>' +
          '<div class="quiz-card__actions">' +
            '<button class="tf-btn" type="button" data-value="true">' +
              ic('check', 24) + '<span>' + esc(UI.answer.yes) + '</span></button>' +
            '<button class="tf-btn" type="button" data-value="false">' +
              ic('x', 24) + '<span>' + esc(UI.answer.no) + '</span></button>' +
          '</div>' +
          '<div id="qzFeedback"></div>' +
        '</div>';

      qa(cardSlot, '[data-value]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          answer(btn.getAttribute('data-value') === 'true');
        });
      });

      if (answers[index]) showFeedback(answers[index], s);
    }

    function answer(value) {
      if (answers[index]) return;
      var s = beat.statements[index];
      answers[index] = { value: value, right: value === s.answer };
      paintPips();
      showFeedback(answers[index], s);

      /* the beat's confirm button becomes the "next question" control */
      api.ready(index === TOTAL - 1 ? beat.confirm : beat.nextLabel);
    }

    function showFeedback(entry, s) {
      qa(cardSlot, '[data-value]').forEach(function (btn) {
        var v = btn.getAttribute('data-value') === 'true';
        btn.disabled = true;
        if (v === entry.value) btn.classList.add(entry.right ? 'is-chosen-right' : 'is-chosen-wrong');
        if (!entry.right && v === s.answer) btn.classList.add('is-keyright');
      });

      q(cardSlot, '#qzFeedback').innerHTML =
        '<div class="quiz-feedback ' + (entry.right ? 'is-right' : 'is-wrong') + '">' +
          ic(entry.right ? 'badge-check' : 'circle-help', 18) +
          '<div><b>' + esc(entry.right ? UI.answer.correct : UI.answer.wrong) + '</b>' +
          esc(s.why) + '</div>' +
        '</div>';
    }

    /* Confirming mid-quiz moves to the next statement instead of leaving the
       beat; only after the last statement does the beat itself advance. */
    api.intercept(function () {
      if (!answers[index]) return true;                       /* nothing answered yet */
      if (index < TOTAL - 1) {
        index++;
        paintPips();
        paintCard();
        api.wait();
        return true;
      }
      q(host, '#qzVerdict').innerHTML = verdictBlock(beat.verdict, 'good');
      return false;
    });

    paintPips();
    paintCard();
    return {};
  };

  /* -------------------------------------------------- finishPanel ------ */
  BEATS.finishPanel = function (host, beat, api) {
    host.innerHTML = '' +
      '<div class="finish">' +
        '<div class="finish__icon">' + ic(beat.icon, 32) + '</div>' +
        '<div class="finish__title">' + esc(beat.title) + '</div>' +
        '<div class="finish__recap">' + esc(beat.recap) + '</div>' +
        '<div class="model">' +
          beat.model.map(function (m, i) {
            return (i ? '<span class="model__arrow">' + ic('arrow-right', 17) + '</span>' : '') +
              '<div class="model__item">' + ic(m.icon, 22) + '<span>' + esc(m.label) + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="finish__next">' + ic('arrow-right', 16) + '<span>' + esc(beat.next) + '</span></div>' +
      '</div>';

    api.ready();
    return {};
  };

  /* ============================================== 7. toast + settings === */

  var Toast = (function () {
    var host = null;

    function show(message, icon) {
      if (!host) {
        host = el('<div class="toasts" id="toasts" aria-live="polite"></div>');
        document.body.appendChild(host);
      }
      var node = el('<div class="toast" role="status">' +
        ic(icon || 'circle-help', 16) + '<span>' + esc(message) + '</span></div>');
      host.appendChild(node);
      setTimeout(function () {
        node.classList.add('is-out');
        setTimeout(function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        }, 320);
      }, 2800);
    }
    return { show: show };
  })();

  /* ------------------------------------------------------- connection --- */

  /**
   * The only place that talks to the model.
   *
   * Every call resolves — never rejects — with { ok, text, detail }, so no
   * call site needs its own try/catch and the UI can always render a result.
   */
  var Api = (function () {
    var TEST_TIMEOUT = 12000;
    var CHAT_TIMEOUT = 60000;

    /**
     * Normalise whatever was typed into an OpenAI-compatible base URL.
     * The service lives under /v1, so an endpoint entered without it gets
     * one appended rather than failing with a bare 404.
     */
    function base(raw) {
      var b = String(raw || '').trim();
      if (!b) return '';
      if (b.charAt(b.length - 1) !== '/') b += '/';
      if (!/\/v1\/$/.test(b)) b += 'v1/';
      return b;
    }

    function chat(cfg, messages, maxTokens) {
      var url = base(cfg.endpoint);
      if (!url) {
        return Promise.resolve({ ok: false, text: '', detail: UI.settings.needEndpoint, ms: 0 });
      }
      if (typeof window.fetch !== 'function') {
        return Promise.resolve({ ok: false, text: '', detail: UI.settings.unreachable, ms: 0 });
      }

      var limit = maxTokens <= 16 ? TEST_TIMEOUT : CHAT_TIMEOUT;
      var ctrl = window.AbortController ? new window.AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, limit);
      var headers = { 'Content-Type': 'application/json' };
      if (cfg.key) headers.Authorization = 'Bearer ' + cfg.key;

      var started = Date.now();
      function settled(result) {
        clearTimeout(timer);
        result.ms = Date.now() - started;
        return result;
      }
      function failed(detail) { return settled({ ok: false, text: '', detail: detail }); }

      return fetch(url + 'chat/completions', {
        method: 'POST',
        headers: headers,
        signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({
          model: cfg.model || 'default',
          messages: messages,
          max_tokens: maxTokens
        })
      }).then(function (res) {
        if (!res.ok) return failed(fill(UI.settings.httpError, { status: res.status }));
        return res.json().then(function (data) {
          var text = '';
          try { text = String(data.choices[0].message.content || '').trim(); } catch (e) { text = ''; }
          return settled({ ok: true, text: text, detail: '' });
        }, function () {
          return failed(UI.settings.unreachable);
        });
      }).catch(function (err) {
        var timedOut = err && err.name === 'AbortError';
        return failed(timedOut ? fill(UI.settings.timedOut, { seconds: limit / 1000 })
                               : UI.settings.unreachable);
      });
    }

    /** One minimal round-trip, for the Test button in Settings. */
    function test(cfg) {
      return chat(cfg, [{ role: 'user', content: 'ping' }], 16)
        .then(function (r) { return { ok: r.ok, detail: r.detail, ms: r.ms }; });
    }

    return { chat: chat, test: test };
  })();

  /* ---------------------------------------------------------- confirm --- */

  /**
   * A second look before something irreversible happens.
   *
   * It is built inside the settings sheet rather than beside it, so it
   * inherits the sheet's stacking order and vanishes with it — there is no
   * state where a confirm outlives the panel that raised it.
   */
  var Confirm = (function () {
    var layer = null, titleEl = null, bodyEl = null, goEl = null, noEl = null;
    var onYes = null, returnTo = null;

    function build(host) {
      layer = el('' +
        '<div class="confirm" hidden>' +
          '<div class="confirm__backdrop" data-no></div>' +
          '<div class="confirm__panel" role="alertdialog" aria-modal="true"' +
            ' aria-labelledby="confirmTitle" aria-describedby="confirmBody">' +
            '<div class="confirm__icon">' + ic('triangle-alert', 24) + '</div>' +
            '<h2 class="confirm__title" id="confirmTitle"></h2>' +
            '<p class="confirm__body" id="confirmBody"></p>' +
            '<div class="confirm__actions">' +
              '<button class="btn" type="button" data-no>' +
                '<span>' + esc(UI.settings.confirm.cancel) + '</span></button>' +
              '<button class="btn btn--danger" type="button" data-yes></button>' +
            '</div>' +
          '</div>' +
        '</div>');
      host.appendChild(layer);

      titleEl = q(layer, '#confirmTitle');
      bodyEl = q(layer, '#confirmBody');
      goEl = q(layer, '[data-yes]');
      noEl = q(layer, '.confirm__actions [data-no]');

      qa(layer, '[data-no]').forEach(function (n) {
        n.addEventListener('click', dismiss);
      });
      goEl.addEventListener('click', function () {
        var act = onYes;
        dismiss();
        if (act) act();          /* the answer is only carried out on a yes */
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen()) dismiss();
      });
    }

    function isOpen() { return !!layer && !layer.hidden; }

    /**
     * Ask; run `opts.onYes` only if the reader says yes.
     *
     * `opts.host` is the panel the question belongs to. The layer is built
     * inside it and moves if the next question comes from somewhere else, so
     * there is one confirm in the document and it always covers the thing it
     * is asking about.
     */
    function ask(opts) {
      var host = opts.host || document.body;
      if (!layer) build(host);
      else if (layer.parentNode !== host) host.appendChild(layer);

      titleEl.textContent = opts.title;
      bodyEl.textContent = opts.body;
      goEl.innerHTML = ic('trash-2', 15) + '<span>' + esc(opts.go) + '</span>';
      onYes = opts.onYes;
      returnTo = document.activeElement;
      layer.hidden = false;
      void layer.offsetHeight;              /* flush the collapsed state */
      layer.classList.add('is-open');
      noEl.focus();                         /* the safe answer takes focus */
    }

    function dismiss() {
      if (!isOpen()) return;
      layer.classList.remove('is-open');
      layer.hidden = true;
      onYes = null;
      if (returnTo && returnTo.focus) returnTo.focus();
    }

    return { build: build, ask: ask, dismiss: dismiss, isOpen: isOpen };
  })();

  /* --------------------------------------------------------- settings --- */

  var Settings = (function () {
    var sheet = null;
    var fields = {};

    function build() {
      sheet = el('' +
        '<div class="sheet" id="settingsSheet" hidden>' +
          '<div class="sheet__backdrop" data-close></div>' +
          '<div class="sheet__panel" role="dialog" aria-modal="true" aria-label="' +
            esc(UI.settings.title) + '">' +
            '<header class="sheet__head">' +
              '<span class="sheet__headicon">' + ic('settings', 16) + '</span>' +
              '<h2 class="sheet__title">' + esc(UI.settings.title) + '</h2>' +
              '<button class="icon-btn" type="button" data-close aria-label="' +
                esc(UI.settings.close) + '">' + ic('x', 17) + '</button>' +
            '</header>' +

            '<div class="sheet__body">' +
              '<div class="field">' +
                '<label class="field__label" for="setEndpoint">' + ic('globe', 14) +
                  '<span>' + esc(UI.settings.endpoint) + '</span></label>' +
                '<input class="input" id="setEndpoint" type="url" spellcheck="false"' +
                  ' autocomplete="off" placeholder="' +
                  esc(UI.settings.endpointPlaceholder) + '">' +
              '</div>' +

              '<div class="field">' +
                '<label class="field__label" for="setKey">' + ic('key-round', 14) +
                  '<span>' + esc(UI.settings.key) + '</span></label>' +
                '<div class="field__row">' +
                  '<input class="input" id="setKey" type="password" spellcheck="false"' +
                    ' autocomplete="off" placeholder="sk-…">' +
                  '<button class="icon-btn" id="keyToggle" type="button" aria-label="' +
                    esc(UI.settings.keyShow) + '">' + ic('eye', 17) + '</button>' +
                '</div>' +
              '</div>' +

              '<div class="field">' +
                '<label class="field__label" for="setModel">' + ic('bot', 14) +
                  '<span>' + esc(UI.settings.model) + '</span></label>' +
                '<div class="field__row">' +
                  '<input class="input" id="setModel" type="text" spellcheck="false"' +
                    ' autocomplete="off" placeholder="deepseek:deepseek-v4-flash">' +
                  '<button class="btn" id="testBtn" type="button">' +
                    ic('send', 15) + '<span>' + esc(UI.settings.test) + '</span></button>' +
                '</div>' +
              '</div>' +

              '<p class="field__status" id="testStatus" role="status"></p>' +

              '<div class="sheet__rule"></div>' +

              '<div class="field__label">' + ic('trash-2', 14) +
                '<span>' + esc(UI.settings.record) + '</span></div>' +
              '<p class="field__note">' + esc(UI.settings.recordNote) + '</p>' +
              '<button class="btn btn--danger" id="clearBtn" type="button">' +
                ic('trash-2', 15) + '<span>' + esc(UI.settings.clear) + '</span></button>' +

              /* a separate heading, not a second button under the first one's
                 title: they destroy different amounts */
              '<div class="sheet__rule"></div>' +
              '<div class="field__label">' + ic('trash-2', 14) +
                '<span>' + esc(UI.settings.clearAllLabel) + '</span></div>' +
              '<p class="field__note">' + esc(UI.settings.clearAllNote) + '</p>' +
              '<button class="btn btn--danger" id="wipeBtn" type="button">' +
                ic('trash-2', 15) + '<span>' + esc(UI.settings.clearAll) + '</span></button>' +
            '</div>' +
          '</div>' +
        '</div>');

      document.body.appendChild(sheet);

      fields.endpoint = q(sheet, '#setEndpoint');
      fields.key = q(sheet, '#setKey');
      fields.model = q(sheet, '#setModel');
      var status = q(sheet, '#testStatus');
      var testBtn = q(sheet, '#testBtn');

      var saved = Store.read(Store.KEY.settings, {}) || {};
      fields.endpoint.value = saved.endpoint || '';
      fields.key.value = saved.key || '';
      fields.model.value = saved.model || '';

      function persist() {
        Store.write(Store.KEY.settings, {
          endpoint: fields.endpoint.value.trim(),
          key: fields.key.value,
          model: fields.model.value.trim()
        });
      }
      [fields.endpoint, fields.key, fields.model].forEach(function (f) {
        f.addEventListener('input', persist);
      });

      q(sheet, '#keyToggle').addEventListener('click', function () {
        var hidden = fields.key.type === 'password';
        fields.key.type = hidden ? 'text' : 'password';
        this.innerHTML = ic(hidden ? 'eye-off' : 'eye', 17);
        this.setAttribute('aria-label', hidden ? UI.settings.keyHide : UI.settings.keyShow);
      });

      testBtn.addEventListener('click', function () {
        if (testBtn.disabled) return;
        persist();
        var was = testBtn.innerHTML;
        testBtn.disabled = true;
        testBtn.innerHTML = ic('loader-circle', 15, 'is-spinning') +
          '<span>' + esc(UI.settings.testing) + '</span>';
        status.className = 'field__status';
        status.textContent = '';

        /* Wrapping the call in Promise.resolve().then() turns even a
           synchronous throw — a browser with no fetch, say — into a
           rejection, so the button can never get stuck on "Testing…". */
        Promise.resolve().then(function () {
          return Api.test({
            endpoint: fields.endpoint.value,
            key: fields.key.value,
            model: fields.model.value
          });
        }).catch(function () {
          return { ok: false, detail: UI.settings.unreachable };
        }).then(function (result) {
          status.className = 'field__status ' + (result.ok ? 'is-ok' : 'is-bad');
          status.innerHTML = ic(result.ok ? 'circle-check' : 'circle-x', 15) +
            '<span>' + esc(result.ok ? UI.settings.ok : UI.settings.fail) +
            /* `result.ms` can legitimately be 0 on a local endpoint, so test
               the type rather than the truthiness or the figure vanishes. */
            (result.ok && typeof result.ms === 'number'
              ? ' · ' + esc(fill(UI.settings.latency, { ms: result.ms })) : '') +
            (result.detail ? ' — ' + esc(result.detail) : '') + '</span>';
          testBtn.disabled = false;
          testBtn.innerHTML = was;
        });
      });

      q(sheet, '#clearBtn').addEventListener('click', function () {
        var c = UI.settings.confirm;
        var done = PAGES.filter(function (p) { return Progress.isDone(p.id); }).length;
        Confirm.ask({
          host: sheet,
          title: c.recordTitle,
          /* say how much is actually at stake, not just that something is */
          body: done ? fill(c.recordBody, { count: done }) : c.recordBodyNone,
          go: c.recordGo,
          onYes: function () {
            Progress.clear();      /* wipes the stored record and the unlocks */
            clearCache();
            showPage(0);
            refreshRail();
            Toast.show(UI.settings.cleared, 'trash-2');
          }
        });
      });

      q(sheet, '#wipeBtn').addEventListener('click', function () {
        var c = UI.settings.confirm;
        Confirm.ask({
          host: sheet,
          title: c.allTitle,
          body: c.allBody,
          go: c.allGo,
          onYes: function () {
            Progress.clear();      /* memory first, then the stored copy goes */
            Theme.reset();         /* back to whatever the system prefers */
            try {
              ['record', 'settings', 'theme'].forEach(function (k) {
                window.localStorage.removeItem(Store.KEY[k]);
              });
            } catch (e) { /* private mode */ }
            fields.endpoint.value = '';
            fields.key.value = '';
            fields.model.value = '';
            status.className = 'field__status';
            status.textContent = '';
            Chat.reset({ forget: true });   /* transcript, memory and key */
            clearCache();
            showPage(0);
            refreshRail();
            Toast.show(UI.settings.clearAllDone, 'trash-2');
          }
        });
      });

      qa(sheet, '[data-close]').forEach(function (n) { n.addEventListener('click', close); });

      /* Capture, so this decides before Confirm's own Escape handler runs.
         On the bubble phase Confirm would already have dismissed itself by
         the time we looked, and one Escape would shut both layers. */
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (Confirm.isOpen()) return;   /* the confirm owns Escape while it is up */
        if (sheet && !sheet.hidden) close();
      }, true);
    }

    function open() {
      if (!sheet) build();
      sheet.hidden = false;
      setTimeout(function () { if (fields.endpoint) fields.endpoint.focus(); }, 30);
    }
    function close() {
      Confirm.dismiss();       /* never leave a confirm behind the sheet */
      if (sheet) sheet.hidden = true;
      var btn = document.getElementById('settingsBtn');
      if (btn) btn.focus();
    }
    return { open: open, close: close };
  })();

  /* ========================================================= 8. Ask AI = */

  /**
   * A chat panel in the bottom-right corner, opened from the launcher
   * button it grows out of.
   *
   * Its reason for existing is that it can see the lesson: every request
   * carries a snapshot of the step, the moment within it, and the text
   * actually rendered on screen, so the model answers about what the learner
   * is looking at rather than in general.
   */
  var Chat = (function () {
    var fab = null, panel = null;
    var logEl = null, inputEl = null, sendEl = null;
    var modelEl = null, ctxEl = null, emptyEl = null, clearEl = null;
    var history = [];          /* the running conversation, system prompt aside */
    var busy = false;

    /** How much of the transcript is kept on disk. */
    var SAVED_LIMIT = 200;

    /**
     * The transcript is saved after every change, so closing the panel or
     * reloading the page does not throw the conversation away. Only real
     * turns are stored — the local error notices never enter `history`.
     */
    function save() {
      Store.write(Store.KEY.chat, history.slice(-SAVED_LIMIT));
    }

    /** Put the saved transcript back into the log, oldest first. */
    function restore() {
      history.forEach(function (m) {
        if (m && m.content && (m.role === 'user' || m.role === 'assistant')) {
          push(m.role, m.content);
        }
      });
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
      paintClear();
    }

    function emptyState() {
      return el('<p class="chat__empty">' + ic('bot-message-square', 18) +
        '<span>' + esc(UI.chat.empty) + '</span></p>');
    }

    /**
     * Wipe the transcript, on screen and on disk, without saying anything.
     * The settings sheet uses this when it clears all data — the reader
     * already confirmed that, so a second notice would only be noise.
     *
     * `forget` drops the storage key instead of writing an empty list, so
     * "clear all data" leaves nothing of the conversation behind.
     */
    function reset(opt) {
      history = [];
      if (opt && opt.forget) {
        try { window.localStorage.removeItem(Store.KEY.chat); } catch (e) { /* private mode */ }
      } else {
        save();
      }
      if (!logEl) return;              /* the panel was never opened */
      logEl.innerHTML = '';
      emptyEl = emptyState();
      logEl.appendChild(emptyEl);
      paintClear();
    }

    /** Wipe it and say so. */
    function clear() {
      reset();
      Toast.show(UI.chat.cleared, 'trash-2');
      if (inputEl) inputEl.focus();
    }

    /** Nothing to clear means nothing to offer. */
    function paintClear() {
      if (clearEl) clearEl.disabled = history.length === 0;
    }

    function config() {
      var s = Store.read(Store.KEY.settings, {}) || {};
      return { endpoint: s.endpoint || '', key: s.key || '', model: s.model || '' };
    }

    /**
     * The visible text of a node, one line per block.
     *
     * `textContent` runs adjacent blocks together — the answer beat arrives
     * as "Nobody knows.You picked file_final_real.docx." — which the model
     * reads as a single sentence. `innerText` respects layout and breaks
     * lines at block boundaries; textContent is the fallback for engines
     * that do not implement it.
     */
    function visibleText(node) {
      if (!node) return '';
      var raw = (typeof node.innerText === 'string' && node.innerText)
        ? node.innerText
        : (node.textContent || '');
      return raw.split('\n')
        .map(function (line) { return line.replace(/\s+/g, ' ').trim(); })
        .filter(Boolean)
        .join('\n');
    }

    /** What the learner is looking at right now. */
    function snapshot() {
      var e = App.entry;
      if (!e) return null;
      var page = e.page;
      var beat = page.beats[e.index];
      var node = e.els[e.index];
      var onScreen = visibleText(node);
      return {
        /* meta.title is not set in the content file yet, so do not send the
           model a chapter line that trails off into a bare dash */
        chapter: 'Chapter ' + C.meta.number + (C.meta.title ? ' — ' + C.meta.title : ''),
        step: page.nav.label,
        stepNo: (App.pageIndex + 1) + ' of ' + PAGES.length,
        moment: (e.index + 1) + ' of ' + page.beats.length + ' (' + beat.kind + ')',
        momentShort: (e.index + 1) + ' of ' + page.beats.length,
        onScreen: onScreen.slice(0, 1400),
        finished: PAGES.filter(function (p) { return Progress.isDone(p.id); })
                       .map(function (p) { return p.nav.label; })
      };
    }

    /**
     * The most messages that travel with one request. Older ones are left
     * out entirely: they are neither sent as messages nor folded into the
     * prompt, so the model sees a bounded window however long the reader
     * keeps talking.
     */
    var RECENT_MESSAGES = 6;

    /**
     * The tail of the conversation, capped and always opening on a question.
     *
     * A request is built just after the new question is pushed and before
     * its reply exists, so the history has odd length at that moment and a
     * plain tail of an even size starts on the tutor's last answer. An
     * orphaned reply is the first thing the model would read, so it is
     * dropped — which makes the window one shorter than the cap.
     */
    function recentHistory() {
      var tail = history.slice(-RECENT_MESSAGES);
      var opens = 0;
      while (opens < tail.length && tail[opens].role !== 'user') opens++;
      return tail.slice(opens);
    }

    /**
     * The prompt describes the lesson, never the conversation. Earlier turns
     * travel in the message list where they belong — folding them in here as
     * well would say the same thing twice and bury the description of the
     * screen the answer is supposed to be about.
     */
    function systemPrompt(s) {
      return [
        fill(UI.chat.promptIntro, { brand: UI.brand }),
        '',
        UI.chat.promptChapter + ': ' + s.chapter,
        UI.chat.promptStep + ': ' + s.step + ' (' + s.stepNo + ')',
        UI.chat.promptMoment + ': ' + s.moment,
        s.finished.length ? UI.chat.promptFinished + ': ' + s.finished.join(', ') : '',
        '',
        UI.chat.promptOnScreen + ':',
        '"""',
        s.onScreen,
        '"""',
        '',
        UI.chat.promptAsk
      ].filter(Boolean).join('\n');
    }

    /* ------------------------------------------------------- rendering --- */

    /** Escape, then the smallest amount of markdown worth honouring. */
    function render(text) {
      return esc(text).split(/```/).map(function (part, i) {
        if (i % 2) return '<pre class="msg__code">' + part.replace(/^\n+|\n+$/g, '') + '</pre>';
        return part
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      }).join('');
    }

    function push(role, text) {
      if (emptyEl && emptyEl.parentNode) { emptyEl.parentNode.removeChild(emptyEl); emptyEl = null; }
      var node = el('<div class="msg msg--' + role + '"><div class="msg__body">' +
        render(text) + '</div></div>');
      logEl.appendChild(node);
      logEl.scrollTop = logEl.scrollHeight;
      return node;
    }

    /** Keep the "Reading: …" strip in step with wherever the learner is. */
    function refresh() {
      if (!panel || panel.hidden || !ctxEl) return;
      var s = snapshot();
      if (!s) return;
      ctxEl.innerHTML = ic('eye', 13) + '<span>' + esc(UI.chat.reading) + '</span>' +
        '<b>' + esc(s.step) + '</b>' +
        '<span class="chat__dim">' + esc(s.momentShort) + '</span>';
      modelEl.textContent = config().model || '';
    }

    /* ------------------------------------------------------------ build -- */

    function build() {
      panel = el('' +
        '<section class="chat" id="chatPanel" hidden aria-label="' + esc(UI.chat.title) + '">' +
          '<header class="chat__head">' +
            '<span class="chat__avatar">' + ic('bot-message-square', 16) + '</span>' +
            '<div class="chat__who">' +
              '<span class="chat__title">' + esc(UI.chat.title) + '</span>' +
              '<span class="chat__model" id="chatModel"></span>' +
            '</div>' +
            '<button class="icon-btn" type="button" id="chatClear" title="' +
              esc(UI.chat.clear) + '" aria-label="' + esc(UI.chat.clear) + '">' +
              ic('trash-2', 16) + '</button>' +
            '<button class="icon-btn" type="button" id="chatClose" aria-label="' +
              esc(UI.chat.close) + '">' + ic('x', 17) + '</button>' +
          '</header>' +
          '<div class="chat__context" id="chatContext"></div>' +
          '<div class="chat__log" id="chatLog" role="log" aria-live="polite"></div>' +
          '<div class="chat__presets" id="chatPresets" role="group" aria-label="' +
            esc(UI.chat.presetsLabel) + '">' +
            UI.chat.presets.map(function (p) {
              return '<button class="chat__preset" type="button" data-ask="' +
                esc(p.text) + '">' + ic(p.icon, 14) +
                '<span>' + esc(p.text) + '</span></button>';
            }).join('') +
          '</div>' +
          '<form class="chat__compose" id="chatForm">' +
            '<textarea class="chat__input" id="chatInput" rows="1" placeholder="' +
              esc(UI.chat.placeholder) + '"></textarea>' +
            '<button class="btn btn--primary chat__send" type="submit" aria-label="' +
              esc(UI.chat.send) + '">' + ic('send', 17) + '</button>' +
          '</form>' +
        '</section>');
      document.body.appendChild(panel);

      logEl = q(panel, '#chatLog');
      inputEl = q(panel, '#chatInput');
      sendEl = q(panel, '.chat__send');
      modelEl = q(panel, '#chatModel');
      ctxEl = q(panel, '#chatContext');

      clearEl = q(panel, '#chatClear');
      emptyEl = emptyState();
      logEl.appendChild(emptyEl);
      restore();

      clearEl.addEventListener('click', function () {
        var c = UI.chat;
        Confirm.ask({
          host: panel,
          title: c.clearTitle,
          body: c.clearBody,
          go: c.clearGo,
          onYes: clear
        });
      });
      q(panel, '#chatClose').addEventListener('click', close);
      qa(panel, '.chat__preset').forEach(function (btn) {
        btn.addEventListener('click', function () {
          ask(btn.getAttribute('data-ask'));
        });
      });
      q(panel, '#chatForm').addEventListener('submit', function (e) {
        e.preventDefault();
        send();
      });
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panel && !panel.hidden &&
            !(e.target && e.target.tagName === 'TEXTAREA')) close();
      });
      /* Clicking anywhere else puts the panel away. Capture phase, so a
         handler that stops propagation on the way up cannot trap it open. */
      document.addEventListener('pointerdown', function (e) {
        if (!panel || panel.hidden || !panel.classList.contains('is-open')) return;
        if (panel.contains(e.target)) return;
        close();
      }, true);
    }

    /* ------------------------------------------------------------- send -- */

    function send() {
      var text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      ask(text);
    }

    /** Ask something the reader did not have to type — a preset, say. */
    function ask(text) {
      if (busy) return;
      var cfg = config();

      push('user', text);
      history.push({ role: 'user', content: text });
      save();
      paintClear();

      if (!cfg.endpoint || !cfg.model) {
        history.pop();                      /* nothing was actually asked */
        save();
        paintClear();
        push('error', UI.chat.needSetup);
        return;
      }

      busy = true;
      sendEl.disabled = true;
      var pending = push('assistant', UI.chat.thinking);
      pending.classList.add('is-thinking');

      var messages = [{ role: 'system', content: systemPrompt(snapshot()) }]
        .concat(recentHistory());

      Promise.resolve().then(function () {
        return Api.chat(cfg, messages, 700);
      }).catch(function () {
        return { ok: false, text: '', detail: UI.chat.unreachable };
      }).then(function (res) {
        if (pending.parentNode) pending.parentNode.removeChild(pending);
        busy = false;
        sendEl.disabled = false;
        if (res.ok && res.text) {
          history.push({ role: 'assistant', content: res.text });
          push('assistant', res.text);
        } else {
          history.pop();                    /* do not replay a failed turn */
          push('error', res.detail || UI.chat.noAnswer);
        }
        save();
        paintClear();
        if (!panel.hidden) inputEl.focus();
      });
    }

    /* ----------------------------------------------------------- public -- */

    /* The panel is only `hidden` once it has finished shrinking, so the
       collapse is visible; reopening inside that window cancels the timer
       and the panel grows back from wherever it got to. */
    var closeTimer = null;

    function open() {
      if (!panel) build();
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      panel.hidden = false;
      if (fab) fab.classList.add('is-gone');
      refresh();
      /* Reading a layout property flushes the collapsed state before the
         class lands, so the transition has somewhere to travel from. An
         rAF pair would do the same thing, but only if frames keep arriving. */
      void panel.offsetHeight;
      panel.classList.add('is-open');
      if (inputEl) inputEl.focus();
    }

    function close() {
      if (!panel || panel.hidden) return;
      panel.classList.remove('is-open');
      if (fab) fab.classList.remove('is-gone');
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(function () {
        closeTimer = null;
        if (!panel.classList.contains('is-open')) {
          panel.hidden = true;
          if (fab) fab.focus();     /* hand focus back to what opened it */
        }
      }, 320);
    }

    /* Read the open state off the class, not off `hidden`: during the
       collapse the panel is still in the DOM and a second click should
       reopen it rather than close it again. */
    function toggle() {
      if (panel && !panel.hidden && panel.classList.contains('is-open')) close();
      else open();
    }

    function mount() {
      /* Load before the panel exists: build() renders whatever is here. */
      var saved = Store.read(Store.KEY.chat, []);
      history = Object.prototype.toString.call(saved) === '[object Array]' ? saved : [];

      fab = el('<button class="chatfab" id="chatFab" type="button" title="' +
        esc(UI.chat.open) + '" aria-label="' + esc(UI.chat.open) + '">' +
        ic('bot-message-square', 22) + '</button>');
      fab.addEventListener('click', toggle);
      document.body.appendChild(fab);
    }

    return { mount: mount, refresh: refresh, open: open, close: close, reset: reset };
  })();

  /* ========================================================= 9. shell === */

  function renderRail() {
    var rail = document.getElementById('rail');

    /* On a narrow screen the settings button may be living in the topbar;
       that copy is stale the moment the rail is redrawn, so drop it before
       building the replacement. */
    var bar = document.getElementById('topbar');
    var moved = bar ? q(bar, '.rail__tools') : null;
    if (moved && moved.parentNode) moved.parentNode.removeChild(moved);

    rail.innerHTML = '' +
      '<div class="rail__brand">' +
        '<div class="rail__logo">' + ic('git-branch', 20) + '</div>' +
        '<div class="rail__brandtitle">' + esc(UI.brand) + '</div>' +
      '</div>' +

      '<div class="rail__chapter">' +
        '<div class="rail__chapternum">Chapter ' + esc(C.meta.number) +
          ' · ' + esc(C.meta.minutes) + ' ' + esc(UI.minutes) + '</div>' +
        '<div class="rail__chaptertitle">' + esc(C.meta.title) + '</div>' +
      '</div>' +

      /* The bar sits directly under the chapter card, where it reads as
         "how much of this chapter is behind you" — a label or a count would
         only restate what it already shows. */
      '<div class="rail__bar"><div class="rail__fill" id="railFill"></div></div>' +

      '<ol class="rail__steps" aria-label="' + esc(UI.nav.steps) + '">' +
        PAGES.map(function (p, i) {
          var open = Progress.isUnlocked(i);
          return '' +
            '<li class="step' + (open ? '' : ' is-locked') + '" data-page="' + esc(p.id) + '">' +
              /* A locked step stays clickable on purpose: clicking it is how
                 the reader finds out why it is shut. `aria-disabled` says so
                 without killing the event. */
              '<button class="step__btn" type="button" data-goto="' + i + '"' +
                (open ? '' : ' aria-disabled="true" title="' + esc(UI.lock.title) + '"') + '>' +
                '<span class="step__dot">' + ic(open ? p.nav.icon : 'lock', 15) + '</span>' +
                '<span class="step__label">' + esc(p.nav.label) + '</span>' +
                '<span class="step__num">' + (i + 1) + '</span>' +
              '</button>' +
            '</li>';
        }).join('') +
      '</ol>' +

      '<div class="rail__tools">' +
        '<button class="icon-btn" id="settingsBtn" type="button" title="' +
          esc(UI.settings.open) + '" aria-label="' + esc(UI.settings.open) + '">' +
          ic('settings', 18) + '</button>' +
      '</div>';

    qa(rail, '[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showPage(parseInt(btn.getAttribute('data-goto'), 10));
        window.scrollTo(0, 0);
      });
    });
    q(rail, '#settingsBtn').addEventListener('click', Settings.open);
    placeSettingsButton();
  }

  /* ----------------------------------------------------------- layout --- */

  /**
   * The settings button is one element that lives in two places.
   *
   * Wide: at the foot of the rail, which is a tall column with a foot to
   * pin it to. Narrow: the rail collapses into a horizontal strip with no
   * foot at all, so the button would float alone below the steps — it moves
   * to the left end of the topbar row instead, where the other controls are.
   *
   * Moving the node rather than rendering it twice keeps one event binding
   * and one place it can be wrong.
   */
  var narrow = window.matchMedia ? window.matchMedia('(max-width: 860px)') : null;

  function placeSettingsButton() {
    var rail = document.getElementById('rail');
    var bar = document.getElementById('topbar');
    if (!rail || !bar || !narrow || !narrow.matches) return;
    var tools = q(rail, '.rail__tools');
    if (tools) bar.insertBefore(tools, bar.firstChild);
  }

  /** Re-draw the rail so lock badges and ticks match the record. */
  function refreshRail() {
    var active = App.entry ? App.entry.page.id : null;
    renderRail();
    qa(document, '.step').forEach(function (li) {
      li.classList.toggle('is-active', li.getAttribute('data-page') === active);
    });
    Progress.paint();
  }

  function renderTopbar() {
    var bar = document.getElementById('topbar');
    /* The step rail already navigates; repeating it as dots up here would be
       a second control for the same job. */
    bar.innerHTML = '' +
      '<div class="topbar__crumbs">' +
        '<span>Chapter ' + esc(C.meta.number) + '</span>' +
        '<span class="topbar__sep">/</span>' +
        '<b id="crumbTitle">' + esc(PAGES[0].nav.label) + '</b>' +
      '</div>' +
      '<div class="topbar__spacer"></div>' +
      '<button class="icon-btn" id="restartBtn" type="button" title="' + esc(UI.nav.restart) +
        '" aria-label="' + esc(UI.nav.restart) + '">' + ic('rotate-ccw', 18) + '</button>' +
      '<button class="icon-btn theme-toggle" id="themeBtn" type="button">' +
        ic('sun', 18, 'icon-sun') + ic('moon', 18, 'icon-moon') +
      '</button>' +
      '<button class="icon-btn" id="practiceBtn" type="button" title="' + esc(UI.practice.label) +
        '" aria-label="' + esc(UI.practice.label) + '">' + ic('terminal', 18) + '</button>';

    document.getElementById('themeBtn').addEventListener('click', Theme.toggle);
    document.getElementById('restartBtn').addEventListener('click', restart);
    document.getElementById('practiceBtn').addEventListener('click', function () {
      Toast.show(UI.practice.locked, 'lock');
    });

    /* Theme.init() runs before this button exists, so it could not label it.
       Re-apply now that there is something to label — and again after every
       rebuild, since a fresh button starts bare. */
    Theme.apply(Theme.current());
  }

  function renderFootnav() {
    var bar = document.getElementById('footnav');
    var beats = App.entry ? App.entry.page.beats.length : 0;
    var pips = '';
    for (var i = 0; i < beats; i++) pips += '<i class="beatpip"></i>';

    bar.innerHTML = '' +
      '<button class="btn" id="prevBtn" type="button">' +
        ic('chevron-left', 16) + '<span>' + esc(UI.nav.prev) + '</span>' +
      '</button>' +
      '<span class="beatpips" aria-hidden="true">' + pips + '</span>';

    q(bar, '#prevBtn').addEventListener('click', backBeat);
    paintFootnav();
  }

  function paintFootnav() {
    if (!App.entry) return;
    var prev = document.getElementById('prevBtn');
    if (prev) prev.disabled = (App.pageIndex === 0 && App.entry.index === 0);
    paintPips(App.entry);
  }

  /* ======================================================== 10. boot === */

  function boot() {
    App.stage = document.getElementById('stage');

    Theme.init();
    Progress.load();          /* restore the record before anything reads it */

    /* Topbar first: on a narrow screen the rail hands it the settings
       button, and it needs somewhere to hand it to. */
    renderTopbar();
    renderRail();
    renderFootnav();
    Chat.mount();

    if (narrow && narrow.addEventListener) {
      narrow.addEventListener('change', function () {
        renderTopbar();       /* rebuilds the bar, so the moved button is gone */
        refreshRail();        /* rebuilds the rail, and places the button */
      });
    }

    /* A finished step opens the next one. Announce the moment it happens. */
    var seenFurthest = Progress.furthest();
    Progress.onChange(function () {
      refreshRail();
      var now = Progress.furthest();
      if (now > seenFurthest) {
        Toast.show(fill(UI.lock.unlocked, { name: PAGES[now].nav.label }), 'lock-open');
      }
      seenFurthest = now;
    });

    /* Open on a deep link if it is both valid and unlocked; otherwise resume
       at the first step the reader has not finished yet. */
    var hash = (window.location.hash || '').replace('#', '');
    var start = -1;
    PAGES.forEach(function (p, i) {
      if (p.id === hash && Progress.isUnlocked(i)) start = i;
    });
    if (start < 0) {
      start = 0;
      while (start < PAGES.length - 1 && Progress.isDone(PAGES[start].id)) start++;
    }
    showPage(start);

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') {
        /* only when the live beat is actually confirmable */
        if (q(App.entry.els[App.entry.index], '.btn')) confirmBeat();
      } else if (e.key === 'ArrowLeft') {
        backBeat();
      }
    });

    window.addEventListener('hashchange', function () {
      var id = (window.location.hash || '').replace('#', '');
      PAGES.forEach(function (p, i) {
        if (p.id === id && i !== App.pageIndex) showPage(i);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
