import { BASELINE_ROLL } from '../../src/utils/rollLayout';
import { DEFAULT_LAYOUT } from '../../src/utils/loupeMapping';
import { test, expect, Page } from '@playwright/test';
import { getPerforationPositions } from '../../src/utils/loupeMapping';
import { PNG } from 'pngjs';
import { captureCanvas, openLoupeSettings, closeLoupeSettings } from './helpers/viewing';
import { getRegionMeanDifference, getRegionStats } from './helpers/pixelAnalysis';
const MIN_MOVEMENT = .001 * BASELINE_ROLL.scale; // Same native-film movement threshold after physical scale conversion.
const ready=async(page:Page)=>{await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false',{timeout:30000});await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true',{timeout:60000});};
const display=async(page:Page)=>(await page.locator('canvas').getAttribute('data-loupe-display'))!.split(',').map(Number);
const sample=async(page:Page)=>(await page.locator('canvas').getAttribute('data-loupe-sample'))!.split(',').map(Number);
const pose=async(page:Page)=>(await page.locator('canvas').getAttribute('data-camera-position'))!.split(',').map(Number);
const open=async(page:Page)=>{await page.goto('/guest?mode=inspect');await ready(page);await page.locator('.canvas-wrapper').focus();await page.keyboard.press('Enter');await ready(page);await page.getByRole('button',{name:'Choose frame',exact:true}).click();await page.getByRole('button',{name:'Open frame 3',exact:true}).click();await ready(page);await page.getByTestId('loupe-activate').click();await page.waitForTimeout(350);};

// Chromium exercises native contacts through CDP; WebKit exercises its Pointer
// Event path with dispatched contacts (physical Safari ergonomics remain review).
async function contacts(page:Page,browserName:string){
  const cdp=browserName==='chromium'?await page.context().newCDPSession(page):null;
  let previous:{id:number;x:number;y:number}[]=[];
  return async(type:'start'|'move'|'end',points:{id:number;x:number;y:number}[])=>{
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:type==='start'?'touchStart':type==='move'?'touchMove':'touchEnd',touchPoints:points.map(p=>({...p,radiusX:3,radiusY:3,force:1}))});
    else await page.locator('canvas').evaluate((canvas,{type,points,previous})=>{
      for(const p of type==='end'?previous:points)canvas.dispatchEvent(new PointerEvent(type==='start'?'pointerdown':type==='move'?'pointermove':'pointerup',{pointerId:p.id,pointerType:'touch',clientX:p.x,clientY:p.y,bubbles:true,cancelable:true,buttons:type==='end'?0:1}));
    },{type,points,previous});
    previous=points;await page.waitForTimeout(40);
  };
}

test('M17 pickup preserves physical size while camera zoom changes apparent size',async({page,browserName})=>{
  await open(page);
  const canvas=page.locator('canvas'),main=page.locator('main');
  const scale=await canvas.getAttribute('data-loupe-scale'),wideRadius=(await display(page))[2];
  const wideZoom=Number(await main.getAttribute('data-inspect-zoom'));
  await page.getByTestId('put-away-loupe').click();
  await page.mouse.move(page.viewportSize()!.width/2,page.viewportSize()!.height/2);
  for(let i=0;i<2;i++){
    if(browserName==='webkit')await canvas.dispatchEvent('wheel',{deltaY:-100,cancelable:true});
    else await page.mouse.wheel(0,-100);
    await page.waitForTimeout(100);
  }
  const nearZoom=Number(await main.getAttribute('data-inspect-zoom'));expect(nearZoom).toBeLessThan(wideZoom);
  await page.getByTestId('loupe-activate').click();await page.waitForTimeout(700);
  expect(await canvas.getAttribute('data-loupe-scale')).toBe(scale);
  expect(Number(await main.getAttribute('data-inspect-zoom'))).toBe(nearZoom);
  expect((await display(page))[2]).toBeGreaterThan(wideRadius*1.2);
  const nearRadius=(await display(page))[2];
  await page.getByTestId('put-away-loupe').click();await page.getByTestId('loupe-activate').click();await page.waitForTimeout(150);
  expect(await canvas.getAttribute('data-loupe-scale')).toBe(scale);expect((await display(page))[2]).toBeCloseTo(nearRadius,1);
});

test('M17 drag versus tap, smooth lens framing, optical effects and exact pull back',async({page,browserName},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page);const original=await pose(page),before=await sample(page);const [x,y]=await display(page);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+34,y-15,{steps:8});await page.mouse.up();await page.waitForTimeout(350);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state','activated');const moved=await sample(page);expect(Math.hypot(moved[0]-before[0],moved[1]-before[1])).toBeGreaterThan(MIN_MOVEMENT);
  const [cx,cy]=await display(page);await page.mouse.click(cx,cy);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state','inspection');
  await page.waitForTimeout(80);const intermediate=await pose(page);
  await ready(page);const close=await pose(page);
  // An enlarged lens can require a slight pull back from an already close
  // table view. Inspection must animate toward its framing in either direction.
  const travel=close[1]-original[1];expect(Math.abs(travel)).toBeGreaterThan(.0001);
  const progress=(intermediate[1]-original[1])/travel;expect(progress).toBeGreaterThan(0);expect(progress).toBeLessThan(1);
  const [lx,ly,r]=await display(page);expect(r).toBeGreaterThan(Math.min(page.viewportSize()!.width,page.viewportSize()!.height)*.42);
  await page.screenshot({path:info.outputPath('inspection-initial.png')});
  const on=PNG.sync.read(await captureCanvas(page));expect(getRegionStats(on,Math.round(lx),Math.round(ly),Math.round(r*.4)).stdDev).toBeGreaterThan(3);
  await page.screenshot({path:info.outputPath('inspection-effects-on.png')});
  await openLoupeSettings(page);await page.getByTestId('loupe-effects').click();await closeLoupeSettings(page);await expect(page.locator('main')).toHaveAttribute('data-loupe-effects','false');await page.waitForTimeout(100);
  const off=PNG.sync.read(await captureCanvas(page));expect(getRegionMeanDifference(on,off,Math.round(lx+r*.60),Math.round(ly),15)).toBeGreaterThan(.2);
  await openLoupeSettings(page);await page.getByTestId('mag-btn-8x').click();await closeLoupeSettings(page);await page.waitForTimeout(150);expect(await pose(page)).toEqual(close);
  expect(getRegionMeanDifference(off,PNG.sync.read(await captureCanvas(page)),Math.round(lx),Math.round(ly),Math.round(r*.6))).toBeGreaterThan(2);
  await page.screenshot({path:info.outputPath('inspection-effects-off-8x.png')});
  await page.mouse.move(lx,ly);if(browserName==='webkit'){await page.locator('canvas').dispatchEvent('wheel',{deltaY:-600,cancelable:true});await page.locator('canvas').dispatchEvent('wheel',{deltaY:600,cancelable:true});}else{await page.mouse.wheel(0,-600);await page.mouse.wheel(0,600);}await page.waitForTimeout(200);expect(await pose(page)).toEqual(close);
  await page.mouse.down();await page.mouse.move(lx+60,ly+25,{steps:8});await page.mouse.up();await page.waitForTimeout(150);
  const shifted=await sample(page);expect(Math.hypot(shifted[0]-moved[0],shifted[1]-moved[1])).toBeGreaterThan(MIN_MOVEMENT);expect((await pose(page))[1]).toBe(close[1]);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state','inspection');
  const [backX,backY]=await display(page);await page.mouse.click(backX,backY);await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state','activated');expect(await pose(page)).toEqual(original);expect(await sample(page)).toEqual(shifted);
  await page.screenshot({path:info.outputPath('activated-return.png')});
  await page.getByTestId('put-away-loupe').click();await expect(page.locator('main')).toHaveAttribute('data-loupe-state','inactivated');
  await page.reload();await ready(page);await page.getByTestId('loupe-activate').click();await page.getByTestId('inspect-loupe').click();await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-effects','false');await openLoupeSettings(page);await expect(page.getByTestId('mag-btn-8x')).toHaveAttribute('aria-pressed','true');expect(errors).toEqual([]);
});

test('M17 touch drag preserves grab point; pinch cannot inspect or zoom the eye; translation works',async({page,browserName},info)=>{
  await page.setViewportSize({width:820,height:1180});await open(page);const touch=await contacts(page,browserName),original=await pose(page);
  const [x,y,r]=await display(page),before=await sample(page);
  await touch('start',[{id:1,x:x+r*.65,y}]);await touch('move',[{id:1,x:x+r*.65+28,y:y+20}]);await touch('end',[]);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state','activated');const after=await sample(page);expect(Math.hypot(after[0]-before[0],after[1]-before[1])).toBeGreaterThan(MIN_MOVEMENT);
  const [cx,cy]=await display(page);await touch('start',[{id:1,x:cx,y:cy},{id:2,x:cx+50,y:cy}]);await touch('end',[]);await expect(page.locator('main')).toHaveAttribute('data-loupe-state','activated');
  await page.getByTestId('inspect-loupe').click();await ready(page);const eye=await pose(page),power=await page.locator('canvas').getAttribute('data-loupe-magnification');
  await touch('start',[{id:1,x:330,y:500},{id:2,x:490,y:500}]);
  for(let i=1;i<=6;i++)await touch('move',[{id:1,x:330-i*10,y:500},{id:2,x:490+i*10,y:500}]);
  await touch('end',[]);expect((await pose(page))[1]).toBe(eye[1]);expect(await page.locator('canvas').getAttribute('data-loupe-magnification')).toBe(power);
  const stationary=await sample(page);await touch('start',[{id:1,x:330,y:500},{id:2,x:490,y:500}]);await touch('move',[{id:1,x:350,y:525},{id:2,x:510,y:525}]);await touch('end',[]);
  const translated=await sample(page);expect(Math.hypot(translated[0]-stationary[0],translated[1]-stationary[1])).toBeGreaterThan(MIN_MOVEMENT);expect((await pose(page))[1]).toBe(eye[1]);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state','inspection');
  const [backX,backY]=await display(page);await touch('start',[{id:1,x:backX,y:backY}]);await touch('end',[]);await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-loupe-state','activated');expect(await pose(page)).toEqual(original);expect(await sample(page)).toEqual(translated);
  await page.getByTestId('inspect-loupe').click();await ready(page);
  for(const [width,height] of [[820,1180],[390,844],[375,667],[844,390],[1180,820]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(250);await ready(page);
    await expect(page.getByTestId('inspect-loupe')).toBeVisible();await expect(page.getByTestId('loupe-customize')).toBeVisible();
    for(const b of await page.locator('.loupe-controls button').all()) {const box=(await b.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);expect(box.y+box.height).toBeLessThanOrEqual(height+1);}
    const current=await sample(page);expect(current[0]).toBeCloseTo(translated[0]);expect(current[1]).toBeCloseTo(translated[1]);
    await page.screenshot({path:info.outputPath(`inspection-${width}x${height}.png`)});
  }
});

test('M17 approach can reverse; keyboard movement and reduced-motion keep the three-state sequence',async({page})=>{
  await open(page);const before=await pose(page);await page.locator('.canvas-wrapper').focus();await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');await ready(page);await expect(page.locator('main')).toHaveAttribute('data-loupe-state','activated');expect(await pose(page)).toEqual(before);
  await page.keyboard.press('Enter');await ready(page);const sampleBefore=await sample(page);await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);expect((await sample(page))[0]).toBeGreaterThan(sampleBefore[0]);
  await page.keyboard.press('Escape');await ready(page);await page.keyboard.press('Escape');await expect(page.locator('main')).toHaveAttribute('data-loupe-state','inactivated');
  await page.goto('/guest?mode=inspect&reduced_motion=true');await ready(page);await page.getByTestId('loupe-activate').click();await page.getByTestId('inspect-loupe').click();await ready(page);await expect(page.locator('main')).toHaveAttribute('data-loupe-state','inspection');
});

test('M17 scene optics inspect photographs, perforations and bare table with transmitted illumination',async({page},info)=>{
  await page.setViewportSize({width:1280,height:800});await page.goto('/guest?mode=inspect&deterministic=true');await ready(page);await page.getByTestId('loupe-activate').click();await page.waitForTimeout(150);
  const canvas=page.locator('canvas');
  const place=async(x:number,y:number)=>{
    const [cx,cy]=await display(page),[sx,sy]=await sample(page);
    const zoom=Number(await page.locator('main').getAttribute('data-inspect-zoom'));
    // Project the desired translation on the eyepiece plane, retaining the grab point.
    const scale=Number(await canvas.getAttribute('data-loupe-scale'));
    const wpp=2*(zoom-.008-.19*scale)*Math.tan(Math.PI/8)/800;
    if(Math.hypot(x-sx,y-sy)>MIN_MOVEMENT){await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+(x-sx)/wpp,cy-(y-sy)/wpp,{steps:12});await page.mouse.up();await page.waitForTimeout(100);}
    const point=await sample(page);expect(point[0]).toBeCloseTo(x,2);expect(point[1]).toBeCloseTo(y,2);
    await page.getByTestId('inspect-loupe').click();await ready(page);await page.screenshot({path:info.outputPath(`scene-${x}-${y}.png`)});
    return PNG.sync.read(await captureCanvas(page));
  };
  const photo=await place(0,0);expect(getRegionStats(photo,640,400,160).stdDev).toBeGreaterThan(3);
  await page.locator('.canvas-wrapper').focus();await page.keyboard.press('m');await page.waitForTimeout(200);const positive=PNG.sync.read(await captureCanvas(page));expect(getRegionMeanDifference(photo,positive,640,400,160)).toBeGreaterThan(15);
  await page.getByTestId('inspect-loupe').click();await ready(page);
  const hole=getPerforationPositions({...DEFAULT_LAYOUT,...BASELINE_ROLL.layout}).top.find(p=>p.frameIndex===2&&p.perforationIndex===4)!;
  const perforation=await place((hole.x+.011)*BASELINE_ROLL.scale,hole.y*BASELINE_ROLL.scale);expect(getRegionStats(perforation,640,400,200).stdDev).toBeGreaterThan(8);
  await page.getByTestId('inspect-loupe').click();await ready(page);
  const table=await place(0,.55*BASELINE_ROLL.scale),stats=getRegionStats(table,640,400,80);expect(stats.meanLum).toBeGreaterThan(160);expect(Math.abs(stats.meanR-stats.meanB)).toBeLessThan(12);
  await page.locator('.canvas-wrapper').focus();await page.keyboard.press('b');await page.keyboard.press('b');await page.keyboard.press('b');await page.waitForTimeout(150);
  expect(getRegionStats(PNG.sync.read(await captureCanvas(page)),640,400,80).meanLum).toBeLessThan(stats.meanLum-15);
  expect(await canvas.getAttribute('data-loupe-visible')).toBe('true');
});
