import { describe, expect, it } from 'vitest';

import { fixedRng, seededRng } from '@core/battle/rng';
import type { Rng } from '@core/battle/rng';
import {
  CHASE_RANGE,
  CHASE_STEP_MS,
  GIVE_UP_RANGE,
  STUN_MS,
  WANDER_INTERVAL_MS,
  WANDER_RADIUS_DEFAULT,
  WANDER_STEP_MS,
  chebyshev,
  createSymbol,
  hasLineOfSight,
  isBehind,
  pickGroup,
  renderPosition,
  shouldRespawn,
  stunSymbol,
  symbolSpecFromObject,
  updateSymbol,
} from '@core/field/symbols';
import type { PlayerPos, SymbolEnv, SymbolSpec, SymbolState } from '@core/field/symbols';
import type { EnemyObject } from '@core/map/objects';

const HOME = { x: 10, y: 10 };

const spec = (over: Partial<SymbolSpec> = {}): SymbolSpec => ({
  id: 'enemy_0',
  homeX: HOME.x,
  homeY: HOME.y,
  radius: 4,
  groupIds: ['grp_a'],
  respawnSec: 60,
  ...over,
});

const env = (over: Partial<SymbolEnv> = {}): SymbolEnv => ({
  blocked: () => false,
  canSee: () => true,
  playerSafe: false,
  ...over,
});

const player = (x: number, y: number, facing: PlayerPos['facing'] = 'down'): PlayerPos => ({
  x,
  y,
  facing,
});

/** Far enough that neither chase nor contact can trigger. */
const FAR = player(50, 50);

const wallAt = (bx: number, by: number) => (x: number, y: number) => x === bx && y === by;

/** A fresh wandering symbol whose first step may start at `now` (interval already elapsed). */
function readySymbol(now: number, rng: Rng, over: Partial<SymbolSpec> = {}): SymbolState {
  const sym = createSymbol(spec(over), 0, rng);
  sym.nextStepAt = now;
  return sym;
}

/** A symbol already in chase mode at `pos`, ready to step at `now`. */
function chasingSymbol(now: number, x: number, y: number, rng: Rng): SymbolState {
  const sym = readySymbol(now, rng);
  sym.tx = x;
  sym.ty = y;
  sym.fromX = x;
  sym.fromY = y;
  sym.mode = 'chase';
  return sym;
}

describe('createSymbol', () => {
  it('starts idle at home in wander mode with a random first interval', () => {
    const sym = createSymbol(spec(), 1000, fixedRng([0.5]));
    expect(sym.mode).toBe('wander');
    expect([sym.tx, sym.ty]).toEqual([HOME.x, HOME.y]);
    expect([sym.fromX, sym.fromY]).toEqual([HOME.x, HOME.y]);
    expect(sym.stepStart).toBe(1000);
    expect(sym.stepEnd).toBe(1000);
    expect(sym.nextStepAt).toBe(1000 + (WANDER_INTERVAL_MS[0] + WANDER_INTERVAL_MS[1]) / 2);
    expect(sym.stunnedUntil).toBe(0);
    expect(renderPosition(sym, 1000)).toEqual({ x: HOME.x, y: HOME.y });
  });

  it('draws the interval from the configured range', () => {
    expect(createSymbol(spec(), 0, fixedRng([0])).nextStepAt).toBe(WANDER_INTERVAL_MS[0]);
    expect(createSymbol(spec(), 0, fixedRng([0.999])).nextStepAt).toBeLessThan(
      WANDER_INTERVAL_MS[1],
    );
  });
});

describe('wander', () => {
  it('stays within the radius and never enters blocked tiles over many steps', () => {
    const rng = seededRng(7);
    const blocked = (x: number, y: number) => x === 12 || y === 7;
    const e = env({ blocked });
    const sym = createSymbol(spec({ radius: 3 }), 0, rng);
    const visited = new Set<string>();
    for (let now = 0; now <= 300_000; now += 50) {
      updateSymbol(sym, now, FAR, e, rng);
      expect(chebyshev(HOME.x, HOME.y, sym.tx, sym.ty)).toBeLessThanOrEqual(3);
      expect(blocked(sym.tx, sym.ty)).toBe(false);
      expect(sym.mode).toBe('wander');
      visited.add(`${sym.tx},${sym.ty}`);
    }
    expect(visited.size).toBeGreaterThan(5);
  });

  it('picks uniformly among the directions that fit (up, down, left, right order)', () => {
    const sym = readySymbol(1000, fixedRng([0]));
    updateSymbol(sym, 1000, FAR, env(), fixedRng([0]));
    expect([sym.tx, sym.ty]).toEqual([HOME.x, HOME.y - 1]);
    expect([sym.fromX, sym.fromY]).toEqual([HOME.x, HOME.y]);
    expect(sym.stepStart).toBe(1000);
    expect(sym.stepEnd).toBe(1000 + WANDER_STEP_MS);
    expect(sym.nextStepAt).toBe(1000 + WANDER_INTERVAL_MS[0]);
  });

  it('skips blocked directions and the player tile before picking', () => {
    const sym = readySymbol(0, fixedRng([0]));
    // Up is blocked, down is the player (out of sight so no chase): the first remaining option is left.
    updateSymbol(
      sym,
      0,
      player(HOME.x, HOME.y + 1),
      env({ blocked: wallAt(HOME.x, HOME.y - 1), canSee: () => false }),
      fixedRng([0]),
    );
    expect(sym.mode).toBe('wander');
    expect([sym.tx, sym.ty]).toEqual([HOME.x - 1, HOME.y]);
  });

  it('stays put when nothing fits but still schedules the next attempt', () => {
    const sym = readySymbol(500, fixedRng([0]), { radius: 0 });
    updateSymbol(sym, 500, FAR, env(), fixedRng([0.25]));
    expect([sym.tx, sym.ty]).toEqual([HOME.x, HOME.y]);
    expect(sym.stepEnd).toBe(0);
    expect(sym.nextStepAt).toBe(500 + 800 + 0.25 * 400);
  });

  it('does not step again before the interval elapses', () => {
    const rng = fixedRng([0]);
    const sym = readySymbol(0, rng);
    updateSymbol(sym, 0, FAR, env(), rng);
    const after = { tx: sym.tx, ty: sym.ty };
    updateSymbol(sym, WANDER_STEP_MS + 10, FAR, env(), rng);
    updateSymbol(sym, WANDER_INTERVAL_MS[0] - 1, FAR, env(), rng);
    expect([sym.tx, sym.ty]).toEqual([after.tx, after.ty]);
    updateSymbol(sym, WANDER_INTERVAL_MS[0], FAR, env(), rng);
    expect(sym.stepStart).toBe(WANDER_INTERVAL_MS[0]);
  });

  it('walks back toward home when a chase left it outside the radius', () => {
    const rng = fixedRng([0]);
    const sym = readySymbol(0, rng, { radius: 2 });
    sym.tx = HOME.x + 6;
    sym.ty = HOME.y;
    sym.fromX = sym.tx;
    updateSymbol(sym, 0, FAR, env(), rng);
    // Only "left" reduces the distance to home; it is picked regardless of the roll.
    expect([sym.tx, sym.ty]).toEqual([HOME.x + 5, HOME.y]);
  });
});

describe('chase', () => {
  it('starts only within range and with line of sight', () => {
    const rng = fixedRng([0]);
    const inRange = player(HOME.x + CHASE_RANGE, HOME.y);
    const noSight = readySymbol(0, rng);
    updateSymbol(noSight, 0, inRange, env({ canSee: () => false }), rng);
    expect(noSight.mode).toBe('wander');

    const tooFar = readySymbol(0, rng);
    updateSymbol(tooFar, 0, player(HOME.x + CHASE_RANGE + 1, HOME.y), env(), rng);
    expect(tooFar.mode).toBe('wander');

    const seen = readySymbol(0, rng);
    let args: number[] = [];
    const e = env({
      canSee: (ax, ay, bx, by) => {
        args = [ax, ay, bx, by];
        return true;
      },
    });
    updateSymbol(seen, 0, inRange, e, rng);
    expect(seen.mode).toBe('chase');
    expect(args).toEqual([HOME.x, HOME.y, inRange.x, inRange.y]);
  });

  it('steps right away when the chase starts, even with a wander interval pending', () => {
    const rng = fixedRng([0]);
    const sym = createSymbol(spec(), 0, rng);
    expect(sym.nextStepAt).toBeGreaterThan(0);
    updateSymbol(sym, 0, player(HOME.x + 3, HOME.y + 1), env(), rng);
    expect(sym.mode).toBe('chase');
    expect([sym.tx, sym.ty]).toEqual([HOME.x + 1, HOME.y]);
    expect(sym.stepEnd).toBe(CHASE_STEP_MS);
    expect(sym.nextStepAt).toBe(CHASE_STEP_MS);
  });

  it('steps along the larger axis first and stops adjacent, never onto the player', () => {
    const rng = fixedRng([0]);
    const target = player(HOME.x + 3, HOME.y + 1);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    const path: [number, number][] = [];
    for (let now = 0; now <= CHASE_STEP_MS * 6; now += CHASE_STEP_MS) {
      updateSymbol(sym, now, target, env(), rng);
      path.push([sym.tx, sym.ty]);
      expect([sym.tx, sym.ty]).not.toEqual([target.x, target.y]);
    }
    expect(path.slice(0, 3)).toEqual([
      [HOME.x + 1, HOME.y],
      [HOME.x + 2, HOME.y],
      [HOME.x + 3, HOME.y],
    ]);
    // Adjacent: the only move would land on the player, so it waits one chase step at a time.
    expect(path[3]).toEqual([HOME.x + 3, HOME.y]);
    expect(path[6]).toEqual([HOME.x + 3, HOME.y]);
    expect(sym.mode).toBe('chase');
  });

  it('prefers the vertical axis when the vertical delta is larger', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    updateSymbol(sym, 0, player(HOME.x - 1, HOME.y - 4), env(), rng);
    expect([sym.tx, sym.ty]).toEqual([HOME.x, HOME.y - 1]);
  });

  it('falls back to the other axis when the first is blocked', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    const e = env({ blocked: wallAt(HOME.x + 1, HOME.y) });
    updateSymbol(sym, 0, player(HOME.x + 3, HOME.y + 1), e, rng);
    expect([sym.tx, sym.ty]).toEqual([HOME.x, HOME.y + 1]);
  });

  it('waits one chase step when neither axis is usable', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(100, HOME.x, HOME.y, rng);
    const e = env({ blocked: wallAt(HOME.x + 1, HOME.y) });
    updateSymbol(sym, 100, player(HOME.x + 3, HOME.y), e, rng);
    expect([sym.tx, sym.ty]).toEqual([HOME.x, HOME.y]);
    expect(sym.stepEnd).toBe(0);
    expect(sym.nextStepAt).toBe(100 + CHASE_STEP_MS);
  });

  it('does not change mode or step while a step is in progress', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    updateSymbol(sym, 0, player(HOME.x + 3, HOME.y), env(), rng);
    const mid = CHASE_STEP_MS / 2;
    updateSymbol(sym, mid, player(HOME.x + 30, HOME.y), env(), rng);
    expect(sym.mode).toBe('chase');
    expect([sym.tx, sym.ty]).toEqual([HOME.x + 1, HOME.y]);
  });

  it('gives up beyond GIVE_UP_RANGE and schedules a wander interval', () => {
    const rng = fixedRng([0]);
    const keep = chasingSymbol(0, HOME.x, HOME.y, rng);
    updateSymbol(keep, 0, player(HOME.x + GIVE_UP_RANGE, HOME.y), env(), rng);
    expect(keep.mode).toBe('chase');

    const quit = chasingSymbol(1000, HOME.x, HOME.y, rng);
    updateSymbol(quit, 1000, player(HOME.x + GIVE_UP_RANGE + 1, HOME.y), env(), fixedRng([1]));
    expect(quit.mode).toBe('wander');
    expect([quit.tx, quit.ty]).toEqual([HOME.x, HOME.y]);
    expect(quit.nextStepAt).toBe(1000 + WANDER_INTERVAL_MS[1]);
  });
});

describe('contact', () => {
  it('reports contact on the same tile and on 4-neighbours only', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    const e = env({ blocked: () => true });
    expect(updateSymbol(sym, 0, player(HOME.x, HOME.y), e, rng).contact).toBeDefined();
    expect(updateSymbol(sym, 0, player(HOME.x + 1, HOME.y), e, rng).contact).toBeDefined();
    expect(updateSymbol(sym, 0, player(HOME.x, HOME.y - 1), e, rng).contact).toBeDefined();
    expect(updateSymbol(sym, 0, player(HOME.x + 1, HOME.y + 1), e, rng).contact).toBeUndefined();
    expect(updateSymbol(sym, 0, player(HOME.x + 2, HOME.y), e, rng).contact).toBeUndefined();
    // Contact alone never changes the mode.
    expect(sym.mode).toBe('chase');
  });

  it('is preemptive when the symbol is behind the player', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    const below = player(HOME.x, HOME.y + 1, 'down');
    expect(updateSymbol(sym, 0, below, env(), rng)).toEqual({
      contact: { preemptive: true },
    });
    const facingIt = player(HOME.x, HOME.y + 1, 'up');
    expect(updateSymbol(sym, 0, facingIt, env(), rng)).toEqual({
      contact: { preemptive: false },
    });
    const sideways = player(HOME.x + 1, HOME.y, 'up');
    expect(updateSymbol(sym, 0, sideways, env(), rng)).toEqual({
      contact: { preemptive: false },
    });
  });

  it('uses the logical tile: a step onto a neighbour counts at step start', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    const res = updateSymbol(sym, 0, player(HOME.x + 2, HOME.y, 'left'), env(), rng);
    expect([sym.tx, sym.ty]).toEqual([HOME.x + 1, HOME.y]);
    expect(res).toEqual({ contact: { preemptive: false } });
  });

  it('is suppressed while the player is safe', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    const res = updateSymbol(sym, 0, player(HOME.x, HOME.y + 1), env({ playerSafe: true }), rng);
    expect(res).toEqual({});
    expect(res.contact).toBeUndefined();
  });
});

describe('stun', () => {
  it('freezes the symbol, suppresses contact, and recovers to wander after STUN_MS', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    const adjacent = player(HOME.x, HOME.y + 1, 'down');
    stunSymbol(sym, 1000);
    expect(sym.mode).toBe('stunned');
    expect(sym.stunnedUntil).toBe(1000 + STUN_MS);

    for (let now = 1000; now < 1000 + STUN_MS; now += 500) {
      expect(updateSymbol(sym, now, adjacent, env(), rng)).toEqual({});
      expect([sym.tx, sym.ty]).toEqual([HOME.x, HOME.y]);
      expect(sym.mode).toBe('stunned');
    }

    // The recovery frame itself only switches the mode.
    const recover = 1000 + STUN_MS;
    expect(updateSymbol(sym, recover, adjacent, env(), rng)).toEqual({});
    expect(sym.mode).toBe('wander');
    expect(sym.nextStepAt).toBe(recover);

    // From the next frame on it behaves normally again (adjacent + line of sight → chase + contact).
    const res = updateSymbol(sym, recover + 16, adjacent, env(), rng);
    expect(sym.mode).toBe('chase');
    expect(res).toEqual({ contact: { preemptive: true } });
  });

  it('lets a running step tween finish instead of snapping', () => {
    const rng = fixedRng([0]);
    const sym = chasingSymbol(0, HOME.x, HOME.y, rng);
    updateSymbol(sym, 0, player(HOME.x + 4, HOME.y), env(), rng);
    stunSymbol(sym, 100);
    expect(renderPosition(sym, 150).x).toBeCloseTo(HOME.x + 0.5, 5);
    expect(renderPosition(sym, CHASE_STEP_MS)).toEqual({ x: HOME.x + 1, y: HOME.y });
  });
});

describe('renderPosition', () => {
  it('equals the tile when idle and interpolates linearly during a step', () => {
    const rng = fixedRng([0]);
    const sym = readySymbol(1000, rng);
    expect(renderPosition(sym, 999)).toEqual({ x: HOME.x, y: HOME.y });
    updateSymbol(sym, 1000, FAR, env(), rng); // steps up
    expect(renderPosition(sym, 1000)).toEqual({ x: HOME.x, y: HOME.y });
    const quarter = renderPosition(sym, 1000 + WANDER_STEP_MS / 4);
    expect(quarter.x).toBe(HOME.x);
    expect(quarter.y).toBeCloseTo(HOME.y - 0.25, 5);
    expect(renderPosition(sym, 1000 + WANDER_STEP_MS)).toEqual({ x: HOME.x, y: HOME.y - 1 });
    expect(renderPosition(sym, 5000)).toEqual({ x: HOME.x, y: HOME.y - 1 });
  });

  it('clamps to the start tile before the step begins', () => {
    const rng = fixedRng([0]);
    const sym = readySymbol(1000, rng);
    updateSymbol(sym, 1000, FAR, env(), rng);
    expect(renderPosition(sym, 900)).toEqual({ x: HOME.x, y: HOME.y });
  });
});

describe('hasLineOfSight', () => {
  it('is blocked by a wall strictly between the tiles on a straight line', () => {
    expect(hasLineOfSight(0, 0, 4, 0, wallAt(2, 0))).toBe(false);
    expect(hasLineOfSight(4, 0, 0, 0, wallAt(2, 0))).toBe(false);
    expect(hasLineOfSight(3, 1, 3, 6, wallAt(3, 4))).toBe(false);
    expect(hasLineOfSight(0, 0, 4, 0, wallAt(2, 1))).toBe(true);
    expect(hasLineOfSight(0, 0, 4, 0, () => false)).toBe(true);
  });

  it('ignores the endpoints themselves', () => {
    expect(hasLineOfSight(0, 0, 3, 0, (x, y) => (x === 0 && y === 0) || (x === 3 && y === 0))).toBe(
      true,
    );
    expect(hasLineOfSight(2, 2, 2, 2, () => true)).toBe(true);
    expect(hasLineOfSight(2, 2, 3, 2, () => true)).toBe(true);
  });

  it('traces diagonal lines', () => {
    expect(hasLineOfSight(0, 0, 3, 3, wallAt(1, 1))).toBe(false);
    expect(hasLineOfSight(0, 0, 3, 3, wallAt(2, 2))).toBe(false);
    expect(hasLineOfSight(3, 3, 0, 0, wallAt(1, 1))).toBe(false);
    expect(hasLineOfSight(0, 3, 3, 0, wallAt(2, 1))).toBe(false);
    expect(hasLineOfSight(0, 0, 3, 3, wallAt(1, 0))).toBe(true);
    expect(hasLineOfSight(0, 0, 3, 3, wallAt(0, 1))).toBe(true);
    // Shallow slope: the visited cells follow the Bresenham line, not the bounding box.
    const visited: string[] = [];
    expect(
      hasLineOfSight(0, 0, 4, 2, (x, y) => {
        visited.push(`${x},${y}`);
        return false;
      }),
    ).toBe(true);
    expect(visited).toEqual(['1,1', '2,1', '3,2']);
  });
});

describe('isBehind / chebyshev', () => {
  it('is behind when the symbol lies opposite the facing, not beside', () => {
    const p = (facing: PlayerPos['facing']) => player(5, 5, facing);
    expect(isBehind(p('up'), 5, 6)).toBe(true);
    expect(isBehind(p('up'), 5, 4)).toBe(false);
    expect(isBehind(p('up'), 6, 5)).toBe(false);
    expect(isBehind(p('down'), 5, 4)).toBe(true);
    expect(isBehind(p('down'), 5, 6)).toBe(false);
    expect(isBehind(p('down'), 4, 5)).toBe(false);
    expect(isBehind(p('left'), 6, 5)).toBe(true);
    expect(isBehind(p('left'), 4, 5)).toBe(false);
    expect(isBehind(p('left'), 5, 6)).toBe(false);
    expect(isBehind(p('right'), 4, 5)).toBe(true);
    expect(isBehind(p('right'), 6, 5)).toBe(false);
    expect(isBehind(p('right'), 5, 4)).toBe(false);
    expect(isBehind(p('right'), 5, 5)).toBe(false);
  });

  it('chebyshev is the larger axis distance', () => {
    expect(chebyshev(0, 0, 3, 1)).toBe(3);
    expect(chebyshev(0, 0, -1, -4)).toBe(4);
    expect(chebyshev(2, 2, 2, 2)).toBe(0);
  });
});

describe('symbolSpecFromObject', () => {
  const base: EnemyObject = {
    kind: 'enemy',
    tx: 3,
    ty: 4,
    tw: 1,
    th: 1,
    groupIds: ['grp_a, grp_b'],
    respawnSec: 60,
    radius: 2,
    tide: 'any',
  };

  it('copies the placement and splits/trims group ids', () => {
    const s = symbolSpecFromObject(base, 'enemy_3');
    expect(s).toEqual({
      id: 'enemy_3',
      homeX: 3,
      homeY: 4,
      radius: 2,
      groupIds: ['grp_a', 'grp_b'],
      respawnSec: 60,
    });
    expect(s).not.toHaveProperty('defeatedFlag');
    expect(
      symbolSpecFromObject({ ...base, groupIds: ['grp_a', ' grp_b ,', 'grp_c'] }, 'e').groupIds,
    ).toEqual(['grp_a', 'grp_b', 'grp_c']);
  });

  it('keeps radius 0 (stationary) and defaults an invalid radius', () => {
    expect(symbolSpecFromObject({ ...base, radius: 0 }, 'e').radius).toBe(0);
    expect(symbolSpecFromObject({ ...base, radius: -1 }, 'e').radius).toBe(WANDER_RADIUS_DEFAULT);
  });

  it('carries the defeated flag and a negative respawn through', () => {
    const s = symbolSpecFromObject({ ...base, respawnSec: -1, defeatedFlag: 'boss.uro' }, 'boss');
    expect(s.respawnSec).toBe(-1);
    expect(s.defeatedFlag).toBe('boss.uro');
  });
});

describe('pickGroup', () => {
  it('picks uniformly and throws on an empty list', () => {
    const s = spec({ groupIds: ['grp_a', 'grp_b', 'grp_c'] });
    expect(pickGroup(s, fixedRng([0]))).toBe('grp_a');
    expect(pickGroup(s, fixedRng([0.5]))).toBe('grp_b');
    expect(pickGroup(s, fixedRng([0.99]))).toBe('grp_c');
    expect(() => pickGroup(spec({ groupIds: [] }), fixedRng([0]))).toThrow(/enemy_0/);
  });
});

describe('shouldRespawn', () => {
  it('never respawns with respawnSec -1 once defeated', () => {
    const s = spec({ respawnSec: -1 });
    expect(shouldRespawn(s, 0, 10_000_000)).toBe(false);
  });

  it('respawns once the delay has passed', () => {
    const s = spec({ respawnSec: 60 });
    expect(shouldRespawn(s, 1000, 1000 + 59_999)).toBe(false);
    expect(shouldRespawn(s, 1000, 1000 + 60_000)).toBe(true);
    expect(shouldRespawn(spec({ respawnSec: 0 }), 1000, 1000)).toBe(true);
  });

  it('spawns when the symbol was never defeated', () => {
    expect(shouldRespawn(spec({ respawnSec: 60 }), undefined, 0)).toBe(true);
    expect(shouldRespawn(spec({ respawnSec: -1 }), undefined, 0)).toBe(true);
  });
});
