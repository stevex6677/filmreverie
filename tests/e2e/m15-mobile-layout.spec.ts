import { openFrame, captureCanvas } from "./helpers/viewing";
import {test,expect,Page} from '@playwright/test';
import {PNG} from 'pngjs';
import {getRegionStats,getRegionMeanDifference} from './helpers/pixelAnalysis';
const ready=async(page:Page)=>{
  await expect(page.locator('main')).toHaveAttribute('data-app-ready','true',{timeout:90000});
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true',{timeout:60000});
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false',{timeout:45000});
  // Raw pointer input does not auto-wait for the loading overlay like clicks do.
  await expect(page.locator('#darkroom-loader')).toBeHidden();
};
test('M15 phone and tablet layouts keep usable film, controls, modal ownership and framing through rotation',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/guest?fixture=36&mode=inspect&deterministic=true');await ready(page);
  await openFrame(page,7);await ready(page);
  for(const [width,height] of [[375,667],[390,844],[667,375],[844,390],[820,1180],[1180,820],[540,820]]) {
    await page.setViewportSize({width,height});
    // visualViewport's resize event can follow setViewportSize's resolution.
    // Wait for the actual canvas to resize before assessing the new layout.
    await expect.poll(async()=>Math.round((await page.locator('canvas').boundingBox())?.height??0)).toBe(height);
    await ready(page);
    const canvas=await page.locator('canvas').boundingBox();expect(canvas).not.toBeNull();expect(canvas!.height).toBeGreaterThan(180);
    expect(canvas!.x).toBeGreaterThanOrEqual(0);expect(canvas!.x+canvas!.width).toBeLessThanOrEqual(width+1);
    expect(canvas!.y).toBeGreaterThanOrEqual(0);
    expect(canvas!.y+canvas!.height).toBeLessThanOrEqual(height+1);
    for(const name of ['Previous','Next','Choose frame','Reset framing','Settings','← Overview']) {
      const b=await page.getByRole('button',{name,exact:true}).boundingBox();expect(b).not.toBeNull();expect(b!.width).toBeGreaterThanOrEqual(44);expect(b!.height).toBeGreaterThanOrEqual(44);expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.y+b!.height).toBeLessThanOrEqual(height+1);
    }
    const image=PNG.sync.read(await captureCanvas(page));expect(getRegionStats(image,image.width/2|0,image.height/2|0,70).stdDev).toBeGreaterThan(4);
    await page.screenshot({path:info.outputPath(`layout-${width}x${height}.png`)});
    const zoom=await page.locator('main').getAttribute('data-inspect-zoom');
    await page.getByRole('button',{name:'Settings',exact:true}).tap();await expect(page.getByRole('dialog',{name:'Viewing tools'})).toBeVisible();
    await page.keyboard.press('ArrowRight');await expect(page.locator('main')).toHaveAttribute('data-selected-frame','7');
    await page.keyboard.press('Escape');expect(await page.locator('main').getAttribute('data-inspect-zoom')).toBe(zoom);
    await page.getByRole('button',{name:'← Overview',exact:true}).tap();await ready(page);await openFrame(page,7);expect(Number(await page.locator('main').getAttribute('data-inspect-zoom'))).toBeCloseTo(Number(zoom));
  }
  // The viewer starts in Positive; capture it before switching to Negative.
  await expect(page.locator('main')).toHaveAttribute('data-film-mode','positive');
  const positive=PNG.sync.read(await captureCanvas(page));await page.getByRole('button',{name:'Settings',exact:true}).tap();await page.getByRole('button',{name:'Switch to Negative',exact:true}).tap();await page.keyboard.press('Escape');await page.waitForTimeout(700);
  const negative=PNG.sync.read(await captureCanvas(page));expect(getRegionMeanDifference(positive,negative,positive.width/2|0,positive.height/2|0,70)).toBeGreaterThan(15);
  expect(errors).toEqual([]);
});
test('M15 mobile import appends, reorders, crops, saves, reloads and cancels edits',async({page},info)=>{
  await page.goto('/guest?mode=room&example=1&deterministic=true');await ready(page);
  await page.getByRole('button',{name:'Film Shelf',exact:true}).tap();await page.getByRole('button',{name:'New roll',exact:true}).tap();
  const image=(name:string,seed:number)=>{const p=new PNG({width:600,height:400});for(let y=0;y<400;y++)for(let x=0;x<600;x++){const i=(y*600+x)*4;p.data[i]=x%100+seed*35;p.data[i+1]=y%200;p.data[i+2]=180;p.data[i+3]=255;}return {name,mimeType:'image/png',buffer:PNG.sync.write(p)};};
  await page.getByLabel('Choose photographs',{exact:true}).setInputFiles(image('first.png',1));await expect(page.getByText('Processed 1 / 1',{exact:true})).toBeVisible();
  await page.getByLabel('Choose photographs',{exact:true}).setInputFiles(image('second.png',2));await expect(page.getByText('2 photographs selected',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Continue to roll details'}).tap();await page.getByLabel('Roll name',{exact:true}).fill('Phone contact sheet');await page.getByRole('radio',{name:'120',exact:true}).check();await page.getByLabel('Film format',{exact:true}).selectOption('66');
  await page.getByRole('button',{name:'Review photographs',exact:true}).tap();await page.getByRole('button',{name:'Select frame 2',exact:true}).tap();await page.getByRole('button',{name:'Move frame 2 earlier',exact:true}).tap();
  await page.getByLabel('Horizontal crop position').fill('0.6');await page.getByRole('button',{name:'Show final crop'}).tap();
  await page.screenshot({path:info.outputPath('mobile-crop-review.png')});await page.getByRole('button',{name:'Save and open',exact:true}).tap();await expect(page.getByRole('dialog')).not.toBeVisible();await ready(page);
  const id=await page.locator('main').getAttribute('data-roll-id');await page.reload();await expect(page.locator('main')).toHaveAttribute('data-roll-id',id!);await ready(page);
  await page.getByRole('button',{name:'Film Shelf',exact:true}).tap();await page.getByRole('button',{name:'Show saved roll Phone contact sheet'}).tap();await page.getByRole('button',{name:'Edit Phone contact sheet',exact:true}).tap();
  await expect(page.getByLabel('Horizontal crop position')).toHaveValue('0.6');await page.getByLabel('Horizontal crop position').fill('-0.6');await page.getByRole('button',{name:'Cancel edits',exact:true}).tap();
  await page.getByRole('button',{name:'Show saved roll Phone contact sheet'}).tap();await page.getByRole('button',{name:'Edit Phone contact sheet',exact:true}).tap();await expect(page.getByLabel('Horizontal crop position')).toHaveValue('0.6');
});

test('M15 iPad and iPhone in room mode have no bottom tools or footer', async ({ page }, info) => {
  for (const [width, height] of [[1180, 820], [820, 1180], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/guest?mode=room&deterministic=true');
    await ready(page);

    await expect(page.getByRole('button', { name: 'Film Shelf', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Face table', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approach table', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('approach-table-btn')).toHaveCount(0);
    await expect(page.locator('.mobile-footer')).toHaveCount(0);

    await page.screenshot({ path: info.outputPath(`room-no-bottom-tools-${width}x${height}.png`) });
  }
});
