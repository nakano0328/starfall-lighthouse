import type { ShopDef, ShopStockEntry } from './types';

/**
 * Shop inventories from docs/GAME_DESIGN.md §7.5 (4 shops), in spec order.
 * An entry with a `condition` (§9.3 grammar) is listed only once it holds.
 * Whether the shop itself is reachable (`hagane.arrived`, `ruins.scholar_met`)
 * is decided by the NPC / map that fronts it, not here.
 */
const plain = (...ids: string[]): ShopStockEntry[] => ids.map((id) => ({ id }));

const gated = (condition: string, ...ids: string[]): ShopStockEntry[] =>
  ids.map((id) => ({ id, condition }));

export const SHOPS: readonly ShopDef[] = [
  {
    id: 'shop_minato',
    name: 'ミナト村 道具屋',
    stock: [
      ...plain(
        'it_herb',
        'it_antidote',
        'it_eye_drop',
        'it_return_feather',
        'eq_ar_cloth_luka',
        'eq_ar_cloth_mio',
      ),
      ...gated('fragments.count>=1', 'it_potion_s'),
    ],
  },
  {
    id: 'shop_hagane_items',
    name: 'ハガネのかじや（道具）',
    stock: [
      ...plain(
        'it_herb',
        'it_potion_s',
        'it_star_drop',
        'it_antidote',
        'it_eye_drop',
        'it_numb_herb',
        'it_star_feather',
        'it_return_feather',
        'it_fire_stone',
        'it_tide_shell',
        'it_quake_stone',
      ),
      ...gated('fragments.count>=2', 'it_potion_m', 'it_panacea'),
    ],
  },
  {
    id: 'shop_hagane_arms',
    name: 'ハガネのかじや（武具）',
    stock: [
      // Tier 2 (§7.2 / §7.3): weapons then armor, Luka → Mio → Goro.
      ...plain(
        'eq_wp_luka_2',
        'eq_wp_mio_2',
        'eq_wp_goro_2',
        'eq_ar_leather_luka',
        'eq_ar_leather_mio',
        'eq_ar_leather_goro',
      ),
      // Tier 3 unlocks with `shop.hagane_tier3` (= fragments.count>=2).
      ...gated(
        'shop.hagane_tier3',
        'eq_wp_luka_3',
        'eq_wp_mio_3',
        'eq_wp_goro_3',
        'eq_ar_chain_luka',
        'eq_ar_chain_mio',
        'eq_ar_chain_goro',
      ),
    ],
  },
  {
    id: 'shop_camp',
    name: '学者のキャンプ 商人',
    stock: plain(
      'it_herb',
      'it_potion_s',
      'it_potion_m',
      'it_potion_l',
      'it_star_drop',
      'it_antidote',
      'it_eye_drop',
      'it_numb_herb',
      'it_panacea',
      'it_star_feather',
      'it_return_feather',
      'it_fire_stone',
      'it_tide_shell',
      'it_quake_stone',
      'it_light_dust',
      'it_fire_bomb',
    ),
  },
];

const BY_ID = new Map(SHOPS.map((shop) => [shop.id, shop] as const));

export function getShop(id: string): ShopDef {
  const shop = BY_ID.get(id);
  if (!shop) throw new Error(`unknown shop: ${id}`);
  return shop;
}

export function findShop(id: string): ShopDef | undefined {
  return BY_ID.get(id);
}
