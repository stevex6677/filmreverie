import { openViewingTools, closeViewingTools, captureCanvas } from "./helpers/viewing";
import {test,expect,Page} from '@playwright/test';
import {PNG} from 'pngjs';
import {getRegionMeanDifference,getRegionStats} from './helpers/pixelAnalysis';
const ready=async(page:Page)=>{await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false',{timeout:45000});await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true',{timeout:60000});};
test('M15 native multi-touch navigates across strips, anchors zoom, pins a loupe and recovers graphics',async({page,context},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',points:{x:number;y:number;id:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:3,radiusY:3,force:1}))});
  const drag=async(x:number,y:number,dx:number,dy:number)=>{await touch('touchStart',[{x,y,id:1}]);for(let i=1;i<=8;i++){await touch('touchMove',[{x:x+dx*i/8,y:y+dy*i/8,id:1}]);await page.waitForTimeout(40);}await touch('touchEnd',[]);};
  await page.goto('/?fixture=36&mode=inspect');await ready(page);
  await page.getByRole('button',{name:'Choose frame',exact:true}).tap();await page.getByRole('button',{name:'Open frame 6',exact:true}).tap();await ready(page);
  const canvas=page.locator('canvas'),rect=(await canvas.boundingBox())!,x=rect.x+rect.width/2,y=rect.y+rect.height/2;
  const before=PNG.sync.read(await captureCanvas(page));await drag(x+60,y,-120,0);await ready(page);await expect(page.locator('main')).toHaveAttribute('data-selected-frame','7');
  const after=PNG.sync.read(await captureCanvas(page));expect(getRegionMeanDifference(before,after,before.width/2|0,before.height/2|0,60)).toBeGreaterThan(3);
  const fit=Number(await page.locator('main').getAttribute('data-inspect-zoom'));
  await touch('touchStart',[{x:x-40,y,id:1},{x:x+40,y,id:2}]);for(let i=1;i<=8;i++){await touch('touchMove',[{x:x-40-i*5,y,id:1},{x:x+40+i*5,y,id:2}]);await page.waitForTimeout(60);}await touch('touchEnd',[]);
  await expect.poll(async()=>Number(await page.locator('main').getAttribute('data-inspect-zoom'))).toBeLessThan(fit*.65);
  await drag(x,y,70,0);await expect(page.locator('main')).toHaveAttribute('data-selected-frame','7');
  await page.getByRole('button',{name:'Reset framing',exact:true}).tap();await ready(page);await openViewingTools(page);await page.getByTestId('loupe-toggle').tap();await closeViewingTools(page);
  // M17 makes the object directly draggable; tapping its center enters
  // Inspection instead of placing an offset lens as the M15 gesture did.
  const initialDisplay=(await canvas.getAttribute('data-loupe-display'))!.split(',').map(Number);
  await drag(initialDisplay[0],initialDisplay[1],25,0);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state','activated');
  await page.waitForTimeout(500);
  const sample=await canvas.getAttribute('data-loupe-sample'),display=(await canvas.getAttribute('data-loupe-display'))!.split(',').map(Number);
  expect(display[0]-initialDisplay[0]).toBeGreaterThan(20);
  expect(display[0]-initialDisplay[0]).toBeLessThan(30);
  const lens=PNG.sync.read(await captureCanvas(page));expect(getRegionStats(lens,Math.round(display[0]),Math.round(display[1]),35).stdDev).toBeGreaterThan(3);
  await page.screenshot({path:info.outputPath('touch-loupe.png')});
  await touch('touchStart',[{x:x-30,y:y+80,id:1},{x:x+30,y:y+80,id:2}]);await touch('touchMove',[{x:x-40,y:y+90,id:1},{x:x+40,y:y+90,id:2}]);await touch('touchEnd',[]);expect(await canvas.getAttribute('data-loupe-sample')).toBe(sample);
  await page.waitForTimeout(500);
  const enlargedDisplay=(await canvas.getAttribute('data-loupe-display'))!.split(',').map(Number);
  expect(enlargedDisplay[2]/display[2]).toBeGreaterThan(1.2);
  const enlarged=PNG.sync.read(await captureCanvas(page));
  const barrelWidth=(png:PNG,position:number[])=>{
    const [cx,cy,r]=position,dark:number[]=[];
    for(let px=Math.ceil(cx-r*1.25);px<=Math.floor(cx+r*1.25);px++){
      const i=(Math.round(cy)*png.width+px)*4;
      if(Math.max(png.data[i],png.data[i+1],png.data[i+2])<55)dark.push(px);
    }
    return Math.max(...dark)-Math.min(...dark);
  };
  expect(barrelWidth(enlarged,enlargedDisplay)/barrelWidth(lens,display)).toBeGreaterThan(1.2);
  await page.screenshot({path:info.outputPath('touch-loupe-after-pinch.png')});
  // Context loss is injected as a fault; all navigation above is native input.
  await page.evaluate(()=>{const canvas=document.querySelector('canvas')!;const gl=canvas.getContext('webgl2')!;gl.getExtension('WEBGL_lose_context')!.loseContext();});
  await expect(page.getByRole('button',{name:'Restore view'})).toBeVisible();await page.getByRole('button',{name:'Restore view'}).tap();await ready(page);await expect(page.locator('main')).toHaveAttribute('data-selected-frame','7');
  await expect.poll(async()=>{const recovered=PNG.sync.read(await captureCanvas(page));return getRegionStats(recovered,recovered.width/2|0,recovered.height/2|0,60).stdDev;}).toBeGreaterThan(3);expect(errors).toEqual([]);
});
