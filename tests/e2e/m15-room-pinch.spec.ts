import { test, expect } from '@playwright/test';
import { ready } from './helpers/shelf';

test('M15 two fingers pinch the room lens in and out without moving the eye', async ({ page, context }) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  const app = page.locator('main'), canvas = page.locator('canvas');
  const zoom = async () => Number(await app.getAttribute('data-room-zoom'));
  const position = await canvas.getAttribute('data-camera-position');
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ ...p, radiusX: 3, radiusY: 3, force: 1 })) });
  const pinch = async (from: number, to: number) => {
    const rect = (await canvas.boundingBox())!, x = rect.x + rect.width / 2, y = rect.y + rect.height * .3;
    await touch('touchStart', [{ x: x - from, y, id: 1 }, { x: x + from, y, id: 2 }]);
    for (let i = 1; i <= 8; i++) { const d = from + (to - from) * i / 8; await touch('touchMove', [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }]); await page.waitForTimeout(40); }
    await touch('touchEnd', []);
  };
  await pinch(40, 100);
  await expect.poll(zoom).toBeCloseTo(2.5, 1);
  await expect(canvas).toHaveAttribute('data-camera-position', position!);
  await expect(app).toHaveAttribute('data-room-mode', 'room');
  await expect(app).toHaveAttribute('data-shelf-focused', 'false');
  await pinch(100, 50);
  await expect.poll(zoom).toBeCloseTo(1.25, 1);
});
