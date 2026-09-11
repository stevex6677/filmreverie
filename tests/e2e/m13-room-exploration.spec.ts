import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionStats, getRegionMeanDifference } from "./helpers/pixelAnalysis";
const output = path.resolve("artifacts/m13-candidates");
const ready = async (page: Page) => { await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true'); await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false'); await page.waitForTimeout(350); };
const pose = async (page: Page) => (await page.locator('main').getAttribute('data-room-pose'))!.split(',').map(Number);
async function light(page: Page, n: number) { const slider=page.getByRole('slider',{name:'Room brightness',exact:true}); await slider.focus(); await slider.press(n===100?'End':'Home'); if(n>0 && n<100){for(let i=0;i<Math.floor(n/10);i++)await slider.press('PageUp');for(let i=0;i<n%10;i++)await slider.press('ArrowRight');} await slider.blur(); await page.waitForTimeout(700); }
async function turn(page: Page, yaw: number, pitch=0) { const x=yaw>0?200:1050; await page.mouse.move(x,400); await page.mouse.down(); await page.mouse.move(x+yaw/.0035,400-pitch/.0035,{steps:16}); await page.mouse.up(); await page.waitForTimeout(250); }
async function face(page: Page) { await page.getByRole('button',{name:'Face table',exact:true}).click(); await page.getByRole('button',{name:'Face table',exact:true}).blur(); await page.waitForTimeout(250); }
async function shot(page: Page, name: string) { fs.mkdirSync(output,{recursive:true}); const buffer=await page.locator('canvas').screenshot(); fs.writeFileSync(path.join(output,`${name}.png`),buffer);return parsePng(buffer); }

for (const reduced of [false,true]) test(`M13 fixed-eye full turns, six views and restored journeys ${reduced?'reduced':'animated'}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/?mode=room&example=1${reduced?'&reduced_motion=true':''}`); await ready(page);
  const canvas=page.locator('canvas'); const position=await canvas.getAttribute('data-camera-position'); const fov=await canvas.getAttribute('data-camera-fov');
  const initial=await pose(page);
  // Drag right/down pulls the scene right/down, turning the eye left/up.
  await page.mouse.move(600,400);await page.mouse.down();await page.mouse.move(700,450,{steps:8});await page.mouse.up();
  expect((await pose(page))[0]).toBeCloseTo(initial[0]+.35,3);
  expect((await pose(page))[1]).toBeCloseTo(initial[1]-.175,3);
  await face(page);
  await light(page,100);
  for(const direction of ['front','left','back','right']){
    if(direction!=='front')await turn(page,Math.PI/2);
    expect(await canvas.getAttribute('data-camera-position')).toBe(position);
    expect(await canvas.getAttribute('data-camera-fov')).toBe(fov);
    const png=await shot(page,`${reduced?'reduced':'animated'}-${direction}`);
    const stats=getRegionStats(png,640,430,160); expect(stats.meanLum).toBeGreaterThan(8);expect(stats.stdDev).toBeGreaterThan(1);
  }
  // Complete two full revolutions: never clamp yaw or translate the eye.
  for(let i=0;i<5;i++)await turn(page,Math.PI/2);
  expect((await pose(page))[0]-initial[0]).toBeCloseTo(4*Math.PI,2);
  expect(await canvas.getAttribute('data-camera-position')).toBe(position);
  await face(page);
  for(const [name,sign] of [['ceiling',-1],['floor',1]] as const){
    for(let i=0;i<3;i++)await turn(page,0,sign*.6);
    expect(Math.abs((await pose(page))[1])).toBeCloseTo(85*Math.PI/180,3);
    const vertical=await shot(page,`${reduced?'reduced':'animated'}-${name}`);
    expect(getRegionStats(vertical,640,430,160).meanLum).toBeGreaterThan(8);
    const q=await canvas.getAttribute('data-camera-quaternion'); const saved=await pose(page);
    await page.getByTestId('approach-table-btn').click();await ready(page);
    await page.getByTestId('return-room-btn').click();await ready(page);
    expect(await pose(page)).toEqual(saved);
    const restored=(await canvas.getAttribute('data-camera-quaternion'))!.split(',').map(Number), expected=q!.split(',').map(Number);
    expect(Math.abs(restored.reduce((sum,v,i)=>sum+v*expected[i],0))).toBeGreaterThan(.99999);
    expect(await canvas.getAttribute('data-camera-position')).toBe(position);
    await face(page);
  }
  await turn(page,Math.PI/2);await turn(page,Math.PI/2);
  const away=await pose(page);await page.getByTestId('approach-table-btn').click();await ready(page);
  await page.getByTestId('return-room-btn').click();await ready(page);expect(await pose(page)).toEqual(away);
  await face(page);
  await page.keyboard.press('ArrowLeft');expect((await pose(page))[0]).toBeCloseTo(initial[0]+.12);
  const keyboardPose=await pose(page); await page.keyboard.press('Enter'); await ready(page); await page.keyboard.press('Escape'); await ready(page); expect(await pose(page)).toEqual(keyboardPose); await page.keyboard.press('0'); expect(await pose(page)).toEqual(initial);
  const beforeFocus=await pose(page);await page.getByRole('slider',{name:'Room brightness',exact:true}).press('ArrowLeft');expect(await pose(page)).toEqual(beforeFocus);
  await page.getByRole('button',{name:'Face table',exact:true}).focus();await page.keyboard.press('ArrowLeft');expect(await pose(page)).toEqual(beforeFocus);
  await page.getByRole('button',{name:'Rolls',exact:true}).click();await page.keyboard.press('ArrowRight');expect(await pose(page)).toEqual(beforeFocus);await page.keyboard.press('Escape');
  // Real pointer capture cancellation followed by motion cannot leave a stuck drag.
  await page.mouse.move(850,420);await page.mouse.down();await page.mouse.move(760,420,{steps:5});
  await canvas.dispatchEvent('pointercancel',{pointerId:1});const cancelled=await pose(page);await page.mouse.move(500,450);await page.mouse.up();expect(await pose(page)).toEqual(cancelled);
  await page.mouse.move(850,420);await page.mouse.down();await page.mouse.move(780,420,{steps:4});await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const blurred=await pose(page);await page.mouse.move(500,450);await page.mouse.up();expect(await pose(page)).toEqual(blurred);
  expect(errors).toEqual([]);
  const video=page.video();await page.close();await video?.saveAs(path.join(output,`${reduced?'reduced':'animated'}-journey.webm`));
});

test('M13 room illumination is ordered and switch remembers level',async({page})=>{
  await page.goto('/?mode=room&example=1');await ready(page);
  const measurements:Record<string,unknown>={};const levels:number[]=[];
  for(const n of [0,25,50,100]){await light(page,n);const png=await shot(page,`room-light-${n}`);const wall=getRegionStats(png,920,280,45);levels.push(wall.meanLum);const table=getRegionStats(png,640,430,30), red=getRegionStats(png,410,157,12); measurements[n]={wall,table,red}; if(n===0){expect(table.meanLum).toBeGreaterThan(100);expect(red.meanLum).toBeGreaterThan(30);}}
  // Predefined visual gate: at least 3 luminance levels per step, bright wall >25.
  for(let i=1;i<levels.length;i++)expect(levels[i]-levels[i-1]).toBeGreaterThan(3);expect(levels[3]).toBeGreaterThan(25);
  await light(page,50);await page.getByRole('switch',{name:'Room lights',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-room-brightness','0');await page.getByRole('switch',{name:'Room lights',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-room-brightness','0.5');
  fs.writeFileSync(path.join(output,'room-light-measurements.json'),JSON.stringify(measurements,null,2));
});

test.describe.parallel('M13 photo independence', () => {
for(const stock of ['ektachrome-e100','ektar-100','portra-160','portra-400','portra-800']) test(`${stock} retains photo and loupe response across room-light endpoints`,async({page})=>{
  await page.goto('/?mode=room&example=1&deterministic=true');await ready(page);
  const measurements:unknown[]=[];
    await page.getByTestId('film-stock-selector').selectOption(stock);
    for(const mode of stock==='ektachrome-e100'?['positive']:['negative','positive'])for(const table of [30,100]){
      const captures:ReturnType<typeof parsePng>[]=[];
      for(const room of [0,100]){
        await light(page,room);await page.getByTestId('approach-table-btn').click();await ready(page);
        if(await page.locator('main').getAttribute('data-film-mode')!==mode)await page.getByTestId('mode-toggle').click();
        const dim=page.getByTestId('brightness-slider');await dim.press(table===30?'Home':'End');await dim.blur();
        await page.getByTestId('loupe-toggle').click();await page.mouse.move(640,400);await page.waitForTimeout(350);
        captures.push(await shot(page,`${stock}-${mode}-table${table}-room${room}`));
        await expect(page.getByTestId('brightness-badge')).toHaveText(`${table}%`);
        await page.getByTestId('return-room-btn').click();await ready(page);
      }
      const photo=getRegionMeanDifference(captures[0],captures[1],430,400,28),loupe=getRegionMeanDifference(captures[0],captures[1],640,400,30);
      expect(photo).toBeLessThan(1);expect(loupe).toBeLessThan(1);
      expect(getRegionStats(captures[1],640,400,30).stdDev).toBeGreaterThan(4);
      measurements.push({stock,mode,table,photoDifference:photo,loupeDifference:loupe});
    }
  fs.writeFileSync(path.join(output,`photo-independence-${stock}.json`),JSON.stringify(measurements,null,2));
});
});
