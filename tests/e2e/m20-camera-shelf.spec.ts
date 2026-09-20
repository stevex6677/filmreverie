import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { PRIMARY_CAMERA } from '../../src/data/cameras';
import { CAMERA_SHELF_ORIGIN, PRIMARY_CAMERA_SLOT, CAMERA_SHELF_MM, mm } from '../../src/data/physicalScale';
import { ready, screenPoint } from './helpers/shelf';
import { offlineServer } from './helpers/offlineServer';
test.use({ actionTimeout: 15000 });

async function cameraShelf(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Cameras', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-shelf-id', 'camera'); await ready(page);
  await expect(page.locator('.canvas-wrapper canvas')).toHaveAttribute('data-camera-model-width', '0.756', { timeout: 90000 });
}
async function display(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Inspect Mamiya Universal', exact: true }).click();
  await expect(page.locator('.camera-display')).toBeVisible();
  await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', { timeout: 90000 });
}

test('physical shelf, all rendered sides, orbit, zoom, reset, history and preserved room pose', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?mode=room&reduced_motion=true'); await ready(page);
  const app = page.locator('main'), pose = await app.getAttribute('data-room-pose');
  await cameraShelf(page);
  const [x, y, z] = CAMERA_SHELF_ORIGIN;
  const topLeft = await screenPoint(page, [x - mm(CAMERA_SHELF_MM.depth), y + mm(CAMERA_SHELF_MM.height), z - mm(CAMERA_SHELF_MM.width / 2)]);
  const bottomRight = await screenPoint(page, [x - mm(CAMERA_SHELF_MM.depth), y, z + mm(CAMERA_SHELF_MM.width / 2)]);
  const area = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const header = document.querySelector('.controls-header, .mobile-header')!.getBoundingClientRect();
    const toolbar = document.querySelector('.camera-collection-toolbar')!.getBoundingClientRect();
    return { left: canvas.left, right: canvas.right, top: Math.max(canvas.top, header.bottom), bottom: Math.min(canvas.bottom, toolbar.top) };
  });
  expect(topLeft.x).toBeGreaterThan(area.left); expect(bottomRight.x).toBeLessThan(area.right);
  expect(topLeft.y).toBeGreaterThan(area.top); expect(bottomRight.y).toBeLessThan(area.bottom);
  expect(Math.max((bottomRight.x - topLeft.x) / (area.right - area.left),
    (bottomRight.y - topLeft.y) / (area.bottom - area.top))).toBeGreaterThan(.8);
  await mkdir('artifacts/m20-candidates', { recursive: true });
  await page.screenshot({ path: `artifacts/m20-candidates/${info.project.name}-shelf.png` });
  await display(page);
  const canvas = page.locator('.camera-stage canvas');
  await expect(canvas).toHaveAttribute('data-model-width', '0.756');
  const renders = new Set<string>();
  for (const side of ['Front', 'Rear', 'Left', 'Right', 'Top', 'Bottom']) {
    await page.getByRole('button', { name: side, exact: true }).click();
    await expect(page.locator('.camera-display')).toHaveAttribute('data-preset', side.toLowerCase());
    await page.waitForTimeout(250);
    renders.add((await canvas.screenshot({ path: `artifacts/m20-candidates/${info.project.name}-${side.toLowerCase()}.png` })).toString('base64'));
  }
  expect(renders.size).toBe(6);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const home = await canvas.getAttribute('data-view-position');
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * .45, rect.y + rect.height * .5); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .65, rect.y + rect.height * .6, { steps: 8 }); await page.mouse.up();
  await expect(canvas).not.toHaveAttribute('data-view-position', home!);
  await expect(app).toHaveAttribute('data-shelf-id', 'camera');
  const distance = async () => (await canvas.getAttribute('data-view-position'))!.split(',').map(Number).reduce((sum, n) => sum + n * n, 0);
  const before = await distance();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(distance).toBeLessThan(before);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.screenshot({ path: `artifacts/m20-candidates/${info.project.name}-display.png` });
  await page.locator('.camera-stage').focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.camera-display')).toHaveAttribute('data-preset', 'free');
  if (await page.locator('.camera-info-toggle').isVisible()) {
    await page.locator('.camera-info-toggle').click();
    await expect(page.getByText('Manufactured', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('.camera-information')).not.toBeVisible();
  }
  await page.goBack(); await expect(page.locator('.camera-display')).toHaveCount(0);
  await page.goForward(); await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true');
  await page.getByRole('button', { name: 'Back to shelf' }).click();
  await expect(page.getByRole('button', { name: 'Inspect Mamiya Universal' })).toBeFocused();
  await page.getByRole('button', { name: 'Back to room' }).click(); await ready(page);
  await expect(app).toHaveAttribute('data-room-pose', pose!);
  expect(errors).toEqual([]);
});

test('physical camera opens only from shelf; shelf drag exits without opening', async ({ page }) => {
  await page.goto('/?mode=room&reduced_motion=true'); await ready(page);
  // A toolbar approach also works when the object is outside the initial view.
  await cameraShelf(page);
  const slot = PRIMARY_CAMERA_SLOT;
  const point = await screenPoint(page, [CAMERA_SHELF_ORIGIN[0] - slot.z, CAMERA_SHELF_ORIGIN[1] + slot.y + mm(98), CAMERA_SHELF_ORIGIN[2] + slot.x]);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', { timeout: 90000 });
  await page.getByRole('button', { name: 'Back to shelf' }).click();
  const target = await page.getByRole('button', { name: 'Inspect Mamiya Universal' }).boundingBox();
  await page.mouse.move(target!.x + 25, target!.y + 20); await page.mouse.down(); await page.mouse.move(target!.x + 75, target!.y + 30, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('main')).toHaveAttribute('data-shelf-focused', 'false');
  await expect(page.locator('.camera-display')).toHaveCount(0);
});

test('model failure can retry and prepared camera reopens with the server stopped', async ({ page }) => {
  const server = await offlineServer();
  try {
    server.fail(PRIMARY_CAMERA.url);
    await page.goto(`${server.url}/?mode=room&reduced_motion=true`); await ready(page);
    await page.getByRole('button', { name: 'Cameras', exact: true }).click(); await ready(page);
    await page.getByRole('button', { name: 'Inspect Mamiya Universal' }).click();
    await expect(page.locator('.camera-display [role="alert"]')).toBeVisible({ timeout: 90000 });
    server.fail('');
    await page.getByRole('button', { name: 'Retry model', exact: true }).click();
    await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', { timeout: 90000 });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 90000 });
    // Normal UI prepares the optional model explicitly, independent of film readiness.
    await page.getByRole('button', { name: 'Back to shelf' }).click();
    await page.getByRole('button', { name: 'Film shelf', exact: true }).click(); await ready(page);
    await page.getByRole('button', { name: 'Backups & offline' }).click();
    await page.getByText('Offline & storage', { exact: true }).click();
    const download = page.getByRole('button', { name: 'Download camera for offline use' });
    if (await download.isVisible()) await download.click();
    await expect(page.getByText('Camera model: downloaded for offline inspection', { exact: false })).toBeVisible({ timeout: 90000 });
    await server.stop();
    await page.reload(); await ready(page); await cameraShelf(page); await display(page);
    await page.getByRole('button', { name: 'Bottom', exact: true }).click();
    await expect(page.locator('.camera-display')).toHaveAttribute('data-preset', 'bottom');
  } finally { await server.stop(); }
});

test('physical room entry and reversible camera shelf flights', async ({ page }, info) => {
  await page.goto('/?mode=room'); await ready(page);
  await expect(page.getByText('Explore the collection', { exact: true })).toHaveCount(0);
  await expect(page.locator('.camera-shelf-target')).toHaveCount(0);
  await page.locator('.canvas-wrapper').focus();
  for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `artifacts/m20-wall-mount/${info.project.name}-room.png` });
  const point = await screenPoint(page, [CAMERA_SHELF_ORIGIN[0] - mm(CAMERA_SHELF_MM.depth), CAMERA_SHELF_ORIGIN[1] + mm(CAMERA_SHELF_MM.height / 2), CAMERA_SHELF_ORIGIN[2]]);
  if (info.project.use.hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await expect(page.locator('main')).toHaveAttribute('data-shelf-id', 'camera');
  await expect(page.locator('.camera-display')).toHaveCount(0); await ready(page);
  await page.getByRole('button', { name: 'Back to room' }).click(); await ready(page);
  await page.getByRole('button', { name: 'Cameras', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning', 'true');
  await page.getByRole('button', { name: 'Back to room' }).click();
  await expect(page.locator('main')).toHaveAttribute('data-shelf-focused', 'false'); await ready(page);
});

test('responsive inspection, touch gestures, graphics recovery and repeated entry', async ({ page, context, browserName }, info) => {
  await page.addInitScript(() => {
    (window as any).__cameraInput = [];
    for (const type of ['pointerdown', 'pointerup', 'click', 'blur']) window.addEventListener(type, event => {
      const pointer = event as PointerEvent;
      const log = (window as any).__cameraInput;
      const record = { type, target: (event.target as HTMLElement)?.className, x: pointer.clientX, y: pointer.clientY, id: pointer.pointerId, detail: pointer.detail, prevented: false };
      log.push(record); queueMicrotask(() => record.prevented = event.defaultPrevented);
      if (log.length > 80) log.shift();
    }, true);
  });
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes(PRIMARY_CAMERA.url)) requests.push(request.url()); });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/?mode=room&reduced_motion=true'); await ready(page); await cameraShelf(page); await display(page);
  await page.screenshot({ path: `artifacts/m20-candidates/${info.project.name}-1024-inspection.png` });
  let canvas = page.locator('.camera-stage canvas');
  await expect.poll(async () => Number(await canvas.getAttribute('data-geometries'))).toBeGreaterThan(0);
  const geometries = await canvas.getAttribute('data-geometries');
  const initial = await canvas.getAttribute('data-view-position');
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page), rect = (await canvas.boundingBox())!;
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 80, y: y + 20, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(canvas).not.toHaveAttribute('data-view-position', initial!);
    const before = await canvas.getAttribute('data-view-position'), target = await canvas.getAttribute('data-view-target');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 40, y, id: 1 }, { x: x + 40, y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 65, y: y + 30, id: 1 }, { x: x + 105, y: y + 30, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(canvas).not.toHaveAttribute('data-view-position', before!);
    await expect(canvas).not.toHaveAttribute('data-view-target', target!); await cdp.detach();
  } else {
    await page.getByRole('button', { name: 'Rear', exact: true }).tap();
    await expect(canvas).not.toHaveAttribute('data-view-position', initial!);
  }
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    const modelRect = (await canvas.boundingBox())!;
    expect(modelRect.height).toBeGreaterThan(100);
    for (const name of ['Back to shelf', 'Reset view', 'Top', 'Bottom']) {
      const button = await page.getByRole('button', { name, exact: name !== 'Back to shelf' }).boundingBox();
      expect(button!.x).toBeGreaterThanOrEqual(0); expect(button!.y).toBeGreaterThanOrEqual(0);
      expect(button!.x + button!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await page.screenshot({ path: `artifacts/m20-candidates/${info.project.name}-${viewport.width}-inspection.png` });
  }
  await canvas.evaluate(node => {
    const context = (node as HTMLCanvasElement).getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.locator('.camera-display [role="alert"]')).toBeVisible();
  await page.getByRole('button', { name: 'Retry model', exact: true }).click();
  await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true');
  try {
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Back to shelf' }).click();
      await expect(page.locator('.camera-collection-toolbar')).toBeVisible();
      if (i === 0) await page.screenshot({ path: `artifacts/m20-candidates/${info.project.name}-844-shelf.png` });
      await display(page);
    }
  } catch (error) {
    const path = info.outputPath('camera-input.json');
    await writeFile(path, JSON.stringify(await page.evaluate(() => (window as any).__cameraInput), null, 2));
    await info.attach('camera-input-events', { path, contentType: 'application/json' });
    throw error;
  }
  canvas = page.locator('.camera-stage canvas');
  await expect(canvas).toHaveAttribute('data-geometries', geometries!);
  expect(requests).toHaveLength(1);
});
