import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GalleryRoll } from '../../src/cloud/contracts';

// A first visit: no stored tour or guest-welcome state.
test.use({ storageState: { cookies: [], origins: [] } });

const tour = (page: Page) => page.getByTestId('intro-tour');
const main = (page: Page) => page.locator('main');
const next = (page: Page) => page.getByRole('button', { name: 'Next step' }).click();

test('the first visit plays a guided tour that ends only when the visitor chooses', async ({ page }) => {
  await page.goto('/?reduced_motion=true');
  await expect(tour(page)).toBeVisible({ timeout: 60000 });
  await expect(tour(page)).toHaveAttribute('data-step', 'welcome');
  await expect(main(page)).toHaveAttribute('data-intro-tour', 'true');
  await expect(tour(page).getByRole('heading', { name: 'A darkroom for film photographs' })).toBeVisible();
  await expect(page.locator('.intro-tour-tag.is-shelf')).toHaveAttribute('data-shown', 'true', { timeout: 10000 });

  // Stray clicks, scrolls and app shortcuts neither pause nor close it.
  await page.mouse.click(640, 300);
  await page.mouse.wheel(0, 400);
  await page.keyboard.press('m');
  await expect(tour(page)).toBeVisible();
  await expect(tour(page)).toHaveAttribute('data-playing', 'true');
  await expect(tour(page).getByRole('status')).toContainText('The tour is playing');
  await expect(main(page)).toHaveAttribute('data-room-mode', 'room');

  // Escape pauses rather than closing; Space resumes.
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveAttribute('data-playing', 'false');
  await expect(tour(page)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(tour(page)).toHaveAttribute('data-playing', 'true');

  // It drives the real room: the shelf, then the light table with the sample roll as a negative.
  await next(page);
  await expect(tour(page)).toHaveAttribute('data-step', 'shelf');
  await expect(main(page)).toHaveAttribute('data-shelf-id', 'film');
  await next(page);
  await expect(tour(page)).toHaveAttribute('data-step', 'table');
  await expect(main(page)).toHaveAttribute('data-room-mode', 'inspect');
  await expect(main(page)).toHaveAttribute('data-film-mode', 'negative');
  await expect(page.getByText('No published roll on the light table')).toHaveCount(0);
  await next(page);
  await expect(tour(page)).toHaveAttribute('data-step', 'positive');
  await expect(main(page)).toHaveAttribute('data-film-mode', 'positive', { timeout: 10000 });
  await next(page); await next(page);
  await expect(tour(page)).toHaveAttribute('data-step', 'loupe');
  await expect(main(page)).toHaveAttribute('data-loupe-active', 'true');
  await expect(main(page)).toHaveAttribute('data-focus-mode', 'true');

  // Back returns to an earlier step from any state.
  await page.getByRole('button', { name: 'Go to Film shelf' }).click();
  await expect(tour(page)).toHaveAttribute('data-step', 'shelf');
  await expect(main(page)).toHaveAttribute('data-shelf-id', 'film');
  await expect(main(page)).toHaveAttribute('data-loupe-active', 'false');

  await page.getByRole('button', { name: 'Go to Cameras' }).click();
  await expect(tour(page)).toHaveAttribute('data-step', 'cabinet');
  await next(page);
  await expect(tour(page)).toHaveAttribute('data-step', 'camera');
  await expect(main(page)).not.toHaveAttribute('data-camera-display', '', { timeout: 10000 });

  // Skipping restores the room and is remembered.
  await page.getByTestId('intro-tour-skip').click();
  await expect(tour(page)).toHaveCount(0);
  await expect(main(page)).toHaveAttribute('data-intro-tour', 'false');
  await expect(main(page)).toHaveAttribute('data-camera-display', '');
  await expect(main(page)).toHaveAttribute('data-room-mode', 'room');
  await expect(main(page)).toHaveAttribute('data-shelf-id', '');
  await expect(main(page)).not.toHaveAttribute('inert');
  expect(await page.evaluate(() => localStorage.getItem('film-reverie-intro-tour'))).toBe('done');

  await page.reload();
  await expect(main(page)).toHaveAttribute('data-app-ready', 'true', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await expect(tour(page)).toHaveCount(0);

  // The menu replays it, and the final card hands over to the room.
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  await expect(tour(page)).toHaveAttribute('data-step', 'welcome', { timeout: 10000 });
  await page.getByRole('button', { name: 'Go to Cameras' }).click();
  await next(page); await next(page);
  await expect(tour(page)).toHaveAttribute('data-final', 'true');
  await page.getByTestId('intro-tour-done').click();
  await expect(tour(page)).toHaveCount(0);
  await expect(main(page)).toHaveAttribute('data-room-mode', 'room');
});

test('deep links and the guest darkroom skip the tour', async ({ page }) => {
  await page.goto('/?mode=room&reduced_motion=true');
  await expect(main(page)).toHaveAttribute('data-app-ready', 'true', { timeout: 60000 });
  await page.waitForTimeout(1500);
  await expect(tour(page)).toHaveCount(0);
  await page.goto('/guest?reduced_motion=true');
  await expect(page.getByRole('dialog', { name: 'Your guest darkroom' })).toBeVisible({ timeout: 60000 });
  await expect(tour(page)).toHaveCount(0);
});

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  if (!server.listening) return;
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
}

test('the tour lays the newest published roll on the table and leaves it there', async ({ page, baseURL }) => {
  const image = new PNG({ width: 180, height: 120 });
  image.data.fill(160);
  const bytes = PNG.sync.write(image), sha256 = createHash('sha256').update(bytes).digest('hex');
  const photos = createServer((_, response) => {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    response.end(bytes);
  });
  const rolls: GalleryRoll[] = [];
  const app = createServer((request, response) => {
    if (request.url === '/api/gallery') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ version: 1, rolls })); return;
    }
    if (request.url?.startsWith('/api/owner/')) { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end('{}'); return; }
    const upstream = httpRequest(new URL(request.url!, baseURL), result => { response.writeHead(result.statusCode!, result.headers); result.pipe(response); });
    upstream.on('error', () => response.destroy()); upstream.end();
  });
  try {
    const photoOrigin = await listen(photos), origin = await listen(app);
    const picture = (name: string) => ({ url: `${photoOrigin}/${name}.png`, bytes: bytes.length, sha256 });
    const roll = (id: string, publishedAt: number): GalleryRoll => ({ id, revision: 'one', name: id, stockId: 'portra-400', format: '135', coverId: `${id}-1`, publishedAt,
      frames: [1, 2, 3].map(n => ({ id: `${id}-${n}`, width: 180, height: 120, rotation: 0, viewing: picture(`${id}-${n}`), thumbnail: picture(`${id}-${n}-thumb`) })) });
    rolls.push(roll('older', 1), roll('newest', 2));
    await page.goto(`${origin}/?reduced_motion=true`);
    await expect(tour(page)).toHaveAttribute('data-step', 'welcome', { timeout: 60000 });
    // Give the roll time to arrive before the table step asks for it.
    await page.waitForTimeout(2500);
    await next(page); await next(page);
    await expect(tour(page)).toHaveAttribute('data-step', 'table');
    await expect(main(page)).toHaveAttribute('data-roll-id', 'gallery:newest:one');
    await expect(main(page)).toHaveAttribute('data-room-mode', 'inspect');
    await page.getByTestId('intro-tour-skip').click();
    await expect(tour(page)).toHaveCount(0);
    await expect(main(page)).toHaveAttribute('data-roll-id', 'gallery:newest:one');
    await expect(main(page)).toHaveAttribute('data-table-roll-available', 'true');
  } finally { await close(app); await close(photos); }
});
