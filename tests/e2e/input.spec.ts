import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Gamepad and touch input (docs/GAME_DESIGN.md §11.4). The gamepad is a fake
 * `navigator.getGamepads()` driven from the test; touch goes through Chromium's
 * touch emulation (taps) and CDP touch events (holds on the D-pad).
 */

type Game = {
  scene: { getScene: <T>(key: string) => T; isActive: (key: string) => boolean };
};

type FieldProbe = {
  gameState: { save: { location: { map: string; x: number; y: number; facing: string } } };
  isDialogOpen: boolean;
  isEventRunning: boolean;
  isMoving: boolean;
  playerTile: { x: number; y: number; facing: string };
  controlsHintText: string;
};

/** Internal resolution (src/config.ts). */
const GAME_W = 640;
const GAME_H = 360;

/** Touch control centres in game pixels (src/core/input/touch.ts). */
const TOUCH = {
  dpadLeft: { x: 28, y: 280 },
  dpadRight: { x: 116, y: 280 },
  a: { x: 598, y: 292 },
  b: { x: 538, y: 320 },
  menu: { x: 552, y: 19 },
  empty: { x: 320, y: 60 },
} as const;

/** Standard-mapping button indices (src/core/input/gamepad.ts). */
const PAD = { a: 0, b: 1, left: 14, right: 15 } as const;

const field = (page: Page) =>
  page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    return {
      map: w.gameState.save.location.map,
      dialog: w.isDialogOpen,
      event: w.isEventRunning,
      moving: w.isMoving,
      tile: w.playerTile,
      hint: w.controlsHintText,
    };
  });

const waitForScene = (page: Page, scene: string) =>
  page.waitForFunction((s) => window.__starfall?.scene === s, scene, { timeout: 10_000 });

const menuActive = (page: Page) =>
  page.evaluate(() => (window.__starfall?.game as Game).scene.isActive('Menu'));

const waitForMenu = (page: Page, active: boolean) =>
  page.waitForFunction(
    (a) => (window.__starfall?.game as Game).scene.isActive('Menu') === a,
    active,
    { timeout: 5_000 },
  );

/**
 * Waits until the player has reached (or passed) column `x` walking `dir`. A starved
 * frame can carry the mover through two tiles at once, so an exact match could be
 * missed while the walk continues to the wall.
 */
const waitForTileX = (page: Page, x: number, dir: 'left' | 'right') =>
  page.waitForFunction(
    ([tx, d]) => {
      const px = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World').playerTile.x;
      return d === 'left' ? px <= tx : px >= tx;
    },
    [x, dir] as [number, 'left' | 'right'],
    { timeout: 10_000 },
  );

const waitForStill = (page: Page) =>
  page.waitForFunction(
    () => !(window.__starfall?.game as Game).scene.getScene<FieldProbe>('World').isMoving,
    undefined,
    { timeout: 5_000 },
  );

async function openTitle(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__starfall?.ready === true, undefined, {
    timeout: 20_000,
  });
  return errors;
}

/** Presses 決定 repeatedly until the opening event has finished. */
async function playThroughOpening(page: Page, confirm: () => Promise<void>): Promise<void> {
  await waitForScene(page, 'World');
  await page.waitForTimeout(300);
  expect((await field(page)).event).toBe(true);
  for (let i = 0; i < 40 && (await field(page)).event; i += 1) {
    await confirm();
    await page.waitForTimeout(400);
  }
  const s = await field(page);
  expect(s.event).toBe(false);
  expect(s.dialog).toBe(false);
  expect(s.map).toBe('map_minato_luka_house');
  expect(s.tile).toMatchObject({ x: 7, y: 7 });
}

// ---- gamepad -------------------------------------------------------------------

type FakePad = {
  buttons: { pressed: boolean; touched: boolean; value: number }[];
  axes: number[];
  timestamp: number;
};

test('a standard gamepad drives the title, the opening, walking, dashing and the menu', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const pad = {
      id: 'Fake Standard Pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
  const setButton = (index: number, pressed: boolean) =>
    page.evaluate(
      ([i, p]) => {
        const pad = (window as unknown as { __pad: FakePad }).__pad;
        const button = pad.buttons[i];
        if (button) {
          button.pressed = p;
          button.touched = p;
          button.value = p ? 1 : 0;
        }
        pad.timestamp += 1;
      },
      [index, pressed] as [number, boolean],
    );
  const setAxis = (index: number, value: number) =>
    page.evaluate(
      ([i, v]) => {
        const pad = (window as unknown as { __pad: FakePad }).__pad;
        pad.axes[i] = v;
        pad.timestamp += 1;
      },
      [index, value] as [number, number],
    );
  const tapButton = async (index: number) => {
    await setButton(index, true);
    await page.waitForTimeout(80);
    await setButton(index, false);
    await page.waitForTimeout(150);
  };

  const errors = await openTitle(page);
  expect(await page.evaluate(() => window.__starfall?.inputDevice)).toBe('keyboard');

  // A on the title starts a new game and the device label flips to the pad.
  await tapButton(PAD.a);
  await waitForScene(page, 'World');
  expect(await page.evaluate(() => window.__starfall?.inputDevice)).toBe('gamepad');
  await playThroughOpening(page, () => tapButton(PAD.a));
  const hint = (await field(page)).hint;
  expect(hint).toContain('A');
  expect(hint).not.toContain('Z');

  // D-pad left walks; releasing stops on a tile. (The release races the 40 ms input
  // lead of the mover, so the walk may end one tile further than the first one seen.)
  await setButton(PAD.left, true);
  await waitForTileX(page, 6, 'left');
  await setButton(PAD.left, false);
  await waitForStill(page);
  const afterWalk = (await field(page)).tile;
  expect(afterWalk.y).toBe(7);
  expect(afterWalk.x).toBeLessThanOrEqual(6);

  // B held while walking is the dash, so it must not open the menu.
  await setButton(PAD.left, true);
  await page.waitForTimeout(60);
  await setButton(PAD.b, true);
  await waitForTileX(page, afterWalk.x - 1, 'left');
  await setButton(PAD.left, false);
  await setButton(PAD.b, false);
  await waitForStill(page);
  await page.waitForTimeout(200);
  expect(await menuActive(page)).toBe(false);
  const afterDash = (await field(page)).tile;
  expect(afterDash.x).toBeLessThan(afterWalk.x);

  // The left stick walks back to the right.
  await setAxis(0, 1);
  await waitForTileX(page, afterDash.x + 1, 'right');
  await setAxis(0, 0);
  await waitForStill(page);
  expect((await field(page)).tile.x).toBeGreaterThan(afterDash.x);

  // B standing still opens the menu; B again closes it.
  await tapButton(PAD.b);
  await waitForMenu(page, true);
  await tapButton(PAD.b);
  await waitForMenu(page, false);

  // A key press hands the labels back to the keyboard.
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__starfall?.inputDevice)).toBe('keyboard');
  expect((await field(page)).hint).toContain('Z');
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

// ---- touch ---------------------------------------------------------------------

test.describe('touch controls', () => {
  test.use({ hasTouch: true });

  test('the pad appears on the first touch and drives the title, the opening, walking and the menu', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = await openTitle(page);
    const canvas = page.locator('#game canvas');
    /** Game pixels → page pixels through the FIT-scaled canvas. */
    const toPage = async (gx: number, gy: number) => {
      const box = await canvas.boundingBox();
      if (!box) throw new Error('canvas not laid out');
      return { x: box.x + (gx * box.width) / GAME_W, y: box.y + (gy * box.height) / GAME_H };
    };
    const tapGame = async (p: { x: number; y: number }) => {
      const at = await toPage(p.x, p.y);
      await page.touchscreen.tap(at.x, at.y);
      await page.waitForTimeout(150);
    };
    const cdp = await page.context().newCDPSession(page);
    const holdStart = async (p: { x: number; y: number }) => {
      const at = await toPage(p.x, p.y);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: at.x, y: at.y }],
      });
    };
    const holdEnd = () =>
      cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    expect(await page.evaluate(() => window.__starfall?.touchUi)).toBe(false);
    // The first touch only brings the pad up (§11.4): still on the title afterwards.
    await tapGame(TOUCH.empty);
    await page.waitForFunction(() => window.__starfall?.touchUi === true, undefined, {
      timeout: 5_000,
    });
    expect(await page.evaluate(() => window.__starfall?.inputDevice)).toBe('touch');
    expect(await page.evaluate(() => window.__starfall?.scene)).toBe('Title');

    // A starts the game and plays through the opening; touch players get no key hint.
    await tapGame(TOUCH.a);
    await playThroughOpening(page, () => tapGame(TOUCH.a));
    expect((await field(page)).hint).toBe('');

    // Holding the D-pad walks; lifting stops on a tile (the release may land one
    // tile past the first one seen, see the gamepad test).
    await holdStart(TOUCH.dpadLeft);
    await waitForTileX(page, 6, 'left');
    await holdEnd();
    await waitForStill(page);
    const afterLeft = (await field(page)).tile;
    expect(afterLeft.y).toBe(7);
    expect(afterLeft.x).toBeLessThanOrEqual(6);
    await holdStart(TOUCH.dpadRight);
    await waitForTileX(page, afterLeft.x + 1, 'right');
    await holdEnd();
    await waitForStill(page);
    const afterRight = (await field(page)).tile;
    expect(afterRight.x).toBeGreaterThan(afterLeft.x);

    // MENU opens the pause menu, B closes it.
    await tapGame(TOUCH.menu);
    await waitForMenu(page, true);
    await tapGame(TOUCH.b);
    await waitForMenu(page, false);
    expect((await field(page)).tile).toEqual(afterRight);

    // Keyboard input switches the labels back, and the hint returns.
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__starfall?.inputDevice)).toBe('keyboard');
    expect((await field(page)).hint).toContain('Z');
    expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
  });
});
