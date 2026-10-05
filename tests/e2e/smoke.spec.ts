import { expect, test } from '@playwright/test';

test('title screen boots and a new game reaches the field', async ({ page }) => {
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

  // X returns to the title for now (until the pause menu exists).
  await page.waitForTimeout(400);
  await page.keyboard.press('x');
  await page.waitForFunction(() => window.__starfall?.scene === 'Title', undefined, {
    timeout: 10_000,
  });

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});
