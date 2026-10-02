import { PNG } from 'pngjs';
import { captureCanvas } from './helpers/viewing';
import { getRegionMeanDifference } from './helpers/pixelAnalysis';
import { test, expect } from '@playwright/test';
import { ROLL_FRAMES } from '../../src/data/rollManifest';
import { FILM_PACKAGING } from '../../src/data/filmPackaging';
import { ready, focusShelf, shelfAction, showRoll } from './helpers/shelf';

test('new stocks enforce formats, render filters and retain all four packages after reload', async ({ page, request }, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/guest?mode=room&deterministic=true&reduced_motion=true'); await ready(page); await focusShelf(page);
  const image = await (await request.get(ROLL_FRAMES[0].src)).body();
  for (const [stock, format] of [['fuji-200','135'], ['pro-image-100','135'], ['gold-200','135'], ['gold-200','67']] as const) {
    await shelfAction(page, 'New roll');
    const editor = page.getByRole('dialog', { name: 'Review roll', exact: true });
    await editor.getByLabel('Choose photographs').setInputFiles({ name: `${stock}.jpg`, mimeType: 'image/jpeg', buffer: image });
    const name = `${stock} ${format}`;
    await editor.getByLabel('Roll name', { exact: true }).fill(name);
    await editor.getByLabel('Film stock', { exact: true }).selectOption(stock);
    const medium = editor.getByRole('radio', { name: '120', exact: true });
    if (stock !== 'gold-200') await expect(medium).toBeDisabled();
    else await expect(medium).toBeEnabled();
    if (format !== '135') {
      await medium.check();
      await editor.getByLabel('Film format', { exact: true }).selectOption(format);
      for (const id of ['fuji-200', 'pro-image-100']) await expect(editor.locator(`option[value="${id}"]`)).toHaveJSProperty('disabled', true);
    }
    await page.screenshot({ path: info.outputPath(`${name}-filter-preview.png`) });
    await editor.getByRole('button', { name: 'Save and open', exact: true }).click();
    await expect(editor).not.toBeVisible({ timeout: 60000 }); await ready(page);
    await expect(page.locator('main')).toHaveAttribute('data-film-stock', stock);
    await expect(page.locator('main')).toHaveAttribute('data-film-format', format);
    await expect(page.locator('main')).toHaveAttribute('data-film-strength', '50');
    await page.screenshot({ path: info.outputPath(`${name}-table.png`) });
    const samples: PNG[] = [];
    for (const strength of [0, 100, 0]) {
      await page.evaluate(value => (window as unknown as { __setFilmStrength: (n: number) => void }).__setFilmStrength(value), strength);
      await expect(page.locator('main')).toHaveAttribute('data-film-strength', String(strength));
      samples.push(PNG.sync.read(await captureCanvas(page, { path: info.outputPath(`${name}-strength-${strength}.png`) })));
    }
    const [zero, strong, restored] = samples, x = Math.floor(zero.width / 2), y = Math.floor(zero.height / 2);
    expect(getRegionMeanDifference(zero, strong, x, y, 100), `${name} has a visible filter`).toBeGreaterThan(.1);
    expect(getRegionMeanDifference(zero, restored, x, y, 100), `${name} restores the original at zero`).toBeLessThan(.3);
    await page.evaluate(() => (window as unknown as { __setFilmStrength: (n: number) => void }).__setFilmStrength(50));
    await focusShelf(page);
  }
  await page.reload(); await ready(page); await focusShelf(page);
  const textureCount = new Set(FILM_PACKAGING.flatMap(entry => [entry.singleRollArtwork ?? entry.box.asset, ...(entry.cartridge ? [entry.cartridge.asset] : [])])).size;
  await expect(page.locator('canvas')).toHaveAttribute('data-packaging-loaded', String(textureCount));
  for (const id of ['fuji-200-135','pro-image-100-135','gold-200-135','gold-200-120']) await expect(page.locator(`[data-packaging="${id}"][data-owned="true"]`)).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('four-new-packages.png') });
  // Editing a saved medium-format roll cannot silently change its gate or select a 35mm-only stock.
  const card = await showRoll(page, 'gold-200 67');
  await card.getByRole('button', { name: 'Edit gold-200 67', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Review roll', exact: true });
  for (const id of ['fuji-200', 'pro-image-100']) await expect(editor.locator(`option[value="${id}"]`)).toHaveJSProperty('disabled', true);
  await editor.getByRole('radio', { name: '35mm', exact: true }).check();
  await editor.getByLabel('Film stock', { exact: true }).selectOption('fuji-200');
  await expect(editor.getByRole('radio', { name: '120', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Cancel edits', exact: true }).click();
  expect(errors).toEqual([]);
});
