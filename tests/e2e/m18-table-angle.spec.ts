import { test, expect, Page } from '@playwright/test';

const ready = async (page: Page) => {
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning', 'false', { timeout: 45000 });
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready', 'true', { timeout: 60000 });
};
const angles = async (page: Page) => (await page.locator('main').getAttribute('data-table-angle'))!.split(',').map(Number);
async function drag(page: Page, touch: boolean, browserName: string, dx: number, dy: number) {
  const { width, height } = page.viewportSize()!;
  const x = width / 2, y = height / 2;
  if (touch && browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x + dx * i / 8, y: y + dy * i / 8 }] });
      await page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else if (touch) {
    // Synthetic WebKit events bypass the native input/frame boundary after
    // clicking Adjust view. Let the canvas commit its new input mode first.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    for (let i = 0; i <= 9; i++) {
      await page.locator('canvas').dispatchEvent(i === 0 ? 'pointerdown' : i === 9 ? 'pointerup' : 'pointermove', {
        pointerId: 1, pointerType: 'touch', button: 0, buttons: i === 9 ? 0 : 1,
        clientX: x + dx * Math.min(i, 8) / 8, clientY: y + dy * Math.min(i, 8) / 8,
        bubbles: true, cancelable: true,
      });
      await page.waitForTimeout(30);
    }
  } else {
    await page.mouse.move(x, y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(x + dx * i / 8, y + dy * i / 8); await page.waitForTimeout(30); }
    await page.mouse.up();
  }
}

test('M18 angle drag owns input, restores browsing posture, and resets only angle', async ({ page, browserName }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?fixture=36&mode=inspect'); await ready(page);
  const main = page.locator('main'), canvas = page.locator('canvas');
  const pan = await main.getAttribute('data-inspect-pan'), zoom = await main.getAttribute('data-inspect-zoom');
  await page.getByRole('button', { name: 'Adjust view', exact: true }).click();
  await drag(page, !!info.project.use.hasTouch, browserName, 90, 100);
  const angle = await angles(page);
  expect(angle[0]).toBeGreaterThan(.2); expect(angle[1]).toBeGreaterThan(.2);
  expect(await main.getAttribute('data-inspect-pan')).toBe(pan);
  expect(await main.getAttribute('data-inspect-zoom')).toBe(zoom);
  await expect(main).toHaveAttribute('data-focus-mode', 'false');
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath('angled-table.png') });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Focus frame 1', exact: true }).click(); await ready(page);
  await expect(canvas).toHaveAttribute('data-table-angle', '0,0');
  await page.getByRole('button', { name: '← Overview', exact: true }).click(); await ready(page);
  expect(await angles(page)).toEqual(angle);
  await expect(canvas).toHaveAttribute('data-table-angle', angle.join(','));
  await page.getByTestId('loupe-activate').click();
  await page.getByTestId('inspect-loupe').click(); await ready(page);
  await expect(canvas).toHaveAttribute('data-table-angle', '0,0');
  await page.getByTestId('inspect-loupe').click(); await ready(page);
  await expect(canvas).toHaveAttribute('data-table-angle', angle.join(','));
  await page.getByTestId('put-away-loupe').click();
  await page.getByRole('button', { name: 'Adjust view', exact: true }).click();
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  expect(await angles(page)).toEqual([0, 0]);
  expect(await main.getAttribute('data-inspect-pan')).toBe(pan);
  expect(await main.getAttribute('data-inspect-zoom')).toBe(zoom);
  await page.keyboard.press('Escape'); await expect(main).toHaveAttribute('data-adjusting-view', 'false');
  await expect(main).toHaveAttribute('data-room-mode', 'inspect');
  expect(errors).toEqual([]);
});

test('M18 keyboard and Shift-drag adjust angle; ordinary dragging pans', async ({ page }) => {
  await page.goto('/?fixture=36&mode=inspect&deterministic=true'); await ready(page);
  const main = page.locator('main');
  await page.keyboard.down('Shift'); await drag(page, false, 'chromium', -80, 90); await page.keyboard.up('Shift');
  const angle = await angles(page);
  expect(angle[0]).toBeGreaterThan(.2); expect(angle[1]).toBeLessThan(-.2);
  const pan = await main.getAttribute('data-inspect-pan');
  await drag(page, false, 'chromium', 25, 20);
  expect(await angles(page)).toEqual(angle);
  expect(await main.getAttribute('data-inspect-pan'), `Loupe: ${await main.getAttribute('data-loupe-state')}, focus: ${await main.getAttribute('data-focus-mode')}`).not.toBe(pan);
  await page.getByRole('button', { name: 'Adjust view', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  expect((await angles(page))[1]).toBeGreaterThan(angle[1]);
  await page.keyboard.press('Escape'); await expect(main).toHaveAttribute('data-adjusting-view', 'false');
  await page.getByRole('button', { name: 'Adjust', exact: true }).click();
  await page.getByLabel('Table tilt', { exact: true }).fill('50');
  await page.getByLabel('Table yaw', { exact: true }).fill('-60');
  expect((await angles(page))[0]).toBeCloseTo(50 * Math.PI / 180);
  expect((await angles(page))[1]).toBeCloseTo(-Math.PI / 3);
});

test('M18 pinch zoom in angle mode preserves angle and cannot open a frame', async ({ page, browserName }) => {
  await page.goto('/?fixture=36&mode=inspect'); await ready(page);
  await page.getByRole('button', { name: 'Adjust view', exact: true }).click();
  await drag(page, true, browserName, 55, 90);
  const angle = await angles(page), main = page.locator('main');
  const zoom = Number(await main.getAttribute('data-inspect-zoom'));
  const { width, height } = page.viewportSize()!;
  const x = width / 2, y = height / 2;
  const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
  let previous: { id: number; x: number; y: number }[] = [];
  const touch = async (type: 'start' | 'move' | 'end', points: { id: number; x: number; y: number }[]) => {
    if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: type === 'start' ? 'touchStart' : type === 'move' ? 'touchMove' : 'touchEnd', touchPoints: points });
    else {
      for (const point of type === 'end' ? previous : points) await page.locator('canvas').dispatchEvent(type === 'start' ? 'pointerdown' : type === 'move' ? 'pointermove' : 'pointerup', {
        pointerId: point.id, pointerType: 'touch', clientX: point.x, clientY: point.y, button: 0, buttons: type === 'end' ? 0 : 1, bubbles: true, cancelable: true,
      });
    }
    previous = points; await page.waitForTimeout(40);
  };
  await touch('start', [{ id: 1, x: x - 30, y }, { id: 2, x: x + 30, y }]);
  for (let i = 1; i <= 6; i++) await touch('move', [{ id: 1, x: x - 30 - i * 5, y }, { id: 2, x: x + 30 + i * 5, y }]);
  await touch('end', []);
  expect(Number(await main.getAttribute('data-inspect-zoom'))).toBeLessThan(zoom * .7);
  expect(await angles(page)).toEqual(angle);
  await touch('start', [{ id: 1, x, y }]); await touch('end', []);
  await expect(main).toHaveAttribute('data-focus-mode', 'false');
  await expect(main).toHaveAttribute('data-adjusting-view', 'true');
  await cdp?.detach();
});
