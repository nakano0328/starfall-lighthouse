import { describe, expect, it } from 'vitest';

import type { DialogHost, DialogStep } from '@core/dialog/runner';
import { DialogRunner } from '@core/dialog/runner';
import type { EventHost } from '@core/events/interpreter';
import { EventInterpreter } from '@core/events/interpreter';
import type { FlagMap } from '@core/flags';
import { Flags } from '@core/flags';
import { Inventory } from '@core/inventory';
import type { DialogNodeJson } from '@data/dialogs';
import { DIALOGS } from '@data/dialogs';
import forestDialogs from '@data/dialogs/forest.json';
import minatoDialogs from '@data/dialogs/minato.json';
import { EVENTS } from '@data/events';
import forestEvents from '@data/events/forest.json';
import minatoEvents from '@data/events/minato.json';
import type { CharacterId, EventCommand } from '@data/types';

/**
 * Plays the chapter 0–1 story data (docs/GAME_DESIGN.md §10.3, §13 rows 2–7 and 15,
 * §14 sq_lost_necklace) through the real DialogRunner / EventInterpreter, so a
 * mis-ordered branch or a forgotten effect fails here rather than in play-testing.
 */

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
    face: () => undefined,
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

const AFTER_OPENING: FlagMap = { 'main.chapter': 0, 'minato.intro_done': true };
const AFTER_MIO: FlagMap = { ...AFTER_OPENING, 'minato.mio_joined': true };
const AFTER_SHATTER: FlagMap = {
  ...AFTER_MIO,
  'main.chapter': 1,
  'main.core_shattered': true,
  'fragments.count': 0,
};
const AFTER_GRANDPA: FlagMap = { ...AFTER_SHATTER, 'minato.talked_to_grandpa': true };
const CHAPTER_2: FlagMap = {
  ...AFTER_GRANDPA,
  'main.chapter': 2,
  'forest.boss_defeated': true,
  'fragments.count': 1,
};
const THREE_FRAGMENTS: FlagMap = { ...CHAPTER_2, 'main.chapter': 4, 'fragments.count': 3 };

describe('chapter 1 script: grandpa', () => {
  it.each<[string, FlagMap, string]>([
    ['on a new game', {}, 'dlg_grandpa_01'],
    ['after the opening', AFTER_OPENING, 'dlg_grandpa_02'],
    ['after the core shatters', AFTER_SHATTER, 'dlg_grandpa_after_shatter'],
    ['once he has pointed to the shrine', AFTER_GRANDPA, 'dlg_grandpa_wait_forest'],
    ['in chapter 2', CHAPTER_2, 'dlg_grandpa_wait_mountain'],
    ['with three fragments', THREE_FRAGMENTS, 'dlg_grandpa_final'],
    [
      'once the lighthouse is unlocked',
      { ...THREE_FRAGMENTS, 'minato.lighthouse_unlocked': true },
      'dlg_grandpa_go_lighthouse',
    ],
  ])('routes dlg_grandpa_entry %s', (_label, flags, expected) => {
    expect(talk(talkHost(flags), 'dlg_grandpa_entry')[0]).toBe(expected);
  });

  it('keeps the opening flow: oil, intro_done, then the choice', () => {
    const host = talkHost();
    expect(talk(host, 'dlg_grandpa_entry', 1)).toEqual([
      'dlg_grandpa_01',
      'dlg_grandpa_02',
      'dlg_grandpa_03b',
    ]);
    expect(host.inventory.count('it_lamp_oil')).toBe(1);
    expect(host.flags.has('minato.intro_done')).toBe(true);
    expect(host.flags.has('minato.luka_scared')).toBe(true);
    expect(host.flags.has('minato.talked_to_grandpa')).toBe(false);
  });

  it('after the shatter names the shrine, hands over three herbs once and opens the east road', () => {
    const host = talkHost(AFTER_SHATTER);
    expect(talk(host, 'dlg_grandpa_entry')).toEqual([
      'dlg_grandpa_after_shatter',
      'dlg_grandpa_after_shatter_mio',
    ]);
    expect(host.inventory.count('it_herb')).toBe(3);
    expect(host.flags.has('minato.talked_to_grandpa')).toBe(true);
    const page = DIALOGS['dlg_grandpa_after_shatter']?.pages.join('\n') ?? '';
    expect(page).toContain('森の祠');
    // A second visit repeats the direction without a second gift.
    expect(talk(host, 'dlg_grandpa_entry')).toEqual(['dlg_grandpa_wait_forest']);
    expect(host.inventory.count('it_herb')).toBe(3);
  });

  it('with three fragments gives the key, the letter and two feathers, once (§13 row 15)', () => {
    const host = talkHost(THREE_FRAGMENTS);
    expect(talk(host, 'dlg_grandpa_entry')).toEqual(['dlg_grandpa_final']);
    expect(host.inventory.count('it_key_lighthouse')).toBe(1);
    expect(host.inventory.count('it_grandpa_letter')).toBe(1);
    expect(host.inventory.count('it_star_feather')).toBe(2);
    expect(host.flags.has('minato.lighthouse_unlocked')).toBe(true);
    expect(talk(host, 'dlg_grandpa_entry')).toEqual(['dlg_grandpa_go_lighthouse']);
    expect(host.inventory.count('it_star_feather')).toBe(2);
    expect(host.inventory.count('it_key_lighthouse')).toBe(1);
  });
});

describe('chapter 1 script: villagers', () => {
  const STAGES: [string, FlagMap][] = [
    ['prologue', {}],
    ['intro_done', AFTER_OPENING],
    ['core_shattered', AFTER_SHATTER],
    ['talked_to_grandpa', AFTER_GRANDPA],
    ['chapter 2', CHAPTER_2],
  ];

  it.each(['dlg_minato_boy', 'dlg_minato_fisher', 'dlg_minato_granny'])(
    '%s changes with progress and always ends',
    (entry) => {
      const reached = STAGES.map(([, flags]) => talk(talkHost(flags), entry));
      expect(reached).toEqual([
        [`${entry}_01`],
        [`${entry}_lighthouse`],
        [`${entry}_shattered`],
        [`${entry}_shattered`],
        [`${entry}_ch2`],
      ]);
    },
  );

  it('the guard sends the player to grandpa after the shatter and east afterwards (§13 rows 4–5)', () => {
    const reached = STAGES.map(([, flags]) => talk(talkHost(flags), 'dlg_minato_guard'));
    expect(reached).toEqual([
      ['dlg_minato_guard_01'],
      ['dlg_minato_guard_lighthouse'],
      ['dlg_minato_guard_shattered'],
      ['dlg_minato_guard_open'],
      ['dlg_minato_guard_ch2'],
    ]);
    expect(DIALOGS['dlg_minato_guard_shattered']?.pages.join('')).toContain('じいさん');
    expect(DIALOGS['dlg_minato_guard_ch2']?.pages.join('')).toContain('山道');
  });

  it('Mio waits by the north exit with a single page before joining', () => {
    const host = talkHost(AFTER_OPENING);
    expect(talk(host, 'dlg_mio_idle')).toEqual(['dlg_mio_idle']);
    expect(DIALOGS['dlg_mio_idle']?.pages).toHaveLength(1);
    expect(host.applied).toEqual([]);
  });
});

describe('chapter 1 script: sq_lost_necklace (§14)', () => {
  it('is offered only once Mio has joined, and can be declined without starting', () => {
    const host = talkHost(AFTER_OPENING);
    expect(talk(host, 'dlg_minato_innkeeper')).toEqual(['dlg_minato_innkeeper_01']);
    host.flags.set('minato.mio_joined', true);
    expect(talk(host, 'dlg_minato_innkeeper', 1)).toEqual([
      'dlg_minato_innkeeper_offer',
      'dlg_minato_innkeeper_decline',
    ]);
    expect(host.flags.get('sq.necklace', 0)).toBe(0);
    expect(host.applied).toEqual([]);
    // Declining keeps the offer open.
    expect(talk(host, 'dlg_minato_innkeeper', 1)[0]).toBe('dlg_minato_innkeeper_offer');
  });

  it('runs accept → searching → hand-over → thanks, paying the ring, 300G and a free inn', () => {
    const host = talkHost(AFTER_MIO);
    expect(talk(host, 'dlg_minato_innkeeper', 0)).toEqual([
      'dlg_minato_innkeeper_offer',
      'dlg_minato_innkeeper_accept',
    ]);
    expect(host.flags.get('sq.necklace', 0)).toBe(1);
    expect(talk(host, 'dlg_minato_innkeeper')).toEqual(['dlg_minato_innkeeper_searching']);
    expect(host.gold).toBe(0);

    host.inventory.add('it_shell_necklace', 1);
    host.flags.set('chest.forest_05', true);
    expect(talk(host, 'dlg_minato_innkeeper')).toEqual(['dlg_minato_innkeeper_handover']);
    expect(host.inventory.count('it_shell_necklace')).toBe(0);
    expect(host.inventory.count('eq_acc_sea_ring')).toBe(1);
    expect(host.gold).toBe(300);
    expect(host.applied).toContainEqual({ cmd: 'give_gold', amount: 300 });
    expect(host.flags.get('sq.necklace', 0)).toBe(2);
    expect(host.flags.has('minato.inn_free')).toBe(true);

    // Done: thanks only, nothing paid twice.
    expect(talk(host, 'dlg_minato_innkeeper')).toEqual(['dlg_minato_innkeeper_thanks']);
    expect(host.gold).toBe(300);
    expect(host.inventory.count('eq_acc_sea_ring')).toBe(1);
  });

  it('hands over even when the chest was opened before accepting', () => {
    const host = talkHost({ ...AFTER_MIO, 'chest.forest_05': true });
    host.inventory.add('it_shell_necklace', 1);
    expect(talk(host, 'dlg_minato_innkeeper', 0).at(-1)).toBe('dlg_minato_innkeeper_accept');
    expect(talk(host, 'dlg_minato_innkeeper')).toEqual(['dlg_minato_innkeeper_handover']);
    expect(host.flags.get('sq.necklace', 0)).toBe(2);
  });
});

describe('chapter 1 script: events', () => {
  it('copies ev_mio_join and ev_core_shatter from §10.3 verbatim', () => {
    expect(EVENTS['ev_mio_join']).toEqual([
      { cmd: 'move', actor: 'npc_mio', path: ['left', 'left', 'left'], wait: true },
      { cmd: 'face', actor: 'player', dir: 'right' },
      { cmd: 'say', dialog: 'dlg_mio_join_01' },
      { cmd: 'give_item', item: 'it_mio_lunch', qty: 1 },
      { cmd: 'remove_npc', id: 'npc_mio' },
      { cmd: 'add_member', id: 'ch_mio' },
      { cmd: 'set_flag', key: 'minato.mio_joined', value: true },
    ]);
    expect(EVENTS['ev_core_shatter']).toEqual([
      { cmd: 'say', dialog: 'dlg_shatter_01' },
      { cmd: 'take_item', item: 'it_lamp_oil', qty: 1 },
      { cmd: 'play_bgm', key: 'none', fade_ms: 500 },
      { cmd: 'wait', ms: 600 },
      { cmd: 'play_se', key: 'se_shatter' },
      { cmd: 'flash', ms: 300, color: 'white' },
      { cmd: 'shake', ms: 1200, intensity: 0.6 },
      { cmd: 'say', dialog: 'dlg_shatter_02' },
      { cmd: 'set_flag', key: 'main.core_shattered', value: true },
      { cmd: 'set_flag', key: 'fragments.count', value: 0 },
      { cmd: 'set_flag', key: 'main.chapter', value: 1 },
      { cmd: 'play_bgm', key: 'bgm_field', fade_ms: 1000 },
      { cmd: 'show_chapter', title: '第一章　ささやきの森' },
    ]);
  });

  it('ev_mio_join adds Mio with her lunch and ev_core_shatter spends the oil (§13 rows 3–4)', async () => {
    const host = scriptHost(AFTER_OPENING);
    host.inventory.add('it_lamp_oil', 1);
    const it = new EventInterpreter(host, EVENTS);
    await it.run('ev_mio_join');
    expect(host.log).toEqual([
      'move npc_mio left,left,left',
      'say dlg_mio_join_01',
      'message it_mio_lunchを 手に入れた！',
      'remove npc_mio',
      'add ch_mio',
    ]);
    expect(host.inventory.count('it_mio_lunch')).toBe(1);
    expect(host.flags.has('minato.mio_joined')).toBe(true);

    host.log.length = 0;
    await it.run('ev_core_shatter');
    expect(host.log).toEqual([
      'say dlg_shatter_01',
      'se se_shatter',
      'say dlg_shatter_02',
      'chapter 第一章　ささやきの森',
    ]);
    expect(host.inventory.count('it_lamp_oil')).toBe(0);
    expect(host.flags.has('main.core_shattered')).toBe(true);
    expect(host.flags.get('fragments.count', -1)).toBe(0);
    expect(host.flags.get('main.chapter', -1)).toBe(1);
  });

  it('ev_forest_boss_win sets fragments.count to 1 by value and opens chapter 2 (§13 row 7)', async () => {
    const host = scriptHost(AFTER_GRANDPA);
    const it = new EventInterpreter(host, EVENTS);
    await it.run('ev_forest_boss_win');
    expect(host.log).toEqual([
      'say dlg_forest_boss_win',
      'message it_fragment_1を 手に入れた！',
      'chapter 第二章　鉱山町と廃坑',
    ]);
    expect(host.inventory.count('it_fragment_1')).toBe(1);
    expect(host.flags.get('fragments.count', -1)).toBe(1);
    expect(host.flags.has('forest.boss_defeated')).toBe(true);
    expect(host.flags.get('main.chapter', -1)).toBe(2);

    // §13 補足: the count is written, never incremented, so a replay cannot reach 2.
    const countCmd = EVENTS['ev_forest_boss_win']?.find(
      (c) => c.cmd === 'set_flag' && c.key === 'fragments.count',
    );
    expect(countCmd).toEqual({ cmd: 'set_flag', key: 'fragments.count', value: 1 });
    await it.run('ev_forest_boss_win');
    expect(host.flags.get('fragments.count', -1)).toBe(1);
  });

  it('ev_forest_boss_intro only plays the intro conversation', async () => {
    const host = scriptHost(AFTER_GRANDPA);
    await new EventInterpreter(host, EVENTS).run('ev_forest_boss_intro');
    expect(host.log).toEqual(['say dlg_forest_boss_intro']);
    expect(talk(talkHost(AFTER_GRANDPA), 'dlg_forest_boss_intro')).toEqual([
      'dlg_forest_boss_intro',
      'dlg_forest_boss_intro_mio',
      'dlg_forest_boss_intro_luka',
    ]);
    expect(talk(talkHost(CHAPTER_2), 'dlg_forest_boss_win')).toEqual([
      'dlg_forest_boss_win',
      'dlg_forest_boss_win_luka',
      'dlg_forest_boss_win_mio',
    ]);
  });
});

describe('chapter 1 script: references', () => {
  const newDialogs: Record<string, DialogNodeJson> = {
    ...(forestDialogs as Record<string, DialogNodeJson>),
    ...(minatoDialogs as Record<string, DialogNodeJson>),
  };
  const newEvents: Record<string, EventCommand[]> = {
    ...(forestEvents as Record<string, EventCommand[]>),
    ...(minatoEvents as Record<string, EventCommand[]>),
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
    expect(Object.keys(newDialogs)).toEqual(expect.arrayContaining(['dlg_mio_idle']));
  });

  it('every say in the new events names an existing dialog', () => {
    for (const [id, commands] of Object.entries(newEvents)) {
      for (const c of commands) {
        if (c.cmd === 'say') expect(DIALOGS[c.dialog], `${id} say ${c.dialog}`).toBeDefined();
      }
    }
    expect(Object.keys(newEvents)).toEqual(
      expect.arrayContaining(['ev_mio_join', 'ev_core_shatter', 'ev_forest_boss_intro']),
    );
  });

  it('the shatter narration sends the shards to the forest, the mine and the sea', () => {
    const text = talkPages('dlg_shatter_02').join('\n');
    for (const place of ['森', '廃坑', '海']) expect(text).toContain(place);
  });

  function talkPages(entry: string): string[] {
    const runner = new DialogRunner(DIALOGS, talkHost());
    const pages: string[] = [];
    let step: DialogStep = runner.start(entry);
    while (step.kind === 'page') {
      pages.push(step.text);
      step = runner.advance();
    }
    return pages;
  }
});
