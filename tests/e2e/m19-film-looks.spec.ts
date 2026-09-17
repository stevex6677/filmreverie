import { test, expect, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { FILM_STOCKS } from '../../src/data/filmStocks';
import { captureCanvas, openFrame, openViewingTools, closeViewingTools } from './helpers/viewing';
import { getRegionMeanDifference, getRegionStats } from './helpers/pixelAnalysis';
import { ROLL_FRAMES } from '../../src/data/rollManifest';

const ready = async (page: Page) => {
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true',{timeout:60000});
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false',{timeout:45000});
};
async function strength(page: Page, value: number) {
  await openViewingTools(page);
  const slider = page.getByRole('slider',{name:'Film strength',exact:true});
  if(value===0) { await slider.focus(); await slider.press('Home'); }
  else if(value===100) { await slider.focus(); await slider.press('End'); }
  else await slider.fill(String(value));
  await expect(slider).toHaveValue(String(value));
  await expect(page.locator('main')).toHaveAttribute('data-film-strength',String(value));
  await page.waitForTimeout(180);
}
const shot = async(page:Page) => PNG.sync.read(await captureCanvas(page));
function difference(a:PNG,b:PNG) { return getRegionMeanDifference(a,b,a.width/2|0,a.height/2|0,Math.min(a.width*.5,180)|0); }
test.beforeEach(async({page}) => {
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')errors.push(r.url());});
  (page as Page & {filmErrors:string[]}).filmErrors=errors;
  await page.goto('/?mode=inspect&deterministic=true&reduced_motion=true');await ready(page);
});
test.afterEach(async({page})=>expect((page as Page & {filmErrors:string[]}).filmErrors).toEqual([]));

test('M19 every stock and view has live tone/color, exact zero return and unchanged surrounding film',async({page},info)=>{
  test.setTimeout(240000);
  await openFrame(page,3);await ready(page);await openViewingTools(page);
  await expect(page.getByTestId('film-strength-slider')).toHaveValue('50');
  const pose=await page.locator('canvas').getAttribute('data-camera-position');
  const midpoints:PNG[]=[];let neutral:PNG|undefined;
  for(const stock of FILM_STOCKS) {
    await page.getByLabel('Film stock',{exact:true}).selectOption(stock.id);
    for(const mode of stock.allowedViews) {
      if(await page.locator('main').getAttribute('data-film-mode')!==mode)await page.getByTestId('mode-toggle').click();
      await strength(page,0);const zero=await shot(page);
      await captureCanvas(page,{path:info.outputPath(`${stock.id}-${mode}-0.png`)});
      await strength(page,50);const middle=await shot(page);
      await strength(page,100);const strong=await shot(page);
      expect(difference(zero,middle),`${stock.id}/${mode} midpoint changes photo`).toBeGreaterThan(.12);
      expect(difference(zero,strong)).toBeGreaterThan(difference(zero,middle)*1.2);
      expect(getRegionMeanDifference(zero,strong,15,15,20)).toBeLessThan(.2);
      // The current focus framing can crop the physical rail; both upper
      // corners remain scene pixels outside the photograph material.
      expect(getRegionMeanDifference(zero,strong,zero.width-15,15,20)).toBeLessThan(.2);
      expect(getRegionStats(strong,strong.width/2|0,strong.height/2|0,80).stdDev).toBeGreaterThan(3);
      await captureCanvas(page,{path:info.outputPath(`${stock.id}-${mode}-100.png`)});
      await strength(page,0);expect(difference(zero,await shot(page))).toBeLessThan(.3);
      if(mode==='positive') { if(neutral)expect(difference(neutral,zero)).toBeLessThan(.3);neutral=zero;midpoints.push(middle); }
      await strength(page,50);
      await captureCanvas(page,{path:info.outputPath(`${stock.id}-${mode}-50.png`)});
    }
  }
  expect(Math.max(...midpoints.map(p=>difference(midpoints[0],p)))).toBeGreaterThan(.5);
  expect(await page.locator('canvas').getAttribute('data-camera-position')).toBe(pose);
  await closeViewingTools(page);await page.getByRole('button',{name:'← Overview',exact:true}).click();await ready(page);
  // A comparison strip contains all five actual scene photographs, with identical framing.
  for(const stock of FILM_STOCKS) {
    await openViewingTools(page);await page.getByLabel('Film stock',{exact:true}).selectOption(stock.id);
    if(await page.locator('main').getAttribute('data-film-mode')!=='positive')await page.getByTestId('mode-toggle').click();
    for(const value of [0,50,100]) {await strength(page,value);await captureCanvas(page,{path:info.outputPath(`strip-${stock.id}-${value}.png`)});}
  }
});

test('M19 keyboard and touch strength retain framing, navigation and the loupe look',async({page},info)=>{
  await openFrame(page,1);await ready(page);await openViewingTools(page);
  await page.getByLabel('Film stock',{exact:true}).selectOption('ektar-100');await page.getByTestId('mode-toggle').click();
  for(const [width,height] of [[390,844],[844,390],[820,1180]]) {
    await page.setViewportSize({width,height});await ready(page);
    await strength(page,50);
    const slider=page.getByTestId('film-strength-slider'),pose=await page.locator('canvas').getAttribute('data-camera-position');
    await slider.focus();await slider.press('Home');await expect(slider).toHaveValue('0');
    await slider.press('End');await expect(slider).toHaveValue('100');
    await slider.scrollIntoViewIfNeeded();const b=(await slider.boundingBox())!;
    if(info.project.use.hasTouch)await page.touchscreen.tap(b.x+b.width*.25,b.y+b.height/2);
    else {await page.mouse.move(b.x+b.width*.9,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width*.25,b.y+b.height/2,{steps:8});await page.mouse.up();}
    const value=Number(await slider.inputValue());expect(value).toBeGreaterThan(10);expect(value).toBeLessThan(40);
    expect(await page.locator('canvas').getAttribute('data-camera-position')).toBe(pose);
    await page.screenshot({path:info.outputPath(`strength-controls-${width}x${height}.png`)});
  }
  await strength(page,50);await closeViewingTools(page);await openFrame(page,5);await ready(page);
  await expect(page.locator('main')).toHaveAttribute('data-film-strength','50');
  await page.getByTestId('loupe-activate').click();await page.waitForTimeout(200);
  await strength(page,0);const zero=await shot(page);await strength(page,100);const strong=await shot(page);
  const [x,y,r]=(await page.locator('canvas').getAttribute('data-loupe-display'))!.split(',').map(Number);
  expect(getRegionMeanDifference(zero,strong,Math.round(x),Math.round(y),Math.round(r))).toBeGreaterThan(.2);
  await closeViewingTools(page);await page.getByTestId('inspect-loupe').click();await ready(page);
  await captureCanvas(page,{path:info.outputPath('grain-inspection.png')});
  const still=await shot(page);await page.waitForTimeout(300);expect(difference(still,await shot(page))).toBeLessThan(.3);
  await page.getByTestId('inspect-loupe').click();await ready(page);await page.getByTestId('put-away-loupe').click();
  await strength(page,0);await closeViewingTools(page);await page.getByRole('button',{name:'Reset framing',exact:true}).click();
  await expect(page.locator('main')).toHaveAttribute('data-film-strength','0');
});

test('M19 actual photograph import preserves strength through edits, all film formats and reload',async({page,request},info)=>{
  test.setTimeout(240000);
  const files=await Promise.all(ROLL_FRAMES.slice(0,2).map(async(f,i)=>({name:`photo-${i}.jpg`,mimeType:'image/jpeg',buffer:await (await request.get(f.src)).body()})));
  await page.getByRole('button',{name:'Rolls',exact:true}).click();await page.getByRole('button',{name:'New roll',exact:true}).click();
  await page.getByLabel('Choose photographs').setInputFiles(files);
  await expect(page.getByRole('status').filter({hasText:'Processed'})).toContainText('2 / 2',{timeout:120000});
  await page.getByRole('button',{name:'Continue to roll details'}).click();await page.getByLabel('Roll name',{exact:true}).fill('M19 photographs');
  await page.getByRole('button',{name:'Review photographs',exact:true}).click();await page.getByRole('button',{name:'Save and open',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Review roll',exact:true})).not.toBeVisible({timeout:60000});
  await expect(page.locator('main')).not.toHaveAttribute('data-roll-id','roll-01');await ready(page);
  const rollId=(await page.locator('main').getAttribute('data-roll-id'))!;
  await strength(page,0);
  await expect.poll(()=>page.evaluate(id=>new Promise<number|undefined>(resolve=>{const request=indexedDB.open('darkroom-rolls');request.onsuccess=()=>{const db=request.result,get=db.transaction('rolls').objectStore('rolls').get(id);get.onsuccess=()=>{resolve(get.result?.filmStrength);db.close();};};request.onerror=()=>resolve(undefined);}),rollId)).toBe(0);
  await page.reload();await expect(page.locator('main')).toHaveAttribute('data-roll-id',rollId);await ready(page);await expect(page.locator('main')).toHaveAttribute('data-film-strength','0');
  for(const format of ['135','645','66','67','69']) {
    await closeViewingTools(page);await page.getByRole('button',{name:'Rolls',exact:true}).click();
    await ready(page);await page.getByRole('button',{name:'Show saved roll M19 photographs',exact:true}).click();
    await page.getByRole('radio',{name:format==='135'?'35mm':'120',exact:true}).check();await page.getByLabel('Film format',{exact:true}).selectOption(format);
    await page.getByRole('dialog').getByLabel('Film stock',{exact:true}).selectOption('ektachrome-e100');
    await page.getByRole('button',{name:'Save and open',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Review roll',exact:true})).not.toBeVisible({timeout:60000});
    await expect(page.locator('main')).toHaveAttribute('data-roll-id',rollId);await ready(page);
    await expect(page.locator('main')).toHaveAttribute('data-film-strength','0');
    await openFrame(page,2);await ready(page);await strength(page,0);const zero=await shot(page);await strength(page,100);
    expect(difference(zero,await shot(page))).toBeGreaterThan(.1);
    await closeViewingTools(page);await captureCanvas(page,{path:info.outputPath(`format-${format}.png`)});
    await page.reload();await expect(page.locator('main')).toHaveAttribute('data-roll-id',rollId);await ready(page);await expect(page.locator('main')).toHaveAttribute('data-film-strength','100');
    await strength(page,0);await closeViewingTools(page);await page.getByRole('button',{name:'← Overview',exact:true}).click();await ready(page);
  }
});
