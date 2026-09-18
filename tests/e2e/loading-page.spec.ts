import { test, expect } from '@playwright/test';

test.describe('Darkroom Loading Page', () => {
  test('displays simple, clean loading page with Film Reverie and big loading status', async ({ page }) => {
    // Navigate to webapp
    await page.goto('/?mode=room');

    // The loading screen should be present
    const loader = page.getByTestId('darkroom-loader');
    await expect(loader).toBeAttached();

    // Verify branding: Film Reverie and Welcome to Film Reverie
    await expect(loader.locator('.loading-brand')).toHaveText('Film Reverie');
    await expect(loader.locator('.loading-welcome')).toHaveText('Welcome to Film Reverie');

    // Verify big loading status and progress track
    await expect(loader.locator('.status-primary')).toBeAttached();
    await expect(loader.locator('.status-text')).toBeAttached();
    await expect(loader.locator('.status-percent')).toBeAttached();
    await expect(loader.locator('.progress-track')).toBeAttached();

    // Wait until assets and app are fully loaded
    await expect(page.locator('main')).toHaveAttribute('data-assets-ready', 'true', { timeout: 30000 });
    await expect(page.locator('main')).toHaveAttribute('data-app-ready', 'true', { timeout: 30000 });

    // Once fully loaded, loader fades out and is dismissed
    await expect(loader).not.toBeVisible({ timeout: 15000 });

    // The dark room canvas and interactive scene are now accessible
    await expect(page.locator('.canvas-wrapper canvas')).toBeVisible();
  });
});
