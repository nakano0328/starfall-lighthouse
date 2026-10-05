/**
 * Story/progress flags. A flat key → value map keeps save data simple and
 * makes "has the player done X" checks trivial from any scene or script.
 *
 * Keys are free-form strings but should follow `area.event` naming, e.g.
 * `minato.talked_to_grandpa`, `forest.boss_defeated`, `fragments.count`.
 */
export type FlagValue = boolean | number | string;
export type FlagMap = Record<string, FlagValue>;

export class Flags {
  private readonly map: FlagMap;

  constructor(initial: FlagMap = {}) {
    this.map = { ...initial };
  }

  /** True when the flag exists and is not `false`, `0` or `''`. */
  has(key: string): boolean {
    const v = this.map[key];
    return v !== undefined && v !== false && v !== 0 && v !== '';
  }

  /** Raw value, or undefined when the flag was never set. */
  peek(key: string): FlagValue | undefined {
    return this.map[key];
  }

  get<T extends FlagValue = FlagValue>(key: string, fallback: T): T {
    const v = this.map[key];
    return (v === undefined ? fallback : v) as T;
  }

  set(key: string, value: FlagValue): void {
    this.map[key] = value;
  }

  /** Numeric increment helper (e.g. counting collected star fragments). */
  increment(key: string, by = 1): number {
    const current = this.map[key];
    const base = typeof current === 'number' ? current : 0;
    const next = base + by;
    this.map[key] = next;
    return next;
  }

  clear(key: string): void {
    delete this.map[key];
  }

  /** Plain-object snapshot for serialisation. */
  toJSON(): FlagMap {
    return { ...this.map };
  }
}
