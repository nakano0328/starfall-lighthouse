/**
 * Cursor logic shared by every vertical list menu (title, pause menu, shops).
 * Pure so it can be unit-tested without Phaser.
 */
export interface SelectionItem {
  disabled?: boolean;
}

/** Index of the first enabled item, or -1 when every item is disabled. */
export function firstEnabled(items: readonly SelectionItem[]): number {
  return items.findIndex((it) => !it.disabled);
}

/**
 * Moves the cursor by `delta` (+1 down / -1 up), wrapping around and skipping
 * disabled items. Returns the current index unchanged when nothing is selectable.
 */
export function moveSelection(
  items: readonly SelectionItem[],
  current: number,
  delta: 1 | -1,
): number {
  const n = items.length;
  if (n === 0) return current;
  let next = current;
  for (let step = 0; step < n; step += 1) {
    next = (next + delta + n) % n;
    if (!items[next]?.disabled) return next;
  }
  return current;
}

export function isSelectable(items: readonly SelectionItem[], index: number): boolean {
  const it = items[index];
  return it !== undefined && !it.disabled;
}
