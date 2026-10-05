/** Injectable random source (docs/GAME_DESIGN.md §5.3: core/battle never calls Math.random directly). */
export interface Rng {
  /** Uniform number in [0, 1). */
  next(): number;
}

export const mathRng: Rng = { next: () => Math.random() };

/** Deterministic generator (mulberry32) for tests and replays. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Rng that replays a fixed list of values (cycling); handy for exact-number tests. */
export function fixedRng(values: readonly number[]): Rng {
  let i = 0;
  return {
    next() {
      const v = values[i % values.length] ?? 0;
      i += 1;
      return v;
    },
  };
}

export function rand(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng.next();
}

export function chance(rng: Rng, probability: number): boolean {
  if (probability <= 0) return false;
  if (probability >= 1) return true;
  return rng.next() < probability;
}

export function pick<T>(rng: Rng, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(rng.next() * items.length))];
}

export function weightedPick<T>(
  rng: Rng,
  items: readonly { item: T; weight: number }[],
): T | undefined {
  const total = items.reduce((s, it) => s + Math.max(0, it.weight), 0);
  if (total <= 0) return items[0]?.item;
  let roll = rng.next() * total;
  for (const it of items) {
    roll -= Math.max(0, it.weight);
    if (roll < 0) return it.item;
  }
  return items[items.length - 1]?.item;
}
