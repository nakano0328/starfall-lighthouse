import { describe, expect, it } from 'vitest';

import { createEnemyBattler, createPartyBattler } from '@core/battle/battlers';
import {
  applyRewards,
  computeRewards,
  dropChance,
  syncPartyAfterBattle,
} from '@core/battle/rewards';
import { fixedRng } from '@core/battle/rng';
import { setStatus } from '@core/battle/status';
import { Inventory } from '@core/inventory';
import { expForLevel } from '@core/party/exp';
import { createMember } from '@core/party/member';
import { CHARACTERS, getCharacter } from '@data/characters';
import { getEnemy } from '@data/enemies';
import { findEquip } from '@data/equipment';
import { getItem } from '@data/items';

const maxQtyOf = (id: string): number => getItem(id).maxQty;

describe('computeRewards', () => {
  it('sums EXP and gold of the defeated only and rolls their drops', () => {
    const slime = createEnemyBattler(0, getEnemy('en_lost_star_slime'));
    const wolf = createEnemyBattler(1, getEnemy('en_forest_wolf'));
    slime.ko = true;
    const party = [
      createPartyBattler(0, CHARACTERS.ch_luka, createMember(CHARACTERS.ch_luka), findEquip),
    ];

    const dropped = computeRewards([slime, wolf], party, fixedRng([0]));
    expect(dropped).toEqual({ exp: 7, gold: 5, drops: [{ itemId: 'it_herb', qty: 1 }] });

    const unlucky = computeRewards([slime, wolf], party, fixedRng([0.99]));
    expect(unlucky.drops).toEqual([]);

    wolf.ko = true;
    expect(computeRewards([slime, wolf], party, fixedRng([0.99]))).toMatchObject({
      exp: 22,
      gold: 15,
    });
  });

  it("scales the drop chance with the party's best LUK and caps it at 100%", () => {
    expect(dropChance(0.3, 0)).toBeCloseTo(0.3);
    expect(dropChance(0.3, 66)).toBeCloseTo(0.399);
    expect(dropChance(0.9, 200)).toBe(1);
  });

  it('honours boss drop quantities', () => {
    const tree = createEnemyBattler(0, getEnemy('bo_old_tree_hollow'));
    tree.ko = true;
    const rewards = computeRewards([tree], [], fixedRng([0.5]));
    expect(rewards.drops).toEqual([
      { itemId: 'it_fragment_1', qty: 1 },
      { itemId: 'it_potion_s', qty: 2 },
    ]);
  });
});

describe('applyRewards', () => {
  it('gives survivors full EXP, the fallen half, and reports level-ups with new skills', () => {
    const luka = createMember(CHARACTERS.ch_luka);
    const mio = createMember(CHARACTERS.ch_mio);
    mio.ko = true;
    const inventory = new Inventory(maxQtyOf);
    const wallet = { gold: 10 };

    const outcome = applyRewards(
      { exp: 100, gold: 25, drops: [{ itemId: 'it_herb', qty: 2 }] },
      [luka, mio],
      getCharacter,
      inventory,
      wallet,
    );

    expect(outcome.expByMember).toEqual([100, 50]);
    expect(luka.exp).toBe(100);
    expect(mio.exp).toBe(50);
    expect(wallet.gold).toBe(35);
    expect(inventory.count('it_herb')).toBe(2);
    // 100 EXP: Lv1 → Lv3 (80 needed), 50 EXP: Lv1 → Lv2 (20 needed).
    expect(outcome.levelUps.map((l) => [l.id, l.from, l.to])).toEqual([
      ['ch_luka', 1, 3],
      ['ch_mio', 1, 2],
    ]);
    const lukaUp = outcome.levelUps[0]!;
    expect(lukaUp.newSkills).toEqual(['sk_first_aid']);
    expect(lukaUp.gains).toEqual({ hp: 26, mp: 9, atk: 6, def: 4, spd: 4, luk: 2 });
    // Max HP/MP growth is granted on the spot.
    expect(luka.hp).toBe(42 + 26);
    expect(luka.mp).toBe(12 + 9);
    expect(outcome.levelUps[1]!.newSkills).toEqual([]);
  });

  it('does nothing special when nobody levels', () => {
    const goro = createMember(CHARACTERS.ch_goro, expForLevel(10));
    const outcome = applyRewards(
      { exp: 1, gold: 0, drops: [] },
      [goro],
      getCharacter,
      new Inventory(maxQtyOf),
      { gold: 0 },
    );
    expect(outcome.levelUps).toEqual([]);
    expect(goro.exp).toBe(expForLevel(10) + 1);
  });
});

describe('syncPartyAfterBattle', () => {
  it('writes HP/MP back, revives the fallen at HP 1 and drops every status', () => {
    const lukaMember = createMember(CHARACTERS.ch_luka);
    const mioMember = createMember(CHARACTERS.ch_mio);
    const luka = createPartyBattler(0, CHARACTERS.ch_luka, lukaMember, findEquip);
    const mio = createPartyBattler(1, CHARACTERS.ch_mio, mioMember, findEquip);
    luka.hp = 17;
    luka.mp = 3;
    setStatus(luka, 'poison');
    mio.ko = true;
    mio.hp = 0;
    mioMember.statuses = ['blind'];

    syncPartyAfterBattle([luka, mio], [lukaMember, mioMember]);

    expect(lukaMember).toMatchObject({ hp: 17, mp: 3, ko: false, statuses: [] });
    expect(mioMember).toMatchObject({ hp: 1, ko: false, statuses: [] });
  });

  it('skips battlers without a member index', () => {
    const member = createMember(CHARACTERS.ch_luka);
    const stray = createEnemyBattler(0, getEnemy('en_lost_star_slime'));
    syncPartyAfterBattle([stray], [member]);
    expect(member.hp).toBe(42);
  });
});
