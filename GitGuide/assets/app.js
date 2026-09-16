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
 *   2. theme (day / night)
 *   3. progress model
 *   4. the beat host: mount, confirm, advance, back
 *   5. beat renderers (one per `kind:` used in the content file)
 *   6. shell: rail, topbar, footnav, router
 *   7. boot
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

  /* ========================================================= 2. theme === */

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
    return { init: init, toggle: toggle, apply: apply, current: current };
  })();

  /* ====================================================== 3. progress === */

  var Progress = (function () {
    var done = {};

    function mark(pageId) {
      if (done[pageId]) return;
      done[pageId] = true;
      paint();
    }
    function isDone(pageId) { return !!done[pageId]; }

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
    return { mark: mark, isDone: isDone, paint: paint, clear: function () { done = {}; paint(); } };
  })();

  /* ====================================================== 4. beat host == */

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

    function showConfirm(label) {
      var existing = q(slot, '.btn');
      if (existing) {
        if (label) q(existing, 'span').textContent = label;
        return;
      }
      slot.innerHTML = '<button class="btn btn--primary btn--go" type="button">' +
        '<span>' + esc(label || beat.confirm || UI.confirm) + '</span>' +
        ic('chevron-right', 16) + '</button>';
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

    /* A page counts as done once the reader has reached its final beat —
       not once they confirm it, because the last beat of the last page is
       "Restart chapter", which would reset the progress it just recorded. */
    if (index === entry.page.beats.length - 1) Progress.mark(entry.page.id);
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

    /* last beat of the page */
    if (App.pageIndex < PAGES.length - 1) {
      showPage(App.pageIndex + 1);
      window.scrollTo(0, 0);
    } else {
      restart();
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

    document.title = 'Chapter ' + C.meta.number + ' · ' + page.nav.label + ' — ' + UI.brand;
    try { App.stage.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function restart() {
    Progress.clear();
    App.cache = {};
    App.entry = null;
    App.pageIndex = 0;
    showPage(0);
    window.scrollTo(0, 0);
  }

  /* ================================================ 5. beat renderers === */

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
        '<div class="pipe__spark" id="prSpark"></div>' +
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

    var spark = q(host, '#prSpark');
    var rail = q(host, '.pipe__rail');
    var history = q(host, '#prHistory');
    var go = q(host, '#prGo');
    var finished = false;
    var sparkFade = null;

    function paint() {
      qa(host, '.pipe__stage').forEach(function (st, i) {
        st.classList.toggle('is-lit', i === active - 1);
        st.classList.toggle('is-past', i < active - 1);
      });

      /* The travelling dot is a progress marker, not a result. Once it has
         landed on the final stage it fades, otherwise it sits on that icon
         for the rest of the page. */
      clearTimeout(sparkFade);
      if (active <= 0) {
        spark.classList.remove('is-visible');
      } else {
        spark.style.left = (12.5 + (Math.min(active, TOTAL) - 1) * 25) + '%';
        spark.classList.add('is-visible');
        if (active >= TOTAL) {
          sparkFade = setTimeout(function () { spark.classList.remove('is-visible'); }, 700);
        }
      }

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
      var chip = el('' +
        '<button class="chip" type="button" draggable="true" data-chip="' + esc(c.id) + '">' +
          ic(c.icon, 16) + '<span>' + esc(c.label) + '</span>' +
        '</button>');

      chip.addEventListener('click', function () {
        if (placed[c.id]) return;
        picked = picked === c.id ? null : c.id;
        paintPicked();
      });
      chip.addEventListener('dragstart', function (e) {
        if (placed[c.id]) { e.preventDefault(); return; }
        picked = c.id;
        paintPicked();
        try { e.dataTransfer.setData('text/plain', c.id); } catch (err) { /* ignore */ }
        e.dataTransfer.effectAllowed = 'move';
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
        chipEl.disabled = true;     /* pointer-events alone leaves it keyboard-live */
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

    qa(host, '.bucket__body').forEach(function (zone) {
      var bucketId = zone.getAttribute('data-drop');
      zone.addEventListener('click', function () { if (picked) place(picked, bucketId); });
      zone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        var id = picked;
        try { id = e.dataTransfer.getData('text/plain') || id; } catch (err) { /* ignore */ }
        if (id) place(id, bucketId);
      });
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

  /* ========================================================= 6. shell === */

  function renderRail() {
    var rail = document.getElementById('rail');
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
          return '' +
            '<li class="step" data-page="' + esc(p.id) + '">' +
              '<button class="step__btn" type="button" data-goto="' + i + '">' +
                '<span class="step__dot">' + ic(p.nav.icon, 15) + '</span>' +
                '<span class="step__label">' + esc(p.nav.label) + '</span>' +
                '<span class="step__num">' + (i + 1) + '</span>' +
              '</button>' +
            '</li>';
        }).join('') +
      '</ol>';

    qa(rail, '[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showPage(parseInt(btn.getAttribute('data-goto'), 10));
        window.scrollTo(0, 0);
      });
    });
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
      '</button>';

    qa(bar, '[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showPage(parseInt(btn.getAttribute('data-goto'), 10));
        window.scrollTo(0, 0);
      });
    });
    document.getElementById('themeBtn').addEventListener('click', Theme.toggle);
    document.getElementById('restartBtn').addEventListener('click', restart);
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

  /* ========================================================= 7. boot === */

  function boot() {
    App.stage = document.getElementById('stage');

    Theme.init();
    renderRail();
    renderTopbar();
    renderFootnav();

    var hash = (window.location.hash || '').replace('#', '');
    var start = 0;
    PAGES.forEach(function (p, i) { if (p.id === hash) start = i; });
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
