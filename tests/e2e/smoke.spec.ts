import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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

test('new game: opening, village sign, chest, menu, save, continue from the title', async ({
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

  const world = () =>
    page.evaluate(() => {
      const game = window.__starfall?.game as { scene: { getScene: (k: string) => WorldProbe } };
      const w = game.scene.getScene('World');
      return {
        location: w.gameState.save.location,
        flags: w.gameState.save.flags,
        lampOil: w.gameState.inventory.count('it_lamp_oil'),
        herb: w.gameState.inventory.count('it_herb'),
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

  // The chest at (36,2): up column 21 to row 2, then right along row 2 (plain grass).
  // The chest blocks its tile, so the walk stops at (35,2) facing it; Z opens it once.
  await walkTo('ArrowUp', 21, 2);
  await walkTo('ArrowRight', 35, 2);
  expect((await world()).tile).toMatchObject({ x: 35, y: 2, facing: 'right' });
  expect((await world()).herb).toBe(0);
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  const opened = await world();
  expect(opened.dialog).toBe(true);
  expect(opened.herb).toBe(2);
  expect(opened.flags['chest.minato_01']).toBe(true);
  for (let i = 0; i < 6 && (await world()).dialog; i += 1) {
    await page.keyboard.press('z');
    await page.waitForTimeout(400);
  }
  expect((await world()).dialog).toBe(false);
  // An opened chest only says からっぽだ: nothing is granted a second time.
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  const reopened = await world();
  expect(reopened.dialog).toBe(true);
  expect(reopened.herb).toBe(2);
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
  await page.waitForTimeout(200);
  // Every save is confirmed first (§11.4), even into an empty slot; はい is index 0.
  expect(await menuMode()).toBe('save_confirm');
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  const slot1 = await page.evaluate(() => window.localStorage.getItem('starfall.save.0'));
  expect(slot1).toContain('"schemaVersion":2');
  expect(slot1).toContain('"it_lamp_oil"');
  expect(slot1).toContain('"chest.minato_01"');
  expect(await menuMode()).toBe('save');
  // The slot list (names + detail lines with the saved date) stays inside the right panel.
  const slotList = await page.evaluate(() => {
    type Bounded = { text?: string; getBounds: () => { right: number } };
    const game = window.__starfall?.game as {
      scene: {
        getScene: (k: string) => { panelMenu?: { list: Bounded[] }; slotDetails: Bounded[] };
      };
    };
    const menu = game.scene.getScene('Menu');
    const objects = [...(menu.panelMenu?.list ?? []), ...menu.slotDetails];
    return {
      rightEdges: objects.map((o) => o.getBounds().right),
      details: menu.slotDetails.map((o) => o.text ?? ''),
    };
  });
  expect(slotList.rightEdges.length).toBeGreaterThan(0);
  expect(Math.max(...slotList.rightEdges)).toBeLessThanOrEqual(616);
  expect(slotList.details[0]).toMatch(
    /序章\u3000灯台の夜 {2}ミナト村\n.*Lv1 {2}\d+:\d{2}:\d{2} {2}\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/,
  );
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
  expect(loaded.location).toMatchObject({ map: 'map_minato_village', x: 35, y: 2 });
  expect(loaded.lampOil).toBe(1);
  expect(loaded.herb).toBe(2);
  expect(loaded.flags['chest.minato_01']).toBe(true);
  expect(loaded.flags['minato.intro_done']).toBe(true);
  expect(loaded.event).toBe(false);

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

// ---- field probes (Phase 2 WorldScene) ----------------------------------------

/**
 * Field probes for the Phase 2 WorldScene: a trigger entered mid-walk, scripted
 * player steps, X while walking, a script that warps, a key door, heal_party /
 * add_member and a healing save point. They drive the real scene through
 * window.__starfall and reach private members at runtime on purpose; keep
 * FieldProbe in step with src/scenes/WorldScene.ts.
 */
type Member = {
  id: string;
  exp: number;
  hp: number;
  mp: number;
  ko: boolean;
  statuses: string[];
  equipment: { weapon: string | null };
};

type FieldProbe = {
  gameState: {
    save: {
      location: { map: string; x: number; y: number; facing: string };
      flags: Record<string, unknown>;
    };
    flags: { clear: (key: string) => void };
    party: Member[];
  };
  isDialogOpen: boolean;
  isEventRunning: boolean;
  isMoving: boolean;
  playerTile: { x: number; y: number; facing: string };
  /** Private in TypeScript, plain properties at runtime. */
  player: { x: number; y: number };
  objects: object[];
  collision: { isBlocked: (x: number, y: number) => boolean };
  interpreter: { runCommands: (commands: object[]) => Promise<unknown> };
  runner: { host: { applyEffect: (cmd: object) => void } };
  rebuildCollision: () => void;
};

type MenuProbe = { currentMode: string };

type Game = {
  scene: { getScene: <T>(key: string) => T; isActive: (key: string) => boolean };
};

/** Tile centre in pixels (src/config.ts: TILE_SIZE = 32). */
const TILE = 32;
const centre = (tile: number): number => tile * TILE + TILE / 2;

const fieldWorld = (page: Page) =>
  page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    return {
      location: w.gameState.save.location,
      flags: w.gameState.save.flags,
      dialog: w.isDialogOpen,
      event: w.isEventRunning,
      moving: w.isMoving,
      tile: w.playerTile,
    };
  });

const waitForField = (
  page: Page,
  key: 'isDialogOpen' | 'isEventRunning' | 'isMoving',
  value: boolean,
) =>
  page.waitForFunction(
    ([k, v]) => (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World')[k] === v,
    [key, value] as const,
    { timeout: 10_000 },
  );

const waitForFieldMap = (page: Page, map: string) =>
  page.waitForFunction(
    (target) =>
      (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World').gameState.save.location
        .map === target,
    map,
    { timeout: 10_000 },
  );

const waitForMenu = (page: Page) =>
  page.waitForFunction(() => (window.__starfall?.game as Game).scene.isActive('Menu'), undefined, {
    timeout: 5_000,
  });

const menuMode = (page: Page) =>
  page.evaluate(
    () => (window.__starfall?.game as Game).scene.getScene<MenuProbe>('Menu').currentMode,
  );

/** Presses Z until the dialog (or the whole event) is over. */
async function pressThrough(page: Page, until: 'dialog' | 'event'): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    const s = await fieldWorld(page);
    if (until === 'dialog' ? !s.dialog : !s.event) return;
    await page.keyboard.press('z');
    await page.waitForTimeout(400);
  }
  throw new Error(`${until} still running`);
}

/** Holds a direction key until the step destination is the target tile, then stops. */
async function walkField(page: Page, key: string, x: number, y: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForFunction(
    ([tx, ty]) => {
      const tile = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World').playerTile;
      return tile.x === tx && tile.y === ty;
    },
    [x, y] as const,
    { timeout: 10_000 },
  );
  await page.keyboard.up(key);
  await waitForField(page, 'isMoving', false);
}

async function tapKey(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(50);
  await page.keyboard.up(key);
  await page.waitForTimeout(100);
}

/** はじめから, then through the opening: the player stands on (7,7) in Luka's house. */
async function startNewGame(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__starfall?.ready === true, undefined, {
    timeout: 20_000,
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__starfall?.scene === 'World', undefined, {
    timeout: 10_000,
  });
  await page.waitForTimeout(300);
  await pressThrough(page, 'event');
  const s = await fieldWorld(page);
  expect(s.dialog).toBe(false);
  expect(s.location).toMatchObject({ map: 'map_minato_luka_house', x: 7, y: 7 });
  return errors;
}

test('a trigger stepped on while walking fires with the player on its tile', async ({ page }) => {
  const errors = await startNewGame(page);
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    w.gameState.flags.clear('ev.ev_opening');
  });
  await walkField(page, 'ArrowUp', 7, 5);

  // Hold Down through the trigger at (7,7): the chained step must be cancelled.
  await page.keyboard.down('ArrowDown');
  await waitForField(page, 'isEventRunning', true);
  const atStart = await fieldWorld(page);
  await page.keyboard.up('ArrowDown');
  expect(atStart.moving).toBe(false);
  expect(atStart.tile).toMatchObject({ x: 7, y: 7 });
  expect(atStart.location).toMatchObject({ x: 7, y: 7 });

  await waitForField(page, 'isDialogOpen', true);
  const during = await fieldWorld(page);
  expect(during.moving).toBe(false);
  expect(during.tile).toMatchObject({ x: 7, y: 7 });

  await pressThrough(page, 'event');
  const after = await fieldWorld(page);
  expect(after.tile).toMatchObject({ x: 7, y: 7 });
  expect(after.location).toMatchObject({ map: 'map_minato_luka_house', x: 7, y: 7 });
  expect(errors).toEqual([]);
});

test('a scripted player move slides the sprite between the tiles', async ({ page }) => {
  const errors = await startNewGame(page);
  const xs = await page.evaluate(async () => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    const samples: number[] = [];
    let done = false;
    void w.interpreter.runCommands([{ cmd: 'move', actor: 'player', path: ['left'] }]).then(() => {
      done = true;
    });
    for (let i = 0; i < 600 && !done; i += 1) {
      samples.push(w.player.x);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return samples;
  });
  const from = centre(7);
  const to = centre(6);
  expect(xs[0]).toBe(from);
  expect(xs.filter((x) => x > to && x < from).length).toBeGreaterThanOrEqual(2);
  const s = await fieldWorld(page);
  expect(s.tile).toMatchObject({ x: 6, y: 7, facing: 'left' });
  expect(s.location).toMatchObject({ x: 6, y: 7, facing: 'left' });
  expect(errors).toEqual([]);
});

test('X pressed during a step opens the menu once the step ends', async ({ page }) => {
  const errors = await startNewGame(page);
  await page.keyboard.down('ArrowLeft');
  await waitForField(page, 'isMoving', true);
  await page.keyboard.down('x');
  await page.waitForTimeout(40);
  await page.keyboard.up('x');
  await page.keyboard.up('ArrowLeft');
  await waitForMenu(page);
  expect(await menuMode(page)).toBe('root');
  const s = await fieldWorld(page);
  expect(s.moving).toBe(false);
  expect(s.tile).toMatchObject({ x: s.location.x, y: s.location.y });
  expect(errors).toEqual([]);
});

test('a script continues after warp on the new map with input locked', async ({ page }) => {
  const errors = await startNewGame(page);
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    const probe = window as unknown as { __probeDone?: boolean };
    probe.__probeDone = false;
    void w.interpreter
      .runCommands([
        { cmd: 'set_flag', key: 'probe.before_warp' },
        { cmd: 'warp', map: 'map_minato_village', x: 10, y: 7, facing: 'down' },
        { cmd: 'wait', ms: 50 },
        { cmd: 'set_flag', key: 'probe.after_wait' },
        { cmd: 'say', dialog: 'dlg_sign_minato' },
        { cmd: 'set_flag', key: 'probe.after_say' },
      ])
      .then(() => {
        probe.__probeDone = true;
      });
  });
  await waitForFieldMap(page, 'map_minato_village');
  await waitForField(page, 'isDialogOpen', true);
  const inDialog = await fieldWorld(page);
  expect(inDialog.event).toBe(true);
  expect(inDialog.flags['probe.before_warp']).toBe(true);
  expect(inDialog.flags['probe.after_wait']).toBe(true);
  expect(inDialog.flags['probe.after_say']).toBeUndefined();
  expect(inDialog.tile).toMatchObject({ x: 10, y: 7 });

  // The field is locked while the script's dialog is up.
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowDown');
  expect((await fieldWorld(page)).tile).toMatchObject({ x: 10, y: 7 });

  await pressThrough(page, 'dialog');
  await page.waitForFunction(
    () => (window as unknown as { __probeDone?: boolean }).__probeDone === true,
    undefined,
    { timeout: 5_000 },
  );
  const after = await fieldWorld(page);
  expect(after.flags['probe.after_say']).toBe(true);
  expect(after.event).toBe(false);
  expect(after.location).toMatchObject({ map: 'map_minato_village', x: 10, y: 7 });
  expect(errors).toEqual([]);
});

test('a key door opens with its item and stays open through its door flag', async ({ page }) => {
  const errors = await startNewGame(page);
  // A locked exit above the player without door_flag: §9.2 names its flag door.<map>_<n>.
  const blocked = await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    w.objects.push({
      kind: 'warp',
      tx: 7,
      ty: 6,
      tw: 1,
      th: 1,
      targetMap: 'map_minato_village',
      targetX: 10,
      targetY: 7,
      facing: 'down',
      requiredItem: 'it_lamp_oil',
    });
    w.rebuildCollision();
    return w.collision.isBlocked(7, 6);
  });
  expect(blocked).toBe(true);

  await tapKey(page, 'ArrowUp');
  expect((await fieldWorld(page)).tile).toMatchObject({ x: 7, y: 7, facing: 'up' });
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog');
  const after = await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    return {
      flag: w.gameState.save.flags['door.minato_luka_house_01'],
      blocked: w.collision.isBlocked(7, 6),
    };
  });
  expect(after).toEqual({ flag: true, blocked: false });

  await page.keyboard.down('ArrowUp');
  await waitForFieldMap(page, 'map_minato_village');
  await page.keyboard.up('ArrowUp');
  expect(errors).toEqual([]);
});

test('heal_party, add_member and a healing save point act on the live party', async ({ page }) => {
  const errors = await startNewGame(page);
  const result = await page.evaluate(async () => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    const [luka] = w.gameState.party;
    if (!luka) throw new Error('no leader');
    Object.assign(luka, { hp: 1, mp: 0, ko: true, statuses: ['poison'] });
    await w.interpreter.runCommands([
      { cmd: 'heal_party' },
      { cmd: 'add_member', id: 'ch_mio' },
      { cmd: 'add_member', id: 'ch_mio' },
      { cmd: 'add_member', id: 'ch_goro' },
    ]);
    const afterScript = w.gameState.party.map((m) => ({
      id: m.id,
      exp: m.exp,
      hp: m.hp,
      mp: m.mp,
      ko: m.ko,
      statuses: [...m.statuses],
      weapon: m.equipment.weapon,
    }));
    luka.hp = 1;
    w.runner.host.applyEffect({ cmd: 'heal_party' });
    return { afterScript, hpAfterEffect: luka.hp };
  });
  expect(result.afterScript).toHaveLength(3);
  expect(result.afterScript[0]).toEqual({
    id: 'ch_luka',
    exp: 0,
    hp: 42,
    mp: 12,
    ko: false,
    statuses: [],
    weapon: 'eq_wp_luka_1',
  });
  // ミオ joins at the leader's EXP (§4.1); ゴロー is floored at Lv7 = 991 EXP.
  expect(result.afterScript[1]).toMatchObject({ id: 'ch_mio', exp: 0, hp: 36, mp: 14 });
  expect(result.afterScript[2]).toMatchObject({ id: 'ch_goro', exp: 991, weapon: 'eq_wp_goro_1' });
  expect(result.hpAfterEffect).toBe(42);

  // A heal:true save point (§9.3) restores the party once, then opens the save list.
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    const [luka] = w.gameState.party;
    if (!luka) throw new Error('no leader');
    luka.hp = 1;
    luka.mp = 0;
    w.objects.push({
      kind: 'save_point',
      tx: 7,
      ty: 6,
      tw: 1,
      th: 1,
      heal: true,
      onceFlag: 'ev.probe_spring',
    });
    w.rebuildCollision();
  });
  await tapKey(page, 'ArrowUp');
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  const healed = await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<FieldProbe>('World');
    const [luka] = w.gameState.party;
    return { hp: luka?.hp, mp: luka?.mp, flag: w.gameState.save.flags['ev.probe_spring'] };
  });
  expect(healed).toEqual({ hp: 42, mp: 12, flag: true });
  await pressThrough(page, 'dialog');
  await waitForMenu(page);
  expect(await menuMode(page)).toBe('save');
  expect(errors).toEqual([]);
});

test('a held X keeps the menu open: keyboard auto-repeat is not a press', async ({ page }) => {
  const errors = await startNewGame(page);
  // Each further keyboard.down() while the key is held is a keydown with repeat=true,
  // like the browser's own auto-repeat. The Menu scene never saw the first keydown,
  // so its Key would otherwise treat the repeat as a fresh cancel and close itself.
  await page.keyboard.down('x');
  await waitForMenu(page);
  expect(await menuMode(page)).toBe('root');
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.down('x');
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => (window.__starfall?.game as Game).scene.isActive('Menu')),
    ).toBe(true);
    expect(await menuMode(page)).toBe('root');
  }
  await page.keyboard.up('x');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window.__starfall?.game as Game).scene.isActive('Menu'))).toBe(
    true,
  );
  // A real release and re-press still closes it.
  await tapKey(page, 'x');
  await page.waitForFunction(
    () => !(window.__starfall?.game as Game).scene.isActive('Menu'),
    undefined,
    { timeout: 5_000 },
  );
  expect(errors).toEqual([]);
});

type BattleProbe = {
  phaseName: string;
  outcome: string;
  round: number;
  log: string[];
  enemyHp: number[];
};

type BattleStarter = {
  startBattle: (groupId: string, options: { seed?: number }) => Promise<string>;
  isBattleActive: boolean;
  gameState: { gold: number; party: { exp: number; hp: number }[] };
};

const battlePhase = (page: Page) =>
  page.evaluate(() => {
    const game = window.__starfall?.game as Game;
    if (!game.scene.isActive('Battle')) return 'inactive';
    return game.scene.getScene<BattleProbe>('Battle').phaseName;
  });

/** Waits until the battle asks for the next command or has ended. */
const waitForCommandOrEnd = (page: Page) =>
  page.waitForFunction(
    () => {
      const game = window.__starfall?.game as Game;
      if (!game.scene.isActive('Battle')) return true;
      return game.scene.getScene<BattleProbe>('Battle').phaseName === 'command';
    },
    undefined,
    { timeout: 30_000 },
  );

/** Plays たたかう on the first enemy every round until the battle ends. */
async function fightWithAttacks(page: Page, maxTurns = 40): Promise<void> {
  for (let i = 0; i < maxTurns; i += 1) {
    await waitForCommandOrEnd(page);
    if ((await battlePhase(page)) === 'inactive') return;
    await page.keyboard.press('z'); // たたかう
    await page.waitForFunction(
      () => {
        const game = window.__starfall?.game as Game;
        return game.scene.getScene<BattleProbe>('Battle').phaseName === 'target';
      },
      undefined,
      { timeout: 5_000 },
    );
    // Two confirms closer than CONFIRM_DEBOUNCE_MS (120 ms) count as one (§11.4 連打防止).
    await page.waitForTimeout(200);
    await page.keyboard.press('z'); // first live enemy
    await page.waitForTimeout(200);
  }
  throw new Error('battle did not end');
}

test('a seeded battle on the coast is won with plain attacks and pays out', async ({ page }) => {
  const errors = await startNewGame(page);
  const before = await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<BattleStarter>('World');
    return { gold: w.gameState.gold, exp: w.gameState.party[0]?.exp ?? -1 };
  });
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<BattleStarter>('World');
    void w.startBattle('grp_coast_a', { seed: 1 });
  });
  await page.waitForFunction(
    () => (window.__starfall?.game as Game).scene.isActive('Battle'),
    undefined,
    { timeout: 5_000 },
  );
  await waitForCommandOrEnd(page);
  expect(await battlePhase(page)).toBe('command');

  await fightWithAttacks(page);

  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as Game;
      return game.scene.isActive('World') && !game.scene.isActive('Battle');
    },
    undefined,
    { timeout: 10_000 },
  );
  const after = await page.evaluate(() => {
    const game = window.__starfall?.game as Game;
    const w = game.scene.getScene<BattleStarter>('World');
    const b = game.scene.getScene<BattleProbe>('Battle');
    return {
      gold: w.gameState.gold,
      exp: w.gameState.party[0]?.exp ?? -1,
      hp: w.gameState.party[0]?.hp ?? -1,
      active: w.isBattleActive,
      outcome: b.outcome,
      log: b.log,
    };
  });
  expect(after.outcome).toBe('victory');
  expect(after.active).toBe(false);
  // Two 迷い星スライム: 7 EXP and 5 G each (§8.1).
  expect(after.exp - before.exp).toBe(14);
  expect(after.gold - before.gold).toBe(10);
  expect(after.hp).toBeGreaterThan(0);
  expect(after.log).toContain('迷い星スライムが あらわれた！');
  expect(after.log).toContain('敵を すべて たおした！');
  expect(after.log.some((l) => l.includes('の経験値を 手に入れた！'))).toBe(true);
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

test('losing a battle leads to the game over screen and back to the title', async ({ page }) => {
  const errors = await startNewGame(page);
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<BattleStarter>('World');
    void w.startBattle('grp_boss_tree', { seed: 1 });
  });
  await page.waitForFunction(
    () => (window.__starfall?.game as Game).scene.isActive('Battle'),
    undefined,
    { timeout: 5_000 },
  );
  await fightWithAttacks(page);
  await page.waitForFunction(() => window.__starfall?.scene === 'GameOver', undefined, {
    timeout: 10_000,
  });
  const outcome = await page.evaluate(
    () => (window.__starfall?.game as Game).scene.getScene<BattleProbe>('Battle').outcome,
  );
  expect(outcome).toBe('defeat');
  await page.waitForTimeout(600);
  // No save exists, so the cursor starts on タイトルへ.
  await page.keyboard.press('z');
  await page.waitForFunction(() => window.__starfall?.scene === 'Title', undefined, {
    timeout: 10_000,
  });
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

type ShopProbe = { currentMode: string; quantity: number };
type EconomyProbe = {
  gameState: {
    gold: number;
    inventory: { count: (id: string) => number; add: (id: string, qty: number) => number };
    party: { hp: number; equipment: { weapon: string | null } }[];
  };
  interpreter: { runCommands: (commands: object[]) => Promise<unknown> };
};

const shopMode = (page: Page) =>
  page.evaluate(() => {
    const game = window.__starfall?.game as Game;
    return game.scene.isActive('Shop')
      ? game.scene.getScene<ShopProbe>('Shop').currentMode
      : 'inactive';
  });

const waitForShopMode = (page: Page, mode: string) =>
  page.waitForFunction(
    (target) => {
      const game = window.__starfall?.game as Game;
      const current = game.scene.isActive('Shop')
        ? game.scene.getScene<ShopProbe>('Shop').currentMode
        : 'inactive';
      return current === target;
    },
    mode,
    { timeout: 5_000 },
  );

const waitForMenuMode = (page: Page, mode: string) =>
  page.waitForFunction(
    (target) => {
      const game = window.__starfall?.game as Game;
      return (
        game.scene.isActive('Menu') && game.scene.getScene<MenuProbe>('Menu').currentMode === target
      );
    },
    mode,
    { timeout: 5_000 },
  );

const economy = (page: Page) =>
  page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<EconomyProbe>('World');
    return {
      gold: w.gameState.gold,
      herbs: w.gameState.inventory.count('it_herb'),
      oldSword: w.gameState.inventory.count('eq_wp_luka_1'),
      hp: w.gameState.party[0]?.hp ?? -1,
      weapon: w.gameState.party[0]?.equipment.weapon ?? null,
    };
  });

test('shop, inn and equipment: buy a herb, sleep, then change the weapon', async ({ page }) => {
  const errors = await startNewGame(page);
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<EconomyProbe>('World');
    w.gameState.gold = 100;
    void w.interpreter.runCommands([
      { cmd: 'warp', map: 'map_minato_shop', x: 5, y: 2, facing: 'up' },
    ]);
  });
  await waitForFieldMap(page, 'map_minato_shop');
  await waitForField(page, 'isEventRunning', false);
  await page.waitForTimeout(400);

  // Talk to the shopkeeper: the greeting ends on the counter.
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog');
  await waitForShopMode(page, 'root');
  await page.keyboard.press('z'); // 買う
  await waitForShopMode(page, 'buy');
  await page.keyboard.press('z'); // やくそう
  await waitForShopMode(page, 'qty');
  await page.keyboard.press('z'); // 1 piece
  await waitForShopMode(page, 'confirm');
  await page.keyboard.press('ArrowDown'); // はい
  await page.waitForTimeout(150);
  await page.keyboard.press('z');
  await waitForShopMode(page, 'buy');
  const bought = await economy(page);
  expect(bought.gold).toBe(80);
  expect(bought.herbs).toBe(1);
  await page.keyboard.press('x');
  await waitForShopMode(page, 'root');
  await page.keyboard.press('x');
  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as Game;
      return game.scene.isActive('World') && !game.scene.isActive('Shop');
    },
    undefined,
    { timeout: 5_000 },
  );
  expect(await shopMode(page)).toBe('inactive');

  // The inn: pay 20G, wake up healed, land on the save screen.
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<EconomyProbe>('World');
    const luka = w.gameState.party[0];
    if (luka) luka.hp = 5;
    void w.interpreter.runCommands([
      { cmd: 'warp', map: 'map_minato_inn', x: 9, y: 2, facing: 'up' },
    ]);
  });
  await waitForFieldMap(page, 'map_minato_inn');
  await waitForField(page, 'isEventRunning', false);
  await page.waitForTimeout(400);
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog'); // greeting, then はい on the offer
  await waitForField(page, 'isDialogOpen', true); // ぐっすり 眠った
  await pressThrough(page, 'dialog');
  await waitForMenuMode(page, 'save');
  const slept = await economy(page);
  expect(slept.gold).toBe(60);
  expect(slept.hp).toBe(42);

  // Equipment: a tier-2 sword in the bag replaces the starting one.
  await page.keyboard.press('x');
  await waitForMenuMode(page, 'root');
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<EconomyProbe>('World');
    w.gameState.inventory.add('eq_wp_luka_2', 1);
  });
  const rootIndex = await page.evaluate(() => {
    const game = window.__starfall?.game as Game;
    return game.scene.getScene<{ rootMenu: { selectedIndex: number } }>('Menu').rootMenu
      .selectedIndex;
  });
  for (let i = rootIndex; i > 2; i -= 1) {
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(120);
  }
  for (let i = rootIndex; i < 2; i += 1) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(120);
  }
  await page.keyboard.press('z');
  await waitForMenuMode(page, 'equip');
  await page.keyboard.press('z'); // ルカ
  await waitForMenuMode(page, 'equip_slots');
  await page.keyboard.press('z'); // 武器
  await waitForMenuMode(page, 'equip_pick');
  await page.keyboard.press('z'); // the tier-2 sword
  await waitForMenuMode(page, 'equip_slots');
  const equipped = await economy(page);
  expect(equipped.weapon).toBe('eq_wp_luka_2');
  expect(equipped.oldSword).toBe(1);
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

type ChapterProbe = {
  gameState: {
    gold: number;
    flags: { set: (key: string, value: boolean | number | string) => void };
    save: { flags: Record<string, unknown>; location: { map: string } };
    inventory: { count: (id: string) => number; add: (id: string, qty: number) => number };
    party: { id: string; exp: number; hp: number; mp: number }[];
  };
  interpreter: { runCommands: (commands: object[]) => Promise<unknown> };
  startBattle: (groupId: string, options: { seed?: number }) => Promise<string>;
};

const chapter = (page: Page) =>
  page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    return {
      map: w.gameState.save.location.map,
      flags: w.gameState.save.flags,
      gold: w.gameState.gold,
      party: w.gameState.party.map((m) => m.id),
      hp: w.gameState.party.map((m) => m.hp),
      mineKey: w.gameState.inventory.count('it_key_mine'),
      ore: w.gameState.inventory.count('it_shining_ore'),
      hammer: w.gameState.inventory.count('eq_wp_goro_4'),
      fragment2: w.gameState.inventory.count('it_fragment_2'),
      fragment3: w.gameState.inventory.count('it_fragment_3'),
      tideRune: w.gameState.inventory.count('it_tide_rune'),
      chart: w.gameState.inventory.count('it_old_chart'),
      pendant: w.gameState.inventory.count('eq_acc_lantern_pendant'),
      fang: w.gameState.inventory.count('eq_wp_mio_4'),
      lunch: w.gameState.inventory.count('it_mio_lunch'),
      oil: w.gameState.inventory.count('it_lamp_oil'),
      herbs: w.gameState.inventory.count('it_herb'),
      key: w.gameState.inventory.count('it_key_shrine'),
      fragment: w.gameState.inventory.count('it_fragment_1'),
      ring: w.gameState.inventory.count('eq_acc_sea_ring'),
      necklace: w.gameState.inventory.count('it_shell_necklace'),
    };
  });

/** Warps through a script command and waits for the new map to settle. */
async function warpTo(page: Page, map: string, x: number, y: number, facing: string) {
  await page.evaluate(
    ([m, tx, ty, f]) => {
      const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
      void w.interpreter.runCommands([{ cmd: 'warp', map: m, x: tx, y: ty, facing: f }]);
    },
    [map, x, y, facing] as const,
  );
  await waitForFieldMap(page, map);
  await waitForField(page, 'isEventRunning', false);
  await page.waitForTimeout(400);
}

test('chapter 1: Mio joins, the core shatters, the forest shrine falls and the necklace comes home', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await startNewGame(page);
  // Symbols stay frozen so the walkthrough is deterministic; the boss fight is seeded below.
  await page.evaluate(() => {
    if (window.__starfall) window.__starfall.encounters = false;
  });

  // 序章: the trigger at the village north gate brings Mio in.
  await warpTo(page, 'map_minato_village', 20, 3, 'up');
  await walkField(page, 'ArrowUp', 20, 1);
  await pressThrough(page, 'event');
  let s = await chapter(page);
  expect(s.flags['minato.mio_joined']).toBe(true);
  expect(s.party).toEqual(['ch_luka', 'ch_mio']);
  expect(s.lunch).toBe(1);

  // The lighthouse door: the core shatters and chapter 1 begins.
  await warpTo(page, 'map_lighthouse_path', 15, 4, 'up');
  await walkField(page, 'ArrowUp', 15, 2);
  await pressThrough(page, 'event');
  s = await chapter(page);
  expect(s.flags['main.core_shattered']).toBe(true);
  expect(s.flags['main.chapter']).toBe(1);
  expect(s.oil).toBe(0);

  // Grandpa sends the party to the forest shrine and hands over herbs.
  await warpTo(page, 'map_minato_luka_house', 7, 4, 'up');
  const herbsBefore = (await chapter(page)).herbs;
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog');
  s = await chapter(page);
  expect(s.flags['minato.talked_to_grandpa']).toBe(true);
  expect(s.herbs).toBe(herbsBefore + 3);

  // The guard has left the east gate: the road to the coast is open.
  await warpTo(page, 'map_minato_village', 37, 14, 'right');
  await page.keyboard.down('ArrowRight');
  await waitForFieldMap(page, 'map_coast_road');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);

  // The shrine key waits at the end of the forest's dead-end trail.
  await warpTo(page, 'map_whisper_forest', 45, 33, 'right');
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog');
  s = await chapter(page);
  expect(s.key).toBe(1);
  expect(s.flags['chest.forest_02']).toBe(true);

  // The shrine door opens with the key and stays open.
  await warpTo(page, 'map_whisper_forest', 25, 5, 'up');
  await walkField(page, 'ArrowUp', 25, 4);
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog');
  expect((await chapter(page)).flags['door.forest_shrine_01']).toBe(true);
  await page.keyboard.down('ArrowUp');
  await waitForFieldMap(page, 'map_forest_shrine');
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(500);

  // The boss talk fires at the doorway; a seeded Lv8 party then beats 古木のウロ with plain attacks.
  await warpTo(page, 'map_forest_shrine', 15, 9, 'up');
  await walkField(page, 'ArrowUp', 15, 7);
  await pressThrough(page, 'event');
  expect((await chapter(page)).flags['ev.ev_forest_boss_intro']).toBe(true);
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    for (const m of w.gameState.party) {
      m.exp = 1500; // Lv8 (§6.1 curve)
      m.hp = 999;
      m.mp = 999;
    }
    void w.startBattle('grp_boss_tree', { seed: 1 });
  });
  await page.waitForFunction(
    () => (window.__starfall?.game as Game).scene.isActive('Battle'),
    undefined,
    { timeout: 10_000 },
  );
  await fightWithAttacks(page, 120);
  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as Game;
      return game.scene.isActive('World') && !game.scene.isActive('Battle');
    },
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(500);
  await pressThrough(page, 'event');
  s = await chapter(page);
  expect(s.flags['forest.boss_defeated']).toBe(true);
  expect(s.flags['fragments.count']).toBe(1);
  expect(s.flags['main.chapter']).toBe(2);
  expect(s.fragment).toBe(1);

  // 女将のネックレス: accept (no gold, so the inn offer fails politely), find it, hand it over,
  // then sleep for free and land on the save screen.
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    w.gameState.gold = 0;
  });
  await warpTo(page, 'map_minato_inn', 9, 2, 'up');
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog'); // offer → さがしてみる → inn offer → はい → no gold
  await page.waitForTimeout(500);
  await pressThrough(page, 'dialog');
  expect((await chapter(page)).flags['sq.necklace']).toBe(1);
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    w.gameState.inventory.add('it_shell_necklace', 1);
    w.gameState.flags.set('chest.forest_05', true);
  });
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog'); // hand-over → free inn offer → はい
  await page.waitForTimeout(1500); // the night fades out and in
  await waitForField(page, 'isDialogOpen', true); // ぐっすり 眠った
  await pressThrough(page, 'dialog');
  await waitForMenuMode(page, 'save');
  s = await chapter(page);
  expect(s.flags['sq.necklace']).toBe(2);
  expect(s.flags['minato.inn_free']).toBe(true);
  expect(s.gold).toBe(300);
  expect(s.ring).toBe(1);
  expect(s.necklace).toBe(0);
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

test('chapter 2: ゴロー joins, the mine opens, the vein and the smith, 岩のゴーレム falls', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = await startNewGame(page);
  await page.evaluate(() => {
    if (window.__starfall) window.__starfall.encounters = false;
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    const f = w.gameState.flags;
    f.set('minato.mio_joined', true);
    f.set('main.core_shattered', true);
    f.set('minato.talked_to_grandpa', true);
    f.set('forest.boss_defeated', true);
    f.set('fragments.count', 1);
    f.set('main.chapter', 2);
    void w.interpreter.runCommands([{ cmd: 'add_member', id: 'ch_mio' }]);
  });
  await waitForField(page, 'isEventRunning', false);
  // Arriving in ハガネ through the mountain road's east exit fires the town narration.
  await warpTo(page, 'map_mountain_road', 38, 4, 'right');
  await page.keyboard.down('ArrowRight');
  await waitForFieldMap(page, 'map_hagane_town');
  await page.keyboard.up('ArrowRight');
  await waitForField(page, 'isEventRunning', true);
  await pressThrough(page, 'event');
  let s = await chapter(page);
  expect(s.flags['hagane.arrived']).toBe(true);
  expect(s.party).toEqual(['ch_luka', 'ch_mio']);

  // ゴロー joins at his table and hands over the mine key.
  await warpTo(page, 'map_hagane_goro_house', 5, 7, 'up');
  await walkField(page, 'ArrowUp', 5, 6);
  await pressThrough(page, 'event');
  s = await chapter(page);
  expect(s.flags['hagane.goro_joined']).toBe(true);
  expect(s.party).toEqual(['ch_luka', 'ch_mio', 'ch_goro']);
  expect(s.mineKey).toBe(1);

  // The mine gate opens with the key; ladders lead down to B3.
  await warpTo(page, 'map_hagane_town', 18, 2, 'up');
  await walkField(page, 'ArrowUp', 18, 1);
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog');
  expect((await chapter(page)).flags['door.hagane_mine_01']).toBe(true);
  await page.keyboard.down('ArrowUp');
  await waitForFieldMap(page, 'map_mine_b1');
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(500);
  await warpTo(page, 'map_mine_b1', 36, 6, 'up');
  await page.keyboard.down('ArrowUp');
  await waitForFieldMap(page, 'map_mine_b2');
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(500);
  await warpTo(page, 'map_mine_b2', 4, 28, 'down');
  await page.keyboard.down('ArrowDown');
  await waitForFieldMap(page, 'map_mine_b3');
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(500);

  // The glittering vein yields an ore.
  await warpTo(page, 'map_mine_b3', 4, 16, 'up');
  await walkField(page, 'ArrowUp', 4, 15);
  await pressThrough(page, 'event');
  expect((await chapter(page)).ore).toBe(1);

  // かじやの頼み: accept, then hand over three ores for やまわりの大槌.
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    w.gameState.inventory.add('it_shining_ore', 2);
  });
  await warpTo(page, 'map_hagane_shop', 4, 1, 'left');
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog'); // offer → ひきうける, then the arms counter opens
  await waitForShopMode(page, 'root');
  await page.keyboard.press('x');
  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as Game;
      return game.scene.isActive('World') && !game.scene.isActive('Shop');
    },
    undefined,
    { timeout: 5_000 },
  );
  expect((await chapter(page)).flags['sq.ore']).toBe(1);
  await page.waitForTimeout(300);
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog'); // hand-over, then the counter again
  await waitForShopMode(page, 'root');
  await page.keyboard.press('x');
  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as Game;
      return game.scene.isActive('World') && !game.scene.isActive('Shop');
    },
    undefined,
    { timeout: 5_000 },
  );
  s = await chapter(page);
  expect(s.flags['sq.ore']).toBe(2);
  expect(s.ore).toBe(0);
  expect(s.hammer).toBe(1);

  // The golem's doorway talk, then a seeded Lv12 win with plain attacks and the chapter event.
  await warpTo(page, 'map_mine_b3', 30, 9, 'up');
  await walkField(page, 'ArrowUp', 30, 7);
  await pressThrough(page, 'event');
  expect((await chapter(page)).flags['ev.ev_mine_boss_intro']).toBe(true);
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    for (const m of w.gameState.party) {
      m.exp = 4500; // Lv12 (§6.1 curve: 4392 ≤ exp < 5457)
      m.hp = 999;
      m.mp = 999;
    }
    void w.startBattle('grp_boss_golem', { seed: 1 });
  });
  await page.waitForFunction(
    () => (window.__starfall?.game as Game).scene.isActive('Battle'),
    undefined,
    { timeout: 10_000 },
  );
  await fightWithAttacks(page, 160);
  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as Game;
      return game.scene.isActive('World') && !game.scene.isActive('Battle');
    },
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(500);
  await pressThrough(page, 'event');
  s = await chapter(page);
  expect(s.flags['mine.boss_defeated']).toBe(true);
  expect(s.flags['fragments.count']).toBe(2);
  expect(s.flags['main.chapter']).toBe(3);
  expect(s.flags['shop.hagane_tier3']).toBe(true);
  expect(s.fragment2).toBe(1);

  // The south guard has stepped aside.
  await warpTo(page, 'map_hagane_town', 18, 23, 'down');
  await walkField(page, 'ArrowDown', 18, 25);
  expect((await fieldWorld(page)).tile).toMatchObject({ x: 18, y: 25 });
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

/** Where the party stands to talk to the camp NPCs (map_ruins_camp), facing them. */
const CAMP = {
  scholar: { x: 12, y: 6, facing: 'up' }, // npc_ruins_scholar stands at (12,5)
  assistant: { x: 3, y: 6, facing: 'up' }, // npc_camp_assistant stands at (3,5)
} as const;

/** Talks to the NPC in front of the player and plays the whole conversation. */
async function talk(page: Page): Promise<void> {
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog');
}

test('chapter 3: the scholar, the tide steles, the sunken chart and 遺跡の番人, then ノクス', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors = await startNewGame(page);
  await page.evaluate(() => {
    if (window.__starfall) window.__starfall.encounters = false;
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    const f = w.gameState.flags;
    f.set('minato.mio_joined', true);
    f.set('main.core_shattered', true);
    f.set('minato.talked_to_grandpa', true);
    f.set('forest.boss_defeated', true);
    f.set('hagane.arrived', true);
    f.set('hagane.goro_joined', true);
    f.set('mine.boss_defeated', true);
    f.set('shop.hagane_tier3', true);
    f.set('fragments.count', 2);
    f.set('main.chapter', 3);
    void w.interpreter.runCommands([
      { cmd: 'add_member', id: 'ch_mio' },
      { cmd: 'add_member', id: 'ch_goro' },
    ]);
  });
  await waitForField(page, 'isEventRunning', false);
  expect((await chapter(page)).party).toEqual(['ch_luka', 'ch_mio', 'ch_goro']);

  // The south gate of ハガネ now opens onto 磯の道, and the road ends at the camp.
  await warpTo(page, 'map_hagane_town', 18, 24, 'down');
  await page.keyboard.down('ArrowDown');
  await waitForFieldMap(page, 'map_shore_path');
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(500);
  expect((await fieldWorld(page)).tile).toMatchObject({ x: 19, y: 1 });
  await warpTo(page, 'map_shore_path', 20, 17, 'down');
  await page.keyboard.down('ArrowDown');
  await waitForFieldMap(page, 'map_ruins_camp');
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(500);
  expect((await fieldWorld(page)).tile).toMatchObject({ x: 10, y: 1 });

  // First meeting with the scholar opens the camp.
  await warpTo(page, 'map_ruins_camp', CAMP.scholar.x, CAMP.scholar.y, CAMP.scholar.facing);
  await talk(page);
  let s = await chapter(page);
  expect(s.flags['ruins.scholar_met']).toBe(true);
  expect(s.flags['ruins.tide_learned']).toBeUndefined();

  // Without the rune the stele is just unreadable stone, and the tide stays high.
  await warpTo(page, 'map_sunken_ruins_1f', 20, 4, 'up');
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'event');
  s = await chapter(page);
  expect(s.flags['ruins.tide']).toBeUndefined();
  // The hall is under water: walking down the vestibule throat stops short of it.
  await warpTo(page, 'map_sunken_ruins_1f', 22, 6, 'down');
  await walkField(page, 'ArrowDown', 22, 8);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowDown');
  await waitForField(page, 'isMoving', false);
  expect((await fieldWorld(page)).tile).toMatchObject({ x: 22, y: 8 });

  // The second talk hands over 潮のしるべ; the third offers the chart quest.
  await warpTo(page, 'map_ruins_camp', CAMP.scholar.x, CAMP.scholar.y, CAMP.scholar.facing);
  await talk(page);
  s = await chapter(page);
  expect(s.flags['ruins.tide_learned']).toBe(true);
  expect(s.tideRune).toBe(1);
  await talk(page); // offer → ひきうける (first choice)
  expect((await chapter(page)).flags['sq.chart']).toBe(1);

  // Now the stele answers: the tide goes out and the hall can be crossed to the east stairs.
  await warpTo(page, 'map_sunken_ruins_1f', 20, 4, 'up');
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'event');
  expect((await chapter(page)).flags['ruins.tide']).toBe('low');
  await warpTo(page, 'map_sunken_ruins_1f', 22, 6, 'down');
  await walkField(page, 'ArrowDown', 22, 20);
  await walkField(page, 'ArrowRight', 40, 20);
  await walkField(page, 'ArrowDown', 40, 31);
  await page.keyboard.down('ArrowRight');
  await waitForFieldMap(page, 'map_sunken_ruins_b1');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);
  expect((await fieldWorld(page)).tile).toMatchObject({ x: 42, y: 31 });

  // The chest room holds ふるい海図 and うしおのきば, dry only at low tide.
  await walkField(page, 'ArrowLeft', 37, 31);
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog');
  await walkField(page, 'ArrowUp', 37, 30);
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog');
  s = await chapter(page);
  expect(s.chart).toBe(1);
  expect(s.fang).toBe(1);

  // Handing the chart over earns ランタンのペンダント.
  await warpTo(page, 'map_ruins_camp', CAMP.scholar.x, CAMP.scholar.y, CAMP.scholar.facing);
  await talk(page);
  s = await chapter(page);
  expect(s.flags['sq.chart']).toBe(2);
  expect(s.chart).toBe(0);
  expect(s.pendant).toBe(1);

  // The tent costs 60G and leads to the save screen.
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    w.gameState.gold = 100;
  });
  await warpTo(page, 'map_ruins_camp', CAMP.assistant.x, CAMP.assistant.y, CAMP.assistant.facing);
  await page.keyboard.press('z');
  await waitForField(page, 'isDialogOpen', true);
  await pressThrough(page, 'dialog'); // talk → inn offer → はい
  await page.waitForTimeout(1500); // the night fades out and in
  await waitForField(page, 'isDialogOpen', true); // ぐっすり 眠った
  await pressThrough(page, 'dialog');
  await waitForMenuMode(page, 'save');
  expect((await chapter(page)).gold).toBe(40);
  await page.keyboard.press('x'); // save → root
  await waitForMenuMode(page, 'root');
  await page.keyboard.press('x'); // root → field
  await page.waitForFunction(
    () => !(window.__starfall?.game as Game).scene.isActive('Menu'),
    undefined,
    { timeout: 5_000 },
  );

  // The guardian's doorway talk, then a seeded Lv20 win with plain attacks and the chapter event.
  await warpTo(page, 'map_sunken_ruins_b1', 6, 21, 'down');
  await walkField(page, 'ArrowDown', 6, 24);
  await pressThrough(page, 'event');
  expect((await chapter(page)).flags['ev.ev_ruins_boss_intro']).toBe(true);
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    for (const m of w.gameState.party) {
      m.exp = 17366; // Lv20 (§6.1 curve); plain attacks need it against 遺跡の番人
      m.hp = 999;
      m.mp = 999;
    }
    void w.startBattle('grp_boss_guardian', { seed: 1 });
  });
  await page.waitForFunction(
    () => (window.__starfall?.game as Game).scene.isActive('Battle'),
    undefined,
    { timeout: 10_000 },
  );
  await fightWithAttacks(page, 200);
  await page.waitForFunction(
    () => {
      const game = window.__starfall?.game as Game;
      return game.scene.isActive('World') && !game.scene.isActive('Battle');
    },
    undefined,
    { timeout: 10_000 },
  );
  await page.waitForTimeout(500);
  await pressThrough(page, 'event');
  s = await chapter(page);
  expect(s.flags['ruins.boss_defeated']).toBe(true);
  expect(s.flags['fragments.count']).toBe(3);
  expect(s.flags['main.chapter']).toBe(4);
  expect(s.fragment3).toBe(1);

  // Leaving the chamber, ノクス bars the way and names the lighthouse.
  await walkField(page, 'ArrowDown', 6, 25);
  await walkField(page, 'ArrowUp', 6, 24);
  await waitForField(page, 'isEventRunning', true);
  await pressThrough(page, 'event');
  s = await chapter(page);
  expect(s.flags['ev.ev_nox_appear']).toBe(true);
  expect(s.flags['ruins.nox_on_stage']).toBe(false);
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

type EndingProbe = { phaseName: string; rollLineCount: number };
type TitleProbe = { currentMode: string; hasCleared: boolean; slotLabels: string[] };

test('ending: end_game rewinds the save to 5F, rolls the credits and stars the title', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await startNewGame(page);
  await page.evaluate(() => {
    const w = (window.__starfall?.game as Game).scene.getScene<ChapterProbe>('World');
    w.gameState.flags.set('main.chapter', 5);
    void w.interpreter.runCommands([{ cmd: 'end_game' }]);
  });
  await page.waitForFunction(() => window.__starfall?.scene === 'Ending', undefined, {
    timeout: 10_000,
  });
  const ending = () =>
    page.evaluate(() => {
      const e = (window.__starfall?.game as Game).scene.getScene<EndingProbe>('Ending');
      return { phase: e.phaseName, lines: e.rollLineCount };
    });
  expect((await ending()).phase).toBe('visual');
  await page.keyboard.press('z');
  await page.waitForFunction(
    () =>
      (window.__starfall?.game as Game).scene.getScene<EndingProbe>('Ending').phaseName === 'roll',
    undefined,
    { timeout: 5_000 },
  );
  expect((await ending()).lines).toBeGreaterThan(8);
  // Z held fast-forwards the roll.
  await page.keyboard.down('z');
  await page.waitForFunction(
    () =>
      (window.__starfall?.game as Game).scene.getScene<EndingProbe>('Ending').phaseName === 'end',
    undefined,
    { timeout: 60_000 },
  );
  await page.keyboard.up('z');
  await page.waitForTimeout(300);
  await page.keyboard.press('z');
  await page.waitForFunction(() => window.__starfall?.scene === 'Title', undefined, {
    timeout: 10_000,
  });
  await page.waitForTimeout(500);
  const title = () =>
    page.evaluate(() => {
      const t = (window.__starfall?.game as Game).scene.getScene<TitleProbe>('Title');
      return { mode: t.currentMode, cleared: t.hasCleared, slots: t.slotLabels };
    });
  expect((await title()).cleared).toBe(true);
  // つづきから lists the auto save, which continues from the 5F save point.
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  await page.keyboard.press('z');
  await page.waitForFunction(
    () =>
      (window.__starfall?.game as Game).scene.getScene<TitleProbe>('Title').currentMode === 'slots',
    undefined,
    { timeout: 5_000 },
  );
  const slots = (await title()).slots;
  expect(slots.some((l) => l.startsWith('オート') && !l.includes('----'))).toBe(true);
  // The three empty slots are disabled, so the cursor already rests on オート.
  await page.keyboard.press('z');
  await page.waitForFunction(() => window.__starfall?.scene === 'World', undefined, {
    timeout: 10_000,
  });
  await waitForFieldMap(page, 'map_lighthouse_5f');
  await waitForField(page, 'isMoving', false);
  await page.waitForTimeout(500);
  const s = await chapter(page);
  expect(s.flags['main.ending_seen']).toBe(true);
  expect((await fieldWorld(page)).tile).toMatchObject({ x: 21, y: 3 });
  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});
