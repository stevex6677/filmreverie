import { expect, Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { SHELF_CAMERA } from '../../../src/data/physicalScale';
export const ready = async (page: Page) => {
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready', 'true', { timeout: 60000 });
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning', 'false');
};
export async function screenPoint(page: Page, point: [number, number, number]) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const canvas = page.locator('canvas'), rect = (await canvas.boundingBox())!;
  const camera = new PerspectiveCamera(Number(await canvas.getAttribute('data-camera-fov')), rect.width / rect.height, .04, 100);
  camera.position.fromArray((await canvas.getAttribute('data-camera-position'))!.split(',').map(Number));
  camera.quaternion.fromArray((await canvas.getAttribute('data-camera-quaternion'))!.split(',').map(Number));
  camera.updateMatrixWorld();
  const p = new Vector3(...point).project(camera);
  return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
}
export async function focusShelf(page: Page) {
  if (await page.locator('main').getAttribute('data-shelf-focused') !== 'true') {
    await page.getByRole('button', { name: 'Rolls', exact: true }).click();
  }
  await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-shelf-focused', 'true');
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-position', SHELF_CAMERA.join(','));
  // Projected HTML hit regions update after the camera's Three.js matrices.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
export async function showRoll(page: Page, name: string) {
  await focusShelf(page);
  await page.getByRole('button', { name: `Show saved roll ${name}`, exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  return page.getByRole('dialog', { name: `${name} — roll details`, exact: true });
}
export async function openRoll(page: Page, name: string) {
  const card = await showRoll(page, name);
  await card.getByRole('button', { name: 'Open on light table' }).click();
  await expect(card).not.toBeVisible(); await ready(page);
}
export async function room(page: Page) {
  await page.getByTestId('return-room-btn').click(); await ready(page);
  await expect(page.locator('[data-shelf-slot]')).toHaveCount(16);
  await focusShelf(page);
}
export async function add(page: Page, name: string, stock = 'portra-400', format = '135') {
  await page.getByRole('button', { name: 'New roll', exact: true }).click();
  await page.getByLabel('Choose photographs').setInputFiles('photos/roll-01/frame-01-harbor.png');
  await page.getByRole('button', { name: 'Continue to roll details' }).click();
  await page.getByLabel('Roll name', { exact: true }).fill(name);
  await page.getByRole('dialog').getByLabel('Film stock', { exact: true }).selectOption(stock);
  if (format !== '135') await page.getByRole('radio', { name: '120', exact: true }).check();
  await page.getByLabel('Film format', { exact: true }).selectOption(format);
  await page.getByRole('button', { name: 'Review photographs', exact: true }).click();
  await page.getByRole('button', { name: 'Save and open', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 60000 }); await ready(page);
  await room(page);
}
