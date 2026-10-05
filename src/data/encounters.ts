import type { EncounterGroup } from './types';

/** Encounter groups from docs/GAME_DESIGN.md §8.2 (23 entries). */
type Pack = readonly (readonly [enemyId: string, count: number])[];

const normal = (id: string, battleBgKey: string, pack: Pack): EncounterGroup => ({
  id,
  enemies: pack.map(([enemyId, count]) => ({ enemyId, count })),
  canEscape: true,
  battleBgKey,
  bgmKey: 'bgm_battle',
});

const boss = (id: string, battleBgKey: string, enemyId: string): EncounterGroup => ({
  id,
  enemies: [{ enemyId, count: 1 }],
  canEscape: false,
  battleBgKey,
  bgmKey: 'bgm_boss',
});

export const ENCOUNTERS: readonly EncounterGroup[] = [
  normal('grp_coast_a', 'bg_coast', [['en_lost_star_slime', 2]]),
  normal('grp_coast_b', 'bg_coast', [['en_lost_star_slime', 3]]),
  normal('grp_forest_a', 'bg_forest', [
    ['en_whisper_bat', 2],
    ['en_mushroom_kid', 1],
  ]),
  normal('grp_forest_b', 'bg_forest', [
    ['en_forest_wolf', 1],
    ['en_whisper_bat', 1],
  ]),
  normal('grp_forest_c', 'bg_forest', [
    ['en_thorn_vine', 1],
    ['en_mushroom_kid', 2],
  ]),
  normal('grp_forest_d', 'bg_forest', [
    ['en_forest_wolf', 2],
    ['en_thorn_vine', 1],
  ]),
  normal('grp_mine_a', 'bg_mine', [
    ['en_mine_rat', 2],
    ['en_glow_bug', 1],
  ]),
  normal('grp_mine_b', 'bg_mine', [['en_ore_spider', 2]]),
  normal('grp_mine_c', 'bg_mine', [
    ['en_minecart_ghost', 1],
    ['en_mine_rat', 1],
  ]),
  normal('grp_mine_d', 'bg_mine', [
    ['en_minecart_ghost', 1],
    ['en_ore_spider', 1],
    ['en_glow_bug', 1],
  ]),
  normal('grp_ruins_a', 'bg_ruins', [['en_tidepool_crab', 2]]),
  normal('grp_ruins_b', 'bg_ruins', [
    ['en_ruin_statue', 1],
    ['en_hollow_shell', 1],
  ]),
  normal('grp_ruins_c', 'bg_ruins', [
    ['en_hollow_shell', 2],
    ['en_tidepool_crab', 1],
  ]),
  normal('grp_ruins_d', 'bg_ruins', [['en_ruin_statue', 2]]),
  normal('grp_tower_a', 'bg_lighthouse', [['en_shadow_hand', 2]]),
  normal('grp_tower_b', 'bg_lighthouse', [
    ['en_false_light', 2],
    ['en_shadow_hand', 1],
  ]),
  normal('grp_tower_c', 'bg_lighthouse', [
    ['en_false_light', 1],
    ['en_lost_star_slime', 2],
  ]),
  normal('grp_tower_d', 'bg_lighthouse', [
    ['en_shadow_hand', 2],
    ['en_false_light', 1],
  ]),
  boss('grp_boss_tree', 'bg_forest', 'bo_old_tree_hollow'),
  boss('grp_boss_golem', 'bg_mine', 'bo_rock_golem'),
  boss('grp_boss_guardian', 'bg_ruins', 'bo_ruin_guardian'),
  boss('grp_boss_nox', 'bg_lighthouse_top', 'bo_nox_phase1'),
  boss('grp_boss_nox2', 'bg_lighthouse_top', 'bo_nox_phase2'),
];

const BY_ID = new Map(ENCOUNTERS.map((g) => [g.id, g] as const));

export function getEncounter(id: string): EncounterGroup {
  const group = BY_ID.get(id);
  if (!group) throw new Error(`unknown encounter group: ${id}`);
  return group;
}

export function findEncounter(id: string): EncounterGroup | undefined {
  return BY_ID.get(id);
}
