import { type Page, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LOUPE_LENS_HEIGHT } from '../../../src/utils/loupeView';

// M16 moves viewing settings into Settings. These helpers use the public UI;
// optical tests still exercise the production renderer and actual source assets.
export async function openViewingTools(page:Page) {
  if(await page.locator('main').getAttribute('data-room-mode')==='room')return;
  if(await page.getByRole('dialog',{name:'Viewing tools',exact:true}).isVisible())return;
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Viewing tools',exact:true})).toBeVisible();
}
export async function viewerKey(page:Page,key:string) {
  await closeViewingTools(page);await page.locator('.canvas-wrapper').focus();await page.keyboard.press(key);await openViewingTools(page);
}
export async function closeViewingTools(page:Page) {
  const tools=page.getByRole('dialog',{name:'Viewing tools',exact:true});
  if(await tools.isVisible())await page.keyboard.press('Escape');
  await expect(tools).not.toBeVisible();
}
export async function selectOverviewFrame(page:Page,n:number) {
  await closeViewingTools(page);
  await page.keyboard.press(String(n));
  await openViewingTools(page);
}
export async function openFrame(page:Page,n:number) {
  await closeViewingTools(page);
  const active=await page.locator('main').getAttribute('data-loupe-active')==='true';
  if(await page.locator('main').getAttribute('data-loupe-state')==='inspection') {
    await page.getByTestId('inspect-loupe').click();
    await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
  }
  if(active)await page.getByTestId('put-away-loupe').click();
  if(await page.locator('main').getAttribute('data-focus-mode')!=='true') {
    await page.locator('.canvas-wrapper').focus(); await page.keyboard.press('Enter');
    await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
  }
  await page.getByRole('button',{name:'Choose frame',exact:true}).click();
  await page.getByRole('button',{name:`Open frame ${n}`,exact:true}).click();
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
  if(active)await page.getByTestId('loupe-activate').click();
}
export async function captureCanvas(page:Page,options?:{path?:string}) {
  // A locator screenshot includes DOM panels over the canvas. Wait for rendered
  // frames, not only control state: on software WebGL a timer can expire before
  // the next draw, and film-mode uniforms animate toward their new values.
  const encoded=await page.locator('canvas').evaluate(async (node:HTMLCanvasElement)=>{
    const started=performance.now();
    let frames=0;
    await new Promise<void>(resolve=>{
      const rendered=(now:number)=>{
        if(++frames>=2&&now-started>=500)resolve();
        else requestAnimationFrame(rendered);
      };
      requestAnimationFrame(rendered);
    });
    return node.toDataURL('image/png').split(',')[1];
  });
  const buffer=Buffer.from(encoded,'base64');
  if(options?.path){await fs.mkdir(path.dirname(options.path),{recursive:true});await fs.writeFile(options.path,buffer);}
  return buffer;
}

/** Drag to a page-space surface point; return the lens center in canvas pixels. */
export async function placeLoupeAtScreenPoint(page: Page, x: number, y: number, surfaceHeight = .006) {
  const toolsWereOpen = await page.getByRole('dialog', { name:'Viewing tools', exact:true }).isVisible();
  await closeViewingTools(page);
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
  const canvas = page.locator('canvas'), box = (await canvas.boundingBox())!;
  const [cx, cy] = (await canvas.getAttribute('data-loupe-display'))?.split(',').map(Number) ?? [];
  // Renderer uses camel-case dataset keys, exposed as dashed DOM attributes.
  const display = Number.isFinite(cx) ? [cx,cy] : (await canvas.evaluate(el=>(el as HTMLElement).dataset.loupeDisplay!)).split(',').map(Number);
  const sample = (await canvas.evaluate(el=>(el as HTMLElement).dataset.loupeSample!)).split(',').map(Number);
  const zoom = Number(await page.locator('main').getAttribute('data-inspect-zoom'));
  const pan = (await page.locator('main').getAttribute('data-inspect-pan'))!.split(',').map(Number);
  const scale = Number(await canvas.evaluate(el=>(el as HTMLElement).dataset.loupeScale));
  const wpp = 2 * (zoom - surfaceHeight) * Math.tan(Math.PI / 8) / box.height;
  const target = [pan[0] + (x-box.x-box.width/2)*wpp, -.1-pan[1] - (y-box.y-box.height/2)*wpp];
  const lensWpp = 2 * (zoom - .008 - LOUPE_LENS_HEIGHT*scale) * Math.tan(Math.PI / 8) / box.height;
  const dx=(target[0]-sample[0])/lensWpp,dy=-(target[1]-sample[1])/lensWpp;
  if(Math.hypot(dx,dy)>.01) {
    await page.mouse.move(box.x+display[0],box.y+display[1]);await page.mouse.down();
    if(Math.hypot(dx,dy)<9)await page.mouse.move(box.x+display[0]+12,box.y+display[1],{steps:3});
    await page.mouse.move(box.x+display[0]+dx,box.y+display[1]+dy,{steps:12});await page.mouse.up();
  }
  await expect.poll(async()=>{
    const actual=(await canvas.evaluate(el=>(el as HTMLElement).dataset.loupeSample!)).split(',').map(Number);
    return Math.hypot(actual[0]-target[0],actual[1]-target[1]);
  }).toBeLessThan(.002);
  if(toolsWereOpen)await openViewingTools(page);
  const finalDisplay=(await canvas.evaluate(el=>(el as HTMLElement).dataset.loupeDisplay!)).split(',').map(Number);
  return {x:Math.round(finalDisplay[0]),y:Math.round(finalDisplay[1])};
}

export async function openLoupeSettings(page: Page) {
  if (await page.getByRole('region', { name: 'Loupe settings', exact: true }).isVisible()) return;
  await page.getByTestId('loupe-customize').click();
  await expect(page.getByRole('region', { name: 'Loupe settings', exact: true })).toBeVisible();
}
export async function closeLoupeSettings(page: Page) {
  if (await page.getByRole('region', { name: 'Loupe settings', exact: true }).isVisible()) await page.getByRole('button', { name: 'Done', exact: true }).click();
}
