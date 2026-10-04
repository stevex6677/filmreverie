import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
import { shelfAction, ready } from './helpers/shelf';
import { closeViewingTools, openFrame, openViewingTools } from './helpers/viewing';
import { BASELINE_ROLL } from '../../src/utils/rollLayout';
import { createScreeningTimeline } from '../../src/screening/reels';
import type { ReelId } from '../../src/screening/timeline';

// A photograph shot with the camera held vertically lies across the film, but
// is seen upright: Focus and the table reels turn the camera, prints turn the
// image on upright paper. The photograph is red above, blue below.
const scene = (page: Page) => page.locator('.canvas-wrapper canvas');
async function capture(page: Page, path: string) {
  const encoded = await scene(page).evaluate(async (node: HTMLCanvasElement) => {
    const started = performance.now();
    await new Promise<void>(resolve => { let frames = 0; const step = (now: number) => { if (++frames >= 2 && now - started >= 500) resolve(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
    return node.toDataURL('image/png').split(',')[1];
  });
  const buffer = Buffer.from(encoded, 'base64');
  await fs.writeFile(test.info().outputPath(path), buffer);
  return PNG.sync.read(buffer);
}
function mean(image: PNG, fx: number, fy: number) {
  const cx = Math.round(image.width * fx), cy = Math.round(image.height * fy), r = Math.round(image.height * .03);
  const sum = [0, 0, 0]; let n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { const i = (y * image.width + x) * 4; for (let c = 0; c < 3; c++) sum[c] += image.data[i + c]; n++; }
  return sum.map(v => v / n);
}
function expectUpright(image: PNG, label: string, reach = .15) {
  const [top, bottom] = [mean(image, .5, .5 - reach), mean(image, .5, .5 + reach)];
  expect(top[0] - top[2], `${label}: red above ${top}`).toBeGreaterThan(30);
  expect(bottom[2] - bottom[0], `${label}: blue below ${bottom}`).toBeGreaterThan(30);
}
const player = (page: Page) => page.getByTestId('screening-player');

test('a vertical shot stands upright in Focus, the reels and on its print', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'Import and screening layout are covered on desktop.');
  test.setTimeout(240000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/guest?mode=inspect&deterministic=true'); await ready(page);
  await page.getByRole('button', { name: 'Film Shelf', exact: true }).click();
  await shelfAction(page, 'New roll');
  const png = new PNG({ width: 600, height: 900 });
  for (let y = 0; y < 900; y++) for (let x = 0; x < 600; x++) png.data.set(y < 450 ? [225, 30, 30, 255] : [30, 30, 225, 255], (y * 600 + x) * 4);
  await page.getByLabel('Choose photographs').setInputFiles([{ name: 'vertical.png', mimeType: 'image/png', buffer: PNG.sync.write(png) }]);
  await page.getByLabel('Roll name', { exact: true }).fill('Vertical');
  // Placed automatically across the 35 mm gate.
  await expect(page.getByRole('button', { name: 'Vertically', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save and open', exact: true }).click();
  await ready(page);
  await openViewingTools(page);
  await expect(page.getByTestId('mode-badge')).toBeVisible();
  if (await page.getByRole('button', { name: 'Switch to Positive', exact: true }).isVisible()) await page.getByRole('button', { name: 'Switch to Positive', exact: true }).click();
  await expect(page.getByTestId('mode-badge')).toHaveText(/POSITIVE/);
  await closeViewingTools(page);

  await openFrame(page, 1);
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning', 'false');
  await page.waitForTimeout(700);
  expectUpright(await capture(page, 'focus.png'), 'Focus', .2);
  await page.getByRole('button', { name: '← Overview', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning', 'false');

  const roll = { ...BASELINE_ROLL, frames: [{ ...BASELINE_ROLL.frames[0], rotation: 90 }] };
  for (const [name, reel, reach] of [['Documentary', 'documentary', .2], ['Projector', 'projector', .2], ['Darkroom Prints', 'darkroom-prints', .12]] as const) {
    // The middle of the photograph's hold; durations do not depend on the aspect.
    const timeline = createScreeningTimeline(roll, { reel: reel as ReelId, pace: 'relaxed', aspect: 16 / 9, stockType: 'negative' });
    const hold = timeline.segments.find(s => s.kind === 'frame')!, middle = hold.start + hold.duration / 2;
    await page.getByTestId('screen-roll').click();
    const picker = page.getByRole('dialog', { name: 'Screen roll' });
    await picker.locator('label.screening-choice').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).getByRole('radio').check();
    await picker.getByRole('radio', { name: 'Relaxed', exact: true }).check();
    await picker.getByTestId('screening-preview').click();
    await expect(page.locator('main')).toHaveAttribute('data-screening-reel', reel);
    await expect.poll(async () => Number(await player(page).getAttribute('data-time')), { timeout: 60000, intervals: [50] }).toBeGreaterThan(middle - .3);
    await page.getByTestId('screening-toggle').click();
    const paused = Number(await player(page).getAttribute('data-time'));
    expect(paused, name).toBeLessThan(hold.start + hold.duration);
    expectUpright(await capture(page, `${reel}.png`), name, reach);
    await page.getByTestId('screening-exit').click();
    await expect(page.locator('main')).not.toHaveAttribute('data-screening-reel', reel);
  }
  expect(errors).toEqual([]);
});
