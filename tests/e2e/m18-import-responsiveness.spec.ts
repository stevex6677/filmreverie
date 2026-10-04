import { expect, test } from '@playwright/test';
import { ready, focusShelf, shelfAction } from './helpers/shelf';
import { photograph } from '../integration/m21-worker-fixtures';

test('roll details remain editable during worker processing and Save stays on the shelf', async ({ page }, info) => {
  // Hold actual worker input so this test does not depend on machine speed or image size.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const pending: Array<() => void> = [];
    Object.assign(window, { releaseImports: () => pending.splice(0).forEach(send => send()) });
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if(String(url).includes('photoDerivatives.worker')){
          const send=this.postMessage.bind(this);
          this.postMessage=(message: unknown)=>pending.push(()=>send(message));
        }
      }
    };
  });
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page); await focusShelf(page);
  const initialRoll = await page.locator('main').getAttribute('data-roll-id');
  await shelfAction(page, 'New roll');
  const editor = page.getByRole('dialog', { name: 'Review roll' });
  await editor.getByLabel('Choose photographs', { exact: true }).setInputFiles({ name: 'scan.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photograph()) });
  await expect.poll(() => page.workers().filter(worker => worker.url().includes('photoDerivatives.worker')).length).toBeGreaterThan(0);
  await editor.getByLabel('Roll name', { exact: true }).fill('Saved without opening');
  await editor.getByLabel('Camera (optional)', { exact: true }).fill('Nikon F3');
  await editor.getByRole('radio', { name: '120', exact: true }).check();
  await editor.getByLabel('Film stock', { exact: true }).selectOption('portra-800');
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Save and open', exact: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { releaseImports(): void }).releaseImports());
  await expect(editor.getByText('Processed 1 / 1', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Roll name', { exact: true })).toHaveValue('Saved without opening');
  // Adding another batch must not replace edits made to the earlier photographs.
  await editor.getByLabel('Choose photographs', { exact: true }).setInputFiles({ name: 'second.jpg', mimeType: 'image/jpeg', buffer: Buffer.concat([Buffer.from(photograph()), Buffer.from([0])]) });
  await expect.poll(() => page.workers().filter(worker => worker.url().includes('photoDerivatives.worker')).length).toBeGreaterThan(0);
  await editor.getByRole('button', { name: 'Vertically', exact: true }).click();
  await page.evaluate(() => (window as unknown as { releaseImports(): void }).releaseImports());
  await expect(editor.getByRole('button', { name: 'Select frame 2', exact: true })).toBeVisible();
  // Cancelling a third batch keeps the earlier photographs and edits usable.
  await editor.getByLabel('Choose photographs', { exact: true }).setInputFiles({ name: 'cancel.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photograph()) });
  await expect.poll(() => page.workers().filter(worker => worker.url().includes('photoDerivatives.worker')).length).toBeGreaterThan(0);
  await editor.locator('header').getByRole('button', { name: 'Cancel processing', exact: true }).click();
  await expect(editor).toContainText('Processing cancelled. Your earlier photographs are retained.');
  await expect(editor.getByRole('button', { name: 'Select frame 2', exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Select frame 3', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('save-buttons.png') });
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await expect(page.locator('main')).toHaveAttribute('data-roll-id', initialRoll!);
  const rotations = await page.evaluate(async () => {
    const request = indexedDB.open('darkroom-guest-rolls');
    return new Promise<number[]>((resolve, reject) => {
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result, frames=db.transaction('frames').objectStore('frames').getAll();
        frames.onsuccess=()=>{resolve(frames.result.filter(frame=>frame.filename==='scan.jpg').map(frame=>frame.rotation));db.close();};};
    });
  });
  expect(rotations).toEqual([90]);
  await page.getByRole('button', { name: 'Show saved roll Saved without opening', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Saved without opening', exact: true }).click();
  await expect(editor.getByLabel('Camera (optional)', { exact: true })).toHaveValue('Nikon F3');
  await expect(editor.getByLabel('Film stock', { exact: true })).toHaveValue('portra-800');
  await expect(editor.getByRole('radio', { name: '120', exact: true })).toBeChecked();
  await editor.getByLabel('Roll name', { exact: true }).fill('Edited with Save');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Show saved roll Edited with Save', exact: true })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
});

test('Save refreshes an already open roll without navigating away from the shelf', async ({ page }) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page); await focusShelf(page);
  await page.getByRole('button', { name: 'Show saved roll Roll 01', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Roll 01', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Review roll' });
  await expect(editor.getByLabel('Roll name', { exact: true })).toHaveValue('Roll 01');
  await editor.getByLabel('Film stock', { exact: true }).selectOption('ektachrome-e100');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible(); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await expect(page.locator('main')).toHaveAttribute('data-film-stock', 'ektachrome-e100');
  await page.reload(); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-film-stock', 'ektachrome-e100');
});
