import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GalleryRoll } from '../../src/cloud/contracts';
import { focusShelf, ready } from './helpers/shelf';

test.use({ storageState: { cookies: [], origins: [] } });

function photo() {
  const image = new PNG({ width: 180, height: 120 });
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4;
    image.data[i] = 40 + x; image.data[i + 1] = 40 + y; image.data[i + 2] = 100; image.data[i + 3] = 255;
  }
  return PNG.sync.write(image);
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  if (!server.listening) return;
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
}
function proxy(request: IncomingMessage, response: ServerResponse, baseURL: string) {
  const upstream = httpRequest(new URL(request.url!, baseURL), result => { response.writeHead(result.statusCode!, result.headers); result.pipe(response); });
  upstream.on('error', () => response.destroy()); upstream.end();
}

// The browser's IndexedDB names are checked without opening (and accidentally creating) the legacy library.
async function databases(page: Page) {
  return page.evaluate(async () => (await indexedDB.databases()).map(db => db.name));
}
test('owner room keeps the guest header with the admin menu after Create Your Own beside Lights', async ({ page, baseURL }, info) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${baseURL}/?mode=room&reduced_motion=true`); await ready(page);
    const mobile = await page.evaluate(() => matchMedia('(max-width: 1000px), (any-pointer: coarse)').matches);
    const header = page.locator(mobile ? '.mobile-header' : '.controls-header');
    const lights = header.getByRole(mobile ? 'button' : 'switch', { name: mobile ? 'Lights' : 'Room lights' });
    const admin = header.getByRole('button', { name: 'Admin menu' });
    const create = header.getByRole('link', { name: /Create Your Own/ });
    await expect(header.getByRole('button', { name: 'Rolls' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Cameras' })).toBeVisible();
    await expect(lights).toBeVisible(); await expect(admin).toBeVisible(); await expect(create).toBeVisible();
    await expect(page.getByRole('button', { name: 'Admin menu', exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /Create Your Own/ })).toHaveCount(1);
    const lightBox = (await lights.boundingBox())!, adminBox = (await admin.boundingBox())!, createBox = (await create.boundingBox())!;
    const center = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(center(lightBox) - center(adminBox))).toBeLessThan(4);
    expect(Math.abs(center(lightBox) - center(createBox))).toBeLessThan(4);
    expect(lightBox.x + lightBox.width).toBeLessThan(createBox.x);
    expect(createBox.x + createBox.width).toBeLessThan(adminBox.x);
    expect(adminBox.x + adminBox.width).toBeLessThanOrEqual(width);
    await admin.click();
    await expect(page.getByRole('menuitem', { name: 'Admin Login' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`admin-menu-${width}.png`) });
    await page.getByRole('menuitem', { name: 'Admin Login' }).press('Escape');
    await expect(admin).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.goto(`${baseURL}/guest?mode=room&reduced_motion=true`);
    const welcome = page.getByRole('button', { name: 'Enter guest darkroom' });
    await expect(welcome.or(page.locator('main[data-app-ready="true"]'))).toBeVisible();
    if (await welcome.isVisible()) await welcome.click();
    await ready(page);
    const guestHeader = page.locator(mobile ? '.mobile-header' : '.controls-header');
    await expect(guestHeader.getByRole(mobile ? 'button' : 'switch', { name: mobile ? 'Lights' : 'Room lights' })).toBeVisible();
    await expect(guestHeader.getByRole('button', { name: 'Admin' })).toHaveCount(0);
    await expect(guestHeader.getByRole('link', { name: /Create Your Own/ })).toHaveCount(0);
  }
});

test('Admin Login survives a null focus change and navigates in the same tab', async ({ page, context, baseURL }, info) => {
  await page.route('**/api/owner/session', route => route.request().isNavigationRequest()
    ? route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><h1>Admin sign-in</h1>' })
    : route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Owner login required.' }) }));
  await page.goto(`${baseURL}/?mode=room&reduced_motion=true`); await ready(page);
  await page.getByRole('button', { name: 'Admin menu' }).click();
  const menu = page.getByRole('menu', { name: 'Admin', exact: true });
  const login = menu.getByRole('menuitem', { name: 'Admin Login', exact: true });
  await expect(menu).toHaveText('Admin Login');
  await expect(login).not.toHaveAttribute('target', '_blank');
  // Safari can report a null relatedTarget during a touch-driven focus change.
  await login.evaluate(link => link.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null })));
  await expect(login).toBeVisible();
  const tabs = context.pages().length;
  if (info.project.use.hasTouch) await login.tap(); else await login.click();
  await expect(page).toHaveURL(`${baseURL}/api/owner/session`);
  await expect(page.getByRole('heading', { name: 'Admin sign-in' })).toBeVisible();
  expect(context.pages()).toHaveLength(tabs);
});

test('public home displays only published rolls in the physical cabinet and opens selected photographs read-only', async ({ page, baseURL }, info) => {
  const bytes = photo(), sha256 = createHash('sha256').update(bytes).digest('hex');
  const requests: string[] = [];
  const images = createServer((request, response) => {
    requests.push(request.url!);
    response.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    response.end(bytes);
  });
  let roll: GalleryRoll;
  const app = createServer((request, response) => {
    if (request.url === '/api/gallery') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ version: 1, rolls: [roll] })); return;
    }
    if (request.url?.startsWith('/api/owner/')) {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Owner authorization required.' })); return;
    }
    proxy(request, response, baseURL!);
  });
  try {
    const photos = await listen(images), origin = await listen(app);
    const image = (url: string) => ({ url, bytes: bytes.length, sha256 });
    roll = { id: 'published-roll', revision: 'revision-one', name: 'Published coastline', stockId: 'portra-400', format: '135', coverId: 'frame-one', publishedAt: 1,
      frames: [{ id: 'frame-one', width: 180, height: 120, rotation: 0, viewing: image(`${photos}/view.png`), thumbnail: image(`${photos}/thumb.png`) }] };
    await page.goto(`${origin}/?mode=inspect&reduced_motion=true`); await ready(page);
    await expect(page.getByRole('link', { name: /Create Your Own/ })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('button', { name: 'Admin menu', exact: true })).toBeVisible();
    const guestTab = page.waitForEvent('popup');
    await page.getByRole('link', { name: /Create Your Own/ }).click();
    const guest = await guestTab;
    await expect(guest).toHaveURL(/\/guest\?welcome=1$/);
    await expect(guest.getByRole('dialog', { name: 'Your guest darkroom' })).toBeVisible();
    await guest.getByRole('button', { name: 'Enter guest darkroom' }).click();
    await guest.goto(`${origin}/guest`);
    await expect(guest.getByRole('dialog', { name: 'Your guest darkroom' })).toHaveCount(0);
    await guest.close();
    const repeatTab = page.waitForEvent('popup');
    await page.getByRole('link', { name: /Create Your Own/ }).click();
    const returningGuest = await repeatTab;
    await expect(returningGuest).toHaveURL(/\/guest\?welcome=1$/);
    await expect(returningGuest.getByRole('dialog', { name: 'Your guest darkroom' })).toBeVisible();
    await returningGuest.close();
    await expect(page.getByRole('button', { name: 'New roll' })).toHaveCount(0);
    expect(await databases(page)).not.toContain('darkroom-rolls');
    await focusShelf(page);
    await expect(page.locator('[data-owned="true"]')).toHaveCount(1);
    await expect(page.locator('.shelf-toolbar')).toContainText('PUBLISHED GALLERY');
    await expect(page.getByRole('button', { name: 'Show published roll Published coastline' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveAttribute('data-shelf-covers', /published-roll.*frame-one/);
    await page.screenshot({ path: info.outputPath('public-shelf.png') });
    await expect.poll(() => requests.filter(url => url === '/view.png').length).toBe(0);
    const target = page.getByRole('button', { name: 'Show published roll Published coastline' });
    await target.focus(); await target.press('ArrowDown');
    const card = page.getByRole('dialog', { name: 'Published coastline — roll details' });
    await expect(card).toContainText('PUBLISHED ROLL');
    await expect(card.getByRole('button', { name: /Edit|Delete|Restore/ })).toHaveCount(0);
    await card.getByRole('button', { name: /Open on light table/ }).click();
    await expect(page.locator('main')).toHaveAttribute('data-roll-id', 'gallery:published-roll:revision-one');
    await expect.poll(() => requests.filter(url => url === '/view.png').length).toBe(1);
    expect(await databases(page)).not.toContain('darkroom-rolls');
    await page.getByRole('button', { name: 'Admin menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Admin Login' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Owner publishing' })).toHaveCount(0);
  } finally { await close(images); await close(app); }
});

test('guest welcome, deletable example and private edits stay in guest storage without owner API access', async ({ page, browser, baseURL }) => {
  const apiRequests: string[] = [];
  const app = createServer((request, response) => {
    if (request.url?.startsWith('/api/')) {
      apiRequests.push(`${request.method} ${request.url}`);
      response.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: 'Owner authorization required.' })); return;
    }
    proxy(request, response, baseURL!);
  });
  try {
    const origin = await listen(app);
    await page.goto(`${origin}/guest?mode=inspect&reduced_motion=true`);
    const welcome = page.getByRole('dialog', { name: 'Your guest darkroom' });
    await expect(welcome).toContainText('not uploaded or synced');
    await expect(welcome).toContainText('Clearing browser data');
    await welcome.getByRole('button', { name: 'Enter guest darkroom' }).click();
    await ready(page);
    await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Create Your Own/ })).toHaveCount(0);
    await focusShelf(page);
    await expect(page.locator('[data-owned="true"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Show saved roll Roll 01' }).click();
    await page.getByRole('button', { name: 'Delete Roll 01' }).click();
    await expect(page.getByRole('dialog', { name: 'Review roll' })).toHaveCount(0);
    await expect(page.locator('.shelf-toolbar')).toContainText('0 saved rolls');
    await expect(page.locator('[data-owned="true"]')).toHaveCount(0);
    await page.reload(); await ready(page);
    await expect(welcome).toHaveCount(0);
    await focusShelf(page);
    await expect(page.locator('.shelf-toolbar')).toContainText('0 saved rolls');
    await expect(page.locator('[data-owned="true"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'New roll' }).click();
    await page.getByLabel('Choose photographs', { exact: true }).setInputFiles({ name: 'private-location-source.png', mimeType: 'image/png', buffer: photo() });
    await expect(page.getByText('Processed 1 / 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to roll details' }).click();
    await page.getByLabel('Roll name', { exact: true }).fill('Private guest roll');
    await page.getByRole('button', { name: 'Review photographs' }).click();
    await page.getByRole('button', { name: 'Save and open', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Review roll' })).toHaveCount(0);
    const id = await page.locator('main').getAttribute('data-roll-id');
    expect(id).toBeTruthy(); expect(id).not.toBe('roll-01');
    await page.reload(); await ready(page);
    await expect(page.locator('main')).toHaveAttribute('data-roll-id', id!);
    expect(await databases(page)).toContain('darkroom-guest-rolls');
    expect(await databases(page)).not.toContain('darkroom-rolls');
    expect(apiRequests).toEqual([]);
    const otherContext = await browser.newContext();
    try {
      const other = await otherContext.newPage();
      await other.goto(`${origin}/guest?mode=inspect&reduced_motion=true`);
      await other.getByRole('button', { name: 'Enter guest darkroom' }).click(); await ready(other);
      await focusShelf(other);
      await expect(other.getByRole('button', { name: 'Show saved roll Private guest roll' })).toHaveCount(0);
      await expect(other.getByRole('button', { name: 'Show saved roll Roll 01' })).toBeVisible();
    } finally { await otherContext.close(); }
    expect(apiRequests).toEqual([]);
  } finally { await close(app); }
});

test('guest copies old on-origin rolls only after explicit migration and leaves the old library intact', async ({ page }) => {
  await page.goto('/guest?mode=inspect&reduced_motion=true');
  await page.getByRole('button', { name: 'Enter guest darkroom' }).click(); await ready(page);
  await focusShelf(page);
  await expect(page.getByRole('button', { name: 'Show saved roll Roll 01' })).toBeVisible();
  await page.evaluate(async () => {
    const open = (name: string) => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => {
        for (const name of ['rolls', 'frames', 'blobs']) request.result.createObjectStore(name, { keyPath: name === 'blobs' ? 'key' : 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const guest = await open('darkroom-guest-rolls'), previous = await open('darkroom-rolls');
    const from = guest.transaction(['rolls', 'frames', 'blobs']);
    const rows = await Promise.all(['rolls', 'frames', 'blobs'].map(name => new Promise<unknown[]>((resolve, reject) => {
      const request = from.objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })));
    const roll = { ...(rows[0][0] as { id: string; name: string }), id: 'previous-roll', name: 'Previous roll' };
    const tx = previous.transaction(['rolls', 'frames', 'blobs'], 'readwrite');
    tx.objectStore('rolls').put(roll);
    for (const frame of rows[1]) tx.objectStore('frames').put({ ...(frame as object), rollId: roll.id });
    for (const blob of rows[2]) tx.objectStore('blobs').put(blob);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    guest.close(); previous.close();
  });
  await page.reload(); await ready(page);
  await focusShelf(page);
  await expect(page.getByRole('button', { name: 'Show saved roll Previous roll' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Backups & offline' }).click();
  await page.getByRole('button', { name: 'Copy previous darkroom rolls' }).click();
  await expect(page.getByRole('dialog', { name: 'Backups and offline' }).getByRole('status')).toContainText('Copied 1 previous roll');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await focusShelf(page);
  await expect(page.getByRole('button', { name: 'Show saved roll Previous roll' })).toBeVisible();
  const legacy = await page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const open = indexedDB.open('darkroom-rolls');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, rows = db.transaction('rolls').objectStore('rolls').getAllKeys();
      rows.onerror = () => reject(rows.error);
      rows.onsuccess = () => { db.close(); resolve(rows.result.map(String)); };
    };
  }));
  expect(legacy).toEqual(['previous-roll']);
});
