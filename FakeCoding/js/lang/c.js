/* FakeCoding - C language module */
(function () {
  'use strict';

  const FC = window.FakeCoding;
  const U = FC.util;
  const IND = '    ';

  const COMMENTS = [
    'Reset the cursor before reading the next record.',
    'Guard against a null pointer from the upstream call.',
    'Keep the retry window short so callers stay responsive.',
    'Copy the payload into the local buffer first.',
    'Skip entries that were already processed.',
    'Bound the loop to avoid an unbounded scan.',
    'Flush pending writes before releasing the lock.',
    'Fall back to the default policy on unknown input.',
    'Track the offset so the next pass can resume.',
    'Release resources on every early exit path.',
    'Normalize the length before the checksum pass.',
    'Log once per batch instead of per item.'
  ];

  FC.register({
    id: 'c',
    label: 'C',
    filename: 'main.c',
    icon: 'C',

    spec: {
      keywords: new Set([
        'auto', 'break', 'case', 'const', 'continue', 'default', 'do', 'else',
        'enum', 'extern', 'for', 'goto', 'if', 'inline', 'register', 'restrict',
        'return', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
        'volatile', 'while'
      ]),
      types: new Set([
        'void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed',
        'unsigned', 'bool', 'size_t', 'ssize_t', 'uint8_t', 'uint16_t',
        'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t'
      ]),
      literals: new Set(['NULL', 'true', 'false']),
      lineComment: '//',
      blockComment: ['/*', '*/'],
      hashLine: new Set(['include', 'define', 'ifdef', 'ifndef', 'endif', 'pragma', 'undef'])
    },

    create: function (rng, opts) {
      const namer = U.createNamer(rng, 'snake');

      function pad(lines, n) {
        return U.padTo(lines, n, rng);
      }

      function pickVar(vars) {
        return vars.length ? rng.pick(vars) : null;
      }

      function isPtr(type) {
        return type.indexOf('*') >= 0;
      }

      function expr(vars, type) {
        const pool = vars.filter(function (v) {
          if (type && v.type !== type) return false;
          return !isPtr(v.type);
        });
        const v = pool.length ? rng.pick(pool) : null;
        if (!v) {
          if (type && isPtr(type)) return rng.pick(['NULL', 'data + offset', 'buffer + length']);
          return String(rng.int(0, 255));
        }
        return rng.pick([
          v.name,
          v.name + ' + ' + rng.int(1, 32),
          v.name + ' * 2',
          '(' + v.name + ' >> 1)',
          v.name + ' & 0x' + rng.int(1, 255).toString(16),
          String(rng.int(0, 255))
        ]);
      }

      function cond(vars) {
        const v = pickVar(vars);
        if (!v) return rng.chance(0.5) ? '1' : '0';
        if (isPtr(v.type)) {
          return rng.pick([v.name + ' != NULL', v.name + ' == NULL']);
        }
        return rng.pick([
          v.name + ' > 0',
          v.name + ' != 0',
          v.name + ' >= ' + rng.int(1, 8),
          '(' + v.name + ' & 0x04) != 0'
        ]);
      }

      function initVal(type) {
        if (type === 'double') return rng.pick(['0.0', '1.0', '0.5']);
        if (type === 'bool') return rng.chance(0.5) ? 'true' : 'false';
        if (type === 'uint32_t') return '0x' + rng.int(1, 255).toString(16) + 'u';
        return String(rng.int(0, 64));
      }

      function retExpr(vars, type) {
        if (type === 'bool') return rng.chance(0.5) ? 'true' : 'false';
        if (type === 'double') return rng.pick(['0.0', '1.0']);
        if (type === 'void') return '';
        const pool = vars.filter(function (v) { return !isPtr(v.type) && v.type === type; });
        if (pool.length && rng.chance(0.55)) return rng.pick(pool).name;
        return String(rng.int(0, 64));
      }

      function simple(vars, depth) {
        const ind = IND.repeat(depth);
        const r = rng.next();

        if (r < 0.36 || vars.length === 0) {
          const type = rng.pick(['int', 'size_t', 'uint32_t', 'double', 'bool']);
          const v = { name: namer.varName(), type: type };
          vars.push(v);
          return ind + type + ' ' + v.name + ' = ' + initVal(type) + ';';
        }

        if (r < 0.55) {
          const v = pickVar(vars);
          let value = expr(vars, v.type);
          if (value === v.name) value = initVal(v.type);
          return ind + v.name + ' = ' + value + ';';
        }

        if (r < 0.74) {
          const v = pickVar(vars);
          const fmt = v.type === 'double' ? '%f'
            : (isPtr(v.type) ? '%p' : (v.type === 'size_t' ? '%zu' : (v.type === 'uint32_t' ? '%u' : '%d')));
          return ind + 'printf("' + fmt + '\\n", ' + v.name + ');';
        }

        if (r < 0.88) {
          const v = pickVar(vars);
          if (isPtr(v.type)) return ind + 'memset(' + v.name + ', 0, sizeof(*' + v.name + '));';
          return ind + 'memset(&' + v.name + ', 0, sizeof(' + v.name + '));';
        }

        return ind + 'fprintf(stderr, "unexpected state: %d\\n", ' + String(rng.int(0, 16)) + ');';
      }

      function genBlock(vars, depth, n, ret) {
        const out = [];
        const ind = IND.repeat(depth);
        const needReturn = ret !== 'void';
        const limit = Math.max(0, n - (needReturn ? 1 : 0));

        while (out.length < limit) {
          const rem = limit - out.length;
          const r = rng.next();

          if (rem >= 5 && vars.length && r < 0.20) {
            const inner = Math.min(rem - 2, rng.int(1, 4));
            out.push(ind + 'if (' + cond(vars) + ') {');
            Array.prototype.push.apply(out, genBlock(vars.slice(), depth + 1, inner, 'void'));
            out.push(ind + '}');
            continue;
          }

          if (rem >= 5 && r < 0.32) {
            const iv = namer.varName();
            const inner = Math.min(rem - 2, rng.int(1, 4));
            out.push(ind + 'for (size_t ' + iv + ' = 0; ' + iv + ' < ' + rng.int(2, 16) + '; ' + iv + '++) {');
            Array.prototype.push.apply(out, genBlock(vars.slice(), depth + 1, inner, 'void'));
            out.push(ind + '}');
            continue;
          }

          if (rem >= 5 && vars.length && r < 0.40) {
            const inner = Math.min(rem - 2, rng.int(1, 3));
            out.push(ind + 'while (' + cond(vars) + ') {');
            Array.prototype.push.apply(out, genBlock(vars.slice(), depth + 1, inner, 'void'));
            out.push(ind + '}');
            continue;
          }

          if (rem >= 7 && r < 0.46 && vars.length) {
            const v = pickVar(vars);
            const cases = Math.min(2, Math.floor((rem - 4) / 3));
            out.push(ind + 'switch (' + v.name + ' & 0x03) {');
            for (let c = 0; c < cases; c++) {
              out.push(ind + 'case ' + c + ':');
              out.push(simple(vars, depth + 1));
              out.push(ind + IND + 'break;');
            }
            out.push(ind + 'default:');
            out.push(ind + IND + 'break;');
            out.push(ind + '}');
            continue;
          }

          if (r < 0.76) {
            out.push(simple(vars, depth));
            continue;
          }

          if (opts.comments && r < 0.90) {
            out.push(ind + '// ' + rng.pick(COMMENTS));
            continue;
          }

          out.push('');
        }

        if (needReturn) out.push(ind + 'return ' + retExpr(vars, ret) + ';');
        else if (!out.length || out.every(function (l) { return l.trim() === ''; })) {
          out.unshift(ind + '/* no-op */');
        }
        while (out.length < n) out.push('');
        return out;
      }

      function params(vars) {
        const pool = [
          function () { const v = { name: namer.varName(), type: 'int' }; vars.push(v); return 'int ' + v.name; },
          function () { const v = { name: namer.varName(), type: 'size_t' }; vars.push(v); return 'size_t ' + v.name; },
          function () { const v = { name: namer.varName(), type: 'const char *' }; vars.push(v); return 'const char *' + v.name; },
          function () { const v = { name: namer.varName(), type: 'void *' }; vars.push(v); return 'void *' + v.name; },
          function () { const v = { name: namer.varName(), type: 'struct context *' }; vars.push(v); return 'struct context *' + v.name; }
        ];
        const n = rng.int(0, 3);
        const picked = rng.shuffle(pool).slice(0, n);
        if (!picked.length) return 'void';
        return picked.map(function (f) { return f(); }).join(', ');
      }

      function unit(budget) {
        if (budget < 4) return pad([], budget);

        const vars = [];
        const name = namer.fn();
        const ret = rng.pick(['int', 'int', 'int', 'size_t', 'bool', 'uint32_t', 'void']);
        const plist = params(vars);

        const head = [];
        if (opts.comments && rng.chance(0.55)) head.push('// ' + rng.pick(COMMENTS));
        head.push('static ' + ret + ' ' + name + '(' + plist + ') {');

        const bodyN = budget - head.length - 1;
        if (bodyN < 1) {
          return pad(['static void ' + namer.fn() + '(void) {', '}'], budget);
        }

        const body = genBlock(vars, 1, bodyN, ret);
        return pad(head.concat(body, ['}']), budget);
      }

      function begin() {
        return [
          '#include <stdio.h>',
          '#include <stdlib.h>',
          '#include <string.h>',
          '#include <stdint.h>',
          '#include <stdbool.h>',
          '',
          '#define MAX_RETRIES 8',
          '#define BUF_SIZE 4096',
          '#define FLAG_DIRTY 0x01',
          '#define FLAG_READY 0x02',
          '',
          'struct context {',
          '    uint32_t flags;',
          '    size_t length;',
          '    void *data;',
          '};',
          '',
          'typedef struct context context_t;',
          ''
        ];
      }

      function end() {
        return [
          '',
          'int main(int argc, char **argv) {',
          '    context_t ctx = {0};',
          '    (void)argc;',
          '    (void)argv;',
          '    return 0;',
          '}'
        ];
      }

      return { begin: begin, unit: unit, end: end };
    }
  });
})();
