import { expect, test } from '@playwright/test';

// The unlinked /showreel page: loads the darkroom with both sample rolls,
// plays its timeline, and is not part of the app or its offline download.
test('showreel loads, plays and renders through the screening engine', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/showreel?paused=1&t=29.6');
  const root = page.locator('.showreel');
  await expect(root).toHaveAttribute('data-showreel-ready', 'true', { timeout: 200000 });
  await expect(page).toHaveTitle('Film Reverie — Showreel');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('#darkroom-loader')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();

  // A held moment renders the loupe shot, then playback advances the timeline.
  await expect.poll(() => page.evaluate(() => (window as any).__showreel.sample.shot)).toBe('loupe');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => Number(await root.getAttribute('data-showreel-time')), { timeout: 30000 }).toBeGreaterThan(30.2);

  // Exact frames through the export engine include the overlay.
  const frame = await page.evaluate(async () => {
    const session = (window as any).__showreel;
    session.pause(); session.setExporting(true);
    await session.engine.begin(640, 360);
    await session.engine.prepare(6.5, new AbortController().signal);
    const canvas: HTMLCanvasElement = session.engine.render(6.5);
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    session.engine.end(); session.setExporting(false);
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 120) lit++;
    return { width: canvas.width, height: canvas.height, lit: lit / (pixels.length / 4) };
  });
  expect(frame).toMatchObject({ width: 640, height: 360 });
  expect(frame.lit).toBeGreaterThan(.05);

  // The New roll editor is drawn into exported frames: its light dialog fills the right of the frame.
  const editor = await page.evaluate(async () => {
    const session = (window as any).__showreel;
    const shot = session.timeline.shots.find((item: any) => item.name === 'new-roll');
    session.setExporting(true);
    await session.engine.begin(640, 360);
    const time = shot.start + 3.6;
    await session.engine.prepare(time, new AbortController().signal);
    const canvas: HTMLCanvasElement = session.engine.render(time);
    const pixels = canvas.getContext('2d')!.getImageData(400, 60, 160, 40).data;
    session.engine.end(); session.setExporting(false);
    let paper = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 200 && pixels[i + 1] > 195 && pixels[i + 2] > 185) paper++;
    return paper / (pixels.length / 4);
  });
  expect(editor).toBeGreaterThan(.6);
  expect(errors).toEqual([]);

  // Offline preparation leaves the showreel photographs to the network.
  const worker = await (await request.get('/sw.js')).text();
  expect(worker).not.toContain('/assets/photos/showreel/');
});

// First visit: settings come first, apply to the frame, and Preview plays.
test('showreel opens on its settings, then previews and offers export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/showreel');
  const panel = page.getByRole('complementary', { name: 'Showreel' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('radio', { name: /Families/ })).toBeChecked();
  const preview = panel.getByRole('button', { name: 'Preview' });
  await expect(preview).toBeEnabled({ timeout: 200000 });

  await panel.getByLabel('Film grain').fill('0.9');
  await panel.getByRole('radio', { name: /No music/ }).check();
  expect(await page.evaluate(() => (window as any).__showreel.settings)).toMatchObject({ grain: .9, music: 'none' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('film-reverie-showreel-settings')!))).toMatchObject({ grain: .9, music: 'none' });

  await preview.click();
  await expect(panel).toBeHidden();
  await expect.poll(async () => Number(await page.locator('.showreel').getAttribute('data-showreel-time')), { timeout: 20000 }).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export video' });
  await expect(dialog.getByRole('radio', { name: /1080p/ })).toBeChecked();
  await dialog.getByRole('radio', { name: /720p/ }).check();
  await expect(dialog).toContainText('silent');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(panel).toBeVisible();
  expect(errors).toEqual([]);
});
