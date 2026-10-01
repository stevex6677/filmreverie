import { test, expect } from '@playwright/test';
import { ready } from './helpers/shelf';

test('guest layout stays automatic and empty menus are hidden across destinations', async ({ page }, info) => {
  // A retired Desktop preference must not strand a phone in that layout.
  await page.addInitScript(() => localStorage.setItem('darkroom-layout', 'desktop'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  const app = page.locator('main');
  const rollId = await app.getAttribute('data-roll-id');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const automaticMobile = await page.evaluate(() => matchMedia('(max-width: 1000px), (any-pointer: coarse)').matches);
    if (automaticMobile) await expect(app).toHaveClass(/mobile-layout/);
    else await expect(app).not.toHaveClass(/mobile-layout/);
    for (const destination of ['Room', 'Film Shelf', 'Cameras', 'Light Table']) {
      await page.locator('.film-strip-header').getByRole('button', { name: destination, exact: true }).click(); await ready(page);
      await expect(page.getByRole('button', { name: 'More options', exact: true })).toHaveCount(0);
      await expect(page.locator('.owner-nav-actions, .layout-menu-options')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
      await expect(app).toHaveAttribute('data-roll-id', rollId!);
    }
    await page.screenshot({ path: info.outputPath(`guest-no-empty-menu-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload(); await ready(page);
  await expect(app).toHaveClass(/mobile-layout/);
  await expect(page.getByRole('button', { name: 'More options', exact: true })).toHaveCount(0);
});

test('room lighting remains available without a Film Shelf shortcut in settings', async ({ page }, info) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Viewing tools', exact: true });
  await panel.getByRole('slider', { name: 'Room brightness', exact: true }).click();
  await panel.getByRole('slider', { name: 'Room brightness', exact: true }).fill('0.6');
  await expect(page.locator('main')).toHaveAttribute('data-room-brightness', '0.6');
  await expect(panel.getByRole('button', { name: 'Film Shelf', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('room-light-settings.png') });
});

test('public menu retains Admin Login without Layout in the room and camera cabinet', async ({ page }, info) => {
  await page.route('**/api/gallery', route => route.fulfill({ json: { version: 1, rolls: [] } }));
  await page.route('**/api/owner/session', route => route.fulfill({ status: 401, json: { error: 'Owner authorization required.' } }));
  await page.goto('/?mode=room&reduced_motion=true'); await ready(page);
  const trigger = page.getByRole('button', { name: 'More options', exact: true });
  for (const destination of ['Room', 'Cameras']) {
    await page.locator('.film-strip-header').getByRole('button', { name: destination, exact: true }).click(); await ready(page);
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'More options', exact: true });
    const login = menu.getByRole('menuitem', { name: 'Admin Login', exact: true });
    await expect(login).toBeVisible();
    await expect(login).toBeFocused();
    await expect(menu.getByRole('group', { name: 'Layout' })).toHaveCount(0);
    await expect(menu.getByRole('menuitemradio')).toHaveCount(0);
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: info.outputPath(`admin-menu-${destination}.png`) });
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});
