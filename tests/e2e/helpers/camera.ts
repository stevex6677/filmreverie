import { expect, type Page } from '@playwright/test';
import { CAMERAS, PRIMARY_CAMERA } from '../../../src/data/cameras';
import { CAMERA_SHELF_ORIGIN, cameraShelfSlot, mm } from '../../../src/data/physicalScale';
import { screenPoint } from './shelf';

export async function openCamera(page: Page, name = PRIMARY_CAMERA.name) {
  const label = page.getByRole('button', { name: `Inspect ${name}`, exact: true });
  if (await label.isVisible()) return label.click();
  const index = CAMERAS.findIndex(camera => camera.name === name);
  if (index < 0) throw new Error(`Unknown camera: ${name}`);
  await expect(page.locator('.canvas-wrapper canvas')).toHaveAttribute('data-camera-model-widths', new RegExp(`${CAMERAS[index].id}:`), { timeout: 90000 });
  const slot = cameraShelfSlot(index);
  const point = await screenPoint(page, [CAMERA_SHELF_ORIGIN[0] - slot.z, CAMERA_SHELF_ORIGIN[1] + slot.y + mm(60), CAMERA_SHELF_ORIGIN[2] + slot.x]);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}
