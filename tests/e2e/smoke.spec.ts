import { expect, test } from '@playwright/test';

type WorldProbe = {
  gameState: {
    save: {
      location: { map: string; x: number; y: number; facing: string };
      flags: Record<string, unknown>;
    };
    inventory: { count: (id: string) => number };
    gold: number;
  };
  isDialogOpen: boolean;
  isEventRunning: boolean;
  isMoving: boolean;
  playerTile: { x: number; y: number; facing: string };
};

test('new game: opening event, leave the house, read the village sign', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${res.url()}`);
  });
  page.on('requestfailed', (req) => {
    errors.push(`request failed: ${req.url()} ${req.failure()?.errorText ?? ''}`);
  });

  const world = () =>
    page.evaluate(() => {
      const game = window.__starfall?.game as { scene: { getScene: (k: string) => WorldProbe } };
      const w = game.scene.getScene('World');
      return {
        location: w.gameState.save.location,
        flags: w.gameState.save.flags,
        lampOil: w.gameState.inventory.count('it_lamp_oil'),
        dialog: w.isDialogOpen,
        event: w.isEventRunning,
        tile: w.playerTile,
      };
    });
  /** Holds a direction key until the step destination is the target tile. */
  const walkTo = async (key: string, x: number, y: number) => {
    await page.keyboard.down(key);
    await page.waitForFunction(
      ([tx, ty]) => {
        const game = window.__starfall?.game as { scene: { getScene: (k: string) => WorldProbe } };
        const tile = game.scene.getScene('World').playerTile;
        return tile.x === tx && tile.y === ty;
      },
      [x, y] as [number, number],
      { timeout: 10_000 },
    );
    await page.keyboard.up(key);
    await page.waitForFunction(
      () => {
        const game = window.__starfall?.game as { scene: { getScene: (k: string) => WorldProbe } };
        return !game.scene.getScene('World').isMoving;
      },
      undefined,
      { timeout: 5_000 },
    );
  };
  const tap = async (key: string) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(50);
    await page.keyboard.up(key);
    await page.waitForTimeout(100);
  };
  const waitForMap = (map: string) =>
    page.waitForFunction(
      (target) => {
        const game = window.__starfall?.game as { scene: { getScene: (k: string) => WorldProbe } };
        return game.scene.getScene('World').gameState.save.location.map === target;
      },
      map,
      { timeout: 10_000 },
    );

  await page.goto('/');
  await expect(page).toHaveTitle(/ほしふる灯台/);
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.waitForFunction(() => window.__starfall?.ready === true, undefined, {
    timeout: 20_000,
  });
  const state = await page.evaluate(() => window.__starfall);
  expect(state?.scene).toBe('Title');
  expect(state?.version).toMatch(/^\d+\.\d+\.\d+/);

  // はじめから → the opening event starts in Luka's house.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__starfall?.scene === 'World', undefined, {
    timeout: 10_000,
  });
  await page.waitForTimeout(300);
  expect((await world()).event).toBe(true);

  // Press through narration, grandpa's lines and the choice until the event ends.
  for (let i = 0; i < 40 && (await world()).event; i += 1) {
    await page.keyboard.press('z');
    await page.waitForTimeout(400);
  }
  const afterOpening = await world();
  expect(afterOpening.event).toBe(false);
  expect(afterOpening.dialog).toBe(false);
  expect(afterOpening.flags['minato.intro_done']).toBe(true);
  expect(afterOpening.flags['main.chapter']).toBe(0);
  expect(afterOpening.flags['ev.ev_opening']).toBe(true);
  expect(afterOpening.lampOil).toBe(1);
  expect(afterOpening.location).toMatchObject({ map: 'map_minato_luka_house', x: 7, y: 7 });

  // Leave through the door at (5,9): the exit lands on the village path at (10,7).
  await walkTo('ArrowLeft', 5, 7);
  await page.keyboard.down('ArrowDown');
  await waitForMap('map_minato_village');
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(600);
  expect((await world()).location).toMatchObject({ map: 'map_minato_village' });

  // Walk to the sign at (21,13): down to row 12, right to x=21, face down and read it.
  await walkTo('ArrowDown', 10, 12);
  await walkTo('ArrowRight', 21, 12);
  await tap('ArrowDown');
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  expect((await world()).dialog).toBe(true);
  for (let i = 0; i < 6 && (await world()).dialog; i += 1) {
    await page.keyboard.press('z');
    await page.waitForTimeout(400);
  }
  expect((await world()).dialog).toBe(false);

  // X returns to the title for now (until the pause menu exists).
  await page.keyboard.press('x');
  await page.waitForFunction(() => window.__starfall?.scene === 'Title', undefined, {
    timeout: 10_000,
  });

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});
