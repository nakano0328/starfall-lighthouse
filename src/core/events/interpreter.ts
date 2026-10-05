import type { CharacterId, EventCommand, Facing } from '@data/types';

import type { Flags } from '../flags';
import type { Inventory } from '../inventory';

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
  showChapter(title: string): Promise<void>;
  spawnNpc(id: string): void;
  removeNpc(id: string): void;
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

const MAX_DEPTH = 8;

/**
 * Runs `ev_*` scripts: one command after another, awaiting the host. `move`
 * with `wait: false` runs alongside the following commands and is awaited
 * before the script ends. Branching lives in dialogs and triggers, so scripts
 * stay linear.
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

  async run(eventId: string): Promise<void> {
    const commands = this.events[eventId];
    if (!commands) throw new EventError(`unknown event ${eventId}`);
    await this.runCommands(commands);
  }

  async runCommands(commands: readonly EventCommand[]): Promise<void> {
    if (this.depth >= MAX_DEPTH) throw new EventError('event nesting too deep');
    this.depth += 1;
    try {
      for (const cmd of commands) await this.execute(cmd);
      if (this.depth === 1) {
        const pending = this.pending;
        this.pending = [];
        await Promise.all(pending);
      }
    } finally {
      this.depth -= 1;
    }
  }

  private async execute(cmd: EventCommand): Promise<void> {
    const host = this.host;
    switch (cmd.cmd) {
      case 'move': {
        const p = host.move(cmd.actor, cmd.path);
        if (cmd.wait === false) this.pending.push(p);
        else await p;
        return;
      }
      case 'face':
        host.face(cmd.actor, cmd.dir);
        return;
      case 'wait':
        await host.wait(cmd.ms);
        return;
      case 'say':
        await host.say(cmd.dialog);
        return;
      case 'choice': {
        const index = await host.choice(cmd.text);
        host.flags.set(cmd.set, index);
        return;
      }
      case 'give_item': {
        const added = host.inventory.add(cmd.item, cmd.qty);
        await host.message(pickupMessage(host.itemName(cmd.item), added, cmd.qty));
        return;
      }
      case 'take_item':
        host.inventory.remove(cmd.item, cmd.qty);
        return;
      case 'set_flag':
        if (cmd.increment !== undefined) host.flags.increment(cmd.key, cmd.increment);
        else host.flags.set(cmd.key, cmd.value ?? true);
        return;
      case 'battle': {
        const result = await host.battle(cmd.group, cmd.lose ?? 'gameover');
        if (result === 'win' && cmd.win_event !== undefined) await this.run(cmd.win_event);
        return;
      }
      case 'warp':
        await host.warp(cmd.map, cmd.x, cmd.y, cmd.facing);
        return;
      case 'fade':
        await host.fade(cmd.dir, cmd.ms, cmd.color ?? 'black');
        return;
      case 'shake':
        await host.shake(cmd.ms, cmd.intensity);
        return;
      case 'play_bgm':
        host.playBgm(cmd.key, cmd.fade_ms ?? 0);
        return;
      case 'play_se':
        host.playSe(cmd.key);
        return;
      case 'heal_party':
        host.healParty();
        return;
      case 'add_member':
        host.addMember(cmd.id);
        return;
      case 'show_chapter':
        await host.showChapter(cmd.title);
        return;
      case 'spawn_npc':
        host.spawnNpc(cmd.id);
        return;
      case 'remove_npc':
        host.removeNpc(cmd.id);
        return;
      case 'flash':
        await host.flash(cmd.ms, cmd.color ?? 'white');
        return;
      case 'end_game':
        host.endGame();
        return;
    }
  }
}

/** "やくそうを 2こ 手に入れた！" / "…は これ以上 持てない。" */
export function pickupMessage(name: string, added: number, wanted: number): string {
  if (added <= 0) return `${name}は これ以上 持てない。`;
  const qty = added === 1 ? '' : ` ${added}こ`;
  const note = added < wanted ? '（持ちきれない分は あきらめた）' : '';
  return `${name}を${qty} 手に入れた！${note}`;
}
