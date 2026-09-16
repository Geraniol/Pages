/* ===========================================================================
 * content.en.js — Chapter 1 : "Why Do We Need Git"
 * ---------------------------------------------------------------------------
 * THIS IS THE ONLY FILE YOU NEED TO EDIT to change what the chapter says.
 *
 * It holds every user-visible string and every piece of teaching data.
 * It contains no layout and no behaviour — those live in theme.css,
 * chapter.css and app.js.
 *
 * ---------------------------------------------------------------------------
 * HOW A PAGE IS BUILT: BEATS
 * ---------------------------------------------------------------------------
 * Nothing is presented all at once. Each page is a short sequence of `beats`.
 * Only one beat is "live" at a time. When the reader confirms it, that beat
 * fades back and the next one expands underneath it — so the story piles up
 * on screen instead of arriving in one wall.
 *
 * A beat is:
 *
 *     { kind: '<renderer>', confirm: '<button label>', waitHint: '<...>', ... }
 *
 *   kind       which renderer in app.js draws it (see the list below)
 *   confirm    label of the button that appears once the beat is satisfied
 *   waitHint   optional muted text shown in place of that button while the
 *              reader still has something to do
 *
 * Most beats become "satisfied" through their own interaction (picking a
 * file, finding all five problems, flipping every card). A `scene` beat has
 * nothing to do, so its button appears immediately.
 *
 * PAGES CARRY NO TITLE. There is no heading and no kicker — the only label
 * is `nav.label`, used by the step rail and the breadcrumb. Everything the
 * reader needs to understand a page is inside its beats.
 *
 * ---------------------------------------------------------------------------
 * AVAILABLE BEAT RENDERERS
 * ---------------------------------------------------------------------------
 *   scene            icon + a sentence (optionally the naming-rule chips)
 *   fileGuess        the question + eight ambiguous files; reader picks one
 *   answerReveal     "Nobody knows." + the four contradicting rules
 *   filePile         the naming-rule generator: counter + growing pile
 *   painHunt         tap every problem the naming rule still has
 *   pipelineRun      files → changes → Git → history, played as one sequence
 *   funnelReveal     Version Control System → VCS → Git
 *   capabilityCards  six flip cards, each with an animated mini-demo
 *   bucketSort       drag/tap cards into "Git" vs "GitHub / GitLab"
 *   quizRun          four true/false statements, one at a time
 *   finishPanel      the chapter wrap-up
 *
 * To translate: copy this file to content.<lang>.js, translate the strings,
 * and point the <script> tag in chapter_1.html at the new file.
 * =========================================================================== */

window.CHAPTER_CONTENT = {

  /* ---------------------------------------------------------------- meta -- */
  meta: {
    number: 1,
    minutes: 8
  },

  /* ------------------------------------------------------------ chrome ---- */
  ui: {
    /* The project name. It appears in the rail, in the document title and in
       the tutor's system prompt — all three read it from here, so a rename
       is a one-line edit. */
    brand: 'Git Adventure',
    theme: {
      toDark: 'Switch to night mode',
      toLight: 'Switch to daylight mode'
    },
    nav: {
      prev: 'Back',
      restart: 'Restart chapter',
      steps: 'Chapter steps'
    },
    minutes: 'min',
    confirm: 'Continue',
    nextChapter: 'Chapter 2 is not available yet.',
    /* The button that closes a step names the step it opens, so "finish and
       move on" never reads like "carry on in here". The name is filled in
       from the next step, so renaming a step cannot leave it stale.
       Beat-level `confirm` labels are ignored on a step's final beat. */
    nextStep: 'Next: {name}',
    answer: {
      yes: 'True',
      no: 'False',
      correct: 'Correct',
      wrong: 'Not quite',
      score: 'Score'
    },

    /* Locked steps: a step opens once the one before it is finished. */
    lock: {
      title: 'Finish the step before this one to unlock it',
      toast: 'Finish the step before this one first.',
      unlocked: 'Unlocked: {name}'
    },

    /* The practice-mode entry point sits beside the theme switch. It is a
       placeholder for now — the chapter does not gate it yet. */
    practice: {
      label: 'Practice mode',
      locked: 'Practice mode is not unlocked yet.'
    },

    /* The tutor panel, opened from the button in the bottom-right corner. */
    chat: {
      open: 'Ask AI',
      title: 'Ask AI',
      close: 'Close Ask AI',
      reading: 'Reading',
      placeholder: 'Ask about what is on screen…',
      send: 'Send',
      thinking: 'Thinking…',
      empty: 'Stuck? Ask about the step you are on.',
      clear: 'Clear this conversation',
      cleared: 'Conversation cleared.',

      /* The transcript is kept in localStorage, so clearing it throws away
         saved material — worth a second look, like the settings clears. */
      clearTitle: 'Clear this conversation?',
      clearBody: 'The whole transcript goes, including the copy saved in this browser.',
      clearGo: 'Clear conversation',
      needSetup: 'Add an endpoint and a model in Settings first.',
      unreachable: 'Could not reach the model.',
      noAnswer: 'The model returned nothing.',

      /* Two canned questions, one tap away. `text` is both the chip and what
         gets sent, so the label can never drift from the question. */
      presetsLabel: 'Try asking',
      presets: [
        { icon: 'circle-help', text: 'What should I do now' },
        { icon: 'book-open', text: 'Explain this' }
      ],

      /* The system prompt. The tutor is handed a description of the page the
         learner is looking at, so it can answer about it.
         {brand} is filled from ui.brand, so the course name lives in one
         place and a rename cannot leave the prompt stale. */
      promptIntro: 'You are a patient tutor inside "{brand}", an interactive course. The learner is reading a lesson right now. Answer only about what they can see, in two or three short sentences or one small code block. If the material on screen does not contain the answer, say so plainly instead of inventing Git behaviour.',
      promptChapter: 'Chapter',
      promptStep: 'Current step',
      promptMoment: 'Moment within that step',
      promptFinished: 'Steps already finished',
      promptOnScreen: 'Exactly what is on the learner’s screen right now',
      promptAsk: 'Answer the question they ask about the above.'
    },

    settings: {
      open: 'Settings',
      title: 'Settings',
      close: 'Close settings',
      endpoint: 'Endpoint URL',
      endpointHint: 'Base URL of an OpenAI-compatible service',
      endpointPlaceholder: 'http://127.0.0.1:23333/v1/',
      key: 'API Key',
      keyShow: 'Show key',
      keyHide: 'Hide key',
      model: 'Model Name',
      test: 'Test',
      testing: 'Testing',
      ok: 'Connected',
      fail: 'Failed',
      needEndpoint: 'enter an endpoint URL first',
      latency: '{ms} ms',
      timedOut: 'no reply within {seconds}s',
      unreachable: 'could not reach the endpoint (offline, or blocked by CORS)',
      httpError: 'the endpoint replied {status}',
      record: 'Learning record',
      recordNote: 'Clears finished steps, unlock states and this page’s progress.',
      clear: 'Clear learning record',
      cleared: 'Learning record cleared.',
      clearAll: 'Clear all data',
      clearAllLabel: 'All data',
      clearAllNote: 'Removes the learning record, the saved theme, the API settings and the AI conversation.',
      clearAllDone: 'All local data cleared.',

      /* A second look before either destructive button acts. There is no
         undo behind this sheet, so the click that erases the chapter should
         not be the first one. `{count}` is filled with how many steps are
         actually finished, so the cost is concrete rather than abstract. */
      confirm: {
        cancel: 'Cancel',
        recordTitle: 'Clear the learning record?',
        recordBody: 'This removes {count} finished steps, and every step those unlocks opened.',
        recordBodyNone: 'No steps are finished yet, so only the progress saved on this page is lost.',
        recordGo: 'Clear record',
        allTitle: 'Clear all data?',
        allBody: 'This removes the learning record, the saved theme, the endpoint, key and model, and the whole AI conversation.',
        allGo: 'Clear everything'
      }
    }
  },

  /* ------------------------------------------------------------- pages ---- */
  pages: [

    /* ============================================ 1-1 · Version chaos ==== */
    {
      id: 'chaos',
      nav: { label: 'Version chaos', icon: 'files' },

      beats: [
        /* --- beat 1: the scene, nothing else ---------------------------- */
        {
          kind: 'scene',
          icon: 'folder-clock',
          text: 'A colleague left the team. This is the project folder they handed over.',
          confirm: 'Open the folder'
        },

        /* --- beat 2: the question, and the eight files ------------------ */
        {
          kind: 'fileGuess',
          question: {
            icon: 'circle-help',
            text: 'Which file holds the latest, correct version?'
          },
          hint: 'Pick the one you would trust',
          picked: 'Your pick: {name}',
          waitHint: 'Pick a file to continue',
          confirm: 'Check my answer',
          files: [
            { name: 'file.docx',             date: '2025-03-02', size: '18 KB', icon: 'file-text' },
            { name: 'file.v2.docx',          date: '2025-03-18', size: '42 KB', icon: 'file-text' },
            { name: 'file_new.docx',         date: '2025-04-05', size: '12 KB', icon: 'file-text' },
            { name: 'file_new.v2.docx',      date: '2025-05-22', size: '31 KB', icon: 'file-text' },
            { name: 'file_final.docx',       date: '2025-06-09', size: '24 KB', icon: 'file-text' },
            { name: 'file_final_real.docx',  date: '2025-07-14', size: '27 KB', icon: 'file-text' },
            { name: 'file_super_final.docx', date: '2025-08-01', size: '9 KB',  icon: 'file-text' },
            { name: 'file_modified.docx',    date: '2025-11-04', size: '15 KB', icon: 'file-text' }
          ]
        },

        /* --- beat 3: the answer ---------------------------------------- */
        {
          kind: 'answerReveal',
          icon: 'triangle-alert',
          headline: 'Nobody knows.',
          pickedEcho: 'You picked {name}. Nothing in this folder can confirm that choice.',
          pickedNone: 'And no choice here could be confirmed.',
          rules: [
            {
              icon: 'arrow-down', label: 'First A–Z', file: 'file.docx',
              short: 'the oldest file here'
            },
            {
              icon: 'clock', label: 'Newest', file: 'file_modified.docx',
              short: 'the name says “modified”'
            },
            {
              icon: 'database', label: 'Largest', file: 'file.v2.docx',
              short: 'a plain v2, beating every “final”'
            },
            {
              icon: 'sparkles', label: 'Sounds final', file: 'file_super_final.docx',
              short: 'and it is the smallest of all'
            }
          ],
          verdict: {
            icon: 'triangle-alert',
            headline: 'Four ways to guess. Four different files.',
            text: 'A file name, a timestamp and a file size are not a history. None of them can say what changed, or why.'
          }
        }
      ]
    },

    /* ======================================== 1-2 · Your own naming rule = */
    {
      id: 'naming',
      nav: { label: 'Your own rule', icon: 'calendar-days' },

      beats: [
        {
          kind: 'scene',
          icon: 'calendar-days',
          text: 'A date, a version number, and discipline. That should fix it.',
          parts: [
            { text: 'YYYY', tone: 'date' },
            { text: 'MM', tone: 'date' },
            { text: 'DD', tone: 'date' },
            { text: '_', tone: 'sep' },
            { text: 'Filename', tone: 'name' },
            { text: '_v', tone: 'ver' },
            { text: 'NN', tone: 'ver' },
            { text: '.ext', tone: 'ext' }
          ],
          confirm: 'Follow the rule'
        },

        {
          kind: 'filePile',
          action: 'Let two weeks pass',
          machine: {
            stem: 'report',
            ext: 'docx',
            counterLabel: 'files',
            /* One entry per save, in the order it happened: which day it was,
               and which version of that day's file it became. Several days
               have more than one, which is the whole point of the `_vNN`
               slot in the rule above. */
            saves: [
              { date: '20260914', v: 1 },
              { date: '20260914', v: 2 },
              { date: '20260915', v: 1 },
              { date: '20260916', v: 1 },
              { date: '20260916', v: 2 },
              { date: '20260916', v: 3 },
              { date: '20260917', v: 1 },
              { date: '20260918', v: 1 },
              { date: '20260918', v: 2 },
              { date: '20260921', v: 1 },
              { date: '20260922', v: 1 },
              { date: '20260922', v: 2 },
              { date: '20260922', v: 3 },
              { date: '20260923', v: 1 }
            ]
          },
          confirm: 'Continue'
        },

        {
          kind: 'painHunt',
          prompt: {
            icon: 'circle-help',
            text: 'Tap every problem this rule still has.'
          },
          foundLabel: 'problems found',
          waitHint: 'Find all five',
          pains: [
            {
              id: 'tedious', icon: 'refresh-cw',
              label: 'Renaming is manual work',
              note: 'Every save needs a new name, typed by hand.'
            },
            {
              id: 'growth', icon: 'layers',
              label: 'Folders keep growing',
              note: 'Versions pile up forever. Nobody deletes any.'
            },
            {
              id: 'why', icon: 'circle-help',
              label: 'The reason is lost',
              note: 'v07 says nothing about what changed or why.'
            },
            {
              id: 'overwrite', icon: 'users',
              label: 'Teammates collide',
              note: 'Two people, one file name, one overwritten afternoon.'
            },
            {
              id: 'rollback', icon: 'undo-2',
              label: 'Rolling back is guesswork',
              note: 'Which old copy is safe to return to? Unknown.'
            }
          ],
          verdict: {
            icon: 'triangle-alert',
            headline: 'A naming rule is not a history.',
            text: 'It renames the mess. It does not record what changed, who changed it, or why.'
          }
        }
      ]
    },

    /* =========================================== 1-3 · The VCS idea ===== */
    {
      id: 'vcs',
      nav: { label: 'The idea', icon: 'database' },

      beats: [
        {
          kind: 'scene',
          icon: 'lightbulb',
          text: 'Stop naming copies. Let a system watch the changes instead.',
          confirm: 'Show me'
        },

        {
          kind: 'pipelineRun',
          action: 'Follow one edit through',
          stages: [
            { icon: 'file-text',             label: 'Files',   note: 'You just edit your work' },
            { icon: 'zap',                   label: 'Changes', note: 'Every edit is noticed' },
            { icon: 'git-commit-horizontal', label: 'Git',     note: 'It records each change' },
            { icon: 'history',               label: 'History', note: 'A timeline you can revisit' }
          ],
          waitHint: 'Play the sequence to continue',
          confirm: 'Continue'
        },

        {
          kind: 'funnelReveal',
          steps: [
            { text: 'Version Control System', short: 'the category' },
            { text: 'VCS', short: 'the acronym' },
            { text: 'Git', short: 'the one you will use' }
          ],
          verdict: {
            icon: 'lightbulb',
            headline: 'Git is a Version Control System.',
            text: 'You edit files. It remembers the story — every change, in order, with a reason attached.'
          }
        }
      ]
    },

    /* ======================================= 1-4 · What Git can do ===== */
    {
      id: 'capabilities',
      nav: { label: 'What Git does', icon: 'sparkles' },

      beats: [
        {
          kind: 'scene',
          icon: 'sparkles',
          text: 'Once the project keeps its own history, six things become possible.',
          confirm: 'Show the six'
        },

        {
          kind: 'capabilityCards',
          flipHint: 'Tap a card',
          backHint: 'Tap to flip back',
          waitHint: 'Flip all six cards',
          cards: [
            {
              id: 'record', icon: 'git-commit-horizontal', label: 'Record history',
              caption: 'Every change, kept in order.', demo: 'commits'
            },
            {
              id: 'travel', icon: 'history', label: 'Go back in time',
              caption: 'Reopen any earlier state.', demo: 'timeline'
            },
            {
              id: 'branch', icon: 'git-branch', label: 'Branch out',
              caption: 'Try ideas without breaking main.', demo: 'branch'
            },
            {
              id: 'merge', icon: 'git-merge', label: 'Bring work together',
              caption: 'Join separate lines of work.', demo: 'merge'
            },
            {
              id: 'team', icon: 'users', label: 'Work as a team',
              caption: 'Share one history, not eight copies.', demo: 'team'
            },
            {
              id: 'automate', icon: 'bot', label: 'Automate the rest',
              caption: 'Run tests and checks on every change.', demo: 'automate'
            }
          ]
        }
      ]
    },

    /* ========================================= 1-5 · Git vs GitHub ===== */
    {
      id: 'git-vs-github',
      nav: { label: 'Git ≠ GitHub', icon: 'git-compare' },

      beats: [
        {
          kind: 'scene',
          icon: 'git-compare',
          text: 'Two names you will hear together constantly. They are not the same thing.',
          confirm: 'Sort them out'
        },

        {
          kind: 'bucketSort',
          prompt: {
            icon: 'mouse-pointer-click',
            text: 'Sort each card into the right column.'
          },
          waitHint: 'Place all eight cards',
          buckets: [
            { id: 'git',      title: 'Git',             subtitle: 'A tool on your computer',        icon: 'laptop' },
            { id: 'platform', title: 'GitHub / GitLab', subtitle: 'Websites that host repositories', icon: 'cloud' }
          ],
          chips: [
            { id: 'tool',    icon: 'git-branch',       label: 'Version control tool', bucket: 'git' },
            { id: 'local',   icon: 'laptop',           label: 'Runs on your machine', bucket: 'git' },
            { id: 'offline', icon: 'zap',              label: 'Works fully offline',  bucket: 'git' },
            { id: 'tracks',  icon: 'history',          label: 'Tracks file history',  bucket: 'git' },
            { id: 'hosting', icon: 'cloud',            label: 'Hosts repos online',   bucket: 'platform' },
            { id: 'pr',      icon: 'git-pull-request', label: 'Pull requests',        bucket: 'platform' },
            { id: 'issues',  icon: 'list-checks',      label: 'Issue tracking',       bucket: 'platform' },
            { id: 'perms',   icon: 'lock',             label: 'Team permissions',     bucket: 'platform' }
          ],
          verdict: {
            icon: 'lightbulb',
            headline: 'Git is the engine. GitHub is a garage.',
            text: 'Git works with no internet and no account. GitHub and GitLab are hosting platforms built around it.'
          }
        }
      ]
    },

    /* ============================================= 1-6 · Chapter quiz == */
    {
      id: 'quiz',
      nav: { label: 'Check yourself', icon: 'badge-check' },

      beats: [
        {
          kind: 'quizRun',
          nextLabel: 'Next question',
          waitHint: 'Answer the statement',
          confirm: 'See the result',
          statements: [
            {
              id: 'q1', icon: 'git-merge',
              text: 'Git can automatically resolve every merge conflict.',
              answer: false,
              why: 'When two people change the same line, only a human can decide the right result.'
            },
            {
              id: 'q2', icon: 'git-compare',
              text: 'Git and GitHub are the same thing.',
              answer: false,
              why: 'Git is a local tool. GitHub is one of several platforms that host Git repositories.'
            },
            {
              id: 'q3', icon: 'history',
              text: 'Git can record the change history of your project.',
              answer: true,
              why: 'That is its whole job: keep every change, in order, with a message.'
            },
            {
              id: 'q4', icon: 'shield-check',
              text: 'Git guarantees your code has zero bugs.',
              answer: false,
              why: 'Git stores what you wrote. It cannot tell whether what you wrote is correct.'
            }
          ],
          verdict: {
            icon: 'badge-check',
            headline: 'Four claims, checked.',
            text: 'Git records history and hands you the tools. It does not think for you.'
          }
        },

        {
          kind: 'finishPanel',
          icon: 'trophy',
          title: 'Chapter 1 complete',
          recap: 'You now know why Git exists — and what it is for.',
          model: [
            { icon: 'file-text',             label: 'You edit files' },
            { icon: 'git-commit-horizontal', label: 'Git records changes' },
            { icon: 'history',               label: 'History grows' }
          ],
          next: 'Next: what exactly does Git manage?',
          confirm: 'Next chapter'
        }
      ]
    }
  ]
};
