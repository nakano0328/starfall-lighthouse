import type { ItemDef } from './types';

/** Consumables and key items from docs/GAME_DESIGN.md §7.1 (30 entries). */
const heal = (
  id: string,
  name: string,
  description: string,
  amount: number | 'full',
  price: number,
  scope: ItemDef['scope'] = 'ally_single',
): ItemDef => ({
  id,
  name,
  description,
  category: 'heal',
  price,
  usableInBattle: true,
  usableInField: true,
  scope,
  effect: { type: 'heal_hp', amount },
  maxQty: 99,
  iconKey: `icon_${id}`,
});

const key = (id: string, name: string, description: string, maxQty = 1): ItemDef => ({
  id,
  name,
  description,
  category: 'key',
  price: 0,
  usableInBattle: false,
  usableInField: false,
  scope: 'none',
  effect: { type: 'none' },
  maxQty,
  iconKey: `icon_${id}`,
});

const attack = (
  id: string,
  name: string,
  description: string,
  power: number,
  element: 'fire' | 'water' | 'earth' | 'light',
  scope: 'enemy_single' | 'enemy_all',
  price: number,
): ItemDef => ({
  id,
  name,
  description,
  category: 'attack',
  price,
  usableInBattle: true,
  usableInField: false,
  scope,
  effect: { type: 'damage', power, element },
  maxQty: 99,
  iconKey: `icon_${id}`,
});

export const ITEMS: readonly ItemDef[] = [
  heal('it_herb', 'やくそう', '味方ひとりの HP を 30 回復する。', 30, 20),
  heal('it_potion_s', 'かいふくやく', '味方ひとりの HP を 80 回復する。', 80, 60),
  heal('it_potion_m', 'じょうきゅうかいふくやく', '味方ひとりの HP を 200 回復する。', 200, 180),
  heal('it_potion_l', 'ほしのいやし', '味方ひとりの HP を全快する。', 'full', 500),
  {
    ...heal('it_star_drop', 'ほしのしずく', '味方ひとりの MP を 30 回復する。', 30, 120),
    effect: { type: 'heal_mp', amount: 30 },
  },
  {
    ...heal('it_star_tear', 'ほしのなみだ', '味方ひとりの MP を全快する。', 'full', 0),
    effect: { type: 'heal_mp', amount: 'full' },
  },
  {
    ...heal('it_antidote', 'どくけし', '毒を治す。', 0, 30),
    category: 'cure',
    effect: { type: 'cure', statuses: ['poison'] },
  },
  {
    ...heal('it_eye_drop', 'めぐすり', '暗闇を治す。', 0, 30),
    category: 'cure',
    effect: { type: 'cure', statuses: ['blind'] },
  },
  {
    ...heal('it_numb_herb', 'しびれぐさ', '麻痺を治す。', 0, 40),
    category: 'cure',
    effect: { type: 'cure', statuses: ['paralyze'] },
  },
  {
    ...heal('it_panacea', 'ばんのうやく', 'すべての状態異常を治す。', 0, 150),
    category: 'cure',
    effect: { type: 'cure', statuses: 'all' },
  },
  {
    ...heal('it_star_feather', 'ほしのはね', '戦闘不能の味方を HP 半分で復活させる。', 0, 300),
    effect: { type: 'revive', hpRatio: 0.5 },
  },
  {
    ...heal('it_return_feather', 'きかんのはね', 'ダンジョンの入口まで戻る。', 0, 100, 'none'),
    category: 'field',
    usableInBattle: false,
    effect: { type: 'escape_dungeon' },
  },
  attack('it_fire_stone', 'ほむらの石', '敵ひとりに炎のダメージ。', 80, 'fire', 'enemy_single', 90),
  attack(
    'it_tide_shell',
    'しおのかいがら',
    '敵ひとりに水のダメージ。',
    80,
    'water',
    'enemy_single',
    90,
  ),
  attack('it_quake_stone', 'ゆれる石', '敵ひとりに土のダメージ。', 80, 'earth', 'enemy_single', 90),
  attack('it_light_dust', 'ひかりのこな', '敵全体に光のダメージ。', 70, 'light', 'enemy_all', 200),
  attack('it_fire_bomb', 'ほむらのたま', '敵全体に炎の大ダメージ。', 110, 'fire', 'enemy_all', 250),
  heal('it_mio_lunch', 'ミオのおべんとう', '味方全員の HP を 50 回復する。', 50, 0, 'ally_all'),
  key('it_key_shrine', '祠のかぎ', '森の祠の扉を開けるかぎ。'),
  key('it_key_mine', '廃坑のかぎ', '廃坑の扉を開けるかぎ。'),
  key('it_key_lighthouse', '灯台のかぎ', '灯台の扉を開けるかぎ。'),
  key('it_tide_rune', '潮のしるべ', '潮の石碑の文字が読めるようになる。'),
  key('it_fragment_1', '星の欠片（森）', '森の祠で取り戻した星心の欠片。'),
  key('it_fragment_2', '星の欠片（廃坑）', '廃坑で取り戻した星心の欠片。'),
  key('it_fragment_3', '星の欠片（遺跡）', '沈んだ遺跡で取り戻した星心の欠片。'),
  key('it_lamp_oil', 'とうだいの油', 'じいちゃんから預かった灯台の油。'),
  key('it_shell_necklace', 'かいがらのネックレス', '宿屋の女将の落とし物。'),
  key('it_shining_ore', 'かがやき鉱石', 'ほのかに光る鉱石。かじやが欲しがっている。', 3),
  key('it_old_chart', 'ふるい海図', '遺跡で見つかった古い海図。'),
  key('it_grandpa_letter', 'じいちゃんの手紙', '灯台の泉を起こすための手紙。'),
];

const BY_ID = new Map(ITEMS.map((it) => [it.id, it] as const));

export function getItem(id: string): ItemDef {
  const item = BY_ID.get(id);
  if (!item) throw new Error(`unknown item: ${id}`);
  return item;
}

export function findItem(id: string): ItemDef | undefined {
  return BY_ID.get(id);
}
