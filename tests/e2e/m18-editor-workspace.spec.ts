import { test, expect } from '@playwright/test';
import { ready, focusShelf } from './helpers/shelf';
import fs from 'node:fs/promises';
const OUT = process.env.M18_REVIEW_DIR || 'artifacts/m18-candidates';

test('M18 dragging the cabinet moves the room view, and a click still approaches it', async ({page,context,browserName}) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page);
  const app = page.locator('main'), cabinet = page.getByRole('button',{name:'View film shelf',exact:true});
  const pose = async () => (await app.getAttribute('data-room-pose'))!.split(',').map(Number);
  const before = await pose(), box = (await cabinet.boundingBox())!, x = box.x+box.width/2, y = box.y+box.height/2;
  await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+40,y+20,{steps:8}); await page.mouse.up();
  const after = await pose(); expect(after[0]-before[0]).toBeCloseTo(40*.0035,3); expect(after[1]-before[1]).toBeCloseTo(-20*.0035,3);
  await expect(app).toHaveAttribute('data-shelf-focused','false');
  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page), rect = (await cabinet.boundingBox())!;
    const tx = rect.x+rect.width/2, ty = rect.y+rect.height/2, start = await pose();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:1}]});
    for (let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+40*i/8,y:ty,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(async()=>(await pose())[0]).toBeGreaterThan(start[0]+.08);
    await expect(app).toHaveAttribute('data-shelf-focused','false'); await cdp.detach();
  }
  await cabinet.click(); await ready(page); await expect(app).toHaveAttribute('data-shelf-focused','true');
});

test('M18 package opens one editor with details left, frames above crop, and persistent changes', async ({page},info) => {
  await page.goto('/guest?mode=room&reduced_motion=true'); await ready(page); await focusShelf(page);
  const packageButton = page.getByRole('button',{name:'Show saved roll Roll 01',exact:true});
  if (info.project.use.hasTouch) await packageButton.tap(); else await packageButton.click();
  const editor = page.getByRole('dialog',{name:'Review roll',exact:true});
  await expect(editor.getByRole('heading',{name:'Edit roll',exact:true})).toBeVisible();
  await expect(editor.getByRole('navigation',{name:'Import progress'})).toHaveCount(0);
  await expect(editor.getByRole('button',{name:'Review photographs',exact:true})).toHaveCount(0);
  await expect(editor.getByLabel('Roll name',{exact:true})).toHaveValue('Roll 01');
  await expect(editor.getByRole('button',{name:'Select frame 5',exact:true})).toBeVisible();
  if (page.viewportSize()!.width > 700) {
    const left = (await editor.locator('.roll-editor-details').boundingBox())!, right = (await editor.locator('.roll-editor-frames').boundingBox())!;
    const frames = (await editor.locator('.draft-photos').boundingBox())!, crop = (await editor.locator('.crop-stage').boundingBox())!;
    expect(left.x+left.width).toBeLessThan(right.x); expect(frames.y+frames.height).toBeLessThan(crop.y);
  }
  await editor.getByRole('radio',{name:'120',exact:true}).check();
  await editor.getByLabel('Film format',{exact:true}).selectOption('66');
  await editor.getByRole('button',{name:'Select frame 2',exact:true}).click();
  await editor.getByLabel('Horizontal crop position').fill('0.4');
  await editor.getByRole('button',{name:'Cover',exact:true}).click();
  await editor.getByLabel('Roll name',{exact:true}).fill('Edited on the shelf');
  await fs.mkdir(OUT,{recursive:true}); await page.screenshot({path:`${OUT}/${info.project.name}-combined-editor.png`});
  await editor.getByRole('button',{name:'Save and open',exact:true}).click(); await expect(editor).not.toBeVisible(); await ready(page);
  await page.reload(); await ready(page); await focusShelf(page);
  await page.getByRole('button',{name:'Show saved roll Edited on the shelf',exact:true}).click();
  await expect(editor.getByLabel('Film format',{exact:true})).toHaveValue('66');
  await editor.getByRole('button',{name:'Select frame 2',exact:true}).click();
  await expect(editor.getByLabel('Horizontal crop position')).toHaveValue('0.4');
  await expect(editor.getByRole('button',{name:'Cover',exact:true})).toHaveAttribute('aria-pressed','true');
  await editor.getByLabel('Roll name',{exact:true}).fill('Discard this change');
  await editor.getByRole('button',{name:'Cancel edits',exact:true}).click();
  await page.getByRole('button',{name:'Show saved roll Edited on the shelf',exact:true}).click();
  await editor.getByRole('button',{name:'Delete Edited on the shelf',exact:true}).click();
  await expect(editor).not.toBeVisible(); await expect(page.locator('[data-owned="true"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.locator('[data-owned="true"]')).toHaveCount(1);
});
