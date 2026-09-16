import { test, expect, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
import { ready, focusShelf, add, room } from './helpers/shelf';
import { COVER_FRAME_MM, SHELF_CELL_MM, shelfArrangement, mm } from '../../src/data/physicalScale';

const OUT = process.env.M18_REVIEW_DIR || 'artifacts/m18-candidates';
async function photoPixels(page: Page, slot: number) {
  const box = (await page.locator(`[data-shelf-slot="${slot}"]`).boundingBox())!;
  const centerX = .5 + shelfArrangement(60, true, true).companionX / mm(SHELF_CELL_MM.width);
  const centerY = 1 - (5 + COVER_FRAME_MM.height / 2) / SHELF_CELL_MM.height;
  const width = Math.floor(box.width * 36 / SHELF_CELL_MM.width), height = Math.floor(box.height * 24 / SHELF_CELL_MM.height);
  return PNG.sync.read(await page.screenshot({ clip: { x: box.x + box.width * centerX - width / 2, y: box.y + box.height * centerY - height / 2, width, height } }));
}
function difference(a: PNG, b: PNG) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let delta = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) delta += Math.abs(a.data[i+c] - b.data[i+c]);
  return delta / (a.width * a.height * 3);
}

test('M18 saved covers render in frames, update after editing, and leave gray blocks unchanged', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?mode=room&reduced_motion=true'); await ready(page); await focusShelf(page);
  await expect(page.locator('canvas')).toHaveAttribute('data-packaging-loaded', '15');
  await add(page, 'Medium format cover', 'ektar-100', '66');
  await expect(page.locator('[data-owned="true"]')).toHaveCount(2);
  await page.mouse.move(0, 0); await page.waitForTimeout(400);
  const before = await photoPixels(page, 0), gray = await photoPixels(page, 5);
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${info.project.name}-cover-frames.png` });
  await page.getByRole('button', { name: 'Show saved roll Roll 01', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Review roll', exact: true });
  await editor.getByRole('button', { name: 'Select frame 2', exact: true }).click();
  await editor.getByRole('button', { name: 'Rotate frame 2', exact: true }).click();
  await editor.getByRole('button', { name: 'Cover', exact: true }).click();
  await editor.getByRole('button', { name: 'Save and open', exact: true }).click();
  await expect(editor).not.toBeVisible(); await ready(page); await room(page);
  await page.mouse.move(0, 0);
  await expect.poll(async () => difference(before, await photoPixels(page, 0))).toBeGreaterThan(12);
  expect(difference(gray, await photoPixels(page, 5))).toBeLessThan(2);
  await page.screenshot({ path: `${OUT}/${info.project.name}-cover-rotated.png` });
  const saved = await photoPixels(page, 0);
  await page.reload(); await ready(page); await focusShelf(page); await page.mouse.move(0, 0);
  await expect.poll(async () => difference(saved, await photoPixels(page, 0))).toBeLessThan(2);
  await expect(page.locator('[data-owned="false"]')).toHaveCount(14);
  const blank = (await page.locator('[data-shelf-slot="5"]').boundingBox())!;
  await page.mouse.move(blank.x + blank.width / 2, blank.y + blank.height / 2); await page.waitForTimeout(300);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});
