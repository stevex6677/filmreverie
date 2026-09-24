import { openCamera } from './helpers/camera';
import { test, expect } from '@playwright/test';
import { PRIMARY_CAMERA } from '../../src/data/cameras';
import { ready } from './helpers/shelf';
import { offlineServer } from './helpers/offlineServer';
test.use({ actionTimeout: 15000 });

test('failed optional preparation preserves film readiness; uncached inspection can recover and reopen offline', async ({ page, context, browserName }) => {
  const server = await offlineServer();
  const reload = () => Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => location.reload())]);
  try {
    server.fail(PRIMARY_CAMERA.url);
    await page.goto(`${server.url}/?mode=room&reduced_motion=true`); await ready(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 90000 });
    await page.getByRole('button', { name: 'Rolls', exact: true }).click(); await ready(page);
    await page.getByRole('button', { name: 'Backups & offline' }).click();
    await page.getByText('Offline & storage', { exact: true }).click();
    await expect(page.locator('.offline-panel')).toContainText('The app and built-in photographs are downloaded.');
    await page.getByRole('button', { name: 'Download cameras for offline use' }).click();
    await expect(page.locator('.offline-panel [role="alert"]')).toContainText('Download incomplete');
    await expect(page.locator('.offline-panel')).toContainText('The app and built-in photographs are downloaded.');
    await expect(page.locator('.offline-panel')).not.toContainText('downloaded for offline inspection');
    // Match the existing M18 contract: WebKit's automation offline mode
    // rejects SW navigation before dispatch; Chrome exercises true offline
    // emulation, and both engines exercise a stopped server below.
    if (browserName !== 'webkit') await context.setOffline(true);
    await reload(); await ready(page);
    await page.getByRole('button', { name: 'Cameras', exact: true }).click(); await ready(page);
    await openCamera(page);
    await expect(page.locator('.camera-display [role="alert"]')).toContainText(browserName === 'webkit' ? 'could not be loaded' : "Camera model isn't available offline");
    await expect(page.getByRole('button', { name: 'Back to shelf' })).toBeEnabled();
    await expect(page.getByText('Introduced', { exact: true })).toBeAttached();
    server.fail(''); await context.setOffline(false);
    await page.getByRole('button', { name: 'Retry model' }).click();
    await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', { timeout: 90000 });
    if (browserName === 'webkit') await server.stop(); else await context.setOffline(true);
    await reload(); await ready(page);
    await page.getByRole('button', { name: 'Cameras', exact: true }).click(); await ready(page);
    await openCamera(page);
    await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready', 'true', { timeout: 90000 });
  } finally { await context.setOffline(false); await server.stop(); }
});
