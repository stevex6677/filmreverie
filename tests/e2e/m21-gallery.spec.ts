import { shelfAction, shelfMenu, expectShelfSummary, focusShelf, ready } from './helpers/shelf';
import { test, expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GalleryRoll } from '../../src/cloud/contracts';

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
test('owner film header keeps Create your own visible beside swipeable destinations', async ({ page, baseURL }, info) => {
  for (const width of [320, 390, 820, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${baseURL}/?mode=room&reduced_motion=true`); await ready(page);
    const header = page.locator('.mobile-header');
    const lights = header.getByRole('button', { name: 'Settings', exact: true });
    const admin = header.getByRole('button', { name: 'More options' });
    const create = header.getByRole('link', { name: /Create your own/i });
    await expect(header.getByRole('button', { name: 'Film Shelf' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Cameras' })).toBeVisible();
    await expect(lights).toBeVisible(); await expect(admin).toBeVisible();
    await expect(page.getByRole('button', { name: 'More options', exact: true })).toHaveCount(1);
    const lightBox = (await lights.boundingBox())!, adminBox = (await admin.boundingBox())!;
    const center = (box: { y: number; height: number }) => box.y + box.height / 2;
    if (width <= 700) expect(lightBox.y + lightBox.height).toBeLessThanOrEqual(adminBox.y);
    else {
      expect(Math.abs(center(lightBox) - center(adminBox))).toBeLessThan(4);
      expect(lightBox.x + lightBox.width).toBeLessThanOrEqual(adminBox.x);
    }
    expect(adminBox.x + adminBox.width).toBeLessThanOrEqual(width);
    await expect(create).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
    const createBox = (await create.boundingBox())!;
    expect(createBox.width).toBeGreaterThanOrEqual(44);
    expect(createBox.height).toBe(52);
    expect(createBox.x + createBox.width).toBeLessThanOrEqual(lightBox.x);
    const stripBox = (await header.locator('.film-strip-body').boundingBox())!;
    expect(createBox.y).toBeGreaterThanOrEqual(stripBox.y + 16);
    expect(createBox.y + createBox.height).toBeLessThanOrEqual(stripBox.y + 72);
    const destinations = header.getByRole('navigation', { name: 'Explore the darkroom' });
    const first = destinations.getByRole('button', { name: 'Room', exact: true });
    await first.focus();
    await page.keyboard.press('End');
    const last = destinations.getByRole('button', { name: 'Cameras', exact: true });
    await expect(last).toBeFocused();
    const lastBox = (await last.boundingBox())!, navBox = (await destinations.boundingBox())!;
    expect(lastBox.x + lastBox.width).toBeLessThanOrEqual(navBox.x + navBox.width + 1);
    if (width > 700) expect(lastBox.width).toBeLessThanOrEqual(105);
    else expect(await destinations.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
    expect((await create.boundingBox())!.x).toBe(createBox.x);
    await page.keyboard.press('Home');
    if (width <= 700 && info.project.use.hasTouch) {
      const cdp = await page.context().newCDPSession(page);
      const x = navBox.x + navBox.width - 10, y = navBox.y + navBox.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
      for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - (navBox.width - 20) * step / 6, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => destinations.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
      expect((await create.boundingBox())!.x).toBe(createBox.x);
      await cdp.detach();
      await page.keyboard.press('End'); await page.keyboard.press('Home');
    }
    await page.screenshot({ path: info.outputPath(`create-film-strip-${width}.png`) });
    await admin.click();
    await expect(page.getByRole('menuitem', { name: /Create your own/i })).toHaveCount(0);
    await expect(create).toHaveAttribute('target', '_blank');
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
    const guestHeader = page.locator('.mobile-header');
    await expect(guestHeader.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await expect(guestHeader.getByRole('button', { name: 'Admin' })).toHaveCount(0);
    await expect(guestHeader.getByRole('link', { name: /Create your own/i })).toHaveCount(0);
  }
});

test('Admin Login survives a null focus change and navigates in the same tab', async ({ page, context, baseURL }, info) => {
  await page.route('**/api/owner/session', route => route.request().isNavigationRequest()
    ? route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><h1>Admin sign-in</h1>' })
    : route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Owner login required.' }) }));
  await page.goto(`${baseURL}/?mode=room&reduced_motion=true`); await ready(page);
  await page.getByRole('button', { name: 'More options' }).click();
  const menu = page.getByRole('menu', { name: 'More options', exact: true });
  const login = menu.getByRole('menuitem', { name: 'Admin Login', exact: true });
  await expect(menu).toContainText('Admin Login');
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
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    await expect(page.getByRole('link', { name: /Create your own/i })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('button', { name: 'More options', exact: true })).toBeVisible();
    const guestTab = page.waitForEvent('popup');
    await page.getByRole('link', { name: /Create your own/i }).click();
    const guest = await guestTab;
    await expect(guest).toHaveURL(/\/guest\?welcome=1$/);
    await expect(guest.getByRole('dialog', { name: 'Your guest darkroom' })).toBeVisible();
    await guest.getByRole('button', { name: 'Enter guest darkroom' }).click();
    await guest.goto(`${origin}/guest`);
    await expect(guest.getByRole('dialog', { name: 'Your guest darkroom' })).toHaveCount(0);
    await guest.close();
    const repeatTab = page.waitForEvent('popup');
    await page.getByRole('link', { name: /Create your own/i }).click();
    const returningGuest = await repeatTab;
    await expect(returningGuest).toHaveURL(/\/guest\?welcome=1$/);
    await expect(returningGuest.getByRole('dialog', { name: 'Your guest darkroom' })).toBeVisible();
    await returningGuest.close();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'New roll' })).toHaveCount(0);
    expect(await databases(page)).not.toContain('darkroom-rolls');
    await focusShelf(page);
    await expect(page.locator('[data-owned="true"]')).toHaveCount(1);
    await expectShelfSummary(page, 'Published gallery');
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
    await ready(page);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const header = page.locator('.film-strip-header');
      const nav = header.getByRole('navigation', { name: 'Explore the darkroom' });
      await expect.poll(() => nav.evaluate(node => {
        const selected = node.querySelector('[aria-current="page"]')!.getBoundingClientRect(), rail = node.getBoundingClientRect();
        return selected.left >= rail.left - 1 && selected.right <= rail.right + 1;
      })).toBe(true);
      const create = header.getByRole('link', { name: 'Create your own', exact: true });
      const createBox = (await create.boundingBox())!;
      for (const name of ['Loupe', 'Settings', 'More options']) {
        const box = (await header.getByRole('button', { name, exact: true }).boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(createBox.x + createBox.width);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      await header.getByRole('button', { name: 'Loupe', exact: true }).click();
      await expect(page.locator('main')).toHaveAttribute('data-loupe-active', 'true');
      await header.getByRole('button', { name: 'Loupe', exact: true }).click();
      await expect(page.locator('main')).toHaveAttribute('data-loupe-active', 'false');
      await page.screenshot({ path: info.outputPath(`public-table-header-${width}.png`) });
    }
    await page.getByRole('button', { name: 'More options' }).click();
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
    await expect(welcome).not.toContainText('Export backups');
    await welcome.getByRole('button', { name: 'Enter guest darkroom' }).click();
    await ready(page);
    await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Create your own/i })).toHaveCount(0);
    await expect(page.locator('.shelf-toolbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New roll', exact: true })).toHaveCount(0);
    await focusShelf(page);
    await expect(page.getByRole('button', { name: 'Backups & offline' })).toHaveCount(0);
    await shelfMenu(page);await expect(page.getByRole('menuitem',{name:'New roll',exact:true})).toBeVisible();
    await page.getByRole('button', { name: 'Room', exact: true }).click(); await ready(page);
    await expect(page.locator('.shelf-toolbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New roll', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cameras', exact: true }).click(); await ready(page);
    await expect(page.getByRole('button', { name: 'New roll', exact: true })).toHaveCount(0);
    await focusShelf(page);
    await expect(page.locator('[data-owned="true"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Show saved roll Roll 01' }).click();
    await page.getByRole('button', { name: 'Delete Roll 01' }).click();
    await expect(page.getByRole('dialog', { name: 'Review roll' })).toHaveCount(0);
    await expectShelfSummary(page, '0 saved rolls');
    await expect(page.locator('[data-owned="true"]')).toHaveCount(0);
    await page.reload(); await ready(page);
    await expect(welcome).toHaveCount(0);
    await focusShelf(page);
    await expectShelfSummary(page, '0 saved rolls');
    await expect(page.locator('[data-owned="true"]')).toHaveCount(0);
    await shelfAction(page, 'New roll');
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

test('guest leaves old on-origin rolls intact and has no backup or migration controls', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Backups & offline' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy previous darkroom rolls' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Backups and offline' })).toHaveCount(0);
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
