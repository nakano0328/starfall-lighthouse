import type { Flags } from './flags';

/**
 * Evaluates the one-clause condition grammar from docs/GAME_DESIGN.md §9.3:
 *   `flag.key`            truthy (Flags.has)
 *   `!flag.key`           falsy
 *   `flag.key>=3`         numeric compare (>=, >, <=, <, ==, !=)
 *   `flag.key=='low'`     string compare (single or double quotes; == or !=)
 *   `flag.key==true`      boolean compare
 * Whitespace around the operator is allowed. Throws on malformed input so bad
 * data is caught by tests rather than silently evaluating to false.
 */
const KEY = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;
const COMPARE = /^([a-z][a-z0-9_.]*)\s*(>=|<=|==|!=|>|<)\s*(.+)$/;

export class ConditionError extends Error {
  constructor(cond: string, message: string) {
    super(`condition "${cond}": ${message}`);
    this.name = 'ConditionError';
  }
}

export function validateCondition(cond: string): void {
  parse(cond);
}

export function evaluateCondition(cond: string, flags: Flags): boolean {
  const parsed = parse(cond);
  switch (parsed.kind) {
    case 'truthy':
      return flags.has(parsed.key);
    case 'falsy':
      return !flags.has(parsed.key);
    case 'compare': {
      const actual = flags.peek(parsed.key);
      const expected = parsed.value;
      switch (parsed.op) {
        case '==':
          return actual === expected;
        case '!=':
          return actual !== expected;
        default: {
          if (typeof expected !== 'number') return false;
          const n = typeof actual === 'number' ? actual : 0;
          if (parsed.op === '>=') return n >= expected;
          if (parsed.op === '>') return n > expected;
          if (parsed.op === '<=') return n <= expected;
          return n < expected;
        }
      }
    }
  }
}

type Parsed =
  | { kind: 'truthy'; key: string }
  | { kind: 'falsy'; key: string }
  | {
      kind: 'compare';
      key: string;
      op: '>=' | '<=' | '==' | '!=' | '>' | '<';
      value: string | number | boolean;
    };

function parse(raw: string): Parsed {
  const cond = raw.trim();
  if (cond === '') throw new ConditionError(raw, 'empty');
  const m = COMPARE.exec(cond);
  if (m) {
    const [, key, op, rhs] = m as unknown as [
      string,
      string,
      Parsed extends { op: infer O } ? O : never,
      string,
    ];
    if (!KEY.test(key)) throw new ConditionError(raw, `bad flag key "${key}"`);
    const value = parseValue(raw, rhs.trim());
    if (op !== '==' && op !== '!=' && typeof value !== 'number') {
      throw new ConditionError(raw, 'ordering operators need a number');
    }
    return { kind: 'compare', key, op, value };
  }
  if (cond.startsWith('!')) {
    const key = cond.slice(1).trim();
    if (!KEY.test(key)) throw new ConditionError(raw, `bad flag key "${key}"`);
    return { kind: 'falsy', key };
  }
  if (!KEY.test(cond)) throw new ConditionError(raw, `bad flag key "${cond}"`);
  return { kind: 'truthy', key: cond };
}

function parseValue(raw: string, rhs: string): string | number | boolean {
  if (rhs === 'true') return true;
  if (rhs === 'false') return false;
  const quoted = /^(['"])(.*)\1$/.exec(rhs);
  if (quoted) return quoted[2] ?? '';
  if (/^-?\d+(\.\d+)?$/.test(rhs)) return Number(rhs);
  throw new ConditionError(raw, `bad value ${rhs}`);
}
