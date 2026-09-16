import { Page, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TABLE_SURFACE_Y, TABLE_CENTER_Z } from '../../../src/utils/cameraBounds';
import { LOUPE_LENS_HEIGHT } from '../../../src/utils/loupeView';

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
  await page.getByRole('button',{name:'Choose frame',exact:true}).click();
  await page.getByRole('button',{name:`Open frame ${n}`,exact:true}).click();
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
}
export async function captureCanvas(page:Page,options?:{path?:string}) {
  // A locator screenshot also includes DOM panels over the canvas. Read the
  // actual framebuffer for optical comparisons; layout suites use page captures.
  const encoded=await page.locator('canvas').evaluate((node:HTMLCanvasElement)=>node.toDataURL('image/png').split(',')[1]);
  const buffer=Buffer.from(encoded,'base64');
  if(options?.path){await fs.mkdir(path.dirname(options.path),{recursive:true});await fs.writeFile(options.path,buffer);}
  return buffer;
}

// M17 replaced hover-follow with a draggable physical loupe. Older optical
// regressions still inspect the same surface points through normal pointer input.
export async function dragLoupeTo(page:Page, x:number, y:number, surfaceHeight=.006) {
  const wasOpen=await page.getByRole('dialog',{name:'Viewing tools',exact:true}).isVisible();
  await closeViewingTools(page);
  const canvas=page.locator('canvas'),box=(await canvas.boundingBox())!;
  const [cx,cy]=(await canvas.getAttribute('data-loupe-display'))!.split(',').map(Number);
  const [sx,sy]=(await canvas.getAttribute('data-loupe-sample'))!.split(',').map(Number);
  const [cameraX,cameraY,cameraZ]=(await canvas.getAttribute('data-camera-position'))!.split(',').map(Number);
  const scale=Number(await canvas.getAttribute('data-loupe-scale'));
  const planeWpp=2*(cameraY-TABLE_SURFACE_Y-surfaceHeight)*Math.tan(Math.PI/8)/box.height;
  const eyeWpp=2*(cameraY-TABLE_SURFACE_Y-.008-LOUPE_LENS_HEIGHT*scale)*Math.tan(Math.PI/8)/box.height;
  const tx=cameraX+(x-box.width/2)*planeWpp,ty=TABLE_CENTER_Z-cameraZ-(y-box.height/2)*planeWpp;
  const dx=(tx-sx)/eyeWpp,dy=-(ty-sy)/eyeWpp;
  if(Math.hypot(dx,dy)>.1) {
    await page.mouse.move(box.x+cx,box.y+cy);await page.mouse.down();
    if(Math.hypot(dx,dy)<9)await page.mouse.move(box.x+cx+12,box.y+cy,{steps:3});
    await page.mouse.move(box.x+cx+dx,box.y+cy+dy,{steps:10});await page.mouse.up();
  }
  await expect.poll(async()=>{
    const [ax,ay]=(await canvas.getAttribute('data-loupe-sample'))!.split(',').map(Number);
    return Math.hypot(ax-tx,ay-ty);
  }).toBeLessThan(.002);
  if(wasOpen)await openViewingTools(page);
}
