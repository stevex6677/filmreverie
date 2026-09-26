import { test, expect } from '@playwright/test';
import { ready, focusShelf, showRoll } from './helpers/shelf';

test('New roll creation and photo import succeed on unsecured connections without crypto.subtle', async ({ page }) => {
  // Invalidate crypto.subtle and crypto.randomUUID to simulate an insecure context (e.g. HTTP over LAN)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { get: () => false });
    if (window.crypto) {
      delete (window.crypto as any).subtle;
      delete (window.crypto as any).randomUUID;
    }
  });

  await page.goto('/guest?mode=inspect&reduced_motion=true');
  await ready(page);
  await focusShelf(page);

  // Click 'New roll'
  await page.getByRole('button', { name: 'New roll', exact: true }).click();

  // Verify dialog is open and no secure connection error is shown
  const dialog = page.getByRole('dialog', { name: 'Review roll' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Photo import needs a secure connection')).toHaveCount(0);

  // Add photos
  await page.getByLabel('Choose photographs').setInputFiles('photos/roll-01/frame-01-harbor.png');
  await expect(page.getByText('1 photographs selected')).toBeVisible();

  // Continue to details
  await page.getByRole('button', { name: 'Continue to roll details' }).click();
  await page.getByLabel('Roll name', { exact: true }).fill('Unsecured Roll');

  // Review and save
  await page.getByRole('button', { name: 'Review photographs', exact: true }).click();
  await page.getByRole('button', { name: 'Save and open', exact: true }).click();

  // Verify saved and opened
  await expect(dialog).not.toBeVisible({ timeout: 15000 });
  await ready(page);

  // Roll is active on the light table
  await expect(page.locator('main')).toHaveAttribute('data-table-roll-available', 'true');

  // Verify roll appears on the shelf as owned
  await focusShelf(page);
  const card = await showRoll(page, 'Unsecured Roll');
  await expect(card).toBeVisible();
  await expect(card).toContainText('1 photograph');
});
