import { approachTable } from "./helpers/room";
import { expect, Page, test } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { ROOM_EYE, TABLE_SURFACE_Y } from '../../src/utils/cameraBounds';
import { SHELF_ORIGIN } from '../../src/data/physicalScale';
import { focusShelf, ready } from './helpers/shelf';

async function screenPoint(page: Page, point: [number, number, number]) {
  // Keyboard look updates React before the camera's next rendered frame.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const canvas = page.locator('canvas'), rect = (await canvas.boundingBox())!;
  const camera = new PerspectiveCamera(Number(await canvas.getAttribute('data-camera-fov')), rect.width / rect.height, .04, 100);
  camera.position.fromArray((await canvas.getAttribute('data-camera-position'))!.split(',').map(Number));
  camera.quaternion.fromArray((await canvas.getAttribute('data-camera-quaternion'))!.split(',').map(Number));
  camera.updateMatrixWorld();
  const p = new Vector3(...point).project(camera);
  return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
}

test('M18 room clicks select the physical table or shelf across viewing angles', async ({ page }, info) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  const app = page.locator('main');
  // The centered room eye brings the near table edge behind the desktop
  // collection toolbar. Use a visible center patch for the third physical hit.
  for (const [x, z, key] of [[-1.4, -.8, 'ArrowLeft'], [1.4, -.8, 'ArrowRight'], [0, -.4, 'ArrowDown']] as const) {
    await page.locator('.canvas-wrapper').focus(); await page.keyboard.press(key);
    const point = await screenPoint(page, [x, TABLE_SURFACE_Y + .002, z]);
    expect(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.tagName, point)).toBe('CANVAS');
    if (info.project.use.hasTouch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
    await expect(app).toHaveAttribute('data-room-mode', 'inspect');
    await expect(app).toHaveAttribute('data-shelf-focused', 'false'); await ready(page);
    await page.getByTestId('return-room-btn').click(); await ready(page);
  }
  const point = await screenPoint(page, SHELF_ORIGIN);
  if (info.project.use.hasTouch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  await expect(app).toHaveAttribute('data-shelf-focused', 'true'); await ready(page);
});

test('M18 shelf drags return smoothly from owned and gray blocks without opening the editor', async ({ page, context, browserName }, info) => {
  await page.goto('/guest?mode=room'); await ready(page); await focusShelf(page);
  const app = page.locator('main'), canvas = page.locator('canvas');
  const pose = await app.getAttribute('data-room-pose');
  // Sample real rendered positions throughout the journey, without video.
  await page.evaluate(() => {
    const samples: number[][] = []; (window as any).__shelfMotion = samples;
    const sample = () => { samples.push(document.querySelector('canvas')!.dataset.cameraPosition!.split(',').map(Number)); if (samples.length < 240) requestAnimationFrame(sample); };
    requestAnimationFrame(sample);
  });
  const button = page.getByRole('button', { name: 'Show saved roll Roll 01', exact: true });
  const box = (await button.boundingBox())!, x = box.x + box.width * .7, y = box.y + box.height * .45;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 35, y + 15, { steps: 5 }); await page.mouse.up();
  await expect(app).toHaveAttribute('data-shelf-focused', 'false'); await ready(page);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const afterPose = (await app.getAttribute('data-room-pose'))!.split(',').map(Number), beforePose = pose!.split(',').map(Number);
  expect(afterPose[0] - beforePose[0]).toBeCloseTo(35 * .0035, 3);
  expect(afterPose[1] - beforePose[1]).toBeCloseTo(-15 * .0035, 3);
  const positions = await page.evaluate(() => (window as any).__shelfMotion as number[][]);
  const start = new Vector3(...positions[0]), end = new Vector3(...ROOM_EYE), distance = start.distanceTo(end);
  expect(positions.filter(p => new Vector3(...p).distanceTo(start) > distance * .05 && new Vector3(...p).distanceTo(end) > distance * .05).length).toBeGreaterThan(2);
  await expect(canvas).toHaveAttribute('data-camera-position', ROOM_EYE.join(','));
  await focusShelf(page);
  const gray = (await page.locator('[data-shelf-slot="5"]').boundingBox())!, tx = gray.x + gray.width / 2, ty = gray.y + gray.height / 2;
  if (browserName === 'chromium' && info.project.use.hasTouch) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty, id: 1 }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + i * 6, y: ty + i * 3, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
  } else {
    await page.mouse.move(tx, ty); await page.mouse.down(); await page.mouse.move(tx - 30, ty + 15, { steps: 5 }); await page.mouse.up();
  }
  await expect(app).toHaveAttribute('data-shelf-focused', 'false'); await ready(page);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await focusShelf(page);
  if (info.project.use.hasTouch) await button.tap(); else await button.click();
  await expect(page.getByRole('dialog', { name: 'Roll 01 — roll details', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Review roll', exact: true })).toHaveCount(0);
});

test('M18 shelf transitions keep navigation enabled and accept dragging before settling', async ({ page, context, browserName }, info) => {
  await page.goto('/guest?mode=room'); await ready(page);
  const app = page.locator('main');
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Film Shelf', exact: true }).click();
    await expect(app).toHaveAttribute('data-is-transitioning', 'true');
    await expect(page.getByRole('button', { name: 'Lights', exact: true })).toBeEnabled();
    await approachTable(page);
    await expect(app).toHaveAttribute('data-room-mode', 'inspect'); await ready(page);
    await page.getByTestId('return-room-btn').click(); await ready(page); await focusShelf(page);
    await page.getByRole('button', { name: '← Back to room', exact: true }).click();
    await expect(app).toHaveAttribute('data-is-transitioning', 'true');
    await expect(page.getByRole('button', { name: 'Lights', exact: true })).toBeEnabled();
    await approachTable(page);
    await expect(app).toHaveAttribute('data-room-mode', 'inspect'); await ready(page);
    await page.getByTestId('return-room-btn').click(); await ready(page);
  }
  const pose = await app.getAttribute('data-room-pose');
  const rect = (await page.locator('canvas').boundingBox())!, x = rect.x + rect.width * .52, y = rect.y + rect.height * .5;
  const cdp = browserName === 'chromium' && info.project.use.hasTouch ? await context.newCDPSession(page) : null;
  await page.getByRole('button', { name: 'Film Shelf', exact: true }).click();
  await expect(app).toHaveAttribute('data-is-transitioning', 'true');
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 30, y: y + 10, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
  } else {
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y + 10); await page.mouse.up();
  }
  await expect(app).toHaveAttribute('data-shelf-focused', 'false');
  await expect(app).not.toHaveAttribute('data-room-pose', pose!);
  await expect(app).toHaveAttribute('data-is-transitioning', 'true');
  await ready(page);
  // Observe a normal entry from start to finish: animated, with no long tail.
  await page.evaluate(() => {
    const main = document.querySelector('main')!, times = { start: 0, end: 0, frames: 0 };
    (window as any).__shelfTiming = times;
    (Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Film Shelf') as HTMLButtonElement).click();
    const sample = () => {
      // WebKit may defer React's commit beyond two animation frames after click.
      // Measure the rendered flight, not the delay before its state appears.
      if (main.dataset.isTransitioning === 'true') { times.start ||= performance.now(); times.frames++; }
      else if (times.start) { times.end = performance.now(); return; }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await expect(app).toHaveAttribute('data-shelf-focused', 'true'); await ready(page);
  await expect.poll(() => page.evaluate(() => (window as any).__shelfTiming.end)).toBeGreaterThan(0);
  const timing = await page.evaluate(() => (window as any).__shelfTiming);
  expect(timing.frames).toBeGreaterThan(2);
  expect(timing.end - timing.start).toBeGreaterThan(200);
  expect(timing.end - timing.start).toBeLessThan(850);
});
