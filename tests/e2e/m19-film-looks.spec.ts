import { shelfAction } from './helpers/shelf';
import { test, expect, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import { FILM_STOCKS } from '../../src/data/filmStocks';
import { captureCanvas, openFrame, openViewingTools, closeViewingTools } from './helpers/viewing';
import { getRegionMeanDifference, getRegionStats } from './helpers/pixelAnalysis';
import { ROLL_FRAMES } from '../../src/data/rollManifest';

const ready = async (page: Page) => {
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true',{timeout:60000});
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false',{timeout:45000});
};
// Strength is edited in the roll editor. Optical checks on the built-in roll
// set the shader strength through the deterministic-mode hook.
async function strength(page: Page, value: number) {
  await openViewingTools(page);
  await page.evaluate(v => (window as any).__setFilmStrength(v), value);
  await expect(page.locator('main')).toHaveAttribute('data-film-strength',String(value));
  await page.waitForTimeout(180);
}
const guestRecords = (page: Page, store: 'rolls' | 'frames') => page.evaluate(name => new Promise<any[]>(resolve => {
  const request = indexedDB.open('darkroom-guest-rolls');
  request.onsuccess = () => { const db = request.result, all = db.transaction(name).objectStore(name).getAll(); all.onsuccess = () => { resolve(all.result); db.close(); }; };
  request.onerror = () => resolve([]);
}), store);
async function editRoll(page: Page, name: string) {
  await closeViewingTools(page);
  if (await page.locator('main').getAttribute('data-focus-mode') === 'true') { await page.getByRole('button',{name:'← Overview',exact:true}).click(); await ready(page); }
  await page.getByRole('button',{name:'Film Shelf',exact:true}).click(); await ready(page);
  await page.getByRole('button',{name:`Show saved roll ${name}`,exact:true}).click(); await page.getByRole('button',{name:`Edit ${name}`,exact:true}).click();
  const editor = page.getByRole('dialog',{name:'Review roll',exact:true});
  await expect(editor.getByRole('heading',{name:'Edit roll',exact:true})).toBeVisible();
  return editor;
}
async function saveEditor(page: Page) {
  await page.getByRole('button',{name:'Save and open',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Review roll',exact:true})).not.toBeVisible({timeout:60000}); await ready(page);
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
  await page.goto('/guest?mode=inspect&deterministic=true&reduced_motion=true');await ready(page);
});
test.afterEach(async({page})=>expect((page as Page & {filmErrors:string[]}).filmErrors).toEqual([]));

test('M19 every stock and view has live tone/color, exact zero return and unchanged surrounding film',async({page},info)=>{
  test.setTimeout(240000);
  await openFrame(page,3);await ready(page);await openViewingTools(page);
  await expect(page.locator('main')).toHaveAttribute('data-film-strength','50');
  await expect(page.getByTestId('film-strength-slider')).toHaveCount(0);
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

test('M19 strength keeps table framing, navigation and the loupe look',async({page},info)=>{
  await openFrame(page,1);await ready(page);await openViewingTools(page);
  await page.getByTestId('mode-toggle').click();
  const pose=await page.locator('canvas').getAttribute('data-camera-position');
  await strength(page,0);await strength(page,100);
  expect(await page.locator('canvas').getAttribute('data-camera-position')).toBe(pose);
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
  await page.getByRole('button',{name:'Film Shelf',exact:true}).click();await shelfAction(page, 'New roll');
  await page.getByLabel('Choose photographs').setInputFiles(files);
  await expect(page.getByRole('status').filter({hasText:'Processed'})).toContainText('2 / 2',{timeout:120000});
  await page.getByRole('button',{name:'Continue to roll details'}).click();await page.getByLabel('Roll name',{exact:true}).fill('M19 photographs');
  await page.getByRole('button',{name:'Review photographs',exact:true}).click();await page.getByRole('button',{name:'Save and open',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Review roll',exact:true})).not.toBeVisible({timeout:60000});
  await expect(page.locator('main')).not.toHaveAttribute('data-roll-id','roll-01');await ready(page);
  const rollId=(await page.locator('main').getAttribute('data-roll-id'))!;
  let editor=await editRoll(page,'M19 photographs');await editor.getByRole('tab',{name:'Film effect',exact:true}).click();
  await editor.getByRole('slider',{name:'Roll film strength',exact:true}).fill('0');await saveEditor(page);
  await expect(page.locator('main')).toHaveAttribute('data-film-strength','0');
  await expect.poll(async()=>(await guestRecords(page,'rolls')).find(r=>r.id===rollId)?.filmStrength).toBe(0);
  await page.reload();await expect(page.locator('main')).toHaveAttribute('data-roll-id',rollId);await ready(page);await expect(page.locator('main')).toHaveAttribute('data-film-strength','0');
  let saved=0;
  for(const format of ['135','645','66','67','69']) {
    editor=await editRoll(page,'M19 photographs');
    await page.getByRole('radio',{name:format==='135'?'35mm':'120',exact:true}).check();await page.getByLabel('Film format',{exact:true}).selectOption(format);
    await editor.getByLabel('Film stock',{exact:true}).selectOption('ektachrome-e100');
    // Format and stock edits keep the saved strength.
    await editor.getByRole('tab',{name:'Film effect',exact:true}).click();
    await expect(editor.getByRole('slider',{name:'Roll film strength',exact:true})).toHaveValue(String(saved));
    saved=saved?0:100;await editor.getByRole('slider',{name:'Roll film strength',exact:true}).fill(String(saved));
    await saveEditor(page);
    await expect(page.locator('main')).toHaveAttribute('data-roll-id',rollId);
    await expect(page.locator('main')).toHaveAttribute('data-film-strength',String(saved));
    await openFrame(page,2);await ready(page);await strength(page,0);const zero=await shot(page);await strength(page,100);
    expect(difference(zero,await shot(page))).toBeGreaterThan(.1);
    await closeViewingTools(page);await captureCanvas(page,{path:info.outputPath(`format-${format}.png`)});
    // Table-side strength changes are not persisted; the editor value is.
    await page.reload();await expect(page.locator('main')).toHaveAttribute('data-roll-id',rollId);await ready(page);await expect(page.locator('main')).toHaveAttribute('data-film-strength',String(saved));
  }
});

test('M19 roll editor previews and saves whole-roll and per-frame strength',async({page,request},info)=>{
  test.setTimeout(240000);
  const files=await Promise.all(ROLL_FRAMES.slice(0,3).map(async(f,i)=>({name:`look-${i}.jpg`,mimeType:'image/jpeg',buffer:await (await request.get(f.src)).body()})));
  await page.getByRole('button',{name:'Film Shelf',exact:true}).click();await shelfAction(page, 'New roll');
  await page.getByLabel('Choose photographs').setInputFiles(files);
  await expect(page.getByRole('status').filter({hasText:'Processed'})).toContainText('3 / 3',{timeout:120000});
  await page.getByRole('button',{name:'Continue to roll details'}).click();await page.getByLabel('Roll name',{exact:true}).fill('Strength review');
  await page.getByRole('button',{name:'Review photographs',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Review roll',exact:true}),preview=dialog.getByTestId('film-look-preview');
  await dialog.getByRole('tab',{name:'Film effect',exact:true}).click();
  await expect(dialog.getByRole('tab',{name:'Film effect',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(preview).toHaveAttribute('data-preview-ready','true');
  const slider=dialog.getByRole('slider',{name:'Roll film strength',exact:true});
  await expect(slider).toHaveValue('50');
  const capture=async(value:number)=>{await expect(preview).toHaveAttribute('data-strength',String(value));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return PNG.sync.read(await preview.screenshot());};
  const mean=(a:PNG,b:PNG)=>getRegionMeanDifference(a,b,a.width/2|0,a.height/2|0,Math.min(a.width,a.height)*.4|0);
  // Keyboard reaches both ends; the presets name the reference points.
  await slider.focus();await slider.press('Home');const zero=await capture(0);
  await slider.press('End');const strong=await capture(100);
  expect(mean(zero,strong)).toBeGreaterThan(1);
  await dialog.getByRole('button',{name:'Default',exact:true}).click();const middle=await capture(50);
  expect(mean(zero,middle)).toBeGreaterThan(.3);expect(mean(zero,strong)).toBeGreaterThan(mean(zero,middle));
  await slider.fill('100');
  await dialog.getByRole('radio',{name:'Original',exact:true}).check();await page.waitForTimeout(100);
  fs.writeFileSync(info.outputPath('preview-zero.png'),PNG.sync.write(zero));fs.writeFileSync(info.outputPath('preview-strong.png'),PNG.sync.write(strong));
  expect(mean(zero,PNG.sync.read(await preview.screenshot({path:info.outputPath('preview-original.png')})))).toBeLessThan(.5);
  await dialog.getByRole('radio',{name:'Split',exact:true}).check();
  await expect(dialog.getByRole('slider',{name:'Comparison divider',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('editor-split.png')});
  await dialog.getByRole('radio',{name:'Film',exact:true}).check();
  // Each frame starts from the roll strength and keeps its own value.
  await dialog.getByRole('radio',{name:'Each frame',exact:true}).check();
  await dialog.getByRole('button',{name:'Next frame',exact:true}).click();
  const frameTwo=dialog.getByRole('slider',{name:'Frame 2 film strength',exact:true});
  await expect(frameTwo).toHaveValue('100');await frameTwo.fill('20');
  await dialog.getByRole('button',{name:'Select frame 3',exact:true}).click();
  await expect(dialog.getByRole('slider',{name:'Frame 3 film strength',exact:true})).toHaveValue('100');
  await dialog.getByRole('button',{name:'Previous frame',exact:true}).click();await expect(frameTwo).toHaveValue('20');
  await page.screenshot({path:info.outputPath('editor-each-frame.png')});
  await saveEditor(page);
  const rollId=(await page.locator('main').getAttribute('data-roll-id'))!;
  const frames=async()=>{const roll=(await guestRecords(page,'rolls')).find(r=>r.id===rollId);const all=await guestRecords(page,'frames');return {roll:roll?.filmStrength,frames:roll.frameIds.map((id:string)=>all.find(f=>f.id===id)?.filmStrength)};};
  expect(await frames()).toEqual({roll:100,frames:[100,20,100]});
  await expect(page.locator('main')).toHaveAttribute('data-film-strength','100');
  // Reopening restores the per-frame mode; returning to one strength clears the overrides.
  const editor=await editRoll(page,'Strength review');await editor.getByRole('tab',{name:'Film effect',exact:true}).click();
  await expect(editor.getByRole('radio',{name:'Each frame',exact:true})).toBeChecked();
  await editor.getByRole('button',{name:'Select frame 2',exact:true}).click();
  await expect(editor.getByRole('slider',{name:'Frame 2 film strength',exact:true})).toHaveValue('20');
  await editor.getByRole('radio',{name:'Whole roll',exact:true}).check();
  await editor.getByRole('slider',{name:'Roll film strength',exact:true}).fill('35');
  await saveEditor(page);
  expect(await frames()).toEqual({roll:35,frames:[undefined,undefined,undefined]});
  await expect(page.locator('main')).toHaveAttribute('data-film-strength','35');
});
