import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { closeViewingTools, openFrame, openViewingTools } from './helpers/viewing';
import { getRegionStats, getRegionMeanDifference } from './helpers/pixelAnalysis';
import { add, focusShelf, openRoll, ready } from './helpers/shelf';
import { offlineServer } from './helpers/offlineServer';
import { readMp4 } from '../helpers/mp4';
import { BASELINE_ROLL } from '../../src/utils/rollLayout';
import { createScreeningTimeline } from '../../src/screening/reels';
import type { GalleryRoll } from '../../src/cloud/contracts';

// The screening overlay is a second canvas; address the WebGL scene explicitly.
const scene = (page: Page) => page.locator('.canvas-wrapper canvas');
async function captureCanvas(page: Page, options?: { path?: string }) {
  const encoded = await scene(page).evaluate(async (node: HTMLCanvasElement) => {
    const started = performance.now();
    await new Promise<void>(resolve => { let frames = 0; const step = (now: number) => { if (++frames >= 2 && now - started >= 500) resolve(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
    return node.toDataURL('image/png').split(',')[1];
  });
  const buffer = Buffer.from(encoded, 'base64');
  if (options?.path) await fs.writeFile(options.path, buffer);
  return buffer;
}
const TABLE_KEYS = ['rollId', 'tableMode', 'inspectionLevel', 'selectedFrame', 'inspectZoom', 'tableAngle', 'inspectPan', 'focusMode', 'filmMode', 'filmStock', 'filmStrength',
  'loupeActive', 'loupeState', 'loupeType', 'loupeSize', 'activeFrame', 'roomMode', 'screening'];
// Everything the table would restore, including the rendered camera pose.
async function table(page: Page) {
  const main = await page.locator('main').evaluate((node, keys) => Object.fromEntries(keys.map(key => [key, (node as HTMLElement).dataset[key]])), TABLE_KEYS);
  const canvas = await scene(page).evaluate(node => ({ position: (node as HTMLElement).dataset.cameraPosition, rotation: (node as HTMLElement).dataset.cameraQuaternion, loupe: (node as HTMLElement).dataset.loupeSample }));
  return { ...main, ...canvas };
}
// Guest rolls, frames and saved views, which screening must never write.
async function library(page: Page, name = 'darkroom-guest-rolls') {
  return page.evaluate(name => new Promise<string>((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, stores = ['rolls', 'frames'].filter(store => db.objectStoreNames.contains(store));
      if (!stores.length) { db.close(); resolve('{}'); return; }
      const tx = db.transaction(stores), out: Record<string, unknown> = {};
      let pending = stores.length;
      for (const store of stores) { const request = tx.objectStore(store).getAll(); request.onsuccess = () => { out[store] = request.result; if (!--pending) { db.close(); resolve(JSON.stringify(out)); } }; }
    };
  }), name);
}
const player = (page: Page) => page.getByTestId('screening-player');
const time = async (page: Page) => Number(await player(page).getAttribute('data-time'));
async function pickReel(page: Page, reel: 'Tracking Shot' | 'Develop' | 'Projector' | 'Darkroom' | 'Flyover' | 'Orbit', pace = 'Normal', format = '16:9') {
  // Phones hide the Focus header button; Settings offers Screen roll in every layout.
  if (await page.getByTestId('screen-roll').isVisible()) await page.getByTestId('screen-roll').click();
  else { await openViewingTools(page); await page.getByTestId('screen-roll-tools').click(); }
  const picker = page.getByRole('dialog', { name: 'Screen roll' });
  await expect(picker).toBeVisible();
  await picker.getByRole('radio', { name: new RegExp(`^${reel}`) }).check();
  await picker.getByRole('radio', { name: pace, exact: true }).check();
  await picker.getByRole('radio', { name: new RegExp(`^${format}`) }).check();
  return picker;
}
async function renderedDeviation(page: Page) {
  const image = PNG.sync.read(await captureCanvas(page));
  return getRegionStats(image, image.width / 2 | 0, image.height / 2 | 0, 120).stdDev;
}
function watchRequests(page: Page) {
  const requests: { method: string; url: string }[] = [];
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  return requests;
}
async function expectRestored(page: Page, before: Awaited<ReturnType<typeof table>>) {
  await expect(page.locator('main')).toHaveAttribute('data-screening', '');
  await expect.poll(() => table(page)).toEqual(before);
}
/** Plays the finished video in the page and returns its size and frame contrast. */
async function inspectVideo(page: Page, times: { leader?: number; middle?: number; later?: number } = {}) {
  return page.getByTestId('screening-export-video').evaluate(async (video: HTMLVideoElement, times) => {
    if (video.readyState < 2) await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true }));
    const frame = async (at: number) => {
      video.currentTime = at; await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 160 * video.videoHeight / video.videoWidth | 0;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0, square = 0;
      for (let i = 0; i < data.length; i += 4) { const l = (data[i] + data[i + 1] + data[i + 2]) / 3; sum += l; square += l * l; }
      const n = data.length / 4; return { mean: sum / n, deviation: Math.sqrt(square / n - (sum / n) ** 2) };
    };
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, start: await frame(.05), leader: await frame(times.leader ?? 1.6), middle: await frame(times.middle ?? video.duration * .45), later: await frame(times.later ?? video.duration * .6) };
  }, times);
}
async function download(page: Page, path: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('screening-download').click()]);
  expect(file.suggestedFilename()).toMatch(/^[a-z0-9-]+\.mp4$/);
  await file.saveAs(path);
  return { name: file.suggestedFilename(), mp4: readMp4(new Uint8Array(await fs.readFile(path))) };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('darkroom-guest-welcome', 'done'));
});

test('Tracking Shot previews in the table scene with pause, seek, tap and keys, then restores Overview exactly', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const requests = watchRequests(page);
  await page.goto('/guest?mode=inspect&deterministic=true'); await ready(page);
  const before = await table(page), stored = await library(page);
  const overview = PNG.sync.read(await captureCanvas(page));
  const picker = await pickReel(page, 'Tracking Shot');
  await expect(picker.getByTestId('screening-estimate')).toContainText('5 frames');
  await page.screenshot({ path: info.outputPath('picker.png') });
  await picker.getByTestId('screening-preview').click();
  await expect(page.locator('main')).toHaveAttribute('data-screening', 'preview');
  await expect(page.locator('main')).toHaveAttribute('data-screening-reel', 'tracking');
  await expect(page.getByTestId('controls-panel')).toHaveCount(0);
  await expect(player(page)).toHaveAttribute('data-playing', 'true');
  await expect.poll(() => time(page), { timeout: 30000 }).toBeGreaterThan(6);
  // The camera belongs to the screening: its pose differs from the table's.
  expect((await table(page)).position).not.toBe(before.position);
  await page.getByTestId('screening-toggle').click();
  await expect(player(page)).toHaveAttribute('data-playing', 'false');
  const paused = await time(page);
  await page.waitForTimeout(700);
  expect(await time(page)).toBe(paused);
  const walk = PNG.sync.read(await captureCanvas(page, { path: info.outputPath('tracking.png') }));
  expect(getRegionMeanDifference(walk, overview, walk.width / 2 | 0, walk.height / 2 | 0, 200)).toBeGreaterThan(4);
  expect(await renderedDeviation(page)).toBeGreaterThan(6);

  const frame = Number(await player(page).getAttribute('data-frame'));
  await page.getByTestId('screening-next').click();
  await expect(player(page)).toHaveAttribute('data-frame', String(frame + 1));
  await page.keyboard.press('ArrowRight');
  await expect(player(page)).toHaveAttribute('data-frame', String(frame + 2));
  await page.getByTestId('screening-previous').click();
  await expect(player(page)).toHaveAttribute('data-frame', String(frame + 1));
  // A tap on the scene resumes, another pauses; Space toggles as well.
  const stage = page.getByRole('button', { name: 'Resume screening' });
  await stage.click({ position: { x: 300, y: 300 } });
  await expect(player(page)).toHaveAttribute('data-playing', 'true');
  await page.getByRole('button', { name: 'Pause screening' }).click({ position: { x: 300, y: 300 } });
  await expect(player(page)).toHaveAttribute('data-playing', 'false');
  await page.locator('body').press('Space');
  await expect(player(page)).toHaveAttribute('data-playing', 'true');
  await page.keyboard.press('Escape');
  await expectRestored(page, before);
  await expect(page.getByTestId('controls-panel')).toBeVisible();
  const after = PNG.sync.read(await captureCanvas(page));
  expect(getRegionMeanDifference(after, overview, after.width / 2 | 0, after.height / 2 | 0, 200)).toBeLessThan(1.5);
  expect(await library(page)).toBe(stored);
  expect(requests.filter(request => request.method !== 'GET' || request.url.includes('/api/'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('Develop from Focus reveals the roll in the scene, and exit restores Focus, dimmer, film mode and framing', async ({ page }, info) => {
  await page.goto('/guest?mode=inspect&deterministic=true'); await ready(page);
  await openFrame(page, 3);
  await openViewingTools(page);
  await page.getByTestId('brightness-slider').fill('0.6');
  await page.getByTestId('mode-toggle').click();
  await expect(page.locator('main')).toHaveAttribute('data-film-mode', 'negative');
  await closeViewingTools(page);
  const before = await table(page), stored = await library(page);
  const focus = PNG.sync.read(await captureCanvas(page));
  expect(before).toMatchObject({ focusMode: 'true', selectedFrame: '3', filmMode: 'negative' });
  await (await pickReel(page, 'Develop', 'Brisk')).getByTestId('screening-preview').click();
  // The table is off at the open: black film on a dim diffuser, lit only by the room.
  await page.getByTestId('screening-toggle').click();
  const opening = PNG.sync.read(await captureCanvas(page, { path: info.outputPath('develop-unlit.png') }));
  expect(getRegionStats(opening, opening.width / 2 | 0, opening.height / 2 | 0, 300).meanLum).toBeLessThan(60);
  await page.getByTestId('screening-next').click(); await page.getByTestId('screening-next').click();
  await expect(player(page)).toHaveAttribute('data-frame', '2');
  await page.getByTestId('screening-toggle').click();
  await expect.poll(() => time(page), { timeout: 30000 }).toBeGreaterThan(Number(await player(page).getAttribute('data-time')) + 1.4);
  await page.getByTestId('screening-toggle').click();
  await captureCanvas(page, { path: info.outputPath('develop-band.png') });
  expect(await renderedDeviation(page)).toBeGreaterThan(8);
  await page.getByTestId('screening-exit').click();
  await expectRestored(page, before);
  await openViewingTools(page);
  await expect(page.getByTestId('brightness-value')).toHaveText('60%');
  await closeViewingTools(page);
  const after = PNG.sync.read(await captureCanvas(page));
  // Mode and dimmer uniforms return exactly: the negative view is unchanged.
  expect(getRegionMeanDifference(after, focus, after.width / 2 | 0, after.height / 2 | 0, 200)).toBeLessThan(1.5);
  expect(await library(page)).toBe(stored);
});

test('Screen roll waits for the loupe to be put away, hides it while screening and restores loupe choices', async ({ page }) => {
  await page.goto('/guest?mode=inspect&deterministic=true'); await ready(page);
  await page.getByTestId('loupe-activate').first().click();
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state', 'activated');
  await expect(page.getByTestId('screen-roll')).toHaveCount(0);
  await page.getByTestId('loupe-customize').click();
  await page.getByRole('radio', { name: 'Glass dome' }).check();
  await page.getByRole('radio', { name: 'Large', exact: true }).check();
  await page.getByTestId('mag-btn-8x').click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.canvas-wrapper').focus(); for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.getByTestId('put-away-loupe').click();
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state', 'inactivated');
  await ready(page);
  const before = await table(page);
  await expect(scene(page)).toHaveAttribute('data-loupe-visible', 'true');
  await (await pickReel(page, 'Tracking Shot', 'Brisk')).getByTestId('screening-preview').click();
  // No reel uses the loupe; it is hidden rather than left resting in shot.
  await expect(scene(page)).toHaveAttribute('data-loupe-visible', 'false');
  await expect.poll(() => time(page), { timeout: 30000 }).toBeGreaterThan(4);
  await page.getByTestId('screening-exit').click();
  await expectRestored(page, before);
  await expect(scene(page)).toHaveAttribute('data-loupe-visible', 'true');
  await expect(scene(page)).toHaveAttribute('data-loupe-type', 'glass');
  await expect(scene(page)).toHaveAttribute('data-loupe-magnification', '8');
  await page.getByTestId('loupe-activate').first().click();
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state', 'activated');
});

test('Darkroom, Flyover and Orbit preview in the actual scene, seek by frame and restore the table', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/guest?mode=inspect&deterministic=true'); await ready(page);
  const before = await table(page), stored = await library(page);
  const overview = PNG.sync.read(await captureCanvas(page));
  await page.getByTestId('screen-roll').click();
  await expect(page.getByRole('dialog', { name: 'Screen roll' }).getByRole('radio')).toHaveCount(6 + 3 + 3);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  for (const [reel, id] of [['Darkroom', 'darkroom'], ['Flyover', 'flyover'], ['Orbit', 'orbit']] as const) {
    await (await pickReel(page, reel, 'Brisk')).getByTestId('screening-preview').click();
    await expect(page.locator('main')).toHaveAttribute('data-screening-reel', id);
    await expect.poll(() => time(page), { timeout: 30000 }).toBeGreaterThan(2);
    await page.getByTestId('screening-toggle').click();
    await page.getByTestId('screening-next').click();
    const frame = Number(await player(page).getAttribute('data-frame'));
    await page.getByTestId('screening-next').click();
    await expect(player(page)).toHaveAttribute('data-frame', String(frame + 1));
    const shot = PNG.sync.read(await captureCanvas(page, { path: info.outputPath(`${id}-frame.png`) }));
    expect(getRegionStats(shot, shot.width / 2 | 0, shot.height / 2 | 0, 200).stdDev, id).toBeGreaterThan(6);
    expect(getRegionMeanDifference(shot, overview, shot.width / 2 | 0, shot.height / 2 | 0, 200), id).toBeGreaterThan(2);
    await page.getByTestId('screening-exit').click();
    await expectRestored(page, before);
  }
  expect(await library(page)).toBe(stored);
  expect(errors).toEqual([]);
});

test('exports a decodable 720p H.264 MP4 of the whole reel without writes or uploads', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'Desktop Chrome covers the Chrome encoder; WebKit covers Safari.');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const requests = watchRequests(page);
  await page.goto('/guest?mode=inspect&deterministic=true'); await ready(page);
  const before = await table(page), stored = await library(page);
  const timeline = createScreeningTimeline(BASELINE_ROLL, { reel: 'projector', pace: 'brisk', aspect: 16 / 9, stockType: 'negative' });
  const expected = timeline.duration, countdown = timeline.cards.find(card => card.kind === 'countdown')!;
  await (await pickReel(page, 'Projector', 'Brisk')).getByTestId('screening-export').click();
  const view = page.getByTestId('screening-export-view');
  await expect(view).toHaveAttribute('data-phase', 'rendering');
  await expect(page.locator('main')).toHaveAttribute('data-screening', 'export');
  await expect.poll(async () => Number(await page.getByTestId('screening-export-progress').getAttribute('value')), { timeout: 60000 }).toBeGreaterThan(60);
  await page.screenshot({ path: info.outputPath('export-progress.png') });
  await expect(view).toHaveAttribute('data-phase', 'done', { timeout: 200000 });
  await expect(page.getByTestId('screening-download')).toBeVisible();
  const video = await inspectVideo(page, { leader: (countdown.start + countdown.end) / 2, middle: timeline.frameStart(1) + .4, later: timeline.frameStart(3) + .4 });
  expect([video.width, video.height]).toEqual([1280, 720]);
  expect(video.duration).toBeCloseTo(Math.round(expected * 30) / 30, 1);
  expect(video.start.mean).toBeLessThan(60);
  // The countdown is projected in the gate: a lit leader on black surroundings.
  expect(video.leader.mean).toBeGreaterThan(40); expect(video.leader.mean).toBeLessThan(160); expect(video.leader.deviation).toBeGreaterThan(30);
  expect(video.middle.deviation).toBeGreaterThan(12);
  expect(Math.abs(video.middle.mean - video.later.mean) + Math.abs(video.middle.deviation - video.later.deviation)).toBeGreaterThan(.5);
  await page.screenshot({ path: info.outputPath('export-done.png') });
  const { name, mp4 } = await download(page, info.outputPath('screening.mp4'));
  expect(name).toBe('roll-01-projector.mp4');
  expect(mp4.order).toEqual(['ftyp', 'moov', 'mdat']);
  expect(mp4.sampleEntry).toBe('avc1');
  expect([mp4.width, mp4.height]).toEqual([1280, 720]);
  expect(mp4.stts.reduce((n, [count]) => n + count, 0)).toBe(Math.round(expected * 30));
  expect(mp4.stts.every(([, delta]) => delta === mp4.timescale / 30)).toBe(true);
  expect(mp4.keyframes[0]).toBe(1);
  await page.getByTestId('screening-export-done').click();
  await expectRestored(page, before);
  expect(await library(page)).toBe(stored);
  expect(requests.filter(request => request.method !== 'GET' || request.url.includes('/api/'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('Darkroom exports its room shots and the table tour as H.264', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'Export is covered on desktop Chrome and WebKit.');
  await page.goto('/guest?mode=inspect&deterministic=true&screening_seconds=12'); await ready(page);
  const before = await table(page);
  await (await pickReel(page, 'Darkroom', 'Brisk')).getByTestId('screening-export').click();
  await expect(page.getByTestId('screening-export-view')).toHaveAttribute('data-phase', 'done', { timeout: 120000 });
  const video = await inspectVideo(page, { leader: 2, middle: 9, later: 11 });
  // The room opening is dim; the lit table tour is bright and detailed.
  expect(video.leader.mean).toBeLessThan(70);
  expect(video.middle.mean).toBeGreaterThan(video.leader.mean + 20); expect(video.middle.deviation).toBeGreaterThan(12);
  const { name, mp4 } = await download(page, info.outputPath('darkroom.mp4'));
  expect(name).toBe('roll-01-darkroom.mp4');
  expect(mp4.stts.reduce((n, [count]) => n + count, 0)).toBe(360);
  await page.getByTestId('screening-export-done').click();
  await expectRestored(page, before);
});

test.describe('high-density display', () => {
test.use({ deviceScaleFactor: 2 });
test('export Cancel and an unavailable encoder leave the table, its resolution and the library unchanged', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'Encoder paths are covered on desktop Chrome and WebKit.');
  await page.goto('/guest?mode=inspect&deterministic=true'); await ready(page);
  await openFrame(page, 2);
  const before = await table(page), stored = await library(page);
  const resolution = () => scene(page).evaluate((node: HTMLCanvasElement) => [node.width, node.height, node.clientWidth, node.clientHeight]);
  const pixels = await resolution();
  expect(pixels[0]).toBeGreaterThan(pixels[2]);
  await (await pickReel(page, 'Tracking Shot')).getByTestId('screening-export').click();
  await expect.poll(async () => Number(await page.getByTestId('screening-export-progress').getAttribute('value')), { timeout: 60000 }).toBeGreaterThan(5);
  await page.getByTestId('screening-export-cancel').click();
  await expect(page.getByTestId('screening-export-view')).toHaveCount(0);
  await expectRestored(page, before);
  await expect.poll(resolution).toEqual(pixels);
  // The canvas renders the live table again after the frame-stepped export.
  const first = await captureCanvas(page), second = await captureCanvas(page);
  expect(getRegionMeanDifference(PNG.sync.read(first), PNG.sync.read(second), 400, 300, 200)).toBeLessThan(1);
  expect(await renderedDeviation(page)).toBeGreaterThan(6);

  await page.evaluate(() => { Object.defineProperty(window, 'VideoEncoder', { value: undefined, configurable: true }); });
  await (await pickReel(page, 'Develop')).getByTestId('screening-export').click();
  await expect(page.getByTestId('screening-export-view')).toHaveAttribute('data-phase', 'unsupported');
  await expect(page.getByTestId('screening-export-view')).toContainText('cannot encode H.264');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expectRestored(page, before);
  expect(await resolution()).toEqual(pixels);
  expect(await library(page)).toBe(stored);
});
});

test('a single-frame 120 roll screens without sprockets and exports portrait video', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'Import and export are covered on desktop Chrome and WebKit.');
  await page.goto('/guest?mode=room&deterministic=true&screening_seconds=4'); await ready(page);
  await focusShelf(page);
  await add(page, 'Medium single', 'portra-160', '66');
  await openRoll(page, 'Medium single');
  await expect(page.locator('main')).toHaveAttribute('data-film-format', '66');
  const before = await table(page), stored = await library(page);
  await (await pickReel(page, 'Projector', 'Normal', '9:16')).getByTestId('screening-preview').click();
  await expect(player(page)).toContainText('/ 1');
  await expect.poll(() => time(page), { timeout: 30000 }).toBeGreaterThan(5);
  await page.getByTestId('screening-toggle').click();
  await captureCanvas(page, { path: info.outputPath('medium-gate.png') });
  await page.getByTestId('screening-player-export').click();
  await expect(page.getByTestId('screening-export-view')).toHaveAttribute('data-phase', 'done', { timeout: 120000 });
  const { name, mp4 } = await download(page, info.outputPath('medium.mp4'));
  expect(name).toBe('medium-single-projector.mp4');
  expect([mp4.width, mp4.height]).toEqual([720, 1280]);
  expect(mp4.stts.reduce((n, [count]) => n + count, 0)).toBe(120);
  const video = await inspectVideo(page);
  expect([video.width, video.height]).toEqual([720, 1280]);
  expect(video.later.deviation).toBeGreaterThan(8);
  // Done returns to the paused preview; Exit restores the table.
  await page.getByTestId('screening-export-done').click();
  await expect(player(page)).toHaveAttribute('data-playing', 'false');
  await page.getByTestId('screening-exit').click();
  await expectRestored(page, before);
  expect(await library(page)).toBe(stored);
});

function photo() {
  const image = new PNG({ width: 180, height: 120 });
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4;
    image.data[i] = 40 + x; image.data[i + 1] = 40 + y; image.data[i + 2] = (x * y) % 200; image.data[i + 3] = 255;
  }
  return PNG.sync.write(image);
}
const listen = async (server: Server) => { await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${(server.address() as AddressInfo).port}`; };
const close = async (server: Server) => { if (server.listening) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); };
const proxy = (request: IncomingMessage, response: ServerResponse, baseURL: string) => {
  const upstream = httpRequest(new URL(request.url!, baseURL), result => { response.writeHead(result.statusCode!, result.headers); result.pipe(response); });
  upstream.on('error', () => response.destroy()); upstream.end();
};

test.describe('public gallery', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('an anonymous visitor screens and exports a published roll with only public reads', async ({ page, baseURL }, info) => {
    test.skip(info.project.name === 'mobile-chrome', 'Covered on desktop Chrome and WebKit.');
    const bytes = photo(), sha256 = createHash('sha256').update(bytes).digest('hex');
    const images = createServer((_, response) => { response.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); response.end(bytes); });
    let roll: GalleryRoll;
    const app = createServer((request, response) => {
      if (request.url === '/api/gallery') { response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ version: 1, rolls: [roll] })); return; }
      if (request.url?.startsWith('/api/owner/')) { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end('{"error":"Owner authorization required."}'); return; }
      proxy(request, response, baseURL!);
    });
    try {
      const photos = await listen(images), origin = await listen(app);
      const image = (url: string) => ({ url, bytes: bytes.length, sha256 });
      const frame = (id: string) => ({ id, width: 180, height: 120, rotation: 0, viewing: image(`${photos}/${id}.png`), thumbnail: image(`${photos}/${id}-thumb.png`) });
      roll = { id: 'public-roll', revision: 'r1', name: 'Harbour night', stockId: 'ektachrome-e100', format: '135', coverId: 'a', publishedAt: 1, frames: [frame('a'), frame('b')] };
      await page.goto(`${origin}/?mode=room&deterministic=true&screening_seconds=3`); await ready(page);
      const target = page.getByRole('button', { name: 'Show published roll Harbour night' });
      await page.getByRole('button', { name: 'Film Shelf', exact: true }).click(); await ready(page);
      await target.focus(); await target.press('ArrowDown');
      await page.getByRole('dialog', { name: 'Harbour night — roll details' }).getByRole('button', { name: /Open on light table/ }).click();
      await expect(page.locator('main')).toHaveAttribute('data-roll-id', 'gallery:public-roll:r1'); await ready(page);
      const before = await table(page);
      const requests = watchRequests(page);
      // Reversal film: Develop brings up the backlight behind each frame.
      await (await pickReel(page, 'Develop', 'Brisk', '1:1')).getByTestId('screening-export').click();
      await expect(page.getByTestId('screening-export-view')).toHaveAttribute('data-phase', 'done', { timeout: 120000 });
      const { name, mp4 } = await download(page, info.outputPath('public.mp4'));
      expect(name).toBe('harbour-night-develop.mp4');
      expect([mp4.width, mp4.height]).toEqual([720, 720]);
      await page.getByTestId('screening-export-done').click();
      await expectRestored(page, before);
      expect(requests.filter(request => request.method !== 'GET')).toEqual([]);
      expect(requests.filter(request => request.url.includes('/api/owner') || /upload|publish/.test(request.url))).toEqual([]);
      expect(await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name))).not.toContain('darkroom-rolls');
    } finally { await close(images); await close(app); }
  });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('a prepared app loads the export code and exports a saved roll while offline', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'desktop', 'Offline export is checked with desktop Chrome network emulation.');
    const server = await offlineServer();
    try {
      await page.goto(`${server.url}/guest?mode=inspect&deterministic=true&screening_seconds=2`); await ready(page);
      await expect.poll(() => page.evaluate(async () => {
        const worker = navigator.serviceWorker.controller;
        if (!worker) return false;
        return new Promise<boolean>(resolve => { const channel = new MessageChannel(); setTimeout(() => resolve(false), 5000); channel.port1.onmessage = event => resolve(event.data.ready === true); worker.postMessage({ type: 'STATUS' }, [channel.port2]); });
      }), { timeout: 60000 }).toBe(true);
      await context.setOffline(true);
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => location.reload())]);
      await ready(page);
      await (await pickReel(page, 'Tracking Shot', 'Brisk')).getByTestId('screening-export').click();
      await expect(page.getByTestId('screening-export-view')).toHaveAttribute('data-phase', 'done', { timeout: 120000 });
      const { mp4 } = await download(page, info.outputPath('offline.mp4'));
      expect(mp4.stts.reduce((n, [count]) => n + count, 0)).toBe(60);
    } finally { await context.setOffline(false); await server.stop(); }
  });
});
