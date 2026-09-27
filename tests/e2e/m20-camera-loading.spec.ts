import { test, expect } from '@playwright/test';
import { CAMERAS } from '../../src/data/cameras';
import { ready } from './helpers/shelf';
import { openCamera } from './helpers/camera';

test.use({ serviceWorkers: 'block', actionTimeout: 30000 });

test('cabinet waits for all five models, then preloads details serially without blocking inspection', async ({ page }) => {
  const last = CAMERAS.at(-1)!;
  const requested: string[] = [];
  page.on('request', request => { if (request.url().includes('/assets/cameras/')) requested.push(new URL(request.url()).pathname); });
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let releaseDetail!: () => void;
  const detailGate = new Promise<void>(resolve => releaseDetail = resolve);
  await page.route(`**${last.shelfUrl}`, async route => { await gate; await route.continue(); });
  await page.route(`**${CAMERAS[0].url}`, async route => { await detailGate; await route.continue(); });
  try {
    await page.goto('/guest?mode=room&reduced_motion=true');
    await expect(page.locator('.canvas-wrapper canvas')).toHaveAttribute('data-camera-models-loaded', '4', { timeout: 90000 });
    // Exercise the old unconditional 12-second bypass while the fifth GLB is held.
    await page.waitForTimeout(13000);
    await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'false');
    await expect(page.locator('#darkroom-loader')).toBeVisible();
    expect(requested.filter(url => CAMERAS.some(camera => camera.url === url))).toEqual([]);
    release();
    await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'true', { timeout: 90000 });
    await expect(page.locator('.canvas-wrapper canvas')).toHaveAttribute('data-camera-models-loaded', '5');
    const detailRequests = () => requested.filter(url => CAMERAS.some(camera => camera.url === url));
    await expect.poll(detailRequests).toEqual([CAMERAS[0].url]);
    // A blocked preload cannot hold readiness or stop opening another camera.
    await page.waitForTimeout(1000);
    expect(detailRequests()).toEqual([CAMERAS[0].url]);
    await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'true');
    await page.getByRole('button', { name: 'Cameras', exact: true }).click(); await ready(page);
    await openCamera(page, last.name);
    await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', { timeout: 90000 });
    expect(detailRequests()).toEqual([CAMERAS[0].url, last.url]);
    releaseDetail();
    await expect.poll(() => detailRequests().slice().sort(), { timeout: 90000 }).toEqual(CAMERAS.map(camera => camera.url).sort());
    await page.getByRole('button', { name: 'Back to shelf' }).click();
    await openCamera(page, CAMERAS[0].name);
    await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', { timeout: 90000 });
    expect(detailRequests().filter(url => url === CAMERAS[0].url)).toHaveLength(1);
  } finally { release(); releaseDetail(); }
});

test('a failed cabinet model keeps readiness false and retries only the failed camera', async ({ page }) => {
  const last = CAMERAS.at(-1)!;
  let failing = true;
  const counts = new Map<string, number>();
  page.on('request', request => { const url = new URL(request.url()).pathname; if (CAMERAS.some(camera => camera.shelfUrl === url)) counts.set(url, (counts.get(url) ?? 0) + 1); });
  await page.route(`**${last.shelfUrl}`, route => failing ? route.fulfill({ status: 503, body: 'test failure' }) : route.continue());
  await page.goto('/guest?mode=room&reduced_motion=true');
  await expect(page.getByRole('button', { name: 'Retry cameras', exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'false');
  const previous = new Map(counts); failing = false;
  await page.getByRole('button', { name: 'Retry cameras', exact: true }).click();
  await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'true', { timeout: 90000 });
  for (const camera of CAMERAS) expect(counts.get(camera.shelfUrl)).toBe((previous.get(camera.shelfUrl) ?? 0) + (camera.id === last.id ? 1 : 0));
});

test('a failed detail preload leaves the room ready, continues the queue and retries on inspection', async ({ page }) => {
  const first = CAMERAS[0];
  let failing = true;
  const requested: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url()).pathname;
    if (CAMERAS.some(camera => camera.url === url)) requested.push(url);
  });
  await page.route(`**${first.url}`, route => failing ? route.fulfill({ status: 503, body: 'test preload failure' }) : route.continue());
  await page.goto('/guest?mode=room&reduced_motion=true');
  await ready(page);
  await expect.poll(() => requested.slice().sort(), { timeout: 90000 }).toEqual(CAMERAS.map(camera => camera.url).sort());
  await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'true');
  await expect(page.locator('#darkroom-loader')).not.toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Cameras', exact: true }).click(); await ready(page);
  await openCamera(page, first.name);
  await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', { timeout: 90000 });
  expect(requested.filter(url => url === first.url)).toHaveLength(2);
});
