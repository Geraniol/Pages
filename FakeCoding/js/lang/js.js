/* FakeCoding - JavaScript language module */
(function () {
  'use strict';

  const FC = window.FakeCoding;
  const U = FC.util;
  const IND = '  ';

  const COMMENTS = [
    'Keep this branch allocation-free for the hot path.',
    'Fall back to the cached value when the source is stale.',
    'The upstream service caps payloads at 64 KiB.',
    'Normalize before comparing so ordering stays stable.',
    'Skip empty batches early to avoid extra work.',
    'Bound the retry loop so callers stay responsive.',
    'Flush pending writes before releasing the handle.',
    'This mirrors the server-side validation rules.',
    'Record the offset so the next pass can resume.',
    'Callers are expected to await the returned promise.',
    'Log once per batch instead of once per item.',
    'Keep the ordering stable for reproducible output.'
  ];

  const TYPES = ['object', 'array', 'map', 'set', 'number', 'string', 'bool'];

  FC.register({
    id: 'js',
    label: 'JavaScript',
    filename: 'main.js',
    icon: 'JS',

    spec: {
      keywords: new Set([
        'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
        'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends',
        'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof',
        'let', 'new', 'of', 'return', 'static', 'super', 'switch', 'throw',
        'try', 'typeof', 'var', 'void', 'while', 'yield'
      ]),
      literals: new Set(['true', 'false', 'null', 'undefined', 'this', 'NaN']),
      types: new Set([
        'Array', 'Object', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
        'Number', 'String', 'Boolean', 'JSON', 'Math', 'Date', 'Error',
        'Symbol', 'BigInt', 'RegExp', 'Buffer', 'Uint8Array'
      ]),
      lineComment: '//',
      blockComment: ['/*', '*/'],
      template: true
    },

    create: function (rng, opts) {
      const namer = U.createNamer(rng, 'camel');

      function pad(lines, n) { return U.padTo(lines, n, rng); }

      function initVal(type) {
        switch (type) {
          case 'object': return '{}';
          case 'array': return '[]';
          case 'map': return 'new Map()';
          case 'set': return 'new Set()';
          case 'string': return "''";
          case 'bool': return rng.chance(0.5) ? 'true' : 'false';
          case 'number': return String(rng.int(0, 32));
          default: return 'null';
        }
      }

      function ref(v, selfMode) {
        return selfMode && v.field ? 'this.' + v.name : v.name;
      }

      function expr(vars, type, selfMode) {
        const pool = vars.filter(function (v) { return !type || v.type === type; });
        const v = pool.length ? rng.pick(pool) : null;

        if (!v) {
          if (type === 'array') return '[]';
          if (type === 'object') return '{}';
          if (type === 'string') return "''";
          if (type === 'bool') return rng.chance(0.5) ? 'true' : 'false';
          if (type === 'map') return 'new Map()';
          if (type === 'set') return 'new Set()';
          return String(rng.int(0, 100));
        }

        const name = ref(v, selfMode);

        if (v.type === 'array') return rng.pick([name, name + '.slice()', 'Array.from(' + name + ')']);
        if (v.type === 'object') return rng.pick([name, '{ ...' + name + ' }']);
        if (v.type === 'map') return rng.pick([name, 'new Map(' + name + ')']);
        if (v.type === 'set') return rng.pick([name, 'new Set(' + name + ')']);
        if (v.type === 'string') return rng.pick([name, name + '.trim()', "''"]);
        if (v.type === 'bool') return rng.pick([name, '!' + name]);
        return rng.pick([name, name + ' + 1', 'Number(' + name + ') || 0', String(rng.int(0, 100))]);
      }

      function cond(vars, selfMode) {
        const v = vars.length ? rng.pick(vars) : null;
        if (!v) return 'true';
        const name = ref(v, selfMode);

        if (v.type === 'array') return rng.pick(['Array.isArray(' + name + ')', name + '.length > 0', name + '.length === 0']);
        if (v.type === 'map' || v.type === 'set') return rng.pick([name + '.size > 0', name + '.size === 0']);
        if (v.type === 'string') return rng.pick([name + '.length > 0', name + " === ''", '!' + name]);
        if (v.type === 'bool') return rng.pick([name, '!' + name]);
        if (v.type === 'object') return rng.pick([name + ' != null', 'Object.keys(' + name + ').length > 0']);
        return rng.pick([name + ' > 0', name + ' !== 0', name + ' != null']);
      }

      function simple(vars, depth, allowAwait, selfMode) {
        const ind = IND.repeat(depth);
        const r = rng.next();

        if (r < 0.28 || vars.length === 0) {
          const type = rng.pick(TYPES);
          const v = { name: namer.varName(), type: type };
          vars.push(v);
          const kw = rng.pick(['const', 'const', 'let']);
          return ind + kw + ' ' + ref(v, selfMode) + ' = ' + initVal(type) + ';';
        }

        if (r < 0.48) {
          const v = rng.pick(vars);
          let value = expr(vars, v.type, selfMode);
          if (value === ref(v, selfMode)) value = initVal(v.type);
          return ind + ref(v, selfMode) + ' = ' + value + ';';
        }

        if (r < 0.60) {
          return ind + 'console.debug("' + rng.pick(['processed %d', 'state=%s', 'batch=%d', 'size=%d']) + '", ' + expr(vars, null, selfMode) + ');';
        }

        if (r < 0.72) {
          const arrays = vars.filter(function (v) { return v.type === 'array'; });
          if (arrays.length) {
            const v = rng.pick(arrays);
            return ind + ref(v, selfMode) + '.push(' + expr(vars, 'number', selfMode) + ');';
          }
        }

        if (r < 0.84) {
          const maps = vars.filter(function (v) { return v.type === 'map'; });
          if (maps.length) {
            const v = rng.pick(maps);
            return ind + ref(v, selfMode) + ".set('id', " + expr(vars, 'number', selfMode) + ');';
          }
        }

        if (allowAwait) {
          return ind + 'await Promise.resolve(' + expr(vars, null, selfMode) + ');';
        }
        const nums = vars.filter(function (v) { return v.type === 'number'; });
        if (nums.length) return ind + ref(rng.pick(nums), selfMode) + ' += 1;';
        return ind + 'console.debug("' + rng.pick(['idle', 'done', 'skipped']) + '");';
      }

      function genBlock(vars, depth, n, needReturn, allowAwait, selfMode) {
        const out = [];
        const ind = IND.repeat(depth);
        const limit = Math.max(0, n - (needReturn ? 1 : 0));

        while (out.length < limit) {
          const rem = limit - out.length;
          const r = rng.next();

          if (rem >= 4 && vars.length && r < 0.16) {
            out.push(ind + 'if (' + cond(vars, selfMode) + ') {');
            out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 2, rng.int(1, 3)), false, allowAwait, selfMode));
            out.push(ind + '}');
            continue;
          }

          if (rem >= 5 && r < 0.26) {
            const arrays = vars.filter(function (v) { return v.type === 'array'; });
            if (arrays.length) {
              const iv = namer.varName();
              out.push(ind + 'for (const ' + iv + ' of ' + ref(rng.pick(arrays), selfMode) + ') {');
              out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 2, rng.int(1, 3)), false, allowAwait, selfMode));
              out.push(ind + '}');
              continue;
            }
          }

          if (rem >= 5 && r < 0.34) {
            const iv = namer.varName();
            out.push(ind + 'for (let ' + iv + ' = 0; ' + iv + ' < ' + rng.int(2, 16) + '; ' + iv + '++) {');
            out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 2, rng.int(1, 3)), false, allowAwait, selfMode));
            out.push(ind + '}');
            continue;
          }

          if (rem >= 6 && r < 0.42) {
            const maps = vars.filter(function (v) { return v.type === 'map'; });
            if (maps.length) {
              const iv = namer.varName();
              out.push(ind + 'for (const [' + iv + ', ' + iv + 'Value] of ' + ref(rng.pick(maps), selfMode) + '.entries()) {');
              out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 2, rng.int(1, 2)), false, allowAwait, selfMode));
              out.push(ind + '}');
              continue;
            }
          }

          if (rem >= 6 && r < 0.50) {
            const arrays = vars.filter(function (v) { return v.type === 'array'; });
            if (arrays.length) {
              const iv = namer.varName();
              out.push(ind + 'const ' + iv + ' = ' + ref(rng.pick(arrays), selfMode) + '.map((entry) => ({');
              out.push(ind + IND + 'id: entry.id,');
              out.push(ind + IND + 'value: entry.value,');
              out.push(ind + '}));');
              vars.push({ name: iv, type: 'array' });
              continue;
            }
          }

          if (rem >= 8 && r < 0.56) {
            out.push(ind + 'try {');
            out.push.apply(out, genBlock(vars.slice(), depth + 1, Math.min(rem - 4, rng.int(1, 3)), false, allowAwait, selfMode));
            out.push(ind + '} catch (err) {');
            out.push(ind + IND + 'console.warn("request failed", err);');
            out.push(ind + '}');
            continue;
          }

          if (allowAwait && rem >= 5 && r < 0.62) {
            const arrays = vars.filter(function (v) { return v.type === 'array'; });
            if (arrays.length) {
              out.push(ind + 'await Promise.all(');
              out.push(ind + IND + ref(rng.pick(arrays), selfMode) + '.map((item) => this.process(item)),');
              out.push(ind + ');');
              continue;
            }
          }

          if (r < 0.84) {
            out.push(simple(vars, depth, allowAwait, selfMode));
            continue;
          }

          if (opts.comments && r < 0.94) {
            out.push(ind + '// ' + rng.pick(COMMENTS));
            continue;
          }

          out.push('');
        }

        if (needReturn) {
          const pool = vars.filter(function (v) {
            return v.type === 'number' || v.type === 'array' || v.type === 'object' || v.type === 'string';
          });
          const value = pool.length && rng.chance(0.6)
            ? ref(rng.pick(pool), selfMode)
            : rng.pick(['null', 'true', 'false', '0', '[]', '{}']);
          out.push(ind + 'return ' + value + ';');
        } else if (!out.length || out.every(function (l) { return l.trim() === ''; })) {
          out.unshift(ind + 'void 0;');
        }

        while (out.length < n) out.push('');
        return out;
      }

      function trimParts(parts, budget, reserved) {
        let total = 0;
        parts.forEach(function (p) { total += p.length; });
        while (total + reserved > budget && parts.length > 1) {
          total -= parts.shift().length;
        }
        return [].concat.apply([], parts);
      }

      function params(vars) {
        const pool = [
          function () { const v = { name: namer.varName(), type: 'string' }; vars.push(v); return v.name; },
          function () { const v = { name: namer.varName(), type: 'number' }; vars.push(v); return v.name + ' = 0'; },
          function () { const v = { name: namer.varName(), type: 'array' }; vars.push(v); return v.name + ' = []'; },
          function () { const v = { name: namer.varName(), type: 'object' }; vars.push(v); return v.name + ' = {}'; }
        ];
        const n = rng.int(0, 3);
        return rng.shuffle(pool).slice(0, n).map(function (f) { return f(); }).join(', ');
      }

      function fnUnit(budget) {
        const vars = [];
        const name = namer.fn();
        const isAsync = rng.chance(0.3);
        const parts = [];

        if (opts.comments && rng.chance(0.4)) parts.push(['// ' + rng.pick(COMMENTS)]);
        if (opts.comments && rng.chance(0.5)) {
          parts.push([
            '/**',
            ' * ' + U.cap(rng.pick([
              'Process one batch and return the handled entries.',
              'Resolve the target from the cache, falling back to the source.',
              'Validate the payload before it reaches the writer.',
              'Apply the pending changes in a single pass.'
            ])),
            ' * @returns {Promise<object> | object}',
            ' */'
          ]);
        }

        const plist = params(vars);
        parts.push([(isAsync ? 'async ' : '') + 'function ' + name + '(' + (plist || '') + ') {']);

        if (budget < 3) return pad([], budget);

        const head = trimParts(parts, budget, 1);
        const bodyN = budget - head.length - 1;
        if (bodyN < 1) return pad(head.concat(['}']), budget);

        const body = genBlock(vars, 1, bodyN, rng.chance(0.75), isAsync, false);
        return pad(head.concat(body, ['}']), budget);
      }

      function classUnit(budget) {
        const cls = namer.cls();
        const head = [];
        const fields = [];

        if (opts.comments && rng.chance(0.4)) head.push('// ' + rng.pick(COMMENTS));
        head.push('class ' + cls + ' {');

        const ctor = [IND + 'constructor(options = {}) {'];
        ctor.push(IND + IND + 'this.options = options;');
        const fieldCount = rng.int(1, 3);
        for (let i = 0; i < fieldCount; i++) {
          const f = { name: namer.varName(), type: rng.pick(['object', 'array', 'map', 'number']), field: true };
          fields.push(f);
          ctor.push(IND + IND + 'this.' + f.name + ' = ' + initVal(f.type) + ';');
        }
        ctor.push(IND + '}');

        const fixed = head.length + ctor.length;
        if (fixed + 2 >= budget) {
          let small;
          if (budget >= 4) {
            small = ['class ' + cls + ' {', IND + 'constructor(options = {}) {', IND + '}', '}'];
          } else if (budget >= 3) {
            small = ['class ' + cls + ' {', IND + 'constructor() {}', '}'];
          } else {
            small = ['class ' + cls + ' {', '}'];
          }
          return pad(small, budget);
        }

        const out = head.concat(ctor);
        let remaining = budget - fixed - 1;
        const methodCount = rng.int(1, 2);

        for (let m = 0; m < methodCount && remaining > 6; m++) {
          const vars = fields.slice();
          const mhead = ['', IND + 'async ' + namer.fn() + '(' + params(vars) + ') {'];
          const bodyN = Math.min(remaining - mhead.length - 1, rng.int(3, 9));
          if (bodyN < 1) break;
          const body = genBlock(vars, 2, bodyN, rng.chance(0.8), true, true);
          out.push.apply(out, mhead);
          out.push.apply(out, body);
          out.push(IND + '}');
          remaining -= mhead.length + body.length + 1;
        }

        out.push('}');
        return pad(out, budget);
      }

      function unit(budget) {
        if (budget < 4) return pad([], budget);
        if (budget >= 16 && rng.chance(0.22)) return classUnit(budget);
        return fnUnit(budget);
      }

      function begin() {
        return [
          "'use strict';",
          '',
          "import { EventEmitter } from 'node:events';",
          "import { setTimeout as delay } from 'node:timers/promises';",
          '',
          'const DEFAULT_TIMEOUT = 30000;',
          'const MAX_RETRIES = 5;',
          'const BATCH_SIZE = 256;',
          'const CACHE_TTL = 60_000;',
          '',
          'const RETRYABLE = new Set([',
          "  'ECONNRESET',",
          "  'ETIMEDOUT',",
          "  'EAGAIN',",
          ']);',
          ''
        ];
      }

      function end() {
        return [
          '',
          'export { DEFAULT_TIMEOUT, MAX_RETRIES, BATCH_SIZE };'
        ];
      }

      return { begin: begin, unit: unit, end: end };
    }
  });
})();
