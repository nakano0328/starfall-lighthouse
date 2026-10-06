import { describe, expect, it } from 'vitest';

import type { EventHost } from '@core/events/interpreter';
import { EventError, EventInterpreter, pickupMessage } from '@core/events/interpreter';
import { Flags } from '@core/flags';
import { Inventory } from '@core/inventory';
import type { EventCommand } from '@data/types';

type TestHost = EventHost & { log: string[]; resolvers: (() => void)[] };

/**
 * Recording host: every method logs its full argument list (so defaulted
 * arguments are visible), and every timed method parks a resolver in
 * `resolvers` until the test releases it.
 */
function makeHost(battleResult: 'win' | 'lose' = 'win'): TestHost {
  const log: string[] = [];
  const resolvers: (() => void)[] = [];
  const timed = (label: string) =>
    new Promise<void>((resolve) => {
      log.push(`${label}:start`);
      resolvers.push(() => {
        log.push(`${label}:end`);
        resolve();
      });
    });
  return {
    log,
    resolvers,
    flags: new Flags(),
    inventory: new Inventory(() => 99),
    itemName: (id) => (id === 'it_herb' ? 'やくそう' : id),
    say: (id) => timed(`say ${id}`),
    message: (text) => {
      log.push(`message ${text}`);
      return Promise.resolve();
    },
    choice: (texts) => {
      log.push(`choice ${texts.join('/')}`);
      return Promise.resolve(1);
    },
    move: (actor, path) => timed(`move ${actor} ${path.join(',')}`),
    face: (actor, dir) => {
      log.push(`face ${actor} ${dir}`);
    },
    wait: (ms) => timed(`wait ${ms}`),
    warp: (map, x, y, facing) => timed(`warp ${map} ${x} ${y} ${facing}`),
    fade: (dir, ms, color) => timed(`fade ${dir} ${ms} ${color}`),
    shake: (ms, intensity) => timed(`shake ${ms} ${intensity}`),
    flash: (ms, color) => timed(`flash ${ms} ${color}`),
    playBgm: (key, fadeMs) => {
      log.push(`bgm ${key} ${fadeMs}`);
    },
    playSe: (key) => {
      log.push(`se ${key}`);
    },
    giveGold: (amount) => {
      log.push(`gold ${amount}`);
    },
    healParty: () => {
      log.push('heal');
    },
    addMember: (id) => {
      log.push(`add ${id}`);
    },
    showChapter: (title) => timed(`chapter ${title}`),
    spawnNpc: (id) => {
      log.push(`spawn ${id}`);
    },
    removeNpc: (id) => {
      log.push(`remove ${id}`);
    },
    setTide: (tide) => timed(`tide ${tide}`),
    battle: (group, lose) => {
      log.push(`battle ${group} ${lose}`);
      return Promise.resolve(battleResult);
    },
    endGame: () => {
      log.push('end');
    },
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** Releases every timed call as soon as the interpreter issues it. */
async function drain(host: TestHost): Promise<void> {
  await flush();
  while (host.resolvers.length > 0) {
    host.resolvers.shift()?.();
    await flush();
  }
}

describe('EventInterpreter', () => {
  it('runs commands in order, awaiting each timed one', async () => {
    const host = makeHost();
    const events: Record<string, EventCommand[]> = {
      ev_a: [
        { cmd: 'play_bgm', key: 'none' },
        { cmd: 'say', dialog: 'dlg_x' },
        { cmd: 'face', actor: 'player', dir: 'up' },
        { cmd: 'set_flag', key: 'a.b', value: 3 },
        { cmd: 'set_flag', key: 'a.b', increment: 2 },
        { cmd: 'set_flag', key: 'a.c' },
      ],
    };
    const it = new EventInterpreter(host, events);
    const run = it.run('ev_a');
    await flush();
    expect(it.running).toBe(true);
    expect(host.log).toEqual(['bgm none 0', 'say dlg_x:start']);
    host.resolvers.shift()?.();
    await run;
    expect(it.running).toBe(false);
    expect(host.log.slice(2)).toEqual(['say dlg_x:end', 'face player up']);
    expect(host.flags.get('a.b', 0)).toBe(5);
    expect(host.flags.get('a.c', false)).toBe(true);
  });

  it('lets wait:false moves overlap and finishes them before the script ends', async () => {
    const host = makeHost();
    const it = new EventInterpreter(host, {
      ev_m: [
        { cmd: 'move', actor: 'npc_a', path: ['left'], wait: false },
        { cmd: 'face', actor: 'npc_b', dir: 'down' },
      ],
    });
    const run = it.run('ev_m');
    await flush();
    expect(host.log).toEqual(['move npc_a left:start', 'face npc_b down']);
    expect(it.running).toBe(true);
    host.resolvers.shift()?.();
    await run;
    expect(host.log.at(-1)).toBe('move npc_a left:end');
  });

  it('gives and takes items with pickup messages, resolves choices into flags', async () => {
    const host = makeHost();
    host.inventory.add('it_herb', 98);
    const it = new EventInterpreter(host, {
      ev_i: [
        { cmd: 'give_item', item: 'it_herb', qty: 3 },
        { cmd: 'take_item', item: 'it_herb', qty: 500 },
        { cmd: 'choice', text: ['はい', 'いいえ'], set: 'q.answer' },
      ],
    });
    await it.run('ev_i');
    expect(host.inventory.count('it_herb')).toBe(0);
    expect(host.log[0]).toBe('message やくそうを 手に入れた！（持ちきれない分は あきらめた）');
    expect(host.flags.get('q.answer', -1)).toBe(1);
  });

  it('passes every other command to the host with its defaults filled in', async () => {
    const host = makeHost();
    const it = new EventInterpreter(host, {
      ev_all: [
        { cmd: 'wait', ms: 5 },
        { cmd: 'move', actor: 'npc_a', path: ['up', 'right'] },
        { cmd: 'warp', map: 'map_x', x: 3, y: 4, facing: 'left' },
        { cmd: 'fade', dir: 'out', ms: 0 },
        { cmd: 'fade', dir: 'in', ms: 300, color: 'white' },
        { cmd: 'shake', ms: 200, intensity: 4 },
        { cmd: 'play_bgm', key: 'bgm_v' },
        { cmd: 'play_bgm', key: 'bgm_w', fade_ms: 500 },
        { cmd: 'play_se', key: 'se_chime' },
        { cmd: 'heal_party' },
        { cmd: 'add_member', id: 'ch_mio' },
        { cmd: 'show_chapter', title: '第一章' },
        { cmd: 'spawn_npc', id: 'npc_a' },
        { cmd: 'remove_npc', id: 'npc_a' },
        { cmd: 'flash', ms: 3 },
        { cmd: 'end_game' },
      ],
    });
    const done = expect(it.run('ev_all')).resolves.toBe('done');
    await drain(host);
    await done;
    expect(it.running).toBe(false);
    expect(host.log).toEqual([
      'wait 5:start',
      'wait 5:end',
      'move npc_a up,right:start',
      'move npc_a up,right:end',
      'warp map_x 3 4 left:start',
      'warp map_x 3 4 left:end',
      'fade out 0 black:start',
      'fade out 0 black:end',
      'fade in 300 white:start',
      'fade in 300 white:end',
      'shake 200 4:start',
      'shake 200 4:end',
      'bgm bgm_v 0',
      'bgm bgm_w 500',
      'se se_chime',
      'heal',
      'add ch_mio',
      'chapter 第一章:start',
      'chapter 第一章:end',
      'spawn npc_a',
      'remove npc_a',
      'flash 3 white:start',
      'flash 3 white:end',
      'end',
    ]);
  });

  it('sets the tide flag before asking the host to play the switch (§3.2)', async () => {
    const host = makeHost();
    const it = new EventInterpreter(host, {
      ev_toggle: [{ cmd: 'set_tide', value: 'toggle' }],
      ev_low: [{ cmd: 'set_tide', value: 'low' }],
    });
    // Unset means high tide, so the first toggle drains the ruins.
    let done = expect(it.run('ev_toggle')).resolves.toBe('done');
    await drain(host);
    await done;
    expect(host.flags.peek('ruins.tide')).toBe('low');
    done = expect(it.run('ev_toggle')).resolves.toBe('done');
    await drain(host);
    await done;
    expect(host.flags.peek('ruins.tide')).toBe('high');
    done = expect(it.run('ev_low')).resolves.toBe('done');
    await drain(host);
    await done;
    expect(host.flags.peek('ruins.tide')).toBe('low');
    expect(host.log).toEqual([
      'tide low:start',
      'tide low:end',
      'tide high:start',
      'tide high:end',
      'tide low:start',
      'tide low:end',
    ]);
  });

  it('runs the win event after a battle and rejects unknown events', async () => {
    const host = makeHost();
    const it = new EventInterpreter(host, {
      ev_b: [{ cmd: 'battle', group: 'grp_boss', win_event: 'ev_w' }],
      ev_w: [{ cmd: 'set_flag', key: 'forest.boss_defeated', value: true }],
      ev_plain: [{ cmd: 'battle', group: 'grp_plain' }],
    });
    await expect(it.run('ev_b')).resolves.toBe('done');
    expect(host.log).toEqual(['battle grp_boss gameover']);
    expect(host.flags.has('forest.boss_defeated')).toBe(true);
    await expect(it.run('ev_plain')).resolves.toBe('done');
    expect(host.log.at(-1)).toBe('battle grp_plain gameover');
    await expect(it.run('ev_nope')).rejects.toThrow(EventError);
  });

  it('stops the script after a lost battle with the default lose (gameover)', async () => {
    const host = makeHost('lose');
    const it = new EventInterpreter(host, {
      ev_b: [
        { cmd: 'battle', group: 'grp_boss', win_event: 'ev_w' },
        { cmd: 'set_flag', key: 'after.battle', value: true },
        { cmd: 'warp', map: 'map_x', x: 1, y: 1, facing: 'down' },
      ],
      ev_w: [{ cmd: 'set_flag', key: 'won', value: true }],
    });
    await expect(it.run('ev_b')).resolves.toBe('stopped');
    expect(host.log).toEqual(['battle grp_boss gameover']);
    expect(host.flags.has('after.battle')).toBe(false);
    expect(host.flags.has('won')).toBe(false);
    expect(it.running).toBe(false);
  });

  it('continues after a lost battle with lose:continue, skipping the win event', async () => {
    const host = makeHost('lose');
    const it = new EventInterpreter(host, {
      ev_b: [
        { cmd: 'battle', group: 'grp_event', win_event: 'ev_w', lose: 'continue' },
        { cmd: 'set_flag', key: 'after.battle', value: true },
      ],
      ev_w: [{ cmd: 'set_flag', key: 'won', value: true }],
    });
    await expect(it.run('ev_b')).resolves.toBe('done');
    expect(host.log).toEqual(['battle grp_event continue']);
    expect(host.flags.has('after.battle')).toBe(true);
    expect(host.flags.has('won')).toBe(false);
  });

  it('propagates a stop out of a nested win event', async () => {
    const host = makeHost();
    host.battle = (group, lose) => {
      host.log.push(`battle ${group} ${lose}`);
      return Promise.resolve(group === 'grp_second' ? 'lose' : 'win');
    };
    const it = new EventInterpreter(host, {
      ev_outer: [
        { cmd: 'battle', group: 'grp_first', win_event: 'ev_inner' },
        { cmd: 'set_flag', key: 'outer.after', value: true },
      ],
      ev_inner: [
        { cmd: 'battle', group: 'grp_second' },
        { cmd: 'set_flag', key: 'inner.after', value: true },
      ],
    });
    await expect(it.run('ev_outer')).resolves.toBe('stopped');
    expect(host.log).toEqual(['battle grp_first gameover', 'battle grp_second gameover']);
    expect(host.flags.has('inner.after')).toBe(false);
    expect(host.flags.has('outer.after')).toBe(false);
    expect(it.running).toBe(false);
  });

  it('refuses win events nested deeper than MAX_DEPTH and unwinds the depth', async () => {
    const host = makeHost();
    const it = new EventInterpreter(host, {
      ev_a: [{ cmd: 'battle', group: 'grp_x', win_event: 'ev_a' }],
    });
    await expect(it.run('ev_a')).rejects.toThrow(EventError);
    expect(host.log).toEqual(Array<string>(8).fill('battle grp_x gameover'));
    expect(it.running).toBe(false);
    host.log.length = 0;
    await expect(it.run('ev_a')).rejects.toThrow(/nesting/);
    expect(host.log).toHaveLength(8);
    expect(it.running).toBe(false);
  });

  it('formats pickup messages', () => {
    expect(pickupMessage('やくそう', 1, 1)).toBe('やくそうを 手に入れた！');
    expect(pickupMessage('やくそう', 2, 2)).toBe('やくそうを 2こ 手に入れた！');
    expect(pickupMessage('やくそう', 1, 3)).toBe(
      'やくそうを 手に入れた！（持ちきれない分は あきらめた）',
    );
    expect(pickupMessage('やくそう', 0, 1)).toBe('やくそうは これ以上 持てない。');
  });
});

describe('give_gold', () => {
  it('credits the wallet and announces the amount', async () => {
    const host = makeHost();
    const interpreter = new EventInterpreter(host, {
      ev_gold: [{ cmd: 'give_gold', amount: 300 }],
    });
    await interpreter.run('ev_gold');
    expect(host.log).toContain('gold 300');
    expect(host.log.some((l) => l.includes('300G'))).toBe(true);
  });
});
