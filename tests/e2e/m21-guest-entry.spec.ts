import { test, expect } from '@playwright/test';
import { openRoll, ready } from './helpers/shelf';

test.use({ storageState: { cookies: [], origins: [] } });

test('guest lands in the darkroom on first visit and after restoring a saved roll', async ({ page }) => {
  await page.goto('/guest?reduced_motion=true');
  await page.getByRole('button', { name: 'Enter guest darkroom', exact: true }).click();
  await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await openRoll(page, 'Roll 01');
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'inspect');
  const rollId = await page.locator('main').getAttribute('data-roll-id');
  await page.goto('/guest'); await ready(page);
  // Wait for the asynchronous saved-roll restoration, not only the initial room.
  await expect(page.locator('main')).toHaveAttribute('data-roll-id', rollId!);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'room');
  await expect(page.getByRole('dialog', { name: 'Your guest darkroom' })).toHaveCount(0);
  await openRoll(page, 'Roll 01');
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'inspect');
  await page.goto('/guest?mode=inspect&reduced_motion=true'); await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-roll-id', rollId!);
  await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'inspect');
});
