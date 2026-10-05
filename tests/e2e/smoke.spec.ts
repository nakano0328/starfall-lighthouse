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

test('new game: opening, village sign, menu, save, continue from the title', async ({ page }) => {
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

  // X opens the pause menu over the paused field; the item tab lists the lamp oil.
  await page.keyboard.press('x');
  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as { scene: { isActive: (k: string) => boolean } };
      return game.scene.isActive('Menu');
    },
    undefined,
    { timeout: 5_000 },
  );
  const menuMode = () =>
    page.evaluate(() => {
      const game = window.__starfall?.game as {
        scene: { getScene: (k: string) => { currentMode: string } };
      };
      return game.scene.getScene('Menu').currentMode;
    });
  expect(await menuMode()).toBe('root');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  expect(await menuMode()).toBe('items');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const keyItems = await page.evaluate(() => {
    const game = window.__starfall?.game as {
      scene: { getScene: (k: string) => { panelMenu?: { items: { label: string }[] } } };
    };
    return game.scene.getScene('Menu').panelMenu?.items.map((i) => i.label) ?? [];
  });
  expect(keyItems.some((label) => label.includes('とうだいの油'))).toBe(true);
  await page.keyboard.press('x');
  await page.waitForTimeout(150);
  expect(await menuMode()).toBe('root');

  // Save to slot 1 (root index 3) from the village: a town allows saving anywhere.
  const rootIndex = () =>
    page.evaluate(() => {
      const game = window.__starfall?.game as {
        scene: { getScene: (k: string) => { rootMenu: { selectedIndex: number } } };
      };
      return game.scene.getScene('Menu').rootMenu.selectedIndex;
    });
  const moveRootTo = async (target: number) => {
    for (let i = await rootIndex(); i < target; i += 1) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(120);
    }
  };
  await moveRootTo(3);
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  expect(await menuMode()).toBe('save');
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  const slot1 = await page.evaluate(() => window.localStorage.getItem('starfall.save.0'));
  expect(slot1).toContain('"schemaVersion":2');
  expect(slot1).toContain('"it_lamp_oil"');
  await page.keyboard.press('x');
  await page.waitForTimeout(150);

  // Settings (root index 4): text speed → はやい, then back to the title.
  await moveRootTo(4);
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  expect(await menuMode()).toBe('settings');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
  }
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  expect(await menuMode()).toBe('title_confirm');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  await page.keyboard.press('z');
  await page.waitForFunction(() => window.__starfall?.scene === 'Title', undefined, {
    timeout: 10_000,
  });
  const stored = await page.evaluate(() => window.localStorage.getItem('starfall.settings'));
  expect(stored).toContain('"textSpeed":"fast"');

  // つづきから → slot 1 → back on the field at the saved spot with the lamp oil.
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  const titleMode = await page.evaluate(() => {
    const game = window.__starfall?.game as {
      scene: { getScene: (k: string) => { currentMode: string } };
    };
    return game.scene.getScene('Title').currentMode;
  });
  expect(titleMode).toBe('slots');
  await page.keyboard.press('z');
  await page.waitForFunction(() => window.__starfall?.scene === 'World', undefined, {
    timeout: 10_000,
  });
  await page.waitForTimeout(500);
  const loaded = await world();
  expect(loaded.location).toMatchObject({ map: 'map_minato_village', x: 21, y: 12 });
  expect(loaded.lampOil).toBe(1);
  expect(loaded.flags['minato.intro_done']).toBe(true);
  expect(loaded.event).toBe(false);

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});
