import { test, expect } from '@playwright/test';
import { ready, screenPoint } from './helpers/shelf';
import { CAMERA_SHELF_ORIGIN, CAMERA_SHELF_MM, PRIMARY_CAMERA_SLOT, mm } from '../../src/data/physicalScale';

test.use({ hasTouch: true, viewport: { width: 1024, height: 768 }, actionTimeout: 15000 });
test('iPad direct camera taps survive repeated visits without compatibility clicks', async ({ page }, info) => {
  await page.goto('/?mode=room&reduced_motion=true');
  await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'true', { timeout: 60000 });
  await page.locator('.canvas-wrapper').focus();
  for (let i = 0; i < 16; i++) await page.keyboard.press('ArrowRight');
  const entry = await screenPoint(page, [CAMERA_SHELF_ORIGIN[0] - mm(CAMERA_SHELF_MM.depth), CAMERA_SHELF_ORIGIN[1] + mm(CAMERA_SHELF_MM.height / 2), CAMERA_SHELF_ORIGIN[2]]);
  await page.touchscreen.tap(entry.x, entry.y);
  await expect(page.locator('main')).toHaveAttribute('data-shelf-id', 'camera'); await ready(page);
  // Explicitly exercise browsers/gesture owners that omit the compatibility
  // click. The tap itself still uses Playwright's real touchscreen input.
  await page.evaluate(() => document.addEventListener('click', event => {
    if (event.target instanceof HTMLCanvasElement) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true));
  for (const viewport of [{width:1024,height:768},{width:768,height:1024},{width:1024,height:768}]) {
    await page.setViewportSize(viewport); await ready(page);
    await page.waitForTimeout(250); // Let the resized projection and HTML nameplate render.
    await page.screenshot({ path: `artifacts/m20-compact-camera/${info.project.name}-${viewport.width}-shelf.png` });
    const slot = PRIMARY_CAMERA_SLOT;
    const point = await screenPoint(page, [CAMERA_SHELF_ORIGIN[0] - slot.z, CAMERA_SHELF_ORIGIN[1] + slot.y + mm(110), CAMERA_SHELF_ORIGIN[2] + slot.x]);
    expect(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.tagName, point)).toBe('CANVAS');
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', {timeout:15000});
    await page.getByRole('button', {name:'Back to shelf'}).tap(); await ready(page);
  }
});
