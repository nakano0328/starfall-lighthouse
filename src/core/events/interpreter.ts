import type { CharacterId, EventCommand, Facing } from '@data/types';

import type { Flags } from '../flags';
import type { Inventory } from '../inventory';
import type { TideLevel } from '../map/source';
import { TIDE_FLAG, currentTide, resolveTide } from '../map/tide';

/**
 * What a scene must provide to play event scripts (docs/GAME_DESIGN.md §10.2).
 * Every method that takes time returns a promise the interpreter awaits.
 */
export interface EventHost {
  flags: Flags;
  inventory: Inventory;
  say(dialogId: string): Promise<void>;
  /** Shows a plain system message (item pickups, etc.). */
  message(text: string): Promise<void>;
  choice(texts: string[]): Promise<number>;
  move(actor: string, path: Facing[]): Promise<void>;
  face(actor: string, dir: Facing): void;
  wait(ms: number): Promise<void>;
  warp(map: string, x: number, y: number, facing: Facing): Promise<void>;
  fade(dir: 'in' | 'out', ms: number, color: 'black' | 'white'): Promise<void>;
  shake(ms: number, intensity: number): Promise<void>;
  flash(ms: number, color: 'black' | 'white'): Promise<void>;
  playBgm(key: string, fadeMs: number): void;
  playSe(key: string): void;
  healParty(): void;
  addMember(id: CharacterId): void;
  giveGold(amount: number): void;
  showChapter(title: string): Promise<void>;
  spawnNpc(id: string): void;
  removeNpc(id: string): void;
  /**
   * The ruins tide has just been set to `tide` (the interpreter updates the flag
   * first): play the switch (fade, SE) and relayer the map (docs/GAME_DESIGN.md §3.2).
   */
  setTide(tide: TideLevel): Promise<void>;
  /**
   * Runs a battle and resolves with its result. On a loss with
   * `lose: 'gameover'` the host owns the GameOverScene transition
   * (docs/GAME_DESIGN.md §5.11); the interpreter then stops the script
   * without running any further command. With `lose: 'continue'` the script
   * goes on after a loss (`win_event` is skipped).
   */
  battle(group: string, lose: 'gameover' | 'continue'): Promise<'win' | 'lose'>;
  endGame(): void;
  /** Display name for pickup messages. */
  itemName(itemId: string): string;
}

export class EventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventError';
  }
}

/**
 * How a script ended: `'done'` after its last command, `'stopped'` when a
 * `battle` was lost with `lose: 'gameover'` and the remaining commands were
 * skipped (the host is moving to the game-over flow).
 */
export type EventOutcome = 'done' | 'stopped';

const MAX_DEPTH = 8;

/**
 * Runs `ev_*` scripts: one command after another, awaiting the host. `move`
 * with `wait: false` runs alongside the following commands and is awaited
 * before the script ends. Branching lives in dialogs and triggers, so scripts
 * stay linear. A `battle` lost with `lose: 'gameover'` stops the script, and
 * the stop propagates out of nested `win_event` runs.
 */
export class EventInterpreter {
  private depth = 0;
  private pending: Promise<void>[] = [];

  constructor(
    private readonly host: EventHost,
    private readonly events: Readonly<Record<string, EventCommand[]>>,
  ) {}

  get running(): boolean {
    return this.depth > 0;
  }

  async run(eventId: string): Promise<EventOutcome> {
    const commands = this.events[eventId];
    if (!commands) throw new EventError(`unknown event ${eventId}`);
    return this.runCommands(commands);
  }

  async runCommands(commands: readonly EventCommand[]): Promise<EventOutcome> {
    if (this.depth >= MAX_DEPTH) throw new EventError('event nesting too deep');
    this.depth += 1;
    let outcome: EventOutcome = 'done';
    try {
      for (const cmd of commands) {
        outcome = await this.execute(cmd);
        if (outcome === 'stopped') break;
      }
      if (this.depth === 1) {
        const pending = this.pending;
        this.pending = [];
        await Promise.all(pending);
      }
    } finally {
      this.depth -= 1;
    }
    return outcome;
  }

  private async execute(cmd: EventCommand): Promise<EventOutcome> {
    const host = this.host;
    switch (cmd.cmd) {
      case 'move': {
        const p = host.move(cmd.actor, cmd.path);
        if (cmd.wait === false) this.pending.push(p);
        else await p;
        break;
      }
      case 'face':
        host.face(cmd.actor, cmd.dir);
        break;
      case 'wait':
        await host.wait(cmd.ms);
        break;
      case 'say':
        await host.say(cmd.dialog);
        break;
      case 'choice': {
        const index = await host.choice(cmd.text);
        host.flags.set(cmd.set, index);
        break;
      }
      case 'give_item': {
        const added = host.inventory.add(cmd.item, cmd.qty);
        await host.message(pickupMessage(host.itemName(cmd.item), added, cmd.qty));
        break;
      }
      case 'take_item':
        host.inventory.remove(cmd.item, cmd.qty);
        break;
      case 'set_flag':
        if (cmd.increment !== undefined) host.flags.increment(cmd.key, cmd.increment);
        else host.flags.set(cmd.key, cmd.value ?? true);
        break;
      case 'battle': {
        const lose = cmd.lose ?? 'gameover';
        const result = await host.battle(cmd.group, lose);
        if (result === 'lose') return lose === 'gameover' ? 'stopped' : 'done';
        if (cmd.win_event !== undefined) return this.run(cmd.win_event);
        return 'done';
      }
      case 'warp':
        await host.warp(cmd.map, cmd.x, cmd.y, cmd.facing);
        break;
      case 'fade':
        await host.fade(cmd.dir, cmd.ms, cmd.color ?? 'black');
        break;
      case 'shake':
        await host.shake(cmd.ms, cmd.intensity);
        break;
      case 'play_bgm':
        host.playBgm(cmd.key, cmd.fade_ms ?? 0);
        break;
      case 'play_se':
        host.playSe(cmd.key);
        break;
      case 'heal_party':
        host.healParty();
        break;
      case 'give_gold':
        host.giveGold(cmd.amount);
        await host.message(`${cmd.amount}G を 手に入れた！`);
        break;
      case 'add_member':
        host.addMember(cmd.id);
        break;
      case 'show_chapter':
        await host.showChapter(cmd.title);
        break;
      case 'spawn_npc':
        host.spawnNpc(cmd.id);
        break;
      case 'remove_npc':
        host.removeNpc(cmd.id);
        break;
      case 'flash':
        await host.flash(cmd.ms, cmd.color ?? 'white');
        break;
      case 'set_tide': {
        const tide = resolveTide(currentTide(host.flags), cmd.value);
        host.flags.set(TIDE_FLAG, tide);
        await host.setTide(tide);
        break;
      }
      case 'end_game':
        host.endGame();
        break;
    }
    return 'done';
  }
}

/** "やくそうを 2こ 手に入れた！" / "…は これ以上 持てない。" */
export function pickupMessage(name: string, added: number, wanted: number): string {
  if (added <= 0) return `${name}は これ以上 持てない。`;
  const qty = added === 1 ? '' : ` ${added}こ`;
  const note = added < wanted ? '（持ちきれない分は あきらめた）' : '';
  return `${name}を${qty} 手に入れた！${note}`;
}
