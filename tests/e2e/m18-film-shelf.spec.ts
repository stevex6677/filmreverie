import { ready, room, add, focusShelf } from './helpers/shelf';
import { SHELF_CAMERA } from '../../src/data/physicalScale';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const OUT = process.env.M18_REVIEW_DIR || 'artifacts/m18-candidates';
test('M18 first example roll shares the cabinet with inert gray placeholders', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  await expect(page.locator('canvas')).toHaveAttribute('data-packaging-loaded', '24');
  await expect(page.locator('[data-shelf-slot]')).toHaveCount(16);
  await expect(page.locator('[data-owned="false"]')).toHaveCount(15);
  await expect(page.getByRole('button', { name: /Show saved roll/ })).toHaveCount(0);
  expect(new Set(await page.locator('[data-packaging]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-packaging')))).size).toBe(10);
  const blank = page.locator('[data-shelf-slot="5"]');
  const box = await blank.boundingBox(); if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); }
  await page.waitForTimeout(600); await expect(page.getByRole('dialog')).not.toBeVisible();
  await fs.mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${info.project.name}-empty.png` });
  expect(errors).toEqual([]);
});
test('M18 saved 35mm and 120 rolls reveal their real cover, open, and persist', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  await add(page, 'Harbor morning');
  await expect(page.locator('[data-owned="true"]')).toHaveCount(2);
  await expect(page.locator('[data-shelf-slot="0"]')).toHaveAttribute('data-packaging', 'portra-400-135');
  await add(page, 'Mountain light', 'ektachrome-e100', '67');
  await expect(page.locator('[data-owned="true"]')).toHaveCount(3);
  await expect(page.locator('[data-shelf-slot="2"]')).toHaveAttribute('data-packaging', 'ektachrome-e100-120');
  const button = page.getByRole('button', { name: 'Show saved roll Mountain light' });
  if (info.project.name !== 'desktop') {
    await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const target = await button.boundingBox(), compartment = await page.locator('[data-shelf-slot="2"]').boundingBox();
    expect(target!.height).toBeLessThanOrEqual(compartment!.height + 1);
  }
  const pose = await page.locator('main').getAttribute('data-room-pose');
  if (info.project.name === 'desktop') await button.hover(); else { await button.focus(); await page.keyboard.press('ArrowDown'); }
  const card = page.getByRole('dialog', { name: 'Mountain light — roll details' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('E-6'); await expect(card).toContainText('120 · 6×7');
  await expect.poll(() => card.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('main')).toHaveAttribute('data-room-pose', pose!);
  const bounds = await card.boundingBox(), viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  await fs.mkdir(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${info.project.name}-saved-card.png` });
  if (info.project.name === 'desktop') { await card.hover(); await page.waitForTimeout(300); await expect(card).toBeVisible(); }
  await card.getByRole('button', { name: /Open on light table/ }).click(); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-film-stock', 'ektachrome-e100');
  await expect(page.locator('main')).toHaveAttribute('data-film-format', '67');
  await room(page); await page.reload(); await ready(page);
  if (await page.locator('main').getAttribute('data-room-mode') === 'inspect') await room(page);
  await focusShelf(page);
  await expect(page.locator('[data-shelf-slot="0"]')).toHaveAttribute('data-packaging', 'portra-400-135');
  await expect(page.locator('[data-shelf-slot="2"]')).toHaveAttribute('data-packaging', 'ektachrome-e100-120');
  expect(errors).toEqual([]);
});

test('M18 card fits phone landscape and iPad rotations, and a dragged package never opens a roll', async ({ page }, info) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page); await add(page, 'Shelf interaction');
  for (const viewport of [{ width: 820, height: 1180 }, { width: 1180, height: 820 }, { width: 844, height: 390 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(300);
    const button = page.getByRole('button', { name: 'Show saved roll Shelf interaction', exact: true });
    await button.focus(); await page.keyboard.press('ArrowDown');
    const card = page.getByRole('dialog', { name: /Shelf interaction —/ }); await expect(card).toBeVisible();
    const bounds = await card.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await fs.mkdir(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${info.project.name}-${viewport.width}x${viewport.height}-card.png` });
    await page.keyboard.press('Escape'); await expect(card).not.toBeVisible();
  }
  const button = page.getByRole('button', { name: 'Show saved roll Shelf interaction', exact: true });
  const box = await button.boundingBox();
  await page.mouse.move(box!.x + 5, box!.y + 5); await page.mouse.down();
  await page.mouse.move(box!.x + 25, box!.y + 8, { steps: 5 }); await page.mouse.up();
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await expect(page.locator('main')).toHaveAttribute('data-shelf-focused', 'false');
  await ready(page); await focusShelf(page);
  // A canceled drag must not poison subsequent keyboard interaction.
  await button.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('dialog', { name: /Shelf interaction —/ })).toBeVisible();
});

test('M18 unavailable packaging does not prevent saving or opening photographs', async ({ page }) => {
  await page.route('**/assets/film-packaging/*', route => route.abort());
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  await add(page, 'Offline packaging');
  const button = page.getByRole('button', { name: 'Show saved roll Offline packaging' });
  await button.focus(); await page.keyboard.press('ArrowDown');
  await page.getByRole('dialog', { name: /Offline packaging —/ }).getByRole('button', { name: /Open on light table/ }).click();
  await ready(page); await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'inspect');
});


test('M18 cabinet click or tap approaches the shelf and Back restores the room pose', async ({ page }, info) => {
  await page.goto('/guest?mode=room'); await ready(page);
  await page.locator('.canvas-wrapper').focus(); await page.keyboard.press('ArrowLeft');
  const app = page.locator('main'), canvas = page.locator('canvas');
  let pose = await app.getAttribute('data-room-pose');
  const before = await canvas.getAttribute('data-camera-position');
  const cabinet = page.getByRole('button', { name: 'View film shelf', exact: true });
  const target = await cabinet.boundingBox();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2);
  await page.mouse.down(); await page.mouse.move(target!.x + target!.width / 2 + 30, target!.y + target!.height / 2, { steps: 5 }); await page.mouse.up();
  await expect(app).toHaveAttribute('data-shelf-focused', 'false');
  await expect(app).not.toHaveAttribute('data-room-pose', pose!);
  pose = await app.getAttribute('data-room-pose');
  if (info.project.name === 'desktop') await cabinet.click(); else await cabinet.tap();
  await expect(app).toHaveAttribute('data-shelf-focused', 'true'); await ready(page);
  await expect(app).toHaveAttribute('data-room-mode', 'room');
  const closePosition = (await canvas.getAttribute('data-camera-position'))!.split(',').map(Number);
  expect(closePosition[2]).toBeCloseTo(SHELF_CAMERA[2], 2);
  expect(closePosition[2]).toBeLessThan(Number(before!.split(',')[2]));
  await expect(page.getByRole('button', { name: /Show saved roll/ })).toHaveCount(1);
  await fs.mkdir(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${info.project.name}-shelf-closeup.png` });
  await page.getByRole('button', { name: '← Back to room', exact: true }).click(); await ready(page);
  await expect(app).toHaveAttribute('data-shelf-focused', 'false');
  await expect(app).toHaveAttribute('data-room-pose', pose!);
  const after = (await canvas.getAttribute('data-camera-position'))!.split(',').map(Number);
  before!.split(',').map(Number).forEach((value, i) => expect(after[i]).toBeCloseTo(value, 3));
  await cabinet.focus(); await page.keyboard.press('Enter'); await ready(page);
  await page.keyboard.press('Escape'); await ready(page);
  await expect(app).toHaveAttribute('data-shelf-focused', 'false');
});
