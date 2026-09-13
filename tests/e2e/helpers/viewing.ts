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
