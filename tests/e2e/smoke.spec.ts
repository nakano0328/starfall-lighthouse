import { expect, test } from '@playwright/test';

test('title screen boots and is ready for input', async ({ page }) => {
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

  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});
