import type { Facing } from '@data/types';

/**
 * Grid movement state machine (docs/GAME_DESIGN.md §9.1), independent of Phaser.
 *
 * - 4 directions, one tile per step; the caller resolves "last pressed wins".
 * - Walking takes `walkMs` per tile, dashing `dashMs` (decided when a step starts).
 * - A blocked direction only turns the actor; no step, and a single `bump` event.
 * - Input lead: a direction held during the last `inputLeadMs` of a step is kept
 *   so the next step starts without a gap, and leftover time carries over.
 */
export interface MoverConfig {
  walkMs: number;
  dashMs: number;
  inputLeadMs: number;
}

export const DEFAULT_MOVER_CONFIG: MoverConfig = { walkMs: 150, dashMs: 100, inputLeadMs: 40 };

export interface TilePosition {
  x: number;
  y: number;
  facing: Facing;
}

export type MoverEvent =
  | { type: 'turn'; facing: Facing }
  | { type: 'step_start'; from: { x: number; y: number }; to: { x: number; y: number } }
  | { type: 'step_end'; x: number; y: number }
  | { type: 'bump'; x: number; y: number };

export const FACING_DELTA: Record<Facing, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export class GridMover {
  private x: number;
  private y: number;
  private facing: Facing;
  private from: { x: number; y: number } | null = null;
  private elapsed = 0;
  private duration = 0;
  private leadDir: Facing | null = null;
  private bumped = false;
  private readonly config: MoverConfig;

  constructor(
    start: TilePosition,
    private isBlocked: (x: number, y: number) => boolean,
    config: Partial<MoverConfig> = {},
  ) {
    this.x = start.x;
    this.y = start.y;
    this.facing = start.facing;
    this.config = { ...DEFAULT_MOVER_CONFIG, ...config };
  }

  /** Logical tile: the destination while a step is in progress. */
  get position(): TilePosition {
    return { x: this.x, y: this.y, facing: this.facing };
  }

  get isMoving(): boolean {
    return this.from !== null;
  }

  /** 0 at the start of a step, 1 when it ends; 1 when idle. */
  get progress(): number {
    if (!this.from || this.duration === 0) return 1;
    return Math.min(1, this.elapsed / this.duration);
  }

  /** Interpolated position in tile units (fractional while moving). */
  get renderPosition(): { x: number; y: number } {
    if (!this.from) return { x: this.x, y: this.y };
    const t = this.progress;
    return {
      x: this.from.x + (this.x - this.from.x) * t,
      y: this.from.y + (this.y - this.from.y) * t,
    };
  }

  setBlockedCheck(isBlocked: (x: number, y: number) => boolean): void {
    this.isBlocked = isBlocked;
  }

  /** Instantly relocates the actor (map transitions, events). Cancels any step. */
  teleport(pos: TilePosition): void {
    this.x = pos.x;
    this.y = pos.y;
    this.facing = pos.facing;
    this.from = null;
    this.elapsed = 0;
    this.duration = 0;
    this.leadDir = null;
    this.bumped = false;
  }

  face(facing: Facing): void {
    this.facing = facing;
  }

  /**
   * Advances the state by `dtMs` with the currently held direction (or null) and
   * whether dash is held. Returns the events that happened, in order.
   */
  update(dtMs: number, dir: Facing | null, dash: boolean): MoverEvent[] {
    const events: MoverEvent[] = [];
    let remaining = Math.max(0, dtMs);

    if (this.from) {
      if (dir !== null && this.duration - this.elapsed <= this.config.inputLeadMs + remaining) {
        this.leadDir = dir;
      }
      this.elapsed += remaining;
      if (this.elapsed < this.duration) return events;
      const carry = this.elapsed - this.duration;
      this.from = null;
      this.elapsed = 0;
      this.duration = 0;
      events.push({ type: 'step_end', x: this.x, y: this.y });
      const next = dir ?? this.leadDir;
      this.leadDir = null;
      if (next !== null) {
        this.tryStart(next, dash, events);
        if (this.from && carry > 0) {
          // Keep the pace steady across step boundaries.
          this.elapsed = Math.min(carry, this.duration - 1);
        }
      }
      return events;
    }

    if (dir === null) {
      this.bumped = false;
      return events;
    }
    this.tryStart(dir, dash, events);
    if (this.from && remaining > 0) {
      remaining = Math.min(remaining, this.duration - 1);
      this.elapsed = remaining;
    }
    return events;
  }

  private tryStart(dir: Facing, dash: boolean, events: MoverEvent[]): void {
    if (dir !== this.facing) {
      this.facing = dir;
      this.bumped = false;
      events.push({ type: 'turn', facing: dir });
    }
    const { dx, dy } = FACING_DELTA[dir];
    const nx = this.x + dx;
    const ny = this.y + dy;
    if (this.isBlocked(nx, ny)) {
      if (!this.bumped) {
        this.bumped = true;
        events.push({ type: 'bump', x: nx, y: ny });
      }
      return;
    }
    this.bumped = false;
    this.from = { x: this.x, y: this.y };
    this.x = nx;
    this.y = ny;
    this.elapsed = 0;
    this.duration = dash ? this.config.dashMs : this.config.walkMs;
    events.push({ type: 'step_start', from: this.from, to: { x: nx, y: ny } });
  }
}
