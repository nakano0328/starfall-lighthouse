import type { DialogNode, EventCommand } from '@data/types';

import { evaluateCondition } from '../condition';
import type { Flags } from '../flags';

/** Effects a dialog node may carry (docs/GAME_DESIGN.md §10.1). */
export const DIALOG_EFFECT_COMMANDS = new Set<EventCommand['cmd']>([
  'set_flag',
  'give_item',
  'give_gold',
  'take_item',
  'play_se',
  'heal_party',
]);

export interface DialogHost {
  flags: Flags;
  /** Applies a node/choice effect. `set_flag` is handled by the runner itself. */
  applyEffect(cmd: EventCommand): void;
  /** Expands text tokens; identity when the host has nothing to substitute. */
  format(text: string): string;
}

export interface DialogPage {
  kind: 'page';
  nodeId: string;
  speaker?: string;
  portrait?: string;
  text: string;
  pageIndex: number;
  pageCount: number;
  /** Present on the last page of a node that offers choices. */
  choices?: string[];
}

export interface DialogEnd {
  kind: 'end';
}

export type DialogStep = DialogPage | DialogEnd;

export class DialogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DialogError';
  }
}

const MAX_HOPS = 64;

/**
 * Walks a dialog tree one page at a time. Resolution order inside a node:
 * branches (no pages) → pages → choices on the last page → node effects →
 * choice effects → next. Empty `pages` with `next` act as a pass-through.
 */
export class DialogRunner {
  private node: DialogNode | null = null;
  private page = 0;

  constructor(
    private readonly dialogs: Readonly<Record<string, DialogNode>>,
    private readonly host: DialogHost,
  ) {}

  get active(): boolean {
    return this.node !== null;
  }

  start(id: string): DialogStep {
    return this.enter(id, 0);
  }

  /** Shows ad-hoc pages (system messages, pickups) with no speaker and no effects. */
  startInline(pages: string[], choices?: string[]): DialogStep {
    const node: DialogNode = { id: '__inline', pages: pages.length > 0 ? pages : [''] };
    if (choices && choices.length > 0) node.choices = choices.map((text) => ({ text }));
    this.node = node;
    this.page = 0;
    return this.currentPage(node);
  }

  /** Called when the player dismisses the current page. */
  advance(): DialogStep {
    const node = this.node;
    if (!node) return { kind: 'end' };
    if (this.page + 1 < node.pages.length) {
      this.page += 1;
      return this.currentPage(node);
    }
    if (node.choices && node.choices.length > 0) {
      // The last page waits for a choice; dismissing it is a no-op.
      return this.currentPage(node);
    }
    this.applyEffects(node.effects);
    return this.leave(node.next, 0);
  }

  /** Called when the player picks a choice on the last page. */
  choose(index: number): DialogStep {
    const node = this.node;
    if (!node) return { kind: 'end' };
    const choice = node.choices?.[index];
    if (!choice) throw new DialogError(`${node.id}: no choice at index ${index}`);
    this.applyEffects(node.effects);
    this.applyEffects(choice.effects);
    return this.leave(choice.next ?? node.next, 0);
  }

  /** Aborts the conversation without running remaining effects. */
  cancel(): void {
    this.node = null;
    this.page = 0;
  }

  private leave(next: string | undefined, hops: number): DialogStep {
    this.node = null;
    this.page = 0;
    if (next === undefined) return { kind: 'end' };
    return this.enter(next, hops + 1);
  }

  private enter(id: string, hops: number): DialogStep {
    if (hops > MAX_HOPS) throw new DialogError(`dialog loop detected at ${id}`);
    const node = this.dialogs[id];
    if (!node) throw new DialogError(`unknown dialog node ${id}`);
    if (node.pages.length === 0) {
      if (node.branches && node.branches.length > 0) {
        const branch = node.branches.find(
          (b) => b.if === undefined || evaluateCondition(b.if, this.host.flags),
        );
        this.node = null;
        if (!branch) return { kind: 'end' };
        return this.enter(branch.next, hops + 1);
      }
      this.applyEffects(node.effects);
      return this.leave(node.next, hops);
    }
    this.node = node;
    this.page = 0;
    return this.currentPage(node);
  }

  private currentPage(node: DialogNode): DialogPage {
    const raw = node.pages[this.page] ?? '';
    const last = this.page === node.pages.length - 1;
    const page: DialogPage = {
      kind: 'page',
      nodeId: node.id,
      text: this.host.format(raw),
      pageIndex: this.page,
      pageCount: node.pages.length,
    };
    if (node.speaker !== undefined) page.speaker = node.speaker;
    if (node.portrait !== undefined) page.portrait = node.portrait;
    if (last && node.choices && node.choices.length > 0) {
      page.choices = node.choices.map((c) => this.host.format(c.text));
    }
    return page;
  }

  private applyEffects(effects: EventCommand[] | undefined): void {
    if (!effects) return;
    for (const cmd of effects) {
      if (!DIALOG_EFFECT_COMMANDS.has(cmd.cmd)) {
        throw new DialogError(`effect ${cmd.cmd} is not allowed in dialogs`);
      }
      if (cmd.cmd === 'set_flag') {
        if (cmd.increment !== undefined) this.host.flags.increment(cmd.key, cmd.increment);
        else this.host.flags.set(cmd.key, cmd.value ?? true);
        continue;
      }
      this.host.applyEffect(cmd);
    }
  }
}
