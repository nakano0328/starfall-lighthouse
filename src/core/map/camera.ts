/**
 * Camera scroll for a map of `mapW`x`mapH` pixels viewed through `viewW`x`viewH`:
 * follows the target, clamps at the map edges, and centres axes where the map is
 * smaller than the viewport (docs/GAME_DESIGN.md §9.1).
 */
export function cameraScroll(
  mapW: number,
  mapH: number,
  viewW: number,
  viewH: number,
  targetX: number,
  targetY: number,
): { scrollX: number; scrollY: number } {
  return {
    scrollX: axis(mapW, viewW, targetX),
    scrollY: axis(mapH, viewH, targetY),
  };
}

function axis(mapSize: number, viewSize: number, target: number): number {
  if (mapSize <= viewSize) return Math.round((mapSize - viewSize) / 2);
  const want = target - viewSize / 2;
  return Math.round(Math.min(Math.max(want, 0), mapSize - viewSize));
}
