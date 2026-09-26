import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { ready, screenPoint } from './helpers/shelf';
import { CAMERA_SHELF_ORIGIN, PRIMARY_CAMERA_SLOT, mm } from '../../src/data/physicalScale';
import { ROOM_EYE } from '../../src/utils/cameraBounds';
test.use({ actionTimeout: 15000 });

test('room dragging remains bounded when the camera collection is visible', async ({ page }, info) => {
  await page.addInitScript(() => {
    (window as any).__roomDraws = 0;
    for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const key of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const proto = type.prototype as any, original = proto[key];
        if (original) proto[key] = function(...args: any[]) { (window as any).__roomDraws++; return original.apply(this, args); };
      }
    }
  });
  await page.goto('/guest?mode=room&reduced_motion=true');
  await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'true', { timeout: 60000 });
  await ready(page);
  // Both catalog cameras remain below a compact collection-wide batch budget.
  if (!process.env.CAMERA_BENCHMARK_BASELINE) expect(Number(await page.locator('.canvas-wrapper canvas').getAttribute('data-camera-model-meshes'))).toBeLessThanOrEqual(40);
  const measure = async () => {
    const canvas = page.locator('.canvas-wrapper canvas'), box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .7); await page.mouse.down();
    await page.evaluate(() => {
      (window as any).__roomDraws = 0; (window as any).__roomFrames = []; (window as any).__roomMeasure = true;
      function sample(time: number) { if (!(window as any).__roomMeasure) return; (window as any).__roomFrames.push(time); requestAnimationFrame(sample); }
      requestAnimationFrame(sample);
    });
    for (let i = 0; i < 45; i++) {
      await page.mouse.move(box.x + box.width * .5 + Math.sin(i / 7) * 22, box.y + box.height * .7);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    return page.evaluate(() => {
      (window as any).__roomMeasure = false;
      const frames: number[] = (window as any).__roomFrames;
      const intervals = frames.slice(1).map((t,i) => t-frames[i]).sort((a,b) => a-b);
      return { frames: frames.length, drawsPerFrame: (window as any).__roomDraws / frames.length, p95IntervalMs: intervals[Math.floor(intervals.length * .95)] };
    });
  };
  const away = await measure();
  await page.locator('.canvas-wrapper').focus();
  const slot = PRIMARY_CAMERA_SLOT;
  const cameraPosition: [number, number, number] = [CAMERA_SHELF_ORIGIN[0] - slot.z, CAMERA_SHELF_ORIGIN[1] + slot.y + mm(98), CAMERA_SHELF_ORIGIN[2] + slot.x];
  const heading = Math.atan2(ROOM_EYE[0] - cameraPosition[0], ROOM_EYE[2] - cameraPosition[2]);
  const currentYaw = Number((await page.locator('main').getAttribute('data-room-pose'))!.split(',')[0]);
  for (let i = 0; i < Math.round((currentYaw - heading) / .12); i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  const projected = await screenPoint(page, cameraPosition), bounds = (await page.locator('.canvas-wrapper canvas').boundingBox())!;
  expect(projected.x).toBeGreaterThan(bounds.x + 30); expect(projected.x).toBeLessThan(bounds.x + bounds.width - 30);
  expect(projected.y).toBeGreaterThan(bounds.y); expect(projected.y).toBeLessThan(bounds.y + bounds.height);
  const visible = await measure();
  if (!process.env.CAMERA_BENCHMARK_BASELINE) await expect(page.locator('main')).toHaveAttribute('data-shelf-focused', 'false');
  await mkdir('artifacts/m20-room-revision', { recursive: true });
  await page.screenshot({ path: `artifacts/m20-room-revision/${info.project.name}-room.png` });
  await writeFile(`artifacts/m20-room-revision/${process.env.CAMERA_BENCHMARK_BASELINE ? 'before' : 'after'}-${info.project.name}.json`, JSON.stringify({away,visible}, null, 2));
  if (!process.env.CAMERA_BENCHMARK_BASELINE) expect(visible.drawsPerFrame).toBeLessThan(away.drawsPerFrame * 1.5);
});
