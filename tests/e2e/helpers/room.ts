import { expect, type Page } from '@playwright/test';

export async function openRoomLights(page: Page) {
  const panel = page.getByRole('dialog', { name: 'Viewing tools', exact: true });
  if (!await panel.isVisible()) await page.getByRole('button', { name: 'Lights', exact: true }).click();
  await expect(panel).toBeVisible();
  return panel;
}

export async function approachTable(page: Page) {
  const panel = await openRoomLights(page);
  await panel.getByTestId('approach-table-btn').click();
}

export async function faceTable(page: Page) {
  const panel = await openRoomLights(page);
  await panel.getByRole('button', { name: 'Face table', exact: true }).click();
  await page.locator('.canvas-wrapper').focus();
}
