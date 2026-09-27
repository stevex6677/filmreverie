import { test, expect, type Page } from '@playwright/test';
import { focusShelf, ready } from './helpers/shelf';
import { mm, SHELF_ORIGIN, SHELF_CELL_MM } from '../../src/data/physicalScale';

async function panelBelowCube(page: Page) {
  const cube = page.getByRole('button', { name: 'Show saved roll Roll 01', exact: true });
  const card = page.getByRole('dialog', { name: 'Roll 01 — roll details', exact: true });
  await expect.poll(async () => {
    const a = await cube.boundingBox(), b = await card.boundingBox();
    const viewport = page.viewportSize()!;
    return !!a && !!b && a.y >= 0 && a.y + a.height <= b.y && b.x >= 0 && b.x + b.width <= viewport.width && b.y + b.height <= viewport.height + 1;
  }).toBe(true);
  return card;
}

test('a selected shelf compartment moves above its roll record, including corners and later pages', async ({ page }, info) => {
  await page.goto('/guest?mode=room'); await ready(page); await focusShelf(page);
  for (const slot of [0, 15, 21]) {
    await page.evaluate(async slot => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('darkroom-guest-rolls');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        const tx = db.transaction('rolls', 'readwrite');
        const request = tx.objectStore('rolls').get('roll-01');
        request.onsuccess = () => tx.objectStore('rolls').put({ ...request.result, shelfSlot: slot });
        await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); });
      } finally { db.close(); }
    }, slot);
    await page.reload(); await ready(page); await focusShelf(page);
    if (slot >= 16) await page.getByRole('button', { name: 'Next shelf page', exact: true }).click();
    const cube = page.getByRole('button', { name: 'Show saved roll Roll 01', exact: true });
    const fullPose = await page.locator('canvas').getAttribute('data-camera-position');
    if (info.project.use.hasTouch) await cube.tap(); else await cube.click();
    const card = await panelBelowCube(page);
    await expect(page.locator('main')).toHaveAttribute('data-shelf-roll-focused', 'roll-01');
    await expect(page.getByRole('dialog', { name: 'Review roll' })).toHaveCount(0);
    await expect(card).toContainText('Kodak Portra 400');
    await expect(card.getByRole('button', { name: 'Open on light table' })).toBeVisible();
    await expect.poll(async () => Number((await page.locator('canvas').getAttribute('data-camera-position'))!.split(',')[2])).toBe(SHELF_ORIGIN[2] + mm(SHELF_CELL_MM.depth / 2) + 1.65);
    await page.screenshot({ path: info.outputPath(`focused-slot-${slot}.png`) });
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect.poll(() => page.locator('canvas').getAttribute('data-camera-position')).toBe(fullPose);
    await expect(cube).toBeFocused();
  }
});

test('roll details separate selection from edit, delete, undo and opening photographs', async ({ page }, info) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page); await focusShelf(page);
  const cube = page.getByRole('button', { name: 'Show saved roll Roll 01', exact: true });
  await cube.focus(); await cube.press('Enter');
  let card = await panelBelowCube(page);
  await card.getByRole('button', { name: 'Edit Roll 01', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Review roll', exact: true });
  await expect(editor.getByLabel('Roll name', { exact: true })).toHaveValue('Roll 01');
  await editor.getByRole('button', { name: 'Cancel edits', exact: true }).click();
  await ready(page); await focusShelf(page);
  if (info.project.use.hasTouch) await cube.tap(); else await cube.click();
  card = await panelBelowCube(page);
  await card.getByRole('button', { name: 'Delete Roll 01', exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.shelf-toolbar')).toContainText('0 saved rolls');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cube).toBeVisible();
  await cube.focus(); await cube.press('ArrowDown');
  card = await panelBelowCube(page);
  await card.getByRole('button', { name: 'Open on light table' }).click();
  await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'inspect');
  await expect(page.locator('main')).toHaveAttribute('data-roll-id', 'roll-01');
  await expect(card).toHaveCount(0);
});
