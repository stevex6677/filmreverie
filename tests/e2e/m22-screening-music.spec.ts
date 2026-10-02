import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { ready } from './helpers/shelf';
import { parseBoxes, type Mp4Box } from '../helpers/mp4';

const titles = ['Families', 'Blue Skies', 'City In The Rearview', 'Dream Pop', 'Autumn'];

test('five shared tracks audition, preview, pause, seek and export with audio', async ({ page }, info) => {
  // Observe real Web Audio sources without replacing decoding or playback.
  await page.addInitScript(() => {
    const sources: AudioBufferSourceNode[] = [];
    Object.assign(window, { musicSources: sources });
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this); sources.push(source);
      const remove = () => { const index = sources.indexOf(source); if (index >= 0) sources.splice(index, 1); };
      source.addEventListener('ended', remove);
      const stop = source.stop.bind(source);
      source.stop = (when = 0) => {
        stop(when);
        // Headless systems can have a stalled audio device; immediate stop still silences the source.
        if (when <= this.currentTime) remove();
      };
      return source;
    };
  });
  const liveLoops = () => page.evaluate(() => (window as typeof window & { musicSources: AudioBufferSourceNode[] }).musicSources.filter(s => s.loop).length);
  await page.goto('/guest?mode=inspect&deterministic=true&screening_seconds=3'); await ready(page);
  await page.getByTestId('screen-roll').click();
  const picker = page.getByRole('dialog', { name: 'Screen roll' });
  for (const title of titles) await expect(picker.getByRole('radio', { name: new RegExp(`^${title}`) })).toHaveCount(1);
  await picker.getByRole('radio', { name: /^Autumn/ }).check();
  await expect(picker.getByRole('button', { name: /Listen/ })).toHaveCount(0);
  await expect(picker.getByRole('radio', { name: /^Autumn/ })).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { musicSources: AudioBufferSourceNode[] }).musicSources.length)).toBe(1);
  await picker.getByRole('radio', { name: 'No music', exact: true }).check();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { musicSources: AudioBufferSourceNode[] }).musicSources.length)).toBe(0);
  await picker.getByText('Autumn', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { musicSources: AudioBufferSourceNode[] }).musicSources.length)).toBe(1);
  // Clicking an already selected track plays it again too.
  await picker.getByText('Autumn', { exact: true }).click();
  await expect(picker.getByRole('radio', { name: /^Autumn/ })).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { musicSources: AudioBufferSourceNode[] }).musicSources.length)).toBe(1);
  await page.screenshot({ path: info.outputPath('music-settings.png') });
  await picker.getByTestId('screening-preview').click();
  await expect.poll(liveLoops, { timeout: 30000 }).toBe(1);
  await expect.poll(async () => Number(await page.getByTestId('screening-player').getAttribute('data-time'))).toBeGreaterThan(1);
  await page.getByTestId('screening-toggle').click(); await expect.poll(liveLoops).toBe(0);
  await page.getByTestId('screening-next').click();
  await page.getByTestId('screening-toggle').click(); await expect.poll(liveLoops).toBe(1);
  await page.getByTestId('screening-player-export').click(); await expect.poll(liveLoops).toBe(0);
  await expect(page.getByTestId('screening-export-view')).toContainText('Music: Autumn');
  await page.getByTestId('screening-export-start').click();
  await expect(page.getByTestId('screening-export-view')).toHaveAttribute('data-phase', 'done', { timeout: 120000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('screening-download').click()]);
  const file = info.outputPath('with-music.mp4'); await download.saveAs(file);
  const bytes = new Uint8Array(await fs.readFile(file));
  const flatten = (boxes: Mp4Box[]): Mp4Box[] => boxes.flatMap(box => [box, ...flatten(box.children)]);
  const handlers = flatten(parseBoxes(new DataView(bytes.buffer))).filter(box => box.type === 'hdlr').map(box => String.fromCharCode(...Array.from({ length: 4 }, (_, i) => box.body.getUint8(8 + i))));
  expect(handlers).toEqual(['vide', 'soun']);
  await page.getByTestId('screening-export-done').click();
  await page.getByTestId('screening-exit').click(); await expect.poll(liveLoops).toBe(0);
  await page.getByTestId('screen-roll').click();
  await expect(picker.getByRole('radio', { name: /^Autumn/ })).toBeChecked();
  await picker.getByRole('radio', { name: 'No music', exact: true }).check();
  await picker.getByTestId('screening-preview').click();
  await expect.poll(async () => Number(await page.getByTestId('screening-player').getAttribute('data-time'))).toBeGreaterThan(1);
  expect(await liveLoops()).toBe(0);
  await page.goto('/showreel');
  for (const title of titles) await expect(page.getByRole('radio', { name: new RegExp(`^${title}`) })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Listen/ })).toHaveCount(0);
  await page.getByRole('radio', { name: /^Dream Pop/ }).check();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { musicSources: AudioBufferSourceNode[] }).musicSources.length)).toBe(1);
  // A settings rerender must not stop the audition via the film playback synchronizer.
  await page.getByLabel('Titles and captions').uncheck();
  await expect(page.getByRole('radio', { name: /^Dream Pop/ })).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { musicSources: AudioBufferSourceNode[] }).musicSources.length)).toBe(1);
  await page.getByRole('radio', { name: 'No music', exact: true }).check();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { musicSources: AudioBufferSourceNode[] }).musicSources.length)).toBe(0);
});
