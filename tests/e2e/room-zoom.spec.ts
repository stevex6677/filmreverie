import { test, expect } from '@playwright/test';
import { focusShelf, ready } from './helpers/shelf';

test('room mode zooms the standing eye\'s lens with the wheel and keyboard', async ({ page }) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  const app = page.locator('main'), canvas = page.locator('canvas');
  const fov = async () => Number(await canvas.getAttribute('data-camera-fov'));
  const zoom = async () => Number(await app.getAttribute('data-room-zoom'));
  const position = await canvas.getAttribute('data-camera-position');
  const standing = await fov();
  expect(await zoom()).toBe(1);

  const rect = (await canvas.boundingBox())!;
  // Over the cabinet's hit overlay as well as the bare canvas.
  const [ox, oy] = [rect.x + rect.width * .7, rect.y + rect.height * .4];
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.shelf-approach-target, .camera-shelf-target'), [ox, oy])).toBe(true);
  await page.mouse.move(ox, oy);
  await page.mouse.wheel(0, -120);
  await page.mouse.move(rect.x + rect.width * .85, rect.y + rect.height * .2);
  await page.mouse.wheel(0, -120);
  await expect.poll(zoom).toBeGreaterThan(1.5);
  await expect.poll(fov).toBeLessThan(standing * .75);
  // Zooming turns the lens toward the pointer; the eye never moves.
  await expect(canvas).toHaveAttribute('data-camera-position', position!);
  expect((await app.getAttribute('data-room-pose'))!.split(',').map(Number)[0]).toBeLessThan(0);

  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 120);
  await expect.poll(zoom).toBeLessThan(1);
  await expect.poll(fov).toBeGreaterThan(standing);

  await page.locator('.canvas-wrapper').focus();
  await page.keyboard.press('0');
  await expect.poll(zoom).toBe(1);
  await page.keyboard.press('=');
  await expect.poll(zoom).toBeCloseTo(1.25);
  await page.keyboard.press('-');
  await expect.poll(zoom).toBeCloseTo(1);
});

test('film shelf compartments carry no slot numbers', async ({ page }) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  await focusShelf(page);
  await expect(page.locator('.shelf-cell-label').first()).toBeAttached();
  await expect(page.locator('.shelf-slot-number')).toHaveCount(0);
  await expect(page.locator('.shelf-cell-label', { hasText: /^\d{2}$/ })).toHaveCount(0);
});
