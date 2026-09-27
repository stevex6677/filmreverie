import { test, expect } from '@playwright/test';
import { ready } from './helpers/shelf';

test('tablet nameplates share one row and hide when resized too narrow', async ({ page }, info) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  await page.getByRole('button', { name: 'Camera Cabinet', exact: true }).click(); await ready(page);
  const visible = page.locator('.camera-shelf-target:visible');
  for (const viewport of [{width:1024,height:768}, {width:1180,height:820}]) {
    await page.setViewportSize(viewport);
    await expect(visible).toHaveCount(5);
    await expect.poll(async () => visible.evaluateAll(buttons => {
      const rects = buttons.map(button => button.getBoundingClientRect());
      return rects.every((rect, i) => Math.abs(rect.y - rects[0].y) < 1 && rect.x >= 0
        && rect.right <= innerWidth && (!i || rect.x >= rects[i - 1].right + 7));
    })).toBe(true);
    await page.screenshot({path:`artifacts/mamiya-repair/${info.project.name}-${viewport.width}-row.png`});
  }
  for (const viewport of [{width:768,height:1024}, {width:390,height:844}, {width:1024,height:450}]) {
    await page.setViewportSize(viewport);
    await expect(visible).toHaveCount(0);
  }
  await page.setViewportSize({width:1024,height:768});
  await expect(visible).toHaveCount(5);
  await page.getByRole('button', {name:'Inspect Mamiya Universal',exact:true}).click();
  await expect(page.locator('.camera-display')).toHaveAttribute('data-model-ready','true',{timeout:90000});
});
