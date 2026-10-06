import { describe, expect, it } from 'vitest';

import { evaluateCondition } from '@core/condition';
import type { DialogHost, DialogStep } from '@core/dialog/runner';
import { DialogRunner } from '@core/dialog/runner';
import type { EventHost } from '@core/events/interpreter';
import { EventInterpreter } from '@core/events/interpreter';
import type { FlagMap } from '@core/flags';
import { Flags } from '@core/flags';
import { Inventory } from '@core/inventory';
import type { DialogNodeJson } from '@data/dialogs';
import { DIALOGS } from '@data/dialogs';
import haganeDialogs from '@data/dialogs/hagane.json';
import mineDialogs from '@data/dialogs/mine.json';
import { EVENTS } from '@data/events';
import haganeEvents from '@data/events/hagane.json';
import mineEvents from '@data/events/mine.json';
import type { CharacterId, EventCommand } from '@data/types';

/**
 * Plays the chapter 2 story data (docs/GAME_DESIGN.md §13 rows 8–10, §14
 * sq_shining_ore) through the real DialogRunner / EventInterpreter, the same way
 * chapter1-script.test.ts does for chapters 0–1.
 *
 * The smith's hand-over branch uses the `item.<item_id>>=N` condition, which the
 * engine resolves against the bag. Without an inventory resolver a plain flag of
 * that name is honoured, so the tests set `item.it_shining_ore` on the flags next
 * to the real bag contents.
 */

/** Tighter than dialogs-data.test.ts (28): §10.1 says 3 lines × 22 chars as the target. */
const MAX_LINES = 3;
const MAX_LINE_CHARS = 22;

type TalkHost = DialogHost & { inventory: Inventory; gold: number; applied: EventCommand[] };

/** Dialog host that keeps a bag and a purse, like WorldScene's applyEffect. */
function talkHost(initial: FlagMap = {}): TalkHost {
  const inventory = new Inventory(() => 99);
  const host: TalkHost = {
    flags: new Flags(initial),
    inventory,
    gold: 0,
    applied: [],
    applyEffect: (cmd) => {
      host.applied.push(cmd);
      if (cmd.cmd === 'give_item') inventory.add(cmd.item, cmd.qty);
      else if (cmd.cmd === 'take_item') inventory.remove(cmd.item, cmd.qty);
      else if (cmd.cmd === 'give_gold') host.gold += cmd.amount;
    },
    format: (text) => text,
  };
  return host;
}

/** Puts `qty` ore in the bag and mirrors the count as the `item.` flag the condition reads. */
function holdOre(host: TalkHost, qty: number): void {
  host.inventory.remove('it_shining_ore', 99);
  host.inventory.add('it_shining_ore', qty);
  host.flags.set('item.it_shining_ore', qty);
}

/**
 * Plays a conversation to its end, picking `choose` on every choice page.
 * Returns the ids of the nodes that showed a page, in order.
 */
function talk(host: DialogHost, entry: string, choose = 0): string[] {
  const runner = new DialogRunner(DIALOGS, host);
  const seen: string[] = [];
  let step: DialogStep = runner.start(entry);
  let guard = 0;
  while (step.kind === 'page') {
    if ((guard += 1) > 200) throw new Error(`${entry}: conversation did not end`);
    if (seen.at(-1) !== step.nodeId) seen.push(step.nodeId);
    step = step.choices ? runner.choose(choose) : runner.advance();
  }
  return seen;
}

/** Every page shown by a conversation (no choices on the way), joined with newlines. */
function talkText(host: DialogHost, entry: string): string {
  const runner = new DialogRunner(DIALOGS, host);
  const pages: string[] = [];
  let step: DialogStep = runner.start(entry);
  while (step.kind === 'page') {
    pages.push(step.text);
    step = runner.advance();
  }
  return pages.join('\n');
}

type ScriptHost = EventHost & { log: string[]; gold: number };

/** Event host that records what a scene would show and keeps the real flags/bag. */
function scriptHost(initial: FlagMap = {}): ScriptHost {
  const host: ScriptHost = {
    log: [],
    gold: 0,
    flags: new Flags(initial),
    inventory: new Inventory(() => 99),
    itemName: (id) => id,
    say: (id) => {
      host.log.push(`say ${id}`);
      return Promise.resolve();
    },
    message: (text) => {
      host.log.push(`message ${text}`);
      return Promise.resolve();
    },
    choice: () => Promise.resolve(0),
    move: (actor, path) => {
      host.log.push(`move ${actor} ${path.join(',')}`);
      return Promise.resolve();
    },
    face: (actor, dir) => {
      host.log.push(`face ${actor} ${dir}`);
    },
    wait: () => Promise.resolve(),
    warp: () => Promise.resolve(),
    fade: () => Promise.resolve(),
    shake: () => Promise.resolve(),
    flash: () => Promise.resolve(),
    playBgm: () => undefined,
    playSe: (key) => {
      host.log.push(`se ${key}`);
    },
    healParty: () => undefined,
    addMember: (id: CharacterId) => {
      host.log.push(`add ${id}`);
    },
    giveGold: (amount) => {
      host.gold += amount;
    },
    showChapter: (title) => {
      host.log.push(`chapter ${title}`);
      return Promise.resolve();
    },
    spawnNpc: () => undefined,
    removeNpc: (id) => {
      host.log.push(`remove ${id}`);
    },
    battle: () => Promise.resolve('win'),
    endGame: () => undefined,
  };
  return host;
}

/** End of chapter 1 (§13 row 7): the mountain road is open, nothing in Hagane yet. */
const CHAPTER_2: FlagMap = {
  'main.chapter': 2,
  'minato.intro_done': true,
  'minato.mio_joined': true,
  'main.core_shattered': true,
  'minato.talked_to_grandpa': true,
  'forest.boss_defeated': true,
  'fragments.count': 1,
};
const ARRIVED: FlagMap = { ...CHAPTER_2, 'hagane.arrived': true };
const GORO_JOINED: FlagMap = { ...ARRIVED, 'hagane.goro_joined': true };
const CHAPTER_3: FlagMap = {
  ...GORO_JOINED,
  'main.chapter': 3,
  'mine.boss_defeated': true,
  'fragments.count': 2,
  'shop.hagane_tier3': true,
};

const STAGES: [string, FlagMap][] = [
  ['arrived', ARRIVED],
  ['goro_joined', GORO_JOINED],
  ['chapter 3', CHAPTER_3],
];

const TOWN_ROUTERS = [
  'dlg_hagane_elder',
  'dlg_hagane_miner_a',
  'dlg_hagane_miner_b',
  'dlg_hagane_child',
  'dlg_hagane_woman',
];

describe('chapter 2 script: townsfolk', () => {
  it.each(TOWN_ROUTERS)('%s changes with progress and always ends (§13 rows 8–10)', (entry) => {
    const reached = STAGES.map(([, flags]) => talk(talkHost(flags), entry));
    expect(reached).toEqual([[`${entry}_01`], [`${entry}_mine`], [`${entry}_ch3`]]);
    // Just arrived: the mine is sealed and Goro keeps the key.
    expect(talkText(talkHost(ARRIVED), entry)).toMatch(/ゴロー/);
    expect(talkText(talkHost(ARRIVED), entry)).toMatch(/かぎ/);
    // After the golem: the south road is open (shore / sunken ruins / scholar).
    expect(talkText(talkHost(CHAPTER_3), entry)).toMatch(/南|磯の道/);
  });

  it('the townsfolk talk the same before and after hagane.arrived', () => {
    for (const entry of TOWN_ROUTERS) {
      expect(talk(talkHost(CHAPTER_2), entry)).toEqual(talk(talkHost(ARRIVED), entry));
    }
  });

  it('the south guard keeps the shore road closed until the golem is beaten (§13 row 10)', () => {
    const reached = STAGES.map(([, flags]) => talk(talkHost(flags), 'dlg_hagane_south_guard'));
    expect(reached).toEqual([
      ['dlg_hagane_south_guard_closed'],
      ['dlg_hagane_south_guard_closed'],
      ['dlg_hagane_south_guard_open'],
    ]);
    expect(talkText(talkHost(ARRIVED), 'dlg_hagane_south_guard')).toContain('廃坑');
    expect(talkText(talkHost(CHAPTER_3), 'dlg_hagane_south_guard')).toContain('磯の道');
  });

  it('the item clerk mentions new stock only after the golem (§7.5)', () => {
    const reached = STAGES.map(([, flags]) => talk(talkHost(flags), 'dlg_hagane_clerk'));
    expect(reached).toEqual([
      ['dlg_hagane_clerk_01'],
      ['dlg_hagane_clerk_01'],
      ['dlg_hagane_clerk_ch3'],
    ]);
  });

  it('the innkeeper greets with the 40G rate and no effects (§7.6)', () => {
    const host = talkHost(ARRIVED);
    expect(talk(host, 'dlg_hagane_innkeeper')).toEqual(['dlg_hagane_innkeeper']);
    expect(DIALOGS['dlg_hagane_innkeeper']?.pages).toHaveLength(1);
    expect(talkText(host, 'dlg_hagane_innkeeper')).toContain('40G');
    expect(host.applied).toEqual([]);
  });

  it('Goro at home has a one-page fallback line with no effects', () => {
    const host = talkHost(ARRIVED);
    expect(talk(host, 'dlg_goro_home')).toEqual(['dlg_goro_home']);
    expect(DIALOGS['dlg_goro_home']?.pages).toEqual(['……なんだ？']);
    expect(host.applied).toEqual([]);
  });
});

describe('chapter 2 script: sq_shining_ore (§14)', () => {
  it('the smith only talks shop until Goro has joined', () => {
    for (const flags of [CHAPTER_2, ARRIVED]) {
      const host = talkHost(flags);
      expect(talk(host, 'dlg_hagane_smith')).toEqual(['dlg_hagane_smith_01']);
      expect(host.flags.get('sq.ore', 0)).toBe(0);
      expect(host.applied).toEqual([]);
    }
  });

  it('offers the quest once Goro has joined, and can be declined without starting', () => {
    const host = talkHost(GORO_JOINED);
    expect(talk(host, 'dlg_hagane_smith', 1)).toEqual([
      'dlg_hagane_smith_offer',
      'dlg_hagane_smith_decline',
    ]);
    expect(host.flags.get('sq.ore', 0)).toBe(0);
    expect(host.applied).toEqual([]);
    // Declining keeps the offer open.
    expect(talk(host, 'dlg_hagane_smith', 1)[0]).toBe('dlg_hagane_smith_offer');
    expect(DIALOGS['dlg_hagane_smith_offer']?.choices?.map((c) => c.text)).toEqual([
      'ひきうける',
      'また今度',
    ]);
  });

  it('accepting sets sq.ore to 1 and the smith then waits for three ore', () => {
    const host = talkHost(GORO_JOINED);
    expect(talk(host, 'dlg_hagane_smith', 0)).toEqual([
      'dlg_hagane_smith_offer',
      'dlg_hagane_smith_accept',
    ]);
    expect(host.flags.get('sq.ore', 0)).toBe(1);
    expect(host.applied).toEqual([]);

    // No ore at all, then two: still searching, bag untouched.
    expect(talk(host, 'dlg_hagane_smith')).toEqual(['dlg_hagane_smith_searching']);
    holdOre(host, 2);
    expect(talk(host, 'dlg_hagane_smith')).toEqual(['dlg_hagane_smith_searching']);
    expect(host.inventory.count('it_shining_ore')).toBe(2);
    expect(host.inventory.count('eq_wp_goro_4')).toBe(0);
    expect(host.flags.get('sq.ore', 0)).toBe(1);
    expect(talkText(host, 'dlg_hagane_smith')).toContain('まだ 3 つ そろっていないな');
  });

  it('hands over at three ore: ore −3, hammer +1, se_item, sq.ore 2, then thanks only', () => {
    const host = talkHost({ ...GORO_JOINED, 'sq.ore': 1 });
    holdOre(host, 3);
    expect(talk(host, 'dlg_hagane_smith')).toEqual(['dlg_hagane_smith_handover']);
    expect(host.inventory.count('it_shining_ore')).toBe(0);
    expect(host.inventory.count('eq_wp_goro_4')).toBe(1);
    expect(host.flags.get('sq.ore', 0)).toBe(2);
    expect(host.applied).toEqual([
      { cmd: 'take_item', item: 'it_shining_ore', qty: 3 },
      { cmd: 'give_item', item: 'eq_wp_goro_4', qty: 1 },
      { cmd: 'play_se', key: 'se_item' },
    ]);

    // Done: thanks, the hammer suits Goro, nothing paid twice even with more ore.
    holdOre(host, 3);
    expect(talk(host, 'dlg_hagane_smith')).toEqual(['dlg_hagane_smith_thanks']);
    expect(talkText(host, 'dlg_hagane_smith')).toContain('ゴロー');
    expect(host.inventory.count('eq_wp_goro_4')).toBe(1);
    expect(host.inventory.count('it_shining_ore')).toBe(3);
    expect(host.applied).toHaveLength(3);
  });

  it('routes the hand-over on the item.it_shining_ore>=3 bag condition', () => {
    const check = DIALOGS['dlg_hagane_smith_check'];
    expect(check?.branches?.[0]).toEqual({
      if: 'item.it_shining_ore>=3',
      next: 'dlg_hagane_smith_handover',
    });
    expect(check?.branches?.at(-1)).toEqual({ next: 'dlg_hagane_smith_searching' });
    expect(evaluateCondition('item.it_shining_ore>=3', new Flags({}))).toBe(false);
    expect(
      evaluateCondition('item.it_shining_ore>=3', new Flags({ 'item.it_shining_ore': 2 })),
    ).toBe(false);
    expect(
      evaluateCondition('item.it_shining_ore>=3', new Flags({ 'item.it_shining_ore': 3 })),
    ).toBe(true);
  });

  it('every smith path ends so the shop counter can follow', () => {
    const cases: [FlagMap, number][] = [
      [ARRIVED, 0],
      [GORO_JOINED, 0],
      [GORO_JOINED, 1],
      [{ ...GORO_JOINED, 'sq.ore': 1 }, 0],
      [{ ...GORO_JOINED, 'sq.ore': 1, 'item.it_shining_ore': 3 }, 0],
      [{ ...GORO_JOINED, 'sq.ore': 2 }, 0],
    ];
    for (const [flags, choose] of cases) {
      const host = talkHost(flags);
      host.inventory.add('it_shining_ore', host.flags.get('item.it_shining_ore', 0) as number);
      const seen = talk(host, 'dlg_hagane_smith', choose);
      expect(seen.length).toBeGreaterThan(0);
      const last = DIALOGS[seen.at(-1) ?? ''];
      expect(last?.next).toBeUndefined();
      expect(last?.choices).toBeUndefined();
    }
  });
});

describe('chapter 2 script: Goro joins (§13 row 9)', () => {
  it('plays Luka → Goro → Mio with the key handed over by the script, not the dialog', () => {
    const host = talkHost(ARRIVED);
    expect(talk(host, 'dlg_goro_join_01')).toEqual([
      'dlg_goro_join_01',
      'dlg_goro_join_02',
      'dlg_goro_join_03',
    ]);
    expect(host.applied).toEqual([]);
    expect(host.inventory.count('it_key_mine')).toBe(0);
    expect(DIALOGS['dlg_goro_join_01']?.speaker).toBe('ルカ');
    expect(DIALOGS['dlg_goro_join_02']?.speaker).toBe('ゴロー');
    expect(DIALOGS['dlg_goro_join_03']?.speaker).toBe('ミオ');
    expect(DIALOGS['dlg_goro_join_01']?.pages.join('')).toContain('欠片');
    expect(DIALOGS['dlg_goro_join_02']?.pages.join('')).toContain('かぎ');
  });

  it('ev_goro_join adds Goro with the mine key and sets hagane.goro_joined', async () => {
    expect(EVENTS['ev_goro_join']).toEqual([
      { cmd: 'say', dialog: 'dlg_goro_join_01' },
      { cmd: 'give_item', item: 'it_key_mine', qty: 1 },
      { cmd: 'play_se', key: 'se_item' },
      { cmd: 'remove_npc', id: 'npc_goro' },
      { cmd: 'add_member', id: 'ch_goro' },
      { cmd: 'set_flag', key: 'hagane.goro_joined', value: true },
    ]);
    const host = scriptHost(ARRIVED);
    await new EventInterpreter(host, EVENTS).run('ev_goro_join');
    expect(host.log).toEqual([
      'say dlg_goro_join_01',
      'message it_key_mineを 手に入れた！',
      'se se_item',
      'remove npc_goro',
      'add ch_goro',
    ]);
    expect(host.inventory.count('it_key_mine')).toBe(1);
    expect(host.flags.has('hagane.goro_joined')).toBe(true);
    expect(host.flags.get('main.chapter', -1)).toBe(2);
  });

  it('ev_hagane_arrive narrates the town and sets hagane.arrived (§13 row 8)', async () => {
    const host = scriptHost(CHAPTER_2);
    await new EventInterpreter(host, EVENTS).run('ev_hagane_arrive');
    expect(host.log).toEqual(['say dlg_hagane_arrive']);
    expect(host.flags.has('hagane.arrived')).toBe(true);
    expect(DIALOGS['dlg_hagane_arrive']?.speaker).toBeUndefined();
    const text = talkText(talkHost(CHAPTER_2), 'dlg_hagane_arrive');
    for (const word of ['レール', '廃坑', '封じ']) expect(text).toContain(word);
  });
});

describe('chapter 2 script: the mine', () => {
  it('ev_mine_vein has Goro dig one ore for the party', async () => {
    const host = scriptHost(GORO_JOINED);
    await new EventInterpreter(host, EVENTS).run('ev_mine_vein');
    expect(host.log).toEqual(['say dlg_mine_vein', 'message it_shining_oreを 手に入れた！']);
    expect(host.inventory.count('it_shining_ore')).toBe(1);

    const talker = talkHost(GORO_JOINED);
    expect(talk(talker, 'dlg_mine_vein')).toEqual(['dlg_mine_vein', 'dlg_mine_vein_goro']);
    expect(DIALOGS['dlg_mine_vein_goro']?.speaker).toBe('ゴロー');
    expect(talkText(talker, 'dlg_mine_vein')).toContain('ここは 俺が 掘る');
    // The ore comes from the script, so the dialog itself gives nothing.
    expect(talker.applied).toEqual([]);
  });

  it('ev_mine_boss_intro only plays the intro conversation', async () => {
    const host = scriptHost(GORO_JOINED);
    await new EventInterpreter(host, EVENTS).run('ev_mine_boss_intro');
    expect(host.log).toEqual(['say dlg_mine_boss_intro']);
    expect(talk(talkHost(GORO_JOINED), 'dlg_mine_boss_intro')).toEqual([
      'dlg_mine_boss_intro',
      'dlg_mine_boss_intro_goro',
      'dlg_mine_boss_intro_luka',
    ]);
    expect(talkText(talkHost(GORO_JOINED), 'dlg_mine_boss_intro')).toContain('守り手');
  });

  it('ev_mine_boss_win sets fragments.count to 2 by value, tier3 and chapter 3 (§13 row 10)', async () => {
    const host = scriptHost(GORO_JOINED);
    const it = new EventInterpreter(host, EVENTS);
    await it.run('ev_mine_boss_win');
    expect(host.log).toEqual([
      'say dlg_mine_boss_win',
      'message it_fragment_2を 手に入れた！',
      'chapter 第三章　沈んだ遺跡',
    ]);
    expect(host.inventory.count('it_fragment_2')).toBe(1);
    expect(host.flags.get('fragments.count', -1)).toBe(2);
    expect(host.flags.has('mine.boss_defeated')).toBe(true);
    expect(host.flags.has('shop.hagane_tier3')).toBe(true);
    expect(host.flags.get('main.chapter', -1)).toBe(3);

    // §13 補足: the count is written, never incremented, so a replay cannot reach 3.
    const countCmd = EVENTS['ev_mine_boss_win']?.find(
      (c) => c.cmd === 'set_flag' && c.key === 'fragments.count',
    );
    expect(countCmd).toEqual({ cmd: 'set_flag', key: 'fragments.count', value: 2 });
    await it.run('ev_mine_boss_win');
    expect(host.flags.get('fragments.count', -1)).toBe(2);

    expect(talk(talkHost(CHAPTER_3), 'dlg_mine_boss_win')).toEqual([
      'dlg_mine_boss_win',
      'dlg_mine_boss_win_goro',
    ]);
    expect(DIALOGS['dlg_mine_boss_win_goro']?.pages).toHaveLength(2);
    expect(talkText(talkHost(CHAPTER_3), 'dlg_mine_boss_win')).toContain('欠片');
  });
});

describe('chapter 2 script: references', () => {
  const newDialogs: Record<string, DialogNodeJson> = {
    ...(haganeDialogs as Record<string, DialogNodeJson>),
    ...(mineDialogs as Record<string, DialogNodeJson>),
  };
  const newEvents: Record<string, EventCommand[]> = {
    ...(haganeEvents as Record<string, EventCommand[]>),
    ...(mineEvents as Record<string, EventCommand[]>),
  };

  it('every next, branch and choice target in the new dialogs exists', () => {
    for (const [id, node] of Object.entries(newDialogs)) {
      const targets = [
        node.next,
        ...(node.branches ?? []).map((b) => b.next),
        ...(node.choices ?? []).map((c) => c.next),
      ].filter((t): t is string => t !== undefined);
      for (const t of targets) expect(DIALOGS[t], `${id} → ${t}`).toBeDefined();
    }
    expect(Object.keys(newDialogs)).toEqual(
      expect.arrayContaining([
        'dlg_sign_mountain_entrance',
        'dlg_sign_mountain_mine',
        'dlg_sign_hagane',
        'dlg_mine_door_locked',
        'dlg_hagane_south_guard',
        ...TOWN_ROUTERS,
        'dlg_hagane_innkeeper',
        'dlg_hagane_clerk',
        'dlg_hagane_smith',
        'dlg_goro_home',
        'dlg_goro_join_01',
        'dlg_goro_join_02',
        'dlg_goro_join_03',
        'dlg_hagane_arrive',
        'dlg_sign_mine_b1',
        'dlg_sign_mine_b2',
        'dlg_sign_mine_b3',
        'dlg_mine_vein',
        'dlg_mine_boss_intro',
        'dlg_mine_boss_win',
      ]),
    );
  });

  it('every say in the new events names an existing dialog', () => {
    for (const [id, commands] of Object.entries(newEvents)) {
      for (const c of commands) {
        if (c.cmd === 'say') expect(DIALOGS[c.dialog], `${id} say ${c.dialog}`).toBeDefined();
      }
    }
    expect(Object.keys(newEvents).sort()).toEqual([
      'ev_goro_join',
      'ev_hagane_arrive',
      'ev_mine_boss_intro',
      'ev_mine_boss_win',
      'ev_mine_vein',
    ]);
  });

  it('keeps every page within 3 lines × 22 chars (§10.1)', () => {
    for (const [id, node] of Object.entries(newDialogs)) {
      node.pages.forEach((page, i) => {
        const lines = page.split('\n');
        expect(lines.length, `${id} page ${i} lines`).toBeLessThanOrEqual(MAX_LINES);
        for (const line of lines) {
          expect([...line].length, `${id} page ${i}: "${line}"`).toBeLessThanOrEqual(
            MAX_LINE_CHARS,
          );
        }
      });
    }
  });

  it('the mine signs warn about the flooded gallery and the sleeping guardian', () => {
    expect(talkText(talkHost(), 'dlg_sign_mine_b2')).toContain('水没');
    expect(talkText(talkHost(), 'dlg_sign_mine_b3')).toContain('守り手');
    expect(talkText(talkHost(), 'dlg_sign_mountain_mine')).toMatch(/ゴロー/);
    expect(talkText(talkHost(), 'dlg_mine_door_locked')).toContain('廃坑のかぎ');
  });
});
