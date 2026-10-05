/** Scene keys, centralised so typos fail at compile time instead of at runtime. */
export const SceneKey = {
  Boot: 'Boot',
  Title: 'Title',
  World: 'World',
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];
