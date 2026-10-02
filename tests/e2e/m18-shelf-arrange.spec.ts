import { test, expect, Page } from '@playwright/test';
import { add, focusShelf, ready, shelfAction, showRoll } from './helpers/shelf';

const cubby = (page: Page, slot: number) => page.locator(`[data-shelf-slot="${slot}"]`);
const target = (page: Page, slot: number) => cubby(page, slot).locator('.shelf-roll-target');
async function centre(page: Page, slot: number) {
  const box = (await target(page, slot).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('Arrange moves a roll into an empty cubby by tap, keyboard and drag, with undo and persistence', async ({ page }, info) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page); await focusShelf(page);
  await shelfAction(page, 'Arrange');
  const main = page.locator('main'), actions = page.getByRole('region', { name: 'Film shelf actions' });
  await expect(main).toHaveAttribute('data-shelf-arranging', 'true');
  await expect(actions.getByRole('heading', { name: 'Arranging shelf' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'New roll' })).toHaveCount(0);
  // A spare page lets rolls spread out; every cubby is a target.
  await expect(actions).toContainText('Page 1/2');
  await expect(page.locator('.shelf-roll-target')).toHaveCount(16);
  await expect(page.getByRole('button', { name: 'Empty cubby, page 1, row 1, column 2', exact: true })).toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('button', { name: 'Pick up Roll 01', exact: true }).click();
  await expect(main).toHaveAttribute('data-shelf-carrying', 'roll-01');
  await expect(actions.getByRole('status')).toHaveText('Picked up Roll 01. Choose a cubby.');
  await page.getByRole('button', { name: 'Move Roll 01 to page 1, row 2, column 2', exact: true }).click();
  await expect(cubby(page, 5)).toHaveAttribute('data-owned', 'true');
  await expect(cubby(page, 0)).toHaveAttribute('data-owned', 'false');
  await expect(main).toHaveAttribute('data-shelf-carrying', '');
  await expect(actions.getByRole('status')).toHaveText('Moved Roll 01 to page 1, row 2, column 2.');
  await page.screenshot({ path: `artifacts/shelf-arrange/${info.project.name}-moved.png` });

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cubby(page, 0)).toHaveAttribute('data-owned', 'true');
  await expect(cubby(page, 5)).toHaveAttribute('data-owned', 'false');

  // Keyboard: Enter picks up, arrows choose a cubby, Enter puts it down, Escape cancels a carry.
  await target(page, 0).focus(); await page.keyboard.press('Enter');
  await expect(main).toHaveAttribute('data-shelf-carrying', 'roll-01');
  await page.keyboard.press('ArrowRight');
  await expect(target(page, 1)).toBeFocused();
  await expect(target(page, 1)).toHaveClass(/is-target/);
  await page.keyboard.press('Escape');
  await expect(main).toHaveAttribute('data-shelf-carrying', '');
  await expect(main).toHaveAttribute('data-shelf-arranging', 'true');
  await target(page, 0).focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(cubby(page, 1)).toHaveAttribute('data-owned', 'true');

  // Drag: the shelf no longer pans away while arranging.
  const from = await centre(page, 1), to = await centre(page, 3);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, to.y, { steps: 6 });
  await expect(main).toHaveAttribute('data-shelf-carrying', 'roll-01');
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect(target(page, 3)).toHaveClass(/is-target/);
  await page.screenshot({ path: `artifacts/shelf-arrange/${info.project.name}-dragging.png` });
  await page.mouse.up();
  await expect(cubby(page, 3)).toHaveAttribute('data-owned', 'true');
  await expect(main).toHaveAttribute('data-shelf-focused', 'true');

  await page.keyboard.press('Escape');
  await expect(main).toHaveAttribute('data-shelf-arranging', 'false');
  await expect(actions).not.toContainText('Page 1/2');
  await page.reload(); await ready(page); await focusShelf(page);
  await expect(cubby(page, 3)).toHaveAttribute('data-owned', 'true');
  await expect(cubby(page, 0)).toHaveAttribute('data-owned', 'false');
});

test('Move on a roll card picks the roll up, and placing it on another roll swaps them', async ({ page }) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page); await focusShelf(page);
  await add(page, 'Second');
  await expect(cubby(page, 1)).toHaveAttribute('data-owned', 'true');
  const card = await showRoll(page, 'Second');
  await card.getByRole('button', { name: 'Move Second', exact: true }).click();
  const main = page.locator('main');
  await expect(card).not.toBeVisible();
  await expect(main).toHaveAttribute('data-shelf-arranging', 'true');
  await expect(target(page, 1)).toBeFocused();
  await expect(target(page, 1)).toHaveAccessibleName('Put Second back');
  await page.getByRole('button', { name: 'Swap Second with Roll 01', exact: true }).click();
  await expect(target(page, 0)).toHaveAccessibleName('Pick up Second');
  await expect(target(page, 1)).toHaveAccessibleName('Pick up Roll 01');
  await expect(page.getByRole('region', { name: 'Film shelf actions' }).getByRole('status')).toHaveText('Swapped Second with Roll 01.');
  await shelfAction(page, 'Done');
  await page.reload(); await ready(page); await focusShelf(page);
  await expect(page.getByRole('button', { name: 'Show saved roll Second', exact: true })).toHaveCount(1);
  await expect(cubby(page, 0).getByRole('button', { name: 'Show saved roll Second', exact: true })).toHaveCount(1);
});

test('Holding a dragged roll over the page arrow carries it onto the spare page', async ({ page }) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page); await focusShelf(page);
  await shelfAction(page, 'Arrange');
  const main = page.locator('main'), actions = page.getByRole('region', { name: 'Film shelf actions' });
  const from = await centre(page, 0), arrow = (await actions.getByRole('button', { name: 'Next shelf page' }).boundingBox())!;
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2, { steps: 10 });
  await expect(actions).toContainText('Page 2/2');
  await expect(main).toHaveAttribute('data-shelf-carrying', 'roll-01');
  const to = await centre(page, 21);
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(target(page, 21)).toHaveClass(/is-target/);
  await page.mouse.up();
  await expect(cubby(page, 21)).toHaveAttribute('data-owned', 'true');
  await expect(actions).toContainText('Page 2/3');
  await shelfAction(page, 'Done');
  await expect(actions).toContainText('Page 2/2');
  await expect(page.getByRole('button', { name: 'Show saved roll Roll 01', exact: true })).toHaveCount(1);
});
