/* FakeCoding - Python language module */
(function () {
  'use strict';

  const FC = window.FakeCoding;
  const U = FC.util;
  const IND = '    ';

  const COMMENTS = [
    'Keep this path allocation-free for the hot loop.',
    'Fall back to the cached value when the source is stale.',
    'The upstream service caps payloads at 64 KiB.',
    'Normalize before comparing so ordering stays stable.',
    'Skip empty batches early to avoid extra work.',
    'Bound the retry loop so callers stay responsive.',
    'Flush pending writes before releasing the handle.',
    'This mirrors the server-side validation rules.',
    'Record the offset so the next pass can resume.',
    'Callers are expected to hold the lock.',
    'Log once per batch instead of once per item.',
    'Keep the ordering stable for reproducible output.'
  ];

  const DOCS = [
    'Process one batch and return the number of handled items.',
    'Resolve the target from the cache, falling back to the source.',
    'Validate the payload before it reaches the writer.',
    'Apply the pending changes in a single pass.',
    'Build the index from the current snapshot.',
    'Return the normalized entries for the current scope.'
  ];

  const TYPES = ['int', 'dict', 'list', 'set', 'bool', 'float', 'str'];

  function isNum(t) { return t === 'int' || t === 'float'; }
  function isSeq(t) { return t === 'list' || t === 'set' || t === 'str'; }

  FC.register({
    id: 'python',
    label: 'Python',
    filename: 'main.py',
    icon: 'PY',

    spec: {
      keywords: new Set([
        'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
        'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from',
        'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not',
        'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
        'match', 'case'
      ]),
      literals: new Set(['True', 'False', 'None']),
      types: new Set([
        'int', 'float', 'bool', 'str', 'bytes', 'list', 'dict', 'set', 'tuple',
        'object', 'Any', 'Iterable', 'Iterator', 'Optional', 'Callable',
        'Sequence', 'Mapping', 'NoneType'
      ]),
      selfWords: new Set(['self', 'cls']),
      decorator: true,
      lineComment: '#',
      hashLine: new Set(['import', 'from', 'coding', 'pytest', 'type'])
    },

    create: function (rng, opts) {
      const namer = U.createNamer(rng, 'snake');

      function pad(lines, n) { return U.padTo(lines, n, rng); }

      function initVal(type) {
        switch (type) {
          case 'dict': return '{}';
          case 'list': return '[]';
          case 'set': return 'set()';
          case 'bool': return rng.chance(0.5) ? 'True' : 'False';
          case 'float': return rng.pick(['0.0', '1.0', '0.5']);
          case 'str': return "''";
          default: return String(rng.int(0, 32));
        }
      }

      function ref(v, selfMode) {
        return selfMode && v.field ? 'self.' + v.name : v.name;
      }

      function expr(vars, type, selfMode) {
        const pool = vars.filter(function (v) { return !type || v.type === type; });
        const v = pool.length ? rng.pick(pool) : null;

        if (!v) {
          if (type === 'dict') return '{}';
          if (type === 'list') return '[]';
          if (type === 'set') return 'set()';
          if (type === 'str') return "''";
          if (type === 'bool') return rng.chance(0.5) ? 'True' : 'False';
          if (type === 'float') return rng.pick(['0.0', '1.0']);
          return String(rng.int(0, 100));
        }

        const name = ref(v, selfMode);

        if (v.type === 'dict') return rng.pick([name, 'dict(' + name + ')', name + '.copy()']);
        if (v.type === 'list') return rng.pick([name, 'list(' + name + ')', 'sorted(' + name + ')']);
        if (v.type === 'set') return rng.pick([name, 'set(' + name + ')']);
        if (v.type === 'str') return rng.pick([name, name + '.strip()', name + '.lower()', "''"]);
        if (v.type === 'bool') return rng.pick([name, 'not ' + name]);
        if (v.type === 'float') return rng.pick([name, name + ' * 1.5', 'max(' + name + ', 0.0)']);
        return rng.pick([name, name + ' + 1', 'max(' + name + ', 0)', 'int(' + name + ')', String(rng.int(0, 100))]);
      }

      function cond(vars, selfMode) {
        const v = vars.length ? rng.pick(vars) : null;
        if (!v) return 'True';
        const name = ref(v, selfMode);

        if (v.type === 'bool') return rng.pick([name, 'not ' + name]);
        if (isNum(v.type)) return rng.pick([name + ' > 0', name + ' != 0', name + ' >= 1']);
        if (v.type === 'dict') return rng.pick([name, 'len(' + name + ') > 0', 'not ' + name, 'isinstance(' + name + ', dict)']);
        if (v.type === 'list') return rng.pick([name, 'len(' + name + ') > 0', 'not ' + name, 'isinstance(' + name + ', list)']);
        if (v.type === 'set') return rng.pick([name, 'len(' + name + ') > 0', 'not ' + name]);
        return rng.pick([name, 'not ' + name, "len(" + name + ') > 0']);
      }

      function simple(vars, depth, selfMode) {
        const ind = IND.repeat(depth);
        const r = rng.next();

        if (r < 0.28 || vars.length === 0) {
          const type = rng.pick(TYPES);
          const v = { name: namer.varName(), type: type };
          vars.push(v);
          return ind + ref(v, selfMode) + ' = ' + initVal(type);
        }

        if (r < 0.48) {
          const v = rng.pick(vars);
          let value = expr(vars, v.type, selfMode);
          if (value === ref(v, selfMode)) value = initVal(v.type);
          return ind + ref(v, selfMode) + ' = ' + value;
        }

        if (r < 0.62) {
          return ind + 'logger.debug("' + rng.pick(['processed %s', 'state=%s', 'batch=%s', 'size=%s']) + '", ' + expr(vars, null, selfMode) + ')';
        }

        if (r < 0.76) {
          const lists = vars.filter(function (v) { return v.type === 'list'; });
          if (lists.length) {
            const v = rng.pick(lists);
            return ind + ref(v, selfMode) + '.append(' + expr(vars, 'int', selfMode) + ')';
          }
        }

        if (r < 0.88) {
          const maps = vars.filter(function (v) { return v.type === 'dict'; });
          if (maps.length) {
            const v = rng.pick(maps);
            return ind + ref(v, selfMode) + '.update({"id": ' + rng.int(1, 512) + '})';
          }
        }

        const sets = vars.filter(function (v) { return v.type === 'set'; });
        if (sets.length) {
          const v = rng.pick(sets);
          return ind + ref(v, selfMode) + '.discard(' + expr(vars, 'int', selfMode) + ')';
        }

        return ind + 'logger.debug("' + rng.pick(['done', 'idle', 'skipped']) + '")';
      }

      function genBlock(vars, depth, n, needReturn, selfMode) {
        const out = [];
        const ind = IND.repeat(depth);
        const limit = Math.max(0, n - (needReturn ? 1 : 0));

        while (out.length < limit) {
          const rem = limit - out.length;
          const r = rng.next();

          if (rem >= 4 && vars.length && r < 0.20) {
            out.push(ind + 'if ' + cond(vars, selfMode) + ':');
            out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 1, rng.int(1, 3)), false, selfMode));
            continue;
          }

          if (rem >= 4 && r < 0.32) {
            const iv = namer.varName();
            out.push(ind + 'for ' + iv + ' in range(' + rng.int(1, 12) + '):');
            out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 1, rng.int(1, 3)), false, selfMode));
            continue;
          }

          if (rem >= 5 && r < 0.40) {
            const iterable = vars.filter(function (v) { return isSeq(v.type) || v.type === 'dict'; });
            if (iterable.length) {
              const v = rng.pick(iterable);
              const iv = namer.varName();
              let line;
              if (v.type === 'dict') line = 'for ' + iv + ', ' + iv + 'Value in ' + ref(v, selfMode) + '.items():';
              else line = 'for ' + iv + ' in ' + ref(v, selfMode) + ':';
              out.push(ind + line);
              out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 1, rng.int(1, 3)), false, selfMode));
              continue;
            }
          }

          if (rem >= 5 && r < 0.47 && selfMode) {
            out.push(ind + 'with self._lock:');
            out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 1, rng.int(1, 3)), false, selfMode));
            continue;
          }

          if (rem >= 7 && r < 0.54) {
            out.push(ind + 'try:');
            out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 4, rng.int(1, 3)), false, selfMode));
            out.push(ind + 'except ValueError as exc:');
            out.push(ind + IND + 'logger.warning("invalid input: %s", exc)');
            continue;
          }

          if (r < 0.82) {
            out.push(simple(vars, depth, selfMode));
            continue;
          }

          if (opts.comments && r < 0.93) {
            out.push(ind + '# ' + rng.pick(COMMENTS));
            continue;
          }

          out.push('');
        }

        if (needReturn) {
          out.push(ind + 'return ' + expr(vars, null, selfMode));
        }

        if (!out.length || out.every(function (l) { return l.trim() === ''; })) {
          out.unshift(ind + 'pass');
        }

        while (out.length < n) out.push('');
        return out;
      }

      function params(vars) {
        function reqStr() { const v = { name: namer.varName(), type: 'str' }; vars.push(v); return v.name + ': str'; }
        function reqDict() { const v = { name: namer.varName(), type: 'dict' }; vars.push(v); return v.name + ': dict'; }
        function reqList() { const v = { name: namer.varName(), type: 'list' }; vars.push(v); return v.name + ': list'; }
        function optInt() { const v = { name: namer.varName(), type: 'int' }; vars.push(v); return v.name + ': int = 0'; }
        function optBool() { const v = { name: namer.varName(), type: 'bool' }; vars.push(v); return v.name + ': bool = False'; }
        function optStr() { const v = { name: namer.varName(), type: 'str' }; vars.push(v); return v.name + ": str = ''"; }

        const total = rng.int(0, 3);
        const required = rng.shuffle([reqStr, reqDict, reqList]);
        const optional = rng.shuffle([optInt, optBool, optStr]);

        const nReq = total <= 2 ? rng.int(0, total) : rng.int(1, 2);
        const nOpt = Math.min(total - nReq, optional.length);

        return required.slice(0, nReq).concat(optional.slice(0, nOpt))
          .map(function (f) { return f(); }).join(', ');
      }

      function docstring(ind) {
        return IND.repeat(ind) + '"""' + U.cap(rng.pick(DOCS)) + '"""';
      }

      function fnUnit(budget) {
        const vars = [];
        const parts = [];
        const name = namer.fn();

        if (opts.comments && rng.chance(0.4)) parts.push(['# ' + rng.pick(COMMENTS)]);

        const plist = params(vars);
        parts.push(['def ' + name + '(' + (plist || '') + '):']);

        if (opts.comments && rng.chance(0.6)) parts.push([docstring(1)]);

        if (budget < 3) return pad([], budget);

        let total = 0;
        parts.forEach(function (p) { total += p.length; });
        while (total + 1 > budget && parts.length > 1) total -= parts.shift().length;

        const head = [].concat.apply([], parts);
        const bodyN = budget - head.length;
        if (bodyN < 1) return pad(head, budget);

        return pad(head.concat(genBlock(vars, 1, bodyN, rng.chance(0.7), false)), budget);
      }

      function classUnit(budget) {
        const cls = namer.cls();
        const head = [];
        const attrs = [];

        if (opts.comments && rng.chance(0.4)) head.push('# ' + rng.pick(COMMENTS));
        head.push('class ' + cls + ':');
        if (opts.comments) head.push(docstring(1));

        const attrCount = rng.int(1, 3);
        for (let i = 0; i < attrCount; i++) {
          attrs.push({ name: namer.varName(), type: rng.pick(['dict', 'list', 'int', 'set']), field: true });
        }

        const init = ['', IND + 'def __init__(self) -> None:'];
        init.push(IND + IND + 'self._lock = threading.Lock()');
        attrs.forEach(function (a) {
          init.push(IND + IND + 'self.' + a.name + ' = ' + initVal(a.type));
        });

        const fixed = head.length + init.length;
        if (fixed + 1 >= budget) {
          const small = ['class ' + cls + ':', IND + 'pass'];
          return pad(small, budget);
        }

        const out = head.concat(init);
        let remaining = budget - fixed - 1;
        const methodCount = rng.int(1, 2);

        for (let m = 0; m < methodCount && remaining > 6; m++) {
          const vars = attrs.slice();
          const mhead = ['', IND + 'def ' + namer.fn() + '(self' + (rng.chance(0.5) ? ', value: int = 0' : '') + '):'];
          if (rng.chance(0.5)) mhead.push(docstring(2));

          const bodyN = Math.min(remaining - mhead.length, rng.int(3, 9));
          if (bodyN < 1) break;

          const body = genBlock(vars, 2, bodyN, rng.chance(0.8), true);
          out.push.apply(out, mhead);
          out.push.apply(out, body);
          remaining -= mhead.length + body.length;
        }

        out.push('');
        return pad(out, budget);
      }

      function unit(budget) {
        if (budget < 4) return pad([], budget);
        if (budget >= 16 && rng.chance(0.22)) return classUnit(budget);
        return fnUnit(budget);
      }

      function begin() {
        return [
          'import os',
          'import sys',
          'import json',
          'import time',
          'import logging',
          'import threading',
          'from dataclasses import dataclass, field',
          'from typing import Any, Iterable',
          '',
          'logger = logging.getLogger(__name__)',
          '',
          'DEFAULT_TIMEOUT = 30',
          'MAX_RETRIES = 5',
          'BATCH_SIZE = 256',
          '',
          '',
          '@dataclass',
          'class Config:',
          '    name: str',
          '    retries: int = MAX_RETRIES',
          '    tags: list[str] = field(default_factory=list)',
          ''
        ];
      }

      function end() {
        return [
          '',
          '',
          'def main() -> int:',
          '    logging.basicConfig(level=logging.INFO)',
          '    config = Config(name="default")',
          '    logger.info("starting with %s", config.name)',
          '    return 0',
          '',
          '',
          'if __name__ == "__main__":',
          '    sys.exit(main())'
        ];
      }

      return { begin: begin, unit: unit, end: end };
    }
  });
})();
