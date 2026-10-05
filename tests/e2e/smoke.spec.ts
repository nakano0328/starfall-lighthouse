import { expect, test } from '@playwright/test';

test('title screen boots, a new game reaches the field and the player can walk through doors', async ({
  page,
}) => {
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

  // Walk back out through the door at the bottom of the room.
  await page.waitForTimeout(600);
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
