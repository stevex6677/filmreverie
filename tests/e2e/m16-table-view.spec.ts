import { test,expect,Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { getRegionStats,getRegionMeanDifference } from './helpers/pixelAnalysis';
import { FULL_ROLL_FIXTURE,locateFrame } from '../../src/utils/rollLayout';
import { captureCanvas } from "./helpers/viewing";
const ready=async(page:Page)=>{await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false',{timeout:45000});await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true',{timeout:60000});};
const open=async(page:Page,n:number)=>{await page.getByRole('button',{name:'Choose frame',exact:true}).click();await page.getByRole('button',{name:`Open frame ${n}`,exact:true}).click();await ready(page);};
test('M16 zooms the same table with neighboring images visible and restores Overview',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?fixture=36&mode=inspect');await ready(page);
  const initialPan=await page.locator('main').getAttribute('data-inspect-pan');
  const viewport=page.viewportSize()!;await page.mouse.move(viewport.width/2,viewport.height/2);await page.mouse.down({button:'right'});await page.mouse.move(viewport.width/2+45,viewport.height/2+35,{steps:6});await page.mouse.up({button:'right'});if(info.project.use.browserName!=='webkit')await page.mouse.wheel(0,-180);await page.waitForTimeout(700);
  expect(await page.locator('main').getAttribute('data-inspect-pan')).not.toBe(initialPan);
  const before=await captureCanvas(page);
  const pose=await page.locator('main').getAttribute('data-inspect-pan'),zoom=await page.locator('main').getAttribute('data-inspect-zoom');
  await open(page,7);await expect(page.locator('main')).toHaveAttribute('data-focus-mode','true');
  for(const [width,height] of [[1280,800],[390,844],[375,667],[820,1180],[1180,820],[844,390]]){
    await page.setViewportSize({width,height});await ready(page);await page.waitForTimeout(350);
    const png=PNG.sync.read(await captureCanvas(page));
    const frame=locateFrame(FULL_ROLL_FIXTURE,6),neighbor=locateFrame(FULL_ROLL_FIXTURE,7);
    const zoom=Number(await page.locator('main').getAttribute('data-inspect-zoom'));
    const pixels=height/(2*zoom*Math.tan(Math.PI/8));
    const photoWidth=frame.strip.layout.frameWidth*FULL_ROLL_FIXTURE.scale*pixels;
    const filmHeight=(frame.strip.layout.frameHeight+2*frame.strip.layout.marginY)*FULL_ROLL_FIXTURE.scale*pixels;
    const b={left:width/2-photoWidth/2,right:width/2+photoWidth/2,top:height/2-filmHeight/2,bottom:height/2+filmHeight/2};
    // Focus changes the camera, not scene contents: part of frame 8 remains
    // visibly photographic to the right, or in the next strip on narrow screens.
    const neighborCenter=width/2+(neighbor.x-frame.x)*pixels;
    const visibleLeft=Math.max(0,neighborCenter-photoWidth/2),visibleRight=Math.min(width,neighborCenter+photoWidth/2);
    if(visibleRight-visibleLeft>20){
      expect(getRegionStats(png,Math.round((visibleLeft+visibleRight)/2),height/2|0,10).stdDev).toBeGreaterThan(3);
    }else{
      const nextStrip=locateFrame(FULL_ROLL_FIXTURE,12);
      const nextY=height/2+(frame.y-nextStrip.y)*pixels;
      const photoHeight=frame.strip.layout.frameHeight*FULL_ROLL_FIXTURE.scale*pixels;
      const top=Math.max(0,nextY-photoHeight/2),bottom=Math.min(height,nextY+photoHeight/2);
      expect(bottom-top).toBeGreaterThan(20);
      expect(getRegionStats(png,width/2|0,Math.round((top+bottom)/2),10).stdDev).toBeGreaterThan(3);
    }
    expect(b.left).toBeGreaterThan(width*.08);expect(b.right).toBeLessThan(width*.92);expect(b.top).toBeGreaterThan(height*.055);expect(b.bottom).toBeLessThan(height*.945);
    expect(b.right-b.left).toBeGreaterThan(width*.18);expect(getRegionStats(png,width/2|0,height/2|0,35).stdDev).toBeGreaterThan(4);
    await expect(page.getByRole('button',{name:'← Overview',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Adjust',exact:true})).toBeVisible();
    await page.screenshot({path:info.outputPath(`focus-${width}x${height}.png`)});
  }
  // Restore the original viewport before checking the saved table pose.
  await page.setViewportSize(info.project.use.viewport!);await ready(page);
  await page.getByRole('button',{name:'Next',exact:true}).click();await ready(page);await expect(page.locator('main')).toHaveAttribute('data-selected-frame','8');
  await page.getByRole('button',{name:'← Overview',exact:true}).click();await ready(page);
  expect(await page.locator('main').getAttribute('data-inspect-pan')).toBe(pose);expect(await page.locator('main').getAttribute('data-inspect-zoom')).toBe(zoom);
  await expect(page.locator('main')).toHaveAttribute('data-selected-frame','8');
  expect(getRegionMeanDifference(PNG.sync.read(before),PNG.sync.read(await captureCanvas(page)),100,100,30)).toBeLessThan(2);
  expect(errors).toEqual([]);
});
test('M16 Focus keeps live settings and keyboard ownership without changing photographic framing',async({page},info)=>{
  await page.goto('/?mode=inspect&deterministic=true');await ready(page);await open(page,3);
  const canvas=page.locator('canvas'),pose=await canvas.getAttribute('data-camera-position');
  await page.getByRole('button',{name:'Adjust',exact:true}).click();await expect(page.getByRole('dialog',{name:'Viewing tools'})).toBeVisible();
  const before=PNG.sync.read(await captureCanvas(page));
  await page.getByTestId('mode-toggle').click();await page.waitForTimeout(350);
  const after=PNG.sync.read(await captureCanvas(page));expect(getRegionMeanDifference(before,after,after.width/2|0,after.height/2|0,40)).toBeGreaterThan(15);
  const visible=PNG.sync.read(await page.screenshot({path:info.outputPath('focus-adjust.png')}));
  expect(getRegionMeanDifference(after,visible,after.width/2|0,after.height/2|0,40)).toBeLessThan(2);
  await page.getByLabel('Light Table Brightness').fill('0.3');await page.keyboard.press('ArrowRight');await expect(page.locator('main')).toHaveAttribute('data-selected-frame','3');
  await page.getByRole('button',{name:'Close',exact:true}).click();expect(await canvas.getAttribute('data-camera-position')).toBe(pose);
  await page.getByRole('button',{name:'Adjust',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('main')).toHaveAttribute('data-focus-mode','true');
  await page.keyboard.press('Escape');await ready(page);await expect(page.locator('main')).toHaveAttribute('data-focus-mode','false');
  await page.screenshot({path:info.outputPath('overview.png')});
});

 test('M16 quiet controls reveal without reframing and retain keyboard access',async({page})=>{
  await page.goto('/?mode=inspect&deterministic=true');await ready(page);await open(page,3);
  const controls=page.getByTestId('controls-panel');await page.locator('.canvas-wrapper').focus();
  await expect(controls).toHaveAttribute('data-quiet','true',{timeout:6000});
  const pose=await page.locator('canvas').getAttribute('data-camera-position');
  const viewport=page.viewportSize()!;
  if(test.info().project.use.hasTouch)await page.touchscreen.tap(viewport.width/2,viewport.height/2);
  else await page.mouse.move(viewport.width/2+10,viewport.height/2+10);
  await expect(controls).toHaveAttribute('data-quiet','false');expect(await page.locator('canvas').getAttribute('data-camera-position')).toBe(pose);
  await page.getByRole('button',{name:'Adjust',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'Viewing tools'})).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Adjust',exact:true})).toBeFocused();
 });
