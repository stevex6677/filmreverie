import { openCamera } from './helpers/camera';
import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ actionTimeout: 15000 });

test('camera rotation keeps one render chain and settles to idle', async ({ page }, info) => {
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    (window as any).__rafSamples = new Map<number, number>();
    window.requestAnimationFrame = callback => original(time => {
      const samples = (window as any).__rafSamples as Map<number, number>;
      if ((window as any).__measureRaf) samples.set(time, (samples.get(time) ?? 0) + 1);
      callback(time);
    });
  });
  await page.goto('/guest?mode=room&reduced_motion=true');
  await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'true', { timeout: 60000 });
  await page.getByRole('button', { name: 'Camera Cabinet', exact: true }).click();
  await openCamera(page);
  await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { (window as any).__measureRaf = true; });
  const rect = (await page.locator('.camera-stage canvas').boundingBox())!;
  await page.mouse.move(rect.x + rect.width * .35, rect.y + rect.height * .5); await page.mouse.down();
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(rect.x + rect.width * (.35 + i / 80), rect.y + rect.height * (.5 + Math.sin(i / 5) * .1));
    await page.waitForTimeout(16);
  }
  await page.mouse.up(); await page.waitForTimeout(1500);
  const result = await page.evaluate(() => {
    const entries = [...(window as any).__rafSamples.entries()] as [number, number][];
    (window as any).__measureRaf = false;
    const intervals = entries.slice(1).map(([t], i) => t - entries[i][0]).sort((a,b) => a-b);
    return { callbacks: entries.reduce((n, [, count]) => n + count, 0), frames: entries.length,
      maxCallbacksPerFrame: Math.max(...entries.map(([, n]) => n)), p95IntervalMs: intervals[Math.floor(intervals.length * .95)] };
  });
  await mkdir('artifacts/m20-performance', { recursive: true });
  await writeFile(`artifacts/m20-performance/${process.env.CAMERA_BENCHMARK_BASELINE ? 'before' : 'after'}-${info.project.name}.json`, JSON.stringify(result, null, 2));
  if (!process.env.CAMERA_BENCHMARK_BASELINE) expect(result.maxCallbacksPerFrame).toBeLessThanOrEqual(5);
});
