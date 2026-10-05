import type { CharacterId, Element, EquipDef, EquipSlot, Stats } from './types';

/**
 * Weapons, armor and accessories from docs/GAME_DESIGN.md §7.2–§7.4 (28 entries).
 * Weapon/armor tiers follow the id suffix (_1.._4, cloth/leather/chain/star).
 */
type ArmorTierName = 'cloth' | 'leather' | 'chain' | 'star';

const ARMOR_TIER: Readonly<Record<ArmorTierName, EquipDef['tier']>> = {
  cloth: 1,
  leather: 2,
  chain: 3,
  star: 4,
};

const ALL_CHARACTERS: readonly CharacterId[] = ['ch_luka', 'ch_mio', 'ch_goro'];

const weapon = (
  id: string,
  name: string,
  description: string,
  owner: CharacterId,
  tier: EquipDef['tier'],
  price: number,
  bonus: Partial<Stats>,
  element?: Exclude<Element, 'none'>,
): EquipDef => ({
  id,
  name,
  description,
  slot: 'weapon',
  allowed: [owner],
  bonus,
  ...(element ? { element } : {}),
  price,
  tier,
  iconKey: `icon_${id}`,
});

const armor = (
  id: string,
  tierName: ArmorTierName,
  name: string,
  description: string,
  owner: CharacterId,
  price: number,
  bonus: Partial<Stats>,
): EquipDef => ({
  id,
  name,
  description,
  slot: 'armor',
  allowed: [owner],
  bonus,
  price,
  tier: ARMOR_TIER[tierName],
  // Armor icons are shared per tier (§7.3): one image for the three characters.
  iconKey: `icon_eq_ar_${tierName}`,
});

const accessory = (
  id: string,
  name: string,
  description: string,
  bonus: Partial<Stats>,
  extra: Pick<EquipDef, 'resist' | 'immune'>,
): EquipDef => ({
  id,
  name,
  description,
  slot: 'accessory',
  allowed: [...ALL_CHARACTERS],
  bonus,
  ...extra,
  price: 0,
  tier: 2,
  iconKey: `icon_${id}`,
});

export const EQUIPMENT: readonly EquipDef[] = [
  // ---- 武器 (§7.2) ----------------------------------------------------
  weapon(
    'eq_wp_luka_1',
    'みならいの剣',
    '灯台守見習いに渡される、ありふれた剣。',
    'ch_luka',
    1,
    120,
    {
      atk: 5,
    },
  ),
  weapon('eq_wp_luka_2', 'はがねの剣', 'ハガネの鍛冶屋が打った頑丈な剣。', 'ch_luka', 2, 450, {
    atk: 12,
  }),
  weapon('eq_wp_luka_3', 'しろがねの剣', '白銀に輝く、よく切れる剣。', 'ch_luka', 3, 1200, {
    atk: 20,
  }),
  weapon(
    'eq_wp_luka_4',
    'ほしのつるぎ',
    '星の光を宿した剣。光属性の攻撃になる。',
    'ch_luka',
    4,
    0,
    { atk: 32, luk: 5 },
    'light',
  ),
  weapon(
    'eq_wp_mio_1',
    'りょうしのナイフ',
    '魚をさばくのにも使う小さなナイフ。',
    'ch_mio',
    1,
    100,
    {
      atk: 4,
      spd: 2,
    },
  ),
  weapon('eq_wp_mio_2', 'さんごの短剣', '珊瑚の柄がついた軽い短剣。', 'ch_mio', 2, 400, {
    atk: 10,
    spd: 3,
  }),
  weapon('eq_wp_mio_3', 'しおかぜの短剣', '潮風のように素早く振れる短剣。', 'ch_mio', 3, 1100, {
    atk: 17,
    spd: 5,
  }),
  weapon(
    'eq_wp_mio_4',
    'うしおのきば',
    '海の力を宿した牙の短剣。水属性の攻撃になる。',
    'ch_mio',
    4,
    0,
    { atk: 28, spd: 8 },
    'water',
  ),
  weapon('eq_wp_goro_1', 'ふるい大槌', '長年使い込まれた坑夫の大槌。', 'ch_goro', 1, 150, {
    atk: 8,
  }),
  weapon('eq_wp_goro_2', 'こうざんの大槌', '鉱山で岩を砕くための重い大槌。', 'ch_goro', 2, 500, {
    atk: 15,
  }),
  weapon(
    'eq_wp_goro_3',
    'くろがねの大槌',
    '黒鉄を鍛えた、ずっしりと重い大槌。',
    'ch_goro',
    3,
    1300,
    {
      atk: 24,
    },
  ),
  weapon(
    'eq_wp_goro_4',
    'やまわりの大槌',
    '山をも割ると伝わる大槌。土属性の攻撃になるが重い。',
    'ch_goro',
    4,
    0,
    { atk: 38, spd: -3 },
    'earth',
  ),

  // ---- 防具 (§7.3) ----------------------------------------------------
  armor('eq_ar_cloth_luka', 'cloth', 'たびびとの服', '旅に出る人が着る丈夫な服。', 'ch_luka', 80, {
    def: 3,
  }),
  armor('eq_ar_cloth_mio', 'cloth', 'りょうしのベスト', '動きやすい漁師のベスト。', 'ch_mio', 80, {
    def: 2,
    spd: 1,
  }),
  armor('eq_ar_cloth_goro', 'cloth', 'こうふのシャツ', '坑夫が着る厚手のシャツ。', 'ch_goro', 80, {
    def: 4,
  }),
  armor(
    'eq_ar_leather_luka',
    'leather',
    'かわのよろい',
    'なめし革で作った軽い鎧。',
    'ch_luka',
    350,
    {
      def: 8,
    },
  ),
  armor(
    'eq_ar_leather_mio',
    'leather',
    'かわのジャケット',
    '革のジャケット。動きを妨げない。',
    'ch_mio',
    350,
    { def: 6, spd: 2 },
  ),
  armor(
    'eq_ar_leather_goro',
    'leather',
    'かわのエプロン',
    '鍛冶屋が使う厚い革のエプロン。',
    'ch_goro',
    350,
    { def: 10 },
  ),
  armor('eq_ar_chain_luka', 'chain', 'くさりかたびら', '細かな鎖を編んだ鎧。', 'ch_luka', 900, {
    def: 14,
  }),
  armor('eq_ar_chain_mio', 'chain', 'かるいくさりのふく', '軽い鎖を縫い込んだ服。', 'ch_mio', 900, {
    def: 11,
    spd: 3,
  }),
  armor(
    'eq_ar_chain_goro',
    'chain',
    'おもいくさりよろい',
    '重いが頼れる鎖の鎧。少し動きにくい。',
    'ch_goro',
    900,
    { def: 18, spd: -2 },
  ),
  armor('eq_ar_star_luka', 'star', 'ほしのコート', '星の光を織り込んだコート。', 'ch_luka', 0, {
    def: 22,
    mp: 20,
  }),
  armor('eq_ar_star_mio', 'star', 'ほしのマント', '星の光を織り込んだマント。', 'ch_mio', 0, {
    def: 18,
    spd: 5,
  }),
  armor('eq_ar_star_goro', 'star', 'ほしのはんてん', '星の光を織り込んだはんてん。', 'ch_goro', 0, {
    def: 28,
    hp: 40,
  }),

  // ---- アクセサリ (§7.4) ----------------------------------------------
  accessory(
    'eq_acc_star_charm',
    'ほしのおまもり',
    '毒を防ぐお守り。運が上がる。',
    { luk: 5 },
    { immune: ['poison'] },
  ),
  accessory(
    'eq_acc_sea_ring',
    'うみのゆびわ',
    '水のダメージを半分にする指輪。素早さが上がる。',
    { spd: 5 },
    { resist: { water: 0.5 } },
  ),
  accessory(
    'eq_acc_miner_badge',
    'こうふのバッジ',
    '麻痺を防ぐバッジ。防御が上がる。',
    { def: 6 },
    { immune: ['paralyze'] },
  ),
  accessory(
    'eq_acc_lantern_pendant',
    'ランタンのペンダント',
    '暗闇を防ぐペンダント。運が大きく上がる。',
    { luk: 10 },
    { immune: ['blind'] },
  ),
];

const BY_ID = new Map(EQUIPMENT.map((eq) => [eq.id, eq] as const));

export function getEquip(id: string): EquipDef {
  const eq = BY_ID.get(id);
  if (!eq) throw new Error(`unknown equipment: ${id}`);
  return eq;
}

export function findEquip(id: string): EquipDef | undefined {
  return BY_ID.get(id);
}

/** Every piece of `slot` that `characterId` may equip, in spec order. */
export function equipmentFor(slot: EquipSlot, characterId: CharacterId): EquipDef[] {
  return EQUIPMENT.filter((eq) => eq.slot === slot && eq.allowed.includes(characterId));
}
