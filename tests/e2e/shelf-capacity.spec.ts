import { test, expect } from '@playwright/test';
import { ready, room, add, showRoll, openRoll } from './helpers/shelf';
import { FILM_STOCKS } from '../../src/data/filmStocks';
import fs from 'node:fs/promises';
const OUT = process.env.M18_REVIEW_DIR || 'artifacts/m18-candidates';
test('M18 all stock packaging, full shelf, overflow, edit, trash and restore through the shelf', async ({ page }) => {
  test.setTimeout(360000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const external: string[] = []; page.on('request', request => { if (request.url().startsWith('http') && !new URL(request.url()).hostname.match(/127\.0\.0\.1|localhost/)) external.push(request.url()); });
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  for (let i = 0; i < 16; i++) {
    await add(page, `Roll ${String(i + 2).padStart(2, '0')}`, FILM_STOCKS[i % 5].id, i >= 5 && i < 10 ? ['645', '66', '67', '69', '645'][i - 5] : '135');
    if (i === 9) { await fs.mkdir(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/all-ten-packaging.png` }); }
  }
  await expect(page.locator('[data-owned="true"]')).toHaveCount(16);
  await expect(page.getByRole('navigation', { name: 'Shelf pages' })).toContainText('1 / 2');
  await page.getByRole('button', { name: 'Next shelf page' }).click();
  await expect(page.getByRole('button', { name: 'Show saved roll Roll 17', exact: true })).toBeVisible();
  await expect(page.locator('[data-owned="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Previous shelf page' }).click();
  // Keyboard reveals a card and Escape dismisses it without opening or moving.
  await page.getByRole('button', { name: 'Show saved roll Roll 01', exact: true }).focus();
  await page.keyboard.press('ArrowDown'); await expect(page.getByRole('dialog', { name: /Roll 01 —/ })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await page.getByRole('button', { name: 'Rolls', exact: true }).click();
  await showRoll(page, 'Roll 01');
  await page.getByRole('button', { name: 'Edit Roll 01', exact: true }).click();
  await page.getByLabel('Roll name', { exact: true }).fill('Edited first roll');
  await page.getByRole('dialog').getByLabel('Film stock', { exact: true }).selectOption('portra-800');
  await page.getByRole('button', { name: 'Save and open', exact: true }).click(); await ready(page); await room(page);
  await expect(page.locator('[data-shelf-slot="0"]')).toHaveAttribute('data-packaging', 'portra-800-135');
  await page.getByRole('button', { name: 'Rolls', exact: true }).click();
  await showRoll(page, 'Edited first roll');
  await page.getByRole('button', { name: 'Delete Edited first roll', exact: true }).click();
  if (await page.locator('main').getAttribute('data-room-mode') === 'inspect') await room(page);
  await expect(page.locator('[data-shelf-slot="0"]')).toHaveAttribute('data-owned', 'false');
  await page.getByRole('button', { name: 'Rolls', exact: true }).click();
  await page.getByRole('button', { name: /^Trash / }).click();
  await showRoll(page, 'Edited first roll');
  await page.getByRole('button', { name: 'Restore Edited first roll', exact: true }).click();
  await page.getByRole('button', { name: 'Saved rolls', exact: true }).click();
  await expect(page.locator('[data-shelf-slot="0"]')).toHaveAttribute('data-owned', 'true');
  // The same package card provides opening and management on desktop and touch.
  await openRoll(page, 'Edited first roll');
  await ready(page); await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'inspect');
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('M18 cabinet leaves the overhead light-table surface clear and neutral', async ({ page }) => {
  await page.goto('/guest?deterministic=true&mode=inspect'); await ready(page);
  await expect(page.locator('canvas')).toHaveAttribute('data-packaging-loaded', '24');
  const { captureCanvas } = await import('./helpers/viewing');
  const { parsePng, getRegionStats } = await import('./helpers/pixelAnalysis');
  const pixels = parsePng(await captureCanvas(page));
  for (const x of [250, 640, 1030]) {
    const surface = getRegionStats(pixels, x, 200, 24);
    expect(surface.meanLum).toBeGreaterThan(230);
    expect(Math.abs(surface.meanR - surface.meanB)).toBeLessThan(10);
  }
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/overhead-clearance.png` });
});
