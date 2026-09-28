import { loupeGeometry, LOUPE_SIZES, LOUPE_SIZE_LABEL, LOUPE_SIZE_SCALE } from '../../src/utils/loupeView';
import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { captureCanvas, openLoupeSettings, closeLoupeSettings, openViewingTools, closeViewingTools } from './helpers/viewing';
import { getRegionMeanDifference, getRegionStats } from './helpers/pixelAnalysis';

const ready = async (page: Page) => {
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready', 'true', { timeout: 60000 });
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning', 'false', { timeout: 30000 });
};
const display = async (page: Page) => (await page.locator('canvas').getAttribute('data-loupe-display'))!.split(',').map(Number);
const sample = async (page: Page) => (await page.locator('canvas').getAttribute('data-loupe-sample'))!.split(',').map(Number);
const open = async (page: Page) => {
  await page.goto('/guest?mode=inspect&deterministic=true'); await ready(page);
  await page.locator('.canvas-wrapper').focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Choose frame', exact: true }).click();
  await page.getByRole('button', { name: 'Open frame 3', exact: true }).click(); await ready(page);
  await page.getByTestId('loupe-activate').click();
  await page.getByTestId('loupe-customize').click();
};

test('glass and all three sizes preview in place, preserve zoom, and survive reload', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /shader|WebGL/i.test(message.text())) errors.push(message.text()); });
  await open(page);
  const main = page.locator('main'), canvas = page.locator('canvas');
  const settings = page.getByRole('region', { name: 'Loupe settings' });
  await expect(settings.getByRole('group', { name: 'Lens size', exact: true })).toBeVisible();
  await expect(settings.getByRole('group', { name: 'Loupe magnification', exact: true })).toBeVisible();
  await expect(page.getByTestId('loupe-customize')).not.toHaveAttribute('aria-haspopup');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const point = await sample(page), zoom = await main.getAttribute('data-inspect-zoom');
  await page.getByRole('radio', { name: 'Glass dome' }).check();
  await expect(canvas).toHaveAttribute('data-loupe-type', 'glass');
  const baseScale = Number(await canvas.getAttribute('data-loupe-scale')) / LOUPE_SIZE_SCALE.medium;
  let previous = 0;
  for (const size of LOUPE_SIZES) {
    await page.getByRole('radio', { name: LOUPE_SIZE_LABEL[size], exact: true }).check();
    await expect(main).toHaveAttribute('data-loupe-size', size);
    // State updates before the next WebGL frame. Wait for the selected scale
    // to render before comparing its apparent radius with the previous size.
    await expect.poll(async () => Number(await canvas.getAttribute('data-loupe-scale'))).toBeCloseTo(baseScale * LOUPE_SIZE_SCALE[size], 8);
    await expect.poll(async () => (await display(page))[2]).toBeGreaterThan(previous);
    previous = (await display(page))[2];
    expect(await sample(page)).toEqual(point);
    expect(await main.getAttribute('data-inspect-zoom')).toBe(zoom);
    await expect(canvas).toHaveAttribute('data-loupe-magnification', '4');
  }
  await page.screenshot({ path: info.outputPath('glass-picker.png') });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('loupe-customize')).toBeFocused();
  await openLoupeSettings(page);
  await page.getByTestId('mag-btn-8x').click();
  await closeLoupeSettings(page);
  await page.reload(); await ready(page);
  await expect(main).toHaveAttribute('data-loupe-type', 'glass');
  await expect(main).toHaveAttribute('data-loupe-size', 'large');
  await page.getByTestId('loupe-activate').click();
  await openLoupeSettings(page);
  await expect(page.getByTestId('mag-btn-8x')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('radio', { name: 'Classic' }).check();
  await expect(canvas).toHaveAttribute('data-loupe-type', 'classic');
  await expect(page.getByRole('radio', { name: 'Large', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Loupe settings' })).toBeHidden();
  await expect(main).toHaveAttribute('data-loupe-state', 'activated');
  expect(errors).toEqual([]);
});

test('glass optics render photographs, drag and inspect at every size, then restore table framing', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await page.getByRole('radio', { name: 'Glass dome' }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const originalZoom = await page.locator('main').getAttribute('data-inspect-zoom');
  const before = await sample(page), [x, y] = await display(page);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y - 12, { steps: 8 }); await page.mouse.up();
  // Wait for the complete requested drag to reach the renderer, including
  // the final pointer event, before asserting that later controls preserve it.
  const scale = Number(await page.locator('canvas').getAttribute('data-loupe-scale'));
  const wpp = 2 * (Number(originalZoom) - .008 - loupeGeometry('glass').lensHeight * scale) * Math.tan(Math.PI / 8) / 800;
  await expect.poll(async () => { const p = await sample(page); return Math.hypot(p[0] - before[0] - 30*wpp, p[1] - before[1] - 12*wpp); }).toBeLessThan(.000001);
  const moved = await sample(page);
  expect(Math.hypot(moved[0] - before[0], moved[1] - before[1])).toBeGreaterThan(.001);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state', 'activated');
  const [cx, cy] = await display(page); await page.mouse.click(cx, cy); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state', 'inspection');
  const on = PNG.sync.read(await captureCanvas(page));
  expect(getRegionStats(on, 640, 400, 120).stdDev).toBeGreaterThan(3);
  await page.screenshot({ path: info.outputPath('glass-inspection.png') });
  await openLoupeSettings(page);
  await page.getByTestId('loupe-effects').click();
  await closeLoupeSettings(page);
  const off = PNG.sync.read(await captureCanvas(page));
  expect(getRegionMeanDifference(on, off, 640, 400, 600)).toBeGreaterThan(.2);
  await openLoupeSettings(page);
  await page.getByTestId('mag-btn-8x').click();
  await closeLoupeSettings(page);
  expect(getRegionMeanDifference(off, PNG.sync.read(await captureCanvas(page)), 640, 400, 140)).toBeGreaterThan(2);
  for (const size of ['Small', 'Medium', 'Large']) {
    await page.getByTestId('loupe-customize').click();
    await page.getByRole('radio', { name: size, exact: true }).check();
    await page.getByRole('button', { name: 'Done', exact: true }).click(); await ready(page);
    expect(await sample(page)).toEqual(moved);
    expect((await display(page))[2]).toBeGreaterThan(300);
    await expect(page.locator('main')).toHaveAttribute('data-loupe-state', 'inspection');
  }
  await page.getByTestId('inspect-loupe').click(); await ready(page);
  expect(await page.locator('main').getAttribute('data-inspect-zoom')).toBe(originalZoom);
  expect(await sample(page)).toEqual(moved);
});

test('picker is keyboard accessible and fits phone, tablet and short landscape screens', async ({ page }, info) => {
  await open(page);
  await page.getByRole('radio', { name: 'Classic' }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Glass dome' })).toBeChecked();
  await page.getByRole('radio', { name: 'Medium', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Large', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('loupe-customize')).toBeFocused();
  for (const [width, height] of [[375, 667], [390, 844], [820, 1180], [844, 390]]) {
    await page.setViewportSize({ width, height }); await ready(page);
    await page.getByTestId('loupe-customize').click();
    const panel = page.getByRole('region', { name: 'Loupe settings' });
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
    await page.getByRole('radio', { name: 'Small', exact: true }).check();
    await page.screenshot({ path: info.outputPath(`picker-${width}x${height}.png`) });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    for (const button of await page.locator('.loupe-controls button').all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1); expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.getByTestId('loupe-customize').click();
  const before = await sample(page);
  await page.mouse.click(8, 200);
  await expect(page.getByRole('region', { name: 'Loupe settings' })).toBeVisible();
  expect(await sample(page)).toEqual(before);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state', 'activated');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Loupe settings' })).toBeHidden();
});

test('loupe moves with settings open using mouse, touch and focused-canvas keys', async ({ page, isMobile, browserName }, info) => {
  test.skip(isMobile && browserName !== 'chromium', 'Native touch contacts use the Chromium protocol.');
  await open(page);
  const settings = page.getByRole('region', { name: 'Loupe settings' });
  const canvas = page.locator('canvas'), main = page.locator('main');
  const cdp = isMobile ? await page.context().newCDPSession(page) : null;
  const exposedPoint = async () => {
    const [x, y, radius] = await display(page);
    const dock = (await page.getByRole('navigation', { name: 'Loupe controls' }).boundingBox())!;
    return { x, y: Math.min(y - radius * .3, dock.y - 24) };
  };
  const drag = async () => {
    const before = await sample(page), point = await exposedPoint();
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, point)).toBe('CANVAS');
    if (cdp) {
      const contact = { id: 1, ...point, radiusX: 3, radiusY: 3, force: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contact] });
      expect(await sample(page)).toEqual(before);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...contact, x: point.x + 28, y: point.y - 16 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(point.x, point.y); await page.mouse.down();
      expect(await sample(page)).toEqual(before);
      await page.mouse.move(point.x + 28, point.y - 16, { steps: 8 }); await page.mouse.up();
    }
    await expect.poll(async () => Math.hypot(...(await sample(page)).map((value, i) => value - before[i]))).toBeGreaterThan(.0001);
    await expect(settings).toBeVisible();
    await expect(page.getByTestId('loupe-customize')).toHaveAttribute('aria-expanded', 'true');
  };
  for (const [label, type] of [['Classic', 'classic'], ['Glass dome', 'glass']]) {
    await page.getByRole('radio', { name: label }).check();
    await expect(canvas).toHaveAttribute('data-loupe-type', type);
    await drag();
    await expect(main).toHaveAttribute('data-loupe-state', 'activated');
  }
  const moved = await sample(page);
  await page.getByTestId('mag-btn-2x').click();
  await expect(canvas).toHaveAttribute('data-loupe-magnification', '2');
  expect(await sample(page)).toEqual(moved);
  // Enter inspection through the exposed lens while keeping its settings open.
  const point = await exposedPoint();
  if (isMobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(main).toHaveAttribute('data-loupe-state', 'inspection'); await ready(page);
  await drag();
  await expect(main).toHaveAttribute('data-loupe-state', 'inspection');
  const beforeKey = await sample(page);
  await page.locator('.canvas-wrapper').focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await sample(page))[0]).toBeGreaterThan(beforeKey[0]);
  await expect(settings).toBeVisible();
  await page.screenshot({ path: info.outputPath('drag-with-settings.png') });
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(main).toHaveAttribute('data-loupe-state', 'inspection');
  await expect(page.getByTestId('loupe-customize')).toBeFocused();
});

test('touch can grab a glass edge at each size without jumping or opening inspection', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native touch contacts use the Chromium protocol.');
  await page.setViewportSize({ width: 820, height: 1180 });
  await open(page);
  await page.getByRole('radio', { name: 'Glass dome' }).check();
  const cdp = await page.context().newCDPSession(page);
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-loupe-type', 'glass');
  const baseScale = Number(await canvas.getAttribute('data-loupe-scale')) / LOUPE_SIZE_SCALE.medium;
  for (const size of LOUPE_SIZES) {
    await page.getByRole('radio', { name: LOUPE_SIZE_LABEL[size], exact: true }).check();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('main')).toHaveAttribute('data-loupe-size', size);
    await expect.poll(async () => Number(await canvas.getAttribute('data-loupe-scale'))).toBeCloseTo(baseScale * LOUPE_SIZE_SCALE[size], 8);
    const [x, y, radius] = await display(page), before = await sample(page);
    // The larger dome can extend beyond a portrait screen's sides at frame
    // zoom. Grab the visible upper rim so the native touch stays on screen.
    const contact = { id: 1, x, y: y - radius * .55, radiusX: 3, radiusY: 3, force: 1 };
    expect(contact.x).toBeGreaterThan(0); expect(contact.x + 24).toBeLessThan(820);
    expect(contact.y).toBeGreaterThan(60); expect(contact.y + 16).toBeLessThan(1180);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contact] });
    expect(await sample(page)).toEqual(before);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...contact, x: contact.x + 24, y: contact.y + 16 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => Math.hypot(...(await sample(page)).map((value, i) => value - before[i]))).toBeGreaterThan(.001);
    await expect(page.locator('main')).toHaveAttribute('data-loupe-state', 'activated');
    await page.getByTestId('loupe-customize').click();
  }
});

test.describe('clear glass transmission', () => {
  test.use({ serviceWorkers: 'block' });
  test('a uniform photograph stays clear at the former reflection spots and curved edge', async ({ page }, info) => {
    const flat = new PNG({ width: 96, height: 64 });
    for (let i = 0; i < flat.data.length; i += 4) {
      flat.data[i] = 45; flat.data[i + 1] = 58; flat.data[i + 2] = 64; flat.data[i + 3] = 255;
    }
    await page.route('**/assets/photos/**', route => route.fulfill({ contentType: 'image/png', body: PNG.sync.write(flat) }));
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    await closeLoupeSettings(page);
    await openViewingTools(page);
    await page.getByTestId('film-strength-slider').fill('0');
    await closeViewingTools(page);
    await openLoupeSettings(page);
    await page.getByRole('radio', { name: 'Glass dome' }).check();
    await page.getByTestId('mag-btn-8x').click();
    await closeLoupeSettings(page);
    await page.getByTestId('inspect-loupe').click(); await ready(page);
    const effects = PNG.sync.read(await captureCanvas(page, { path: info.outputPath('clear-effects-on.png') }));
    await openLoupeSettings(page);
    await page.getByTestId('loupe-effects').click();
    await closeLoupeSettings(page);
    const clear = PNG.sync.read(await captureCanvas(page, { path: info.outputPath('clear-effects-off.png') }));
    // Uniform transmitted color must not acquire painted light sources or a
    // pale veil when refraction is enabled. Film grain is disabled above so
    // moving the sample UV cannot change the source photograph's color.
    expect(getRegionStats(clear, 640, 400, 100).stdDev).toBeLessThan(1);
    for (const [x, y, size] of [[500, 260, 30], [870, 475, 20], [940, 400, 12]]) {
      expect(getRegionMeanDifference(effects, clear, x, y, size)).toBeLessThan(2);
    }
    await page.screenshot({ path: info.outputPath('clear-transmission.png') });
  });
});
