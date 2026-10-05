import { expect, test } from '@playwright/test';

test('new game: walk into the house, talk to grandpa, walk back out', async ({ page }) => {
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

  await page.goto('/');
  await expect(page).toHaveTitle(/ほしふる灯台/);

  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();

  await page.waitForFunction(() => window.__starfall?.ready === true, undefined, {
    timeout: 20_000,
  });
  const state = await page.evaluate(() => window.__starfall);
  expect(state?.scene).toBe('Title');
  expect(state?.version).toMatch(/^\d+\.\d+\.\d+/);

  // はじめから is the first menu item: confirm starts a new game on the field.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__starfall?.scene === 'World', undefined, {
    timeout: 10_000,
  });

  // Walk north from the start tile (10,12) through the door at (10,6) into Luka's house.
  const currentMap = () =>
    page.evaluate(() => {
      const game = window.__starfall?.game as {
        scene: { getScene: (k: string) => { save?: { location: { map: string } } } };
      };
      return game.scene.getScene('World').save?.location.map;
    });
  await page.waitForTimeout(400);
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as {
        scene: { getScene: (k: string) => { save?: { location: { map: string } } } };
      };
      return game.scene.getScene('World').save?.location.map === 'map_minato_luka_house';
    },
    undefined,
    { timeout: 10_000 },
  );
  await page.keyboard.up('ArrowUp');
  expect(await currentMap()).toBe('map_minato_luka_house');

  // Talk to grandpa at (6,3): stand at (7,3) facing left, press Z and read through
  // the conversation (first choice when offered). The effects set the intro flags.
  type WorldProbe = {
    save: { location: { x: number; y: number; facing: string }; flags: Record<string, unknown> };
    isDialogOpen: boolean;
    isMoving: boolean;
    playerTile: { x: number; y: number; facing: string };
  };
  const world = () =>
    page.evaluate(() => {
      const game = window.__starfall?.game as { scene: { getScene: (k: string) => WorldProbe } };
      const w = game.scene.getScene('World');
      return { location: w.save.location, flags: w.save.flags, dialog: w.isDialogOpen };
    });
  /**
   * Holds a direction key until the player's logical tile (the step destination)
   * is the target, then releases it so the step finishes there.
   */
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
  await page.waitForTimeout(500);
  await walkTo('ArrowUp', 5, 5);
  await walkTo('ArrowRight', 7, 5);
  await walkTo('ArrowUp', 7, 3);
  await tap('ArrowLeft');
  const beforeTalk = await world();
  expect(beforeTalk.location).toMatchObject({ x: 7, y: 3, facing: 'left' });
  expect(beforeTalk.dialog).toBe(false);

  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  expect((await world()).dialog).toBe(true);
  for (let i = 0; i < 12 && (await world()).dialog; i += 1) {
    await page.keyboard.press('z');
    await page.waitForTimeout(450);
  }
  const afterTalk = await world();
  expect(afterTalk.dialog).toBe(false);
  expect(afterTalk.flags['minato.intro_done']).toBe(true);
  expect(afterTalk.flags['minato.talked_to_grandpa']).toBe(true);

  // Walk back out through the door at the bottom of the room.
  await walkTo('ArrowDown', 7, 5);
  await walkTo('ArrowLeft', 5, 5);
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as {
        scene: { getScene: (k: string) => { save?: { location: { map: string } } } };
      };
      return game.scene.getScene('World').save?.location.map === 'map_minato_village';
    },
    undefined,
    { timeout: 10_000 },
  );
  await page.keyboard.up('ArrowDown');
  expect(await currentMap()).toBe('map_minato_village');

  // X returns to the title for now (until the pause menu exists).
  await page.waitForTimeout(600);
  await page.keyboard.press('x');
  await page.waitForFunction(() => window.__starfall?.scene === 'Title', undefined, {
    timeout: 10_000,
  });

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});
