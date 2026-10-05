import type { Rng } from '@core/battle/rng';
import { pick, rand } from '@core/battle/rng';
import { FACING_DELTA } from '@core/grid/mover';
import type { EnemyObject } from '@core/map/objects';
import type { Facing } from '@data/types';

/**
 * Field enemy symbol (docs/GAME_DESIGN.md §5.12), independent of Phaser.
 *
 * One `SymbolState` per symbol on the map. The scene calls `updateSymbol` every
 * frame with its clock (ms) and draws `renderPosition`. The symbol wanders near
 * its spawn, chases the player while it can see them within `CHASE_RANGE`, gives
 * up beyond `GIVE_UP_RANGE`, and reports contact (same tile or 4-neighbour) so
 * the scene can start the battle. After a failed battle/escape the scene calls
 * `stunSymbol` and the symbol freezes for `STUN_MS` (§5.9).
 */

export const WANDER_RADIUS_DEFAULT = 4;
/** Time between wander steps. */
export const WANDER_INTERVAL_MS: readonly [number, number] = [800, 1200];
/** How long one wander step tween takes. */
export const WANDER_STEP_MS = 250;
/** 1 tile / 0.3 s while chasing. */
export const CHASE_STEP_MS = 300;
/** Start chasing within this Chebyshev distance and line of sight. */
export const CHASE_RANGE = 5;
/** Stop chasing beyond this distance. */
export const GIVE_UP_RANGE = 8;
/** After a failed battle/escape the symbol freezes (§5.9). */
export const STUN_MS = 3000;

export interface SymbolSpec {
  /** Stable id within the map (e.g. `enemy_<index>`); the scene keys sprites and respawn timers by it. */
  id: string;
  homeX: number;
  homeY: number;
  radius: number;
  groupIds: string[];
  respawnSec: number;
  defeatedFlag?: string;
}

export type SymbolMode = 'wander' | 'chase' | 'stunned';

export interface SymbolState {
  spec: SymbolSpec;
  /** Logical tile (destination while a step is in progress). */
  tx: number;
  ty: number;
  mode: SymbolMode;
  /** Current step tween: from tile and time window; `fromX === tx && fromY === ty` when idle. */
  fromX: number;
  fromY: number;
  stepStart: number;
  stepEnd: number;
  /** Earliest time the next wander step may start. */
  nextStepAt: number;
  stunnedUntil: number;
}

export interface SymbolEnv {
  /** Blocked for symbol movement (map collision + objects + other symbols; the scene decides). */
  blocked(x: number, y: number): boolean;
  /** Line of sight for chasing: true when no collision tile lies strictly between the two tiles. */
  canSee(ax: number, ay: number, bx: number, by: number): boolean;
  /** Player may not be engaged (map transition / post-escape invulnerability / event running). */
  playerSafe: boolean;
}

export interface PlayerPos {
  x: number;
  y: number;
  facing: Facing;
}

export interface SymbolUpdate {
  /** Set when the symbol touched the player this frame (same tile or 4-neighbour). */
  contact?: { preemptive: boolean };
}

const DIRECTIONS: readonly Facing[] = ['up', 'down', 'left', 'right'];
const NO_UPDATE: SymbolUpdate = Object.freeze({});

export function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** True when the symbol lies on the side opposite the player's facing (e.g. facing 'up' and sy > player.y). */
export function isBehind(player: PlayerPos, sx: number, sy: number): boolean {
  switch (player.facing) {
    case 'up':
      return sy > player.y;
    case 'down':
      return sy < player.y;
    case 'left':
      return sx > player.x;
    case 'right':
      return sx < player.x;
  }
}

/** Bresenham line from a to b; false when any tile strictly between them is blocked. */
export function hasLineOfSight(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  blocked: (x: number, y: number) => boolean,
): boolean {
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  let x = ax;
  let y = ay;
  for (;;) {
    if (x === bx && y === by) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if (x === bx && y === by) return true;
    if (blocked(x, y)) return false;
  }
}

function wanderInterval(rng: Rng): number {
  return rand(rng, WANDER_INTERVAL_MS[0], WANDER_INTERVAL_MS[1]);
}

export function createSymbol(spec: SymbolSpec, now: number, rng: Rng): SymbolState {
  return {
    spec,
    tx: spec.homeX,
    ty: spec.homeY,
    mode: 'wander',
    fromX: spec.homeX,
    fromY: spec.homeY,
    stepStart: now,
    stepEnd: now,
    nextStepAt: now + wanderInterval(rng),
    stunnedUntil: 0,
  };
}

function startStep(
  sym: SymbolState,
  nx: number,
  ny: number,
  now: number,
  durationMs: number,
): void {
  sym.fromX = sym.tx;
  sym.fromY = sym.ty;
  sym.tx = nx;
  sym.ty = ny;
  sym.stepStart = now;
  sym.stepEnd = now + durationMs;
}

function usable(env: SymbolEnv, player: PlayerPos, x: number, y: number): boolean {
  return !(x === player.x && y === player.y) && !env.blocked(x, y);
}

/** One tile toward the player: larger axis first, then the other; stops adjacent. */
function chaseStep(sym: SymbolState, now: number, player: PlayerPos, env: SymbolEnv): void {
  const dx = player.x - sym.tx;
  const dy = player.y - sym.ty;
  const alongX = { x: sym.tx + Math.sign(dx), y: sym.ty, ok: dx !== 0 };
  const alongY = { x: sym.tx, y: sym.ty + Math.sign(dy), ok: dy !== 0 };
  const order = Math.abs(dx) >= Math.abs(dy) ? [alongX, alongY] : [alongY, alongX];
  for (const step of order) {
    if (step.ok && usable(env, player, step.x, step.y)) {
      startStep(sym, step.x, step.y, now, CHASE_STEP_MS);
      sym.nextStepAt = sym.stepEnd;
      return;
    }
  }
  sym.nextStepAt = now + CHASE_STEP_MS;
}

/** Random step among the directions that keep the symbol inside its radius; stays when none fits. */
function wanderStep(
  sym: SymbolState,
  now: number,
  player: PlayerPos,
  env: SymbolEnv,
  rng: Rng,
): void {
  const { homeX, homeY, radius } = sym.spec;
  const here = chebyshev(homeX, homeY, sym.tx, sym.ty);
  const options: { x: number; y: number }[] = [];
  for (const dir of DIRECTIONS) {
    const { dx, dy } = FACING_DELTA[dir];
    const nx = sym.tx + dx;
    const ny = sym.ty + dy;
    const dist = chebyshev(homeX, homeY, nx, ny);
    // Outside the radius (a chase led it away) only steps that bring it closer to home are allowed.
    if (dist > radius && dist >= here) continue;
    if (!usable(env, player, nx, ny)) continue;
    options.push({ x: nx, y: ny });
  }
  const target = pick(rng, options);
  if (target) startStep(sym, target.x, target.y, now, WANDER_STEP_MS);
  sym.nextStepAt = now + wanderInterval(rng);
}

/**
 * Advances one symbol by one frame. Mode changes and steps happen only while idle
 * (no step in progress); the contact check runs every frame on the logical tile
 * unless the symbol is stunned or `env.playerSafe`. Contact does not change the
 * mode: the scene starts the battle and removes or stuns the symbol.
 */
export function updateSymbol(
  sym: SymbolState,
  now: number,
  player: PlayerPos,
  env: SymbolEnv,
  rng: Rng,
): SymbolUpdate {
  if (sym.mode === 'stunned') {
    if (now >= sym.stunnedUntil) {
      sym.mode = 'wander';
      sym.nextStepAt = now;
    }
    return NO_UPDATE;
  }

  if (now >= sym.stepEnd) {
    const dist = chebyshev(sym.tx, sym.ty, player.x, player.y);
    if (
      sym.mode === 'wander' &&
      dist <= CHASE_RANGE &&
      env.canSee(sym.tx, sym.ty, player.x, player.y)
    ) {
      sym.mode = 'chase';
      // React at once instead of waiting out the pending wander interval.
      sym.nextStepAt = now;
    } else if (sym.mode === 'chase' && dist > GIVE_UP_RANGE) {
      sym.mode = 'wander';
      sym.nextStepAt = now + wanderInterval(rng);
    }
    if (now >= sym.nextStepAt) {
      if (sym.mode === 'chase') chaseStep(sym, now, player, env);
      else wanderStep(sym, now, player, env, rng);
    }
  }

  if (env.playerSafe) return NO_UPDATE;
  const touching = Math.abs(sym.tx - player.x) + Math.abs(sym.ty - player.y) <= 1;
  if (!touching) return NO_UPDATE;
  return { contact: { preemptive: isBehind(player, sym.tx, sym.ty) } };
}

/** Position in tile units, interpolated linearly during a step; the tile itself when idle. */
export function renderPosition(sym: SymbolState, now: number): { x: number; y: number } {
  const span = sym.stepEnd - sym.stepStart;
  if (span <= 0 || now >= sym.stepEnd) return { x: sym.tx, y: sym.ty };
  const t = Math.max(0, (now - sym.stepStart) / span);
  return {
    x: sym.fromX + (sym.tx - sym.fromX) * t,
    y: sym.fromY + (sym.ty - sym.fromY) * t,
  };
}

/** Freezes the symbol until `now + STUN_MS`; it then resumes wandering. A running step tween finishes. */
export function stunSymbol(sym: SymbolState, now: number): void {
  sym.mode = 'stunned';
  sym.stunnedUntil = now + STUN_MS;
}

/** Builds the spec from a parsed `enemy` object; splits comma-separated group ids and trims them. */
export function symbolSpecFromObject(obj: EnemyObject, id: string): SymbolSpec {
  const groupIds = obj.groupIds
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const radius =
    Number.isInteger(obj.radius) && obj.radius >= 0 ? obj.radius : WANDER_RADIUS_DEFAULT;
  const spec: SymbolSpec = {
    id,
    homeX: obj.tx,
    homeY: obj.ty,
    radius,
    groupIds,
    respawnSec: obj.respawnSec,
  };
  if (obj.defeatedFlag !== undefined) spec.defeatedFlag = obj.defeatedFlag;
  return spec;
}

/** Uniform pick of the enemy group this symbol fights as; throws when the spec lists none. */
export function pickGroup(spec: SymbolSpec, rng: Rng): string {
  const id = pick(rng, spec.groupIds);
  if (id === undefined) throw new Error(`symbol "${spec.id}" has no enemy groups`);
  return id;
}

/**
 * Whether a defeated symbol comes back when the map is re-entered: never defeated → true;
 * `respawnSec < 0` → never; otherwise when `now − defeatedAt ≥ respawnSec × 1000`.
 */
export function shouldRespawn(
  spec: SymbolSpec,
  defeatedAt: number | undefined,
  now: number,
): boolean {
  if (defeatedAt === undefined) return true;
  if (spec.respawnSec < 0) return false;
  return now - defeatedAt >= spec.respawnSec * 1000;
}
