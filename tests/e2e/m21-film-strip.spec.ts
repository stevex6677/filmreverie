import { type Page } from '@playwright/test';
async function dismissOutside(page: Page) {
  const y = Math.round(page.viewportSize()!.height * .55);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(8, y);
  else await page.mouse.click(8, y);
}
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { ready } from './helpers/shelf';

test('film navigation changes destination and inverts the photograph and caption together', async ({ page }, info) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  const header = page.locator('.film-strip-header');
  const shelf = header.getByRole('button', { name: 'Film Shelf', exact: true });
  const camera = header.getByRole('button', { name: 'Cameras', exact: true });
  const table = header.getByRole('button', { name: 'Light Table', exact: true });
  const room = header.getByRole('button', { name: 'Room', exact: true });
  await expect(room).toHaveAttribute('aria-current', 'page');
  const exposure = shelf.locator('.film-frame-exposure');
  // App readiness precedes the header's fade-in; capture settled pixels.
  await expect(header).toHaveCSS('opacity', '1');
  await expect(exposure).toHaveCSS('filter', 'invert(1)');
  const negative = PNG.sync.read(await exposure.screenshot());
  await shelf.click(); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-shelf-id', 'film');
  await expect(page.getByRole('region', { name: 'Film shelf actions' })).toBeVisible();
  await expect(shelf).toHaveAttribute('aria-current', 'page');
  await expect(exposure).toHaveCSS('filter', 'invert(0)');
  const positive = PNG.sync.read(await exposure.screenshot());
  expect(positive.width).toBe(negative.width); expect(positive.height).toBe(negative.height);
  // Check rendered pixels in both the image and caption, not just a CSS class.
  for (const [top, bottom] of [[3, positive.height - 20], [positive.height - 16, positive.height - 3]]) {
    let error = 0, samples = 0;
    for (let y = top; y < bottom; y += 2) for (let x = 3; x < positive.width - 3; x += 2) {
      const offset = (y * positive.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) { error += Math.abs(positive.data[offset + channel] + negative.data[offset + channel] - 255); samples++; }
    }
    expect(error / samples).toBeLessThan(6);
  }
  await camera.click(); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-shelf-id', 'camera');
  await expect(page.locator('.shelf-toolbar')).toHaveCount(0);
  await expect(camera).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: info.outputPath('camera-shelf-no-toolbar.png') });
  await expect(shelf).not.toHaveAttribute('aria-current');
  await table.click(); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'inspect');
  await expect(page.locator('main')).toHaveAttribute('data-shelf-focused', 'false');
  await expect(table).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Overview navigation', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('film-menu-table.png') });
  await room.click(); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await expect(page.locator('main')).toHaveAttribute('data-shelf-focused', 'false');
  await expect(room).toHaveAttribute('aria-current', 'page');
});

test('the cartridge menu stays usable at phone, tablet and desktop widths', async ({ page }, info) => {
  await page.goto('/guest?mode=inspect&reduced_motion=true'); await ready(page);
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const header = page.locator('.film-strip-header');
    for (const name of ['Room', 'Film Shelf', 'Light Table', 'Cameras', 'Loupe', 'Settings']) {
      const button = header.getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      const bounds = (await button.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    for (const name of ['← Room', 'Adjust', 'Adjust view']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    const loupe = header.getByRole('button', { name: 'Loupe', exact: true });
    await loupe.click();
    await expect(page.locator('main')).toHaveAttribute('data-loupe-active', 'true');
    await expect(loupe).toHaveAttribute('aria-pressed', 'true');
    await loupe.click();
    await expect(page.locator('main')).toHaveAttribute('data-loupe-active', 'false');
    for (const caption of await header.locator('.film-frame-label').all()) expect(await caption.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const strip = (await header.locator('.film-strip-body').boundingBox())!;
    const label = (await header.locator('.film-frame-label').first().boundingBox())!;
    expect(label.y).toBeGreaterThan(strip.y + 16);
    expect(label.y + label.height).toBeLessThanOrEqual(strip.y + 70);
    await expect(header.getByRole('button', { name: 'More options', exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`film-menu-${width}.png`) });
  }
});

test('settings stay below the film strip and can be closed after scrolling', async ({ page }, info) => {
  await page.goto('/guest?mode=inspect&reduced_motion=true'); await ready(page);
  const header = page.locator('.film-strip-header');
  const settings = header.getByRole('button', { name: 'Settings', exact: true });
  const panel = page.getByRole('dialog', { name: 'Viewing tools', exact: true });
  for (const [width, height] of [[390, 844], [844, 390], [1024, 768], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    await settings.click(); await expect(panel).toBeVisible();
    await expect(panel.getByText('Screening', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('Inspection', { exact: true })).toHaveCount(0);
    await expect(panel.getByTestId('screen-roll-tools')).toHaveCount(0);
    await expect(panel.locator('.loupe-options')).toHaveCount(0);
    const stripBounds = (await header.boundingBox())!;
    expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(stripBounds.y + stripBounds.height);
    await expect(panel.locator('header')).toHaveCount(0);
    await expect(settings).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
    await expect(panel.locator('.film-panel-edge').first()).toHaveText('1KODAK PORTRA 400');
    expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await panel.getByRole('slider', { name: 'Light Table Brightness', exact: true }).fill('0.6');
    await expect(page.getByTestId('brightness-value')).toHaveText('60%');
    const mode = await page.locator('main').getAttribute('data-film-mode');
    await panel.getByRole('button', { name: /^Switch to (Positive|Negative)$/ }).click();
    await expect(page.locator('main')).toHaveAttribute('data-film-mode', mode === 'positive' ? 'negative' : 'positive');
    await panel.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await expect(panel).toBeVisible();
    await page.screenshot({ path: info.outputPath(`settings-scrolled-${width}.png`) });
    await dismissOutside(page); await expect(panel).toHaveCount(0);
    await expect(settings).toBeFocused();
    await expect(settings).toHaveAttribute('aria-expanded', 'false');
    await settings.click(); await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0); await expect(settings).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await settings.click(); await settings.click(); await expect(panel).toHaveCount(0);
  await settings.click();
  await header.getByRole('button', { name: 'Room', exact: true }).click(); await ready(page);
  await expect(panel).toHaveCount(0);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await settings.click();
  await panel.getByRole('slider', { name: 'Room brightness', exact: true }).fill('0.5');
  const roomStripBounds = (await header.boundingBox())!;
  expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(roomStripBounds.y + roomStripBounds.height);
  await expect(panel.locator('header')).toHaveCount(0);
  await expect(page.locator('main')).toHaveAttribute('data-room-brightness', '0.5');
  await dismissOutside(page);
  await expect(panel).toHaveCount(0); await expect(settings).toBeFocused();
});

test('room and film shelf settings expose usable room lighting above the canvas', async ({ page }, info) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  const main = page.locator('main');
  const header = page.locator('.film-strip-header');
  const settings = header.getByRole('button', { name: 'Settings', exact: true });
  const panel = page.getByRole('dialog', { name: 'Viewing tools', exact: true });
  for (const width of [390, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const destination of ['Room', 'Film Shelf']) {
      await header.getByRole('button', { name: destination, exact: true }).click(); await ready(page);
      await settings.click();
      await expect(settings).toHaveAttribute('aria-expanded', 'true');
      const brightness = panel.getByRole('slider', { name: 'Room brightness', exact: true });
      // Real pointer interaction catches a visible dialog covered by the canvas.
      await brightness.click();
      await brightness.fill('0.6');
      await expect(main).toHaveAttribute('data-room-brightness', '0.6');
      const lights = panel.getByRole('switch', { name: 'Room lights', exact: true });
      await lights.click();
      await expect(main).toHaveAttribute('data-room-brightness', '0');
      await expect(lights).toHaveAttribute('aria-checked', 'false');
      await lights.click();
      await expect(main).toHaveAttribute('data-room-brightness', '0.6');
      await expect(lights).toHaveAttribute('aria-checked', 'true');
      await page.screenshot({ path: info.outputPath(`lighting-${destination.replace(' ', '-')}-${width}.png`) });
      await settings.click(); await expect(panel).toHaveCount(0);
      await settings.click(); await dismissOutside(page);
      await expect(panel).toHaveCount(0); await expect(settings).toBeFocused();
    }
  }
});

test('Room and Light Table honor the latest selection during camera travel', async ({ page }) => {
  await page.goto('/guest?mode=room'); await ready(page);
  const nav = page.getByRole('navigation', { name: 'Explore the darkroom' });
  await nav.getByRole('button', { name: 'Light Table', exact: true }).click();
  await nav.getByRole('button', { name: 'Room', exact: true }).click();
  await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await expect(nav.getByRole('button', { name: 'Room', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: 'Light Table', exact: true }).click();
  await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'inspect');
});

test('frame chooser and loupe settings remain dismissible', async ({ page }, info) => {
  await page.goto('/guest?mode=inspect&reduced_motion=true'); await ready(page);
  await expect(page.getByRole('button', { name: /^Focus frame|^Frames$|^Fit roll$/ })).toHaveCount(0);
  await page.locator('.canvas-wrapper').focus(); await page.keyboard.press('Enter'); await ready(page);
  await page.getByRole('button', { name: 'Choose frame', exact: true }).click();
  const frames = page.getByRole('dialog', { name: 'Choose frame', exact: true });
  await dismissOutside(page);
  await expect(frames).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose frame', exact: true }).click();
  await frames.getByRole('button', { name: 'Open frame 2', exact: true }).click(); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-selected-frame', '2');
  await expect(frames).toHaveCount(0);
  await page.getByTestId('loupe-activate').click();
  await page.getByTestId('loupe-customize').click();
  const panel = page.getByRole('region', { name: 'Loupe settings', exact: true });
  await panel.getByTestId('mag-btn-8x').click();
  await expect(panel.getByTestId('mag-btn-8x')).toHaveAttribute('aria-pressed', 'true');
  await panel.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await page.getByTestId('put-away-loupe').click();
  await expect(page.locator('main')).toHaveAttribute('data-loupe-active', 'false');
  await page.getByRole('button', { name: '← Overview', exact: true }).click(); await ready(page);
  await page.locator('.film-strip-header').getByRole('button', { name: 'Room', exact: true }).click(); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await page.screenshot({ path: info.outputPath('room-after-tools.png') });
});

test('a slider drag ending outside keeps tools open, an outside tap closes without moving the scene', async ({ page }) => {
  await page.goto('/guest?mode=inspect&reduced_motion=true'); await ready(page);
  const main = page.locator('main');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Viewing tools', exact: true });
  await expect(panel).toHaveJSProperty('scrollTop', 0);
  const slider = panel.getByRole('slider', { name: 'Film strength', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(8, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
  await expect(panel).toBeVisible();
  const mode = await main.getAttribute('data-room-mode');
  const focus = await main.getAttribute('data-focus-mode');
  await dismissOutside(page);
  await expect(panel).toHaveCount(0);
  await expect(main).toHaveAttribute('data-room-mode', mode!);
  await expect(main).toHaveAttribute('data-focus-mode', focus!);
});
