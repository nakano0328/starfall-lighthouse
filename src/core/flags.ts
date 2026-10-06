/**
 * Story/progress flags. A flat key → value map keeps save data simple and
 * makes "has the player done X" checks trivial from any scene or script.
 *
 * Keys are free-form strings but should follow `area.event` naming, e.g.
 * `minato.talked_to_grandpa`, `forest.boss_defeated`, `fragments.count`.
 */
export type FlagValue = boolean | number | string;
export type FlagMap = Record<string, FlagValue>;
/** Answers virtual keys (e.g. `item.<id>` bag counts); undefined falls through to the map. */
export type FlagResolver = (key: string) => FlagValue | undefined;

export class Flags {
  private readonly map: FlagMap;
  private resolver: FlagResolver | undefined;

  constructor(initial: FlagMap = {}, shared = false) {
    this.map = shared ? initial : { ...initial };
  }

  /**
   * Wraps an existing map without copying, so writes land in the caller's object
   * (used for the live save data; `new Flags(map)` keeps a detached copy).
   */
  static wrap(map: FlagMap): Flags {
    return new Flags(map, true);
  }

  /**
   * Installs a resolver for virtual keys that are never stored (§9.3
   * `item.<id>>=3` reads the bag). Reads consult it first; writes ignore it.
   */
  setResolver(resolver: FlagResolver | undefined): void {
    this.resolver = resolver;
  }

  private read(key: string): FlagValue | undefined {
    if (this.resolver) {
      const v = this.resolver(key);
      if (v !== undefined) return v;
    }
    return this.map[key];
  }

  /** True when the flag exists and is not `false`, `0` or `''`. */
  has(key: string): boolean {
    const v = this.read(key);
    return v !== undefined && v !== false && v !== 0 && v !== '';
  }

  /** Raw value, or undefined when the flag was never set. */
  peek(key: string): FlagValue | undefined {
    return this.read(key);
  }

  get<T extends FlagValue = FlagValue>(key: string, fallback: T): T {
    const v = this.read(key);
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
