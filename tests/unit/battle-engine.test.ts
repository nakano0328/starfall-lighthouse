import { describe, expect, it } from 'vitest';

import { createEnemyBattler, createPartyBattler } from '@core/battle/battlers';
import { BattleEngine, CHARGE_BREAK_LIGHT_DAMAGE } from '@core/battle/engine';
import { fixedRng, seededRng } from '@core/battle/rng';
import type { Rng } from '@core/battle/rng';
import { hasStatus, setStatus } from '@core/battle/status';
import type { BattleData, BattleEvent, Battler, Command } from '@core/battle/types';
import { Inventory } from '@core/inventory';
import { expForLevel } from '@core/party/exp';
import { createMember } from '@core/party/member';
import type { PartyMember } from '@core/party/member';
import { CHARACTERS } from '@data/characters';
import { getEncounter } from '@data/encounters';
import { getEnemy } from '@data/enemies';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import { getSkill } from '@data/skills';
import type { CharacterId } from '@data/types';

const data: BattleData = { skill: getSkill, item: findItem };
const maxQtyOf = (id: string): number => findItem(id)?.maxQty ?? 99;

function member(id: CharacterId, level = 1): PartyMember {
  return createMember(CHARACTERS[id], expForLevel(level));
}

function partyOf(...members: PartyMember[]): Battler[] {
  return members.map((m, i) => createPartyBattler(i, CHARACTERS[m.id], m, findEquip));
}

function enemiesOf(...ids: string[]): Battler[] {
  return ids.map((id, i) => createEnemyBattler(i, getEnemy(id)));
}

interface Setup {
  party?: Battler[];
  enemies?: Battler[];
  group?: string;
  rng?: Rng;
  inventory?: Inventory;
  preemptive?: boolean;
}

function engineWith(setup: Setup = {}): BattleEngine {
  const group = getEncounter(setup.group ?? 'grp_coast_a');
  return new BattleEngine({
    party: setup.party ?? partyOf(member('ch_luka')),
    enemies: setup.enemies ?? enemiesOf('en_lost_star_slime'),
    group,
    rng: setup.rng ?? fixedRng([0.5]),
    data,
    inventory: setup.inventory ?? new Inventory(maxQtyOf),
    ...(setup.preemptive === undefined ? {} : { preemptive: setup.preemptive }),
  });
}

/** Makes a battler effectively unkillable so multi-round boss mechanics can be observed. */
function fortify(b: Battler): void {
  b.stats = { ...b.stats, hp: 99_999, def: 10_000 };
  b.hp = b.stats.hp;
}

function commands(entries: Record<string, Command>): {
  kind: 'commands';
  commands: Record<string, Command>;
} {
  return { kind: 'commands', commands: entries };
}

function ofType<T extends BattleEvent['type']>(
  events: BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

describe('BattleEngine basics', () => {
  it('resolves a basic attack with the §5.3 formula and ends in victory on the last KO', () => {
    const engine = engineWith();
    const slime = engine.enemies[0]!;
    slime.hp = 1;
    const luka = engine.party[0]!;
    // Luka Lv1 + みならいの剣: ATK 14. Slime DEF 4 → base = 14 − 2 = 12, rand(0.5) = ×1.0.
    expect(luka.stats.atk).toBe(14);

    const events = engine.resolveRound(commands({ p0: { type: 'attack', target: 'e0' } }));

    expect(ofType(events, 'round_start')[0]).toEqual({ type: 'round_start', round: 1 });
    expect(ofType(events, 'damage')[0]).toMatchObject({ target: 'e0', amount: 12, crit: false });
    expect(ofType(events, 'ko')[0]).toEqual({ type: 'ko', target: 'e0' });
    expect(events.at(-1)).toEqual({ type: 'victory' });
    expect(engine.outcome).toBe('victory');
    expect(engine.resolveRound(commands({}))).toEqual([]);
  });

  it('halves damage while guarding and lifts the guard at round end', () => {
    const engine = engineWith();
    const luka = engine.party[0]!;
    const slime = engine.enemies[0]!;
    fortify(slime);
    // Slime ATK 8 vs Luka DEF 10 → base = 8 − 5 = 3; guarded → floor(1.5) = 1.
    const guarded = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    const guardEvent = guarded.findIndex((e) => e.type === 'guard');
    const enemyAction = guarded.findIndex((e) => e.type === 'action' && e.actor === 'e0');
    expect(guardEvent).toBeGreaterThanOrEqual(0);
    expect(guardEvent).toBeLessThan(enemyAction);
    expect(ofType(guarded, 'damage')[0]).toMatchObject({ target: 'p0', amount: 1 });
    expect(luka.guarding).toBe(false);

    const open = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    luka.guarding = false;
    const plain = engine.resolveRound(commands({ p0: { type: 'attack', target: 'e0' } }));
    expect(ofType(open, 'damage')[0]?.amount).toBe(1);
    expect(ofType(plain, 'damage').find((d) => d.target === 'p0')?.amount).toBe(3);
  });

  it('runs priority actions (items) before a faster enemy', () => {
    const inventory = new Inventory(maxQtyOf, [{ itemId: 'it_herb', qty: 1 }]);
    const engine = engineWith({ party: partyOf(member('ch_goro')), inventory });
    const goro = engine.party[0]!;
    const slime = engine.enemies[0]!;
    slime.stats = { ...slime.stats, spd: 50 };
    goro.hp = 10;

    const events = engine.resolveRound(
      commands({ p0: { type: 'item', itemId: 'it_herb', target: 'p0' } }),
    );
    const actors = ofType(events, 'action').map((a) => a.actor);
    expect(actors[0]).toBe('p0');
    expect(ofType(events, 'heal')[0]).toEqual({ type: 'heal', target: 'p0', amount: 30 });
    expect(inventory.count('it_herb')).toBe(0);
  });

  it('retargets to a surviving enemy when the chosen one already fell', () => {
    const engine = engineWith({
      party: partyOf(member('ch_luka'), member('ch_mio')),
      enemies: enemiesOf('en_lost_star_slime', 'en_lost_star_slime'),
    });
    for (const e of engine.enemies) e.hp = 1;
    const events = engine.resolveRound(
      commands({
        p0: { type: 'attack', target: 'e0' },
        p1: { type: 'attack', target: 'e0' },
      }),
    );
    expect(
      ofType(events, 'ko')
        .map((k) => k.target)
        .sort(),
    ).toEqual(['e0', 'e1']);
    expect(engine.outcome).toBe('victory');
  });

  it('reports defeat when the whole party is down', () => {
    const engine = engineWith();
    engine.party[0]!.hp = 1;
    const events = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(events, 'ko')[0]?.target).toBe('p0');
    expect(engine.outcome).toBe('defeat');
    expect(events.at(-1)).toEqual({ type: 'defeat' });
  });

  it('exposes the command helpers the scene needs', () => {
    const inventory = new Inventory(maxQtyOf, [
      { itemId: 'it_herb', qty: 2 },
      { itemId: 'it_key_shrine', qty: 1 },
      { itemId: 'eq_wp_luka_2', qty: 1 }, // spare equipment shares the bag and is not usable
    ]);
    const engine = engineWith({
      party: partyOf(member('ch_luka', 3), member('ch_mio')),
      inventory,
    });
    setStatus(engine.party[1]!, 'paralyze');
    expect(engine.commandableParty.map((p) => p.key)).toEqual(['p0']);
    expect(engine.skillsOf(engine.party[0]!).map((s) => s.id)).toEqual([
      'sk_star_light',
      'sk_first_aid',
    ]);
    expect(engine.battleItems().map((e) => e.item.id)).toEqual(['it_herb']);
    expect(engine.canEscape).toBe(true);
    expect(engine.find('e0')?.id).toBe('en_lost_star_slime');
    expect(engine.find('zz')).toBeUndefined();
  });

  it('ignores an item command whose id is not a consumable item', () => {
    const inventory = new Inventory(maxQtyOf, [{ itemId: 'eq_wp_luka_2', qty: 1 }]);
    const engine = engineWith({ inventory });
    const events = engine.resolveRound(
      commands({ p0: { type: 'item', itemId: 'eq_wp_luka_2', target: 'p0' } }),
    );
    expect(events.filter((e) => e.type === 'action').map((e) => e.actor)).toEqual(['e0']);
    expect(inventory.count('eq_wp_luka_2')).toBe(1);
  });
});

describe('BattleEngine escape and preemptive rounds', () => {
  it('escapes on a successful roll and clears battle state', () => {
    const engine = engineWith({ rng: fixedRng([0.1]) });
    setStatus(engine.party[0]!, 'poison');
    const events = engine.resolveRound({ kind: 'escape' });
    // 50 + (8 − 6) × 2 = 54%.
    expect(ofType(events, 'escape')[0]).toEqual({ type: 'escape', success: true, chance: 54 });
    expect(engine.outcome).toBe('escaped');
    expect(engine.party[0]!.statuses).toEqual([]);
  });

  it('lets the enemies act after a failed escape and raises the next chance', () => {
    const engine = engineWith({ rng: fixedRng([0.99]) });
    const events = engine.resolveRound({ kind: 'escape' });
    expect(ofType(events, 'escape')[0]?.success).toBe(false);
    expect(ofType(events, 'damage').some((d) => d.target === 'p0')).toBe(true);
    expect(engine.escapeFailures).toBe(1);
    const again = engine.resolveRound({ kind: 'escape' });
    expect(ofType(again, 'escape')[0]?.chance).toBe(69);
  });

  it('never escapes from a boss group', () => {
    const engine = engineWith({
      group: 'grp_boss_tree',
      enemies: enemiesOf('bo_old_tree_hollow'),
      rng: fixedRng([0]),
    });
    fortify(engine.party[0]!);
    const events = engine.resolveRound({ kind: 'escape' });
    expect(engine.canEscape).toBe(false);
    expect(ofType(events, 'escape')[0]?.success).toBe(false);
    expect(engine.outcome).toBe('ongoing');
  });

  it('skips the enemies on the first round of a preemptive battle only', () => {
    const engine = engineWith({ preemptive: true });
    fortify(engine.enemies[0]!);
    expect(engine.isPreemptive).toBe(true);
    const first = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(first, 'action')).toEqual([]);
    expect(ofType(first, 'message')[0]?.text).toContain('先制');
    expect(engine.isPreemptive).toBe(false);
    const second = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(second, 'action').map((a) => a.actor)).toEqual(['e0']);
  });

  it('also consumes the preemptive round on a failed escape', () => {
    const engine = engineWith({ preemptive: true, rng: fixedRng([0.99]) });
    const events = engine.resolveRound({ kind: 'escape' });
    expect(ofType(events, 'action')).toEqual([]);
    expect(engine.isPreemptive).toBe(false);
  });
});

describe('BattleEngine statuses', () => {
  it('makes a paralysed member skip and lets the status expire after two of their turns', () => {
    const engine = engineWith();
    fortify(engine.party[0]!);
    fortify(engine.enemies[0]!);
    setStatus(engine.party[0]!, 'paralyze');
    const r1 = engine.resolveRound(commands({ p0: { type: 'attack', target: 'e0' } }));
    expect(ofType(r1, 'paralyzed')).toEqual([{ type: 'paralyzed', actor: 'p0' }]);
    expect(ofType(r1, 'action').map((a) => a.actor)).toEqual(['e0']);
    const r2 = engine.resolveRound(commands({ p0: { type: 'attack', target: 'e0' } }));
    expect(ofType(r2, 'status_expired')).toEqual([
      { type: 'status_expired', target: 'p0', status: 'paralyze' },
    ]);
    expect(hasStatus(engine.party[0]!, 'paralyze')).toBe(false);
  });

  it('ticks poison after the actor moves and can KO them', () => {
    const engine = engineWith();
    const luka = engine.party[0]!;
    fortify(engine.enemies[0]!);
    luka.hp = 3;
    setStatus(luka, 'poison');
    const events = engine.resolveRound(commands({ p0: { type: 'attack', target: 'e0' } }));
    const actionIndex = events.findIndex((e) => e.type === 'action' && e.actor === 'p0');
    const poisonIndex = events.findIndex((e) => e.type === 'damage' && e.target === 'p0');
    expect(poisonIndex).toBeGreaterThan(actionIndex);
    expect(ofType(events, 'damage').find((d) => d.target === 'p0')?.amount).toBe(3);
    expect(engine.outcome).toBe('defeat');
  });

  it('applies debuffs by chance and reports immunity on bosses', () => {
    const engine = engineWith({
      party: partyOf(member('ch_mio', 4), member('ch_goro', 18)),
      enemies: enemiesOf('bo_rock_golem'),
      group: 'grp_boss_golem',
      // Boss blind resist 0.5: 70% × 0.5 = 35% > 0.3 roll; paralyze resist 1 → immune.
      rng: fixedRng([0.3]),
    });
    for (const p of engine.party) fortify(p);
    const events = engine.resolveRound(
      commands({
        p0: { type: 'skill', skillId: 'sk_smoke_bomb' },
        p1: { type: 'skill', skillId: 'sk_stun_hammer', target: 'e0' },
      }),
    );
    expect(ofType(events, 'status_applied')).toContainEqual({
      type: 'status_applied',
      target: 'e0',
      status: 'blind',
    });
    expect(ofType(events, 'status_resisted')).toContainEqual({
      type: 'status_resisted',
      target: 'e0',
      status: 'paralyze',
    });
    expect(engine.party[0]!.mp).toBe(engine.party[0]!.stats.mp - 5);
  });

  it('heals and cures with きよめのひかり, and refuses to cast without MP', () => {
    const engine = engineWith({ party: partyOf(member('ch_luka', 15)) });
    const luka = engine.party[0]!;
    fortify(engine.enemies[0]!);
    luka.hp = 10;
    setStatus(luka, 'poison');
    const events = engine.resolveRound(
      commands({ p0: { type: 'skill', skillId: 'sk_cure', target: 'p0' } }),
    );
    // 20 + 15 × 2 = 50, rand(0.5) → ×1.0.
    expect(ofType(events, 'heal')[0]).toEqual({ type: 'heal', target: 'p0', amount: 50 });
    expect(ofType(events, 'status_cured')).toEqual([
      { type: 'status_cured', target: 'p0', status: 'poison' },
    ]);

    luka.mp = 0;
    const dry = engine.resolveRound(
      commands({ p0: { type: 'skill', skillId: 'sk_star_light', target: 'e0' } }),
    );
    expect(ofType(dry, 'no_mp')).toEqual([{ type: 'no_mp', actor: 'p0' }]);
    expect(ofType(dry, 'damage').some((d) => d.target === 'e0')).toBe(false);
  });

  it('buffs the whole party with ときのこえ', () => {
    const engine = engineWith({ party: partyOf(member('ch_luka'), member('ch_goro', 14)) });
    fortify(engine.enemies[0]!);
    const events = engine.resolveRound(
      commands({ p0: { type: 'guard' }, p1: { type: 'skill', skillId: 'sk_war_cry' } }),
    );
    expect(
      ofType(events, 'status_applied')
        .map((s) => s.target)
        .sort(),
    ).toEqual(['p0', 'p1']);
    expect(hasStatus(engine.party[0]!, 'atk_up')).toBe(true);
  });

  it('redirects single-target enemy attacks to the taunting member', () => {
    const engine = engineWith({ party: partyOf(member('ch_luka'), member('ch_goro', 7)) });
    fortify(engine.enemies[0]!);
    const events = engine.resolveRound(
      commands({ p0: { type: 'guard' }, p1: { type: 'skill', skillId: 'sk_provoke' } }),
    );
    expect(hasStatus(engine.party[1]!, 'taunt')).toBe(true);
    const enemyHit = ofType(events, 'damage').find((d) => d.target.startsWith('p'));
    expect(enemyHit?.target).toBe('p1');
  });
});

describe('BattleEngine items and multi-hit skills', () => {
  it('uses potions, feathers and fire stones from the bag', () => {
    const inventory = new Inventory(maxQtyOf, [
      { itemId: 'it_potion_s', qty: 2 },
      { itemId: 'it_star_feather', qty: 1 },
      { itemId: 'it_fire_stone', qty: 1 },
    ]);
    const engine = engineWith({
      party: partyOf(member('ch_luka'), member('ch_mio'), member('ch_goro')),
      inventory,
    });
    const [luka, mio, goro] = engine.party as [Battler, Battler, Battler];
    const slime = engine.enemies[0]!;
    fortify(slime);
    luka.hp = 1;
    mio.ko = true;
    mio.hp = 0;

    const events = engine.resolveRound(
      commands({
        p0: { type: 'item', itemId: 'it_potion_s', target: 'p0' },
        p2: { type: 'item', itemId: 'it_star_feather', target: 'p1' },
      }),
    );
    expect(ofType(events, 'heal').find((h) => h.target === 'p0')?.amount).toBe(41);
    expect(ofType(events, 'revive')).toEqual([{ type: 'revive', target: 'p1' }]);
    expect(mio.ko).toBe(false);
    expect(mio.hp).toBe(18);
    expect(inventory.count('it_potion_s')).toBe(1);
    expect(inventory.count('it_star_feather')).toBe(0);

    const stone = engine.resolveRound(
      commands({
        p0: { type: 'guard' },
        p1: { type: 'guard' },
        p2: { type: 'item', itemId: 'it_fire_stone', target: 'e0' },
      }),
    );
    const hit = ofType(stone, 'damage').find((d) => d.target === 'e0');
    expect(hit).toMatchObject({ amount: 80, element: 'fire', crit: false });
    expect(goro.ko).toBe(false);
    expect(inventory.count('it_fire_stone')).toBe(0);
  });

  it('ignores an item the bag does not hold', () => {
    const engine = engineWith();
    fortify(engine.enemies[0]!);
    const events = engine.resolveRound(
      commands({ p0: { type: 'item', itemId: 'it_potion_s', target: 'p0' } }),
    );
    expect(ofType(events, 'action').map((a) => a.actor)).toEqual(['e0']);
  });

  it('strikes three random times with トリプルショット and drains MP with うつろ貝', () => {
    const engine = engineWith({
      party: partyOf(member('ch_mio', 20)),
      enemies: enemiesOf('en_lost_star_slime', 'en_lost_star_slime'),
    });
    for (const e of engine.enemies) fortify(e);
    const mio = engine.party[0]!;
    fortify(mio);
    const events = engine.resolveRound(
      commands({ p0: { type: 'skill', skillId: 'sk_triple_shot' } }),
    );
    expect(ofType(events, 'damage').filter((d) => d.target.startsWith('e'))).toHaveLength(3);

    const shell = engine.enemies[0]!;
    shell.ai = [
      {
        priority: 0,
        cond: { type: 'always' },
        action: 'sk_en_void_drain',
        target: 'random',
        weight: 1,
      },
    ];
    engine.enemies[1]!.ko = true;
    mio.mp = 12;
    const drain = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(drain, 'mp_drain')).toEqual([{ type: 'mp_drain', target: 'p0', amount: 10 }]);
    expect(mio.mp).toBe(2);
  });

  it('hits twice with ダブルショット but stops when the target drops', () => {
    const engine = engineWith({ party: partyOf(member('ch_mio')) });
    engine.enemies[0]!.hp = 1;
    const events = engine.resolveRound(
      commands({ p0: { type: 'skill', skillId: 'sk_double_shot', target: 'e0' } }),
    );
    expect(ofType(events, 'damage')).toHaveLength(1);
    expect(engine.outcome).toBe('victory');
  });
});

describe('BattleEngine boss mechanics', () => {
  it('golem 硬化 blocks physical hits, amplifies magic and cracks when it wears off', () => {
    const engine = engineWith({
      party: partyOf(member('ch_luka', 30), member('ch_goro', 30)),
      enemies: enemiesOf('bo_rock_golem'),
      group: 'grp_boss_golem',
    });
    for (const p of engine.party) fortify(p);
    const golem = engine.enemies[0]!;
    golem.stats = { ...golem.stats, hp: 99_999 };
    golem.hp = golem.stats.hp;
    setStatus(golem, 'harden');

    const r1 = engine.resolveRound(
      commands({
        p0: { type: 'skill', skillId: 'sk_star_light', target: 'e0' },
        p1: { type: 'attack', target: 'e0' },
      }),
    );
    const hits = ofType(r1, 'damage').filter((d) => d.target === 'e0');
    const physical = hits.find((d) => d.element !== 'light');
    const magic = hits.find((d) => d.element === 'light');
    expect(physical).toMatchObject({ amount: 0, immune: true });
    expect(magic?.immune).toBe(false);
    // Lv30 Luka ATK 96 + 5 (sword): 101 × 1.2 + 6 − 30 / 4 = 119.7 → ×1.5 (硬化) → 179.
    expect(magic?.amount).toBe(179);

    engine.resolveRound(commands({ p0: { type: 'guard' }, p1: { type: 'guard' } }));
    expect(hasStatus(golem, 'harden')).toBe(false);
    expect(hasStatus(golem, 'cracked')).toBe(true);
  });

  it('ノクス第 1 形態 acts twice per round below half HP and hands over to 第 2 形態', () => {
    const engine = engineWith({
      enemies: enemiesOf('bo_nox_phase1'),
      group: 'grp_boss_nox',
      rng: seededRng(7),
    });
    const luka = engine.party[0]!;
    fortify(luka);
    setStatus(luka, 'atk_up');
    setStatus(luka, 'poison');
    const nox = engine.enemies[0]!;
    nox.hp = 100;

    const r1 = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(r1, 'action').filter((a) => a.actor === 'e0')).toHaveLength(2);
    expect(nox.extraActs).toBe(1);

    nox.hp = 1;
    luka.stats = { ...luka.stats, atk: 500 };
    const r2 = engine.resolveRound(commands({ p0: { type: 'attack', target: 'e0' } }));
    expect(ofType(r2, 'phase_change')).toEqual([
      { type: 'phase_change', actor: 'e0', next: 'bo_nox_phase2' },
    ]);
    expect(engine.outcome).toBe('phase_change');
    expect(hasStatus(luka, 'atk_up')).toBe(true);
    expect(hasStatus(luka, 'poison')).toBe(false);

    engine.nextPhase(enemiesOf('bo_nox_phase2'));
    expect(engine.outcome).toBe('ongoing');
    expect(engine.enemies[0]!.id).toBe('bo_nox_phase2');
    const r3 = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(r3, 'round_start')[0]?.round).toBe(3);
  });

  it('ノクス第 2 形態 charges for two turns, then unleashes 星の消滅', () => {
    const engine = engineWith({
      enemies: enemiesOf('bo_nox_phase2'),
      group: 'grp_boss_nox2',
    });
    const luka = engine.party[0]!;
    fortify(luka);
    const nox = engine.enemies[0]!;
    nox.hp = 100;

    const r1 = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(r1, 'charge')).toEqual([{ type: 'charge', actor: 'e0', step: 1 }]);
    const r2 = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(r2, 'charge')).toEqual([{ type: 'charge', actor: 'e0', step: 2 }]);
    expect(ofType(r2, 'message').some((m) => m.text.includes('吸い寄せられて'))).toBe(true);
    const r3 = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(r3, 'action')[0]).toMatchObject({
      actor: 'e0',
      skillId: 'sk_bo_star_extinction',
    });
    expect(nox.charge).toBe(0);
  });

  it('breaks the charge with enough light damage and leaves 防御ダウン', () => {
    const engine = engineWith({
      party: partyOf(member('ch_luka', 30)),
      enemies: enemiesOf('bo_nox_phase2'),
      group: 'grp_boss_nox2',
    });
    const luka = engine.party[0]!;
    fortify(luka);
    luka.stats = { ...luka.stats, atk: 1000 };
    luka.weaponElement = 'light';
    const nox = engine.enemies[0]!;
    nox.charge = 1;

    const events = engine.resolveRound(commands({ p0: { type: 'attack', target: 'e0' } }));
    const hit = ofType(events, 'damage').find((d) => d.target === 'e0');
    expect(hit?.amount).toBeGreaterThanOrEqual(CHARGE_BREAK_LIGHT_DAMAGE);
    expect(ofType(events, 'charge_broken')).toEqual([{ type: 'charge_broken', actor: 'e0' }]);
    expect(hasStatus(nox, 'def_down')).toBe(true);
    // The charge-continuation it had decided on at round start is void.
    expect(ofType(events, 'action').filter((a) => a.actor === 'e0')).toEqual([]);
    expect(ofType(events, 'message').some((m) => m.text.includes('ひるんで'))).toBe(true);
    expect(nox.charge).toBe(0);
  });

  it('遺跡の番人 telegraphs 大潮 and casts it the following round', () => {
    const engine = engineWith({
      enemies: enemiesOf('bo_ruin_guardian'),
      group: 'grp_boss_guardian',
    });
    const luka = engine.party[0]!;
    fortify(luka);
    engine.round = 3;

    const omen = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(omen, 'action')[0]).toMatchObject({ actor: 'e0', skillId: 'sk_bo_tide_omen' });
    expect(ofType(omen, 'message').some((m) => m.text.includes('大きな波'))).toBe(true);
    expect(engine.enemies[0]!.charge).toBe(1);

    const tide = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(tide, 'action')[0]).toMatchObject({ actor: 'e0', skillId: 'sk_bo_great_tide' });
    expect(ofType(tide, 'damage').find((d) => d.target === 'p0')?.element).toBe('water');
    expect(engine.enemies[0]!.charge).toBe(0);
  });

  it('古木のウロ heals a flat amount with かけらのかがやき on every 4th round', () => {
    const engine = engineWith({
      enemies: enemiesOf('bo_old_tree_hollow'),
      group: 'grp_boss_tree',
    });
    fortify(engine.party[0]!);
    const tree = engine.enemies[0]!;
    tree.hp = 100;
    engine.round = 3;
    const events = engine.resolveRound(commands({ p0: { type: 'guard' } }));
    expect(ofType(events, 'action')[0]).toMatchObject({ skillId: 'sk_bo_fragment_glow' });
    expect(ofType(events, 'heal')).toEqual([{ type: 'heal', target: 'e0', amount: 60 }]);
  });

  it('survives a long seeded fight without throwing and ends in one outcome', () => {
    const engine = engineWith({
      party: partyOf(member('ch_luka', 12), member('ch_mio', 12), member('ch_goro', 12)),
      enemies: enemiesOf('en_ore_spider', 'en_minecart_ghost', 'en_mine_rat'),
      group: 'grp_mine_a',
      rng: seededRng(42),
    });
    let rounds = 0;
    while (engine.outcome === 'ongoing' && rounds < 50) {
      const input: Record<string, Command> = {};
      for (const p of engine.commandableParty) {
        const skill = engine.skillsOf(p).find((s) => s.mpCost <= p.mp && s.scope !== 'none');
        input[p.key] = skill
          ? { type: 'skill', skillId: skill.id, target: 'e0' }
          : { type: 'attack', target: 'e1' };
      }
      engine.resolveRound(commands(input));
      rounds += 1;
    }
    expect(['victory', 'defeat']).toContain(engine.outcome);
    expect(rounds).toBeLessThan(50);
  });
});
