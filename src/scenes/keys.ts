/** Scene keys, centralised so typos fail at compile time instead of at runtime. */
export const SceneKey = {
  Boot: 'Boot',
  Title: 'Title',
  World: 'World',
  Menu: 'Menu',
  Battle: 'Battle',
  GameOver: 'GameOver',
  Shop: 'Shop',
  /** Touch controls / fullscreen overlay; launched by Boot and never stopped. */
  Touch: 'Touch',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
