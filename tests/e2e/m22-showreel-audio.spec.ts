import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1024, height: 768 } });

for (const title of ['Blue Skies', 'Dream Pop', 'Autumn']) test(`${title} starts with the showreel and resumes inside tap gestures`, async ({ page }) => {
  await page.addInitScript(() => {
    // Enforce a strict gesture boundary even on browsers that allow autoplay.
    const calls: boolean[] = [];
    const delays: number[] = [];
    Object.assign(window, { audioResumeGestures: calls, audioStartDelays: delays });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      delays.push(Math.max(0, when - this.context.currentTime));
      start.call(this, when, offset, duration);
    };
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () {
      const event = window.event;
      const gesture = !!event?.isTrusted && ['click', 'keydown'].includes(event.type);
      calls.push(gesture);
      if (!gesture) return Promise.reject(new DOMException('Audio must start in the tap handler.', 'NotAllowedError'));
      return resume.call(this);
    };
  });
  await page.goto('/showreel?size=640x360');
  const panel = page.getByRole('complementary', { name: 'Showreel' });
  const preview = panel.getByRole('button', { name: 'Preview', exact: true });
  await expect(preview).toBeEnabled({ timeout: 200000 });
  await panel.getByRole('radio', { name: new RegExp(`^${title}`) }).check();
  const active = () => page.evaluate(() => (window as any).__showreelAudio.active);
  const calls = () => page.evaluate(() => (window as any).audioResumeGestures as boolean[]);
  await expect.poll(active).toBe(true);
  await expect.poll(calls).toEqual([true]);
  // Let the audition decode and actually start before switching to Preview.
  await expect.poll(() => page.evaluate(() => (window as any).audioStartDelays.length)).toBe(1);
  await preview.click();
  await expect(panel).toBeHidden();
  await expect.poll(calls).toEqual([true, true]);
  await expect.poll(() => page.evaluate(() => (window as any).audioStartDelays.length)).toBe(2);
  const delays = await page.evaluate(() => (window as any).audioStartDelays as number[]);
  expect(delays[1], 'Preview must schedule music immediately, not after the opening').toBeLessThan(.1);
  await expect.poll(active).toBe(true);
  await expect.poll(async () => Number(await page.locator('.showreel').getAttribute('data-showreel-time')), { timeout: 30000 }).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(active).toBe(false);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(calls).toEqual([true, true, true]);
  await expect.poll(active).toBe(true);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect.poll(calls).toEqual([true, true, true, true]);
  await expect.poll(active).toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
