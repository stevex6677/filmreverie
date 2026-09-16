import { Page, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

// M16 moves viewing settings into Adjust. These helpers use the public UI;
// optical tests still exercise the production renderer and actual source assets.
export async function openViewingTools(page:Page) {
  if(await page.locator('main').getAttribute('data-room-mode')==='room')return;
  if(await page.getByRole('dialog',{name:'Viewing tools',exact:true}).isVisible())return;
  await page.getByRole('button',{name:'Adjust',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Viewing tools',exact:true})).toBeVisible();
}
export async function viewerKey(page:Page,key:string) {
  await closeViewingTools(page);await page.locator('.canvas-wrapper').focus();await page.keyboard.press(key);await openViewingTools(page);
}
export async function closeViewingTools(page:Page) {
  const tools=page.getByRole('dialog',{name:'Viewing tools',exact:true});
  if(await tools.isVisible())await tools.getByRole('button',{name:'Close',exact:true}).click();
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
  await page.getByRole('button',{name:'Choose frame',exact:true}).click();
  await page.getByRole('button',{name:`Open frame ${n}`,exact:true}).click();
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
  if(active)await page.getByTestId('loupe-activate').click();
}
export async function captureCanvas(page:Page,options?:{path?:string}) {
  // A locator screenshot also includes DOM panels over the canvas. Read the
  // actual framebuffer for optical comparisons; layout suites use page captures.
  const encoded=await page.locator('canvas').evaluate((node:HTMLCanvasElement)=>node.toDataURL('image/png').split(',')[1]);
  const buffer=Buffer.from(encoded,'base64');
  if(options?.path){await fs.mkdir(path.dirname(options.path),{recursive:true});await fs.writeFile(options.path,buffer);}
  return buffer;
}

/** Position the M17 physical loupe over a top-down surface point using a real
 * drag. Legacy optical tests used hover and an obsolete hard-coded lens height. */
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
  const lensWpp = 2 * (zoom - .008 - .19*scale) * Math.tan(Math.PI / 8) / box.height;
  const dx=(target[0]-sample[0])/lensWpp,dy=-(target[1]-sample[1])/lensWpp;
  if(Math.hypot(dx,dy)>.01) {
    await page.mouse.move(display[0],display[1]);await page.mouse.down();
    if(Math.hypot(dx,dy)<9)await page.mouse.move(display[0]+12,display[1],{steps:3});
    await page.mouse.move(display[0]+dx,display[1]+dy,{steps:12});await page.mouse.up();
  }
  await expect.poll(async()=>{
    const actual=(await canvas.evaluate(el=>(el as HTMLElement).dataset.loupeSample!)).split(',').map(Number);
    return Math.hypot(actual[0]-target[0],actual[1]-target[1]);
  }).toBeLessThan(.002);
  if(toolsWereOpen)await openViewingTools(page);
  const finalDisplay=(await canvas.evaluate(el=>(el as HTMLElement).dataset.loupeDisplay!)).split(',').map(Number);
  return {x:Math.round(finalDisplay[0]-box.x),y:Math.round(finalDisplay[1]-box.y)};
}
