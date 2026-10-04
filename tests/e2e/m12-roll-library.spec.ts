import { shelfAction, focusShelf, showRoll, openRoll } from './helpers/shelf';
import { openViewingTools, closeViewingTools, openFrame, captureCanvas } from "./helpers/viewing";
import { test, expect, Page, chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const OUT=process.env.M12_CANDIDATE_DIR || 'artifacts/m12-candidates';
function photo(name:string,width=600,height=400,seed=0) {
  const png=new PNG({width,height});for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;png.data[i]=x<width/2?230:30;png.data[i+1]=y<height/2?40:210;png.data[i+2]=60+seed*17%150;png.data[i+3]=255;}
  return {name,mimeType:'image/png',buffer:PNG.sync.write(png)};
}
async function library(page:Page){await closeViewingTools(page);if(await page.locator('main').getAttribute('data-focus-mode')==='true'){await page.getByRole('button',{name:'← Overview',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');}await focusShelf(page);}
async function details(page:Page){await expect(page.getByLabel('Roll name',{exact:true})).toBeVisible();}
async function formatOf(page:Page,format:string){await details(page);await page.getByRole('radio',{name:format==='135'?'35mm':'120',exact:true}).check();await page.getByLabel('Film format',{exact:true}).selectOption(format);}
async function review(page:Page){await expect(page.getByRole('button',{name:'Save and open',exact:true})).toBeVisible();}
async function editRoll(page:Page,name:string){await showRoll(page,name);await page.getByRole('button',{name:`Edit ${name}`,exact:true}).click();await expect(page.getByLabel('Roll name',{exact:true})).toBeEnabled();}
// Each call turns the frame a further quarter on the film; after the first, the image is turned before the frame is made vertical.
async function rotate(page:Page,n:number,turnImage=false){await review(page);await page.getByRole('button',{name:`Select frame ${n}`,exact:true}).click();if(turnImage)await page.getByRole('button',{name:'Turn image',exact:true}).click();await page.getByRole('button',{name:'Vertically',exact:true}).click();}
async function start(page:Page,name:string,format='135',files=[photo('scan2.png'),photo('scan10.png',600,400,1)]) {
  await library(page);await shelfAction(page, 'New roll');await page.getByLabel('Choose photographs').setInputFiles(files);await expect(page.getByRole('status').filter({hasText:'Processed'})).toContainText(`${files.length} / ${files.length}`,{timeout:120000});await page.getByLabel('Roll name',{exact:true}).fill(name);await formatOf(page,format);await review(page);
}
async function save(page:Page){await review(page);await page.getByRole('button',{name:'Save and open',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true',{timeout:60000});await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false',{timeout:30000});}
async function dbRolls(page:Page){return page.evaluate(async()=>new Promise<any[]>((resolve,reject)=>{const req=indexedDB.open('darkroom-guest-rolls');req.onsuccess=()=>{const db=req.result;const r=db.transaction('rolls').objectStore('rolls').getAll();r.onsuccess=()=>{db.close();resolve(r.result.filter((roll:any)=>roll.id!=='roll-01'));};r.onerror=()=>reject(r.error);};}));}
async function expectThumbnailCaptionSeparated(page:Page) {
  // Rotated crop images extend beyond their clipping viewport by design.
  // Check the visible viewport and its clipping, rather than the hidden image extent.
  await page.getByRole('button',{name:'Choose frame',exact:true}).click();
  await expect(page.locator('.table-frame-grid img').first()).toBeVisible();
  await page.locator('.table-frame-grid img').first().evaluate(img=>(img as HTMLImageElement).decode());
  const bounds=await page.locator('.table-frame-grid button').first().evaluate(button=>{
    const crop=button.querySelector('div')!,img=crop.querySelector('img')!;
    const rect=crop.getBoundingClientRect();
    return {bottom:rect.bottom,height:rect.height,caption:button.querySelector('span')!.getBoundingClientRect().top,overflow:getComputedStyle(crop).overflow,loaded:img.complete&&img.naturalWidth>0};
  });
  expect(bounds.loaded).toBe(true);expect(bounds.height).toBeGreaterThan(20);expect(bounds.overflow).toBe('hidden');expect(bounds.bottom).toBeLessThanOrEqual(bounds.caption);
  await page.keyboard.press('Escape');
}
test.beforeEach(async({page})=>{await fs.mkdir(OUT,{recursive:true});await page.goto('/guest?mode=inspect&reduced_motion=true');});
test('camera is optional and persists through creating, editing and clearing a roll', async ({page}) => {
  await start(page,'Camera notes');
  await details(page);
  const camera=page.getByRole('textbox',{name:'Camera (optional)',exact:true});
  await expect(camera).toHaveValue('');
  await camera.fill('  Nikon F3  ');
  await save(page);
  expect((await dbRolls(page))[0].camera).toBe('Nikon F3');
  await page.reload();
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true');
  await library(page);await editRoll(page,'Camera notes');
  await expect(camera).toHaveValue('Nikon F3');
  await camera.fill('Olympus OM-1');await save(page);
  expect((await dbRolls(page))[0].camera).toBe('Olympus OM-1');
  await library(page);await editRoll(page,'Camera notes');
  await expect(camera).toHaveValue('Olympus OM-1');
  await camera.fill('');await save(page);
  expect((await dbRolls(page))[0].camera).toBeUndefined();
  await library(page);await editRoll(page,'Camera notes');
  await expect(camera).toHaveValue('');
});
test('M12 real import, editing, duplicate handling, switching and persistent Trash',async({page})=>{
  const requests:string[]=[];page.on('request',r=>{if(r.method()!=='GET'||r.postData())requests.push(r.url());});
  await start(page,'Harbor scans','135',[photo('scan10.png',600,400,1),photo('scan2.png'),{name:'bad.jpg',mimeType:'image/jpeg',buffer:Buffer.from('invalid')},photo('duplicate.png')]);
  await expect(page.getByRole('button',{name:'Save and open'})).toBeDisabled();await page.locator('.draft-photos li').filter({hasText:'bad.jpg'}).getByRole('button').click();await page.getByRole('button',{name:'Remove bad.jpg'}).click();await page.locator('.draft-photos li').filter({has:page.locator('.photo-issue')}).getByRole('button').click();await page.getByLabel('Keep this duplicate content').check();
  await page.locator('.draft-photos li').nth(0).dragTo(page.locator('.draft-photos li').nth(2));await page.getByLabel('Move frame 3 earlier',{exact:true}).click();await rotate(page,1);
  await page.screenshot({path:`${OUT}/import-review.png`});await save(page);expect(requests).toEqual([]);
  const first=(await dbRolls(page))[0];expect(first.frameIds).toHaveLength(3);
  await openFrame(page,2);await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
  await expectThumbnailCaptionSeparated(page);await page.screenshot({path:`${OUT}/rotated-thumbnail-caption.png`});
  await page.setViewportSize({width:1280,height:720});
  await expectThumbnailCaptionSeparated(page);
  await page.setViewportSize({width:1280,height:800});
  await page.keyboard.press('b');await expect.poll(async()=>(await dbRolls(page))[0].view?.frameId).toBe(first.frameIds[1]);const before=await page.locator('main').getAttribute('data-selected-frame');
  await page.reload();await expect(page.locator('main')).toHaveAttribute('data-roll-id',first.id);await expect(page.locator('main')).toHaveAttribute('data-selected-frame',before!);await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true');
  await library(page);await editRoll(page,'Harbor scans');await page.getByLabel('Roll name',{exact:true}).fill('Renamed scans');await details(page);await page.getByRole('dialog').getByLabel('Film stock',{exact:true}).selectOption('ektachrome-e100');await formatOf(page,'66');await save(page);
  await expect(page.locator('main')).toHaveAttribute('data-film-mode','positive');await expect(page.locator('main')).toHaveAttribute('data-film-format','66');
  await library(page);await showRoll(page,'Renamed scans');await page.getByRole('button',{name:'Delete Renamed scans',exact:true}).click();await expect(page.getByRole('button',{name:'Show saved roll Renamed scans',exact:true})).toHaveCount(0);await shelfAction(page, /^Trash /);await showRoll(page,'Renamed scans');await page.getByRole('button',{name:'Restore Renamed scans',exact:true}).click();await shelfAction(page, 'Saved rolls');await openRoll(page,'Renamed scans');await expect(page.locator('main')).toHaveAttribute('data-film-mode','positive');
  await library(page);await page.screenshot({path:`${OUT}/library.png`});await shelfAction(page, 'New roll');await page.getByRole('button',{name:'Cancel draft'}).click();expect(await dbRolls(page)).toHaveLength(1);
});
for(const [format,width,height] of [['645',415,560],['66',560,560],['67',685,560],['69',826,560]] as const) test(`M12 ${format} real imported photo fit, loupe and reopen`,async({page,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await start(page,`Format ${format}`,format,[photo('frame1.png',width,height),photo('frame2.png',width,height,1),photo('frame3.png',width,height,2)]);await details(page);await page.getByRole('dialog').getByLabel('Film stock',{exact:true}).selectOption('ektachrome-e100');await save(page);
  await expect(page.locator('main')).toHaveAttribute('data-film-format',format);await page.screenshot({path:`${OUT}/${format}-whole-roll.png`});
  await openFrame(page,1);await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');const source=PNG.sync.read(await captureCanvas(page));
  const cx=Math.floor(source.width/2),cy=Math.floor(source.height/2);
  const rgb=(image:PNG,x:number,y:number)=>[...image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+3)];
  const saturated=(x:number,y:number)=>{const c=rgb(source,x,y);return Math.max(...c)-Math.min(...c)>45;};
  let left=cx,right=cx,top=cy,bottom=cy;while(left>0&&saturated(left-1,cy+30))left--;while(right<source.width-1&&saturated(right+1,cy+30))right++;while(top>0&&saturated(cx-30,top-1))top--;while(bottom<source.height-1&&saturated(cx-30,bottom+1))bottom++;
  expect((right-left)/(bottom-top)).toBeCloseTo(width/height,1);
  // The selected image has room for its rebate and surrounding table. Neighboring
  // frames are intentionally still rendered beyond this aperture in Focus.
  expect(left).toBeGreaterThan(source.width*.06);expect(right).toBeLessThan(source.width*.94);
  expect(top).toBeGreaterThan(source.height*.055);expect(bottom).toBeLessThan(source.height*.945);
  await page.keyboard.press('l');await expect(page.locator('main')).toHaveAttribute('data-loupe-active','true');await page.waitForTimeout(1500);
  const lens=PNG.sync.read(await captureCanvas(page));
  for(const dx of [-20,20])for(const dy of [-20,20]){const a=rgb(source,cx+dx,cy+dy),b=rgb(lens,cx+dx,cy+dy);expect(a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/3).toBeLessThan(45);}
  await fs.writeFile(`${OUT}/${format}-optics.json`,JSON.stringify({expectedAspect:width/height,renderedAspect:(right-left)/(bottom-top),loupeQuadrantsMatch:true},null,2));
  const shot=await page.screenshot({path:`${OUT}/${format}-frame-loupe.png`});const png=PNG.sync.read(shot);let colored=0;for(let y=160;y<650;y++)for(let x=330;x<1000;x++){const i=(y*png.width+x)*4;if(Math.max(png.data[i],png.data[i+1])-Math.min(png.data[i],png.data[i+1])>55)colored++;}expect(colored).toBeGreaterThan(2000);
  const id=await page.locator('main').getAttribute('data-roll-id');await page.waitForTimeout(350);const other=await context.newPage();await other.goto('/guest?mode=inspect&reduced_motion=true');await expect(other.locator('main')).toHaveAttribute('data-roll-id',id!);await expect(other.locator('main')).toHaveAttribute('data-film-format',format);await other.close();expect(errors).toEqual([]);
});
test('M12 36 distinct imported frames navigate final strips and preserve originals',async({page})=>{
  await start(page,'36 test photographs','135',Array.from({length:36},(_,i)=>photo(`scan${i+1}.png`,180,120,i)));await save(page);await page.setViewportSize({width:1280,height:480});await page.getByRole('button',{name:'Choose frame',exact:true}).click();await expect.poll(()=>page.locator('.table-frame-panel').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await page.keyboard.press('Escape');await openFrame(page,36);await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');await page.setViewportSize({width:1280,height:800});await openFrame(page,30);await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-selected-frame','31');await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');await page.screenshot({path:`${OUT}/36-imported-frame31.png`});
  const counts=await page.evaluate(async()=>new Promise<number[]>((resolve)=>{const req=indexedDB.open('darkroom-guest-rolls');req.onsuccess=()=>{const db=req.result;const tx=db.transaction(['frames','blobs']);const frames=tx.objectStore('frames').count(),blobs=tx.objectStore('blobs').count();tx.oncomplete=()=>{db.close();resolve([frames.result,blobs.result]);};};}));expect(counts).toEqual([41,123]);
});
test('M12 quota and unavailable storage leave no half-saved roll',async({page})=>{
  await start(page,'Quota test');await page.evaluate(()=>{const original=IDBObjectStore.prototype.put; (window as any).__restorePut=()=>{IDBObjectStore.prototype.put=original;};IDBObjectStore.prototype.put=function(value:any,key?:IDBValidKey){if(this.name==='blobs')throw new DOMException('Test quota','QuotaExceededError');return key===undefined?original.call(this,value):original.call(this,value,key);};});
  await page.getByRole('button',{name:'Save and open'}).click();await expect(page.getByRole('alert')).toContainText('storage is full');expect(await dbRolls(page)).toEqual([]);await page.evaluate(()=>(window as any).__restorePut());await page.getByRole('button',{name:'Save and open'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();expect(await dbRolls(page)).toHaveLength(1);
});
test('M12 persistent browser profile survives browser restart',async({baseURL,launchOptions})=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'m12-browser-'));
  const launch=()=>chromium.launchPersistentContext(profile,{...launchOptions,channel:'chrome',headless:true,viewport:{width:1280,height:800}});
  let context=await launch();try{let page=await context.newPage();await page.goto(`${baseURL}/guest?mode=inspect&reduced_motion=true`);await page.getByRole('button',{name:'Enter guest darkroom',exact:true}).click();await start(page,'Restart evidence');await save(page);const id=await page.locator('main').getAttribute('data-roll-id');await page.waitForTimeout(400);await context.close();context=await launch();page=await context.newPage();await page.goto(`${baseURL}/guest?mode=inspect&reduced_motion=true`);await expect(page.locator('main')).toHaveAttribute('data-roll-id',id!);await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true');await page.screenshot({path:`${OUT}/browser-restart.png`});}finally{await context.close();await fs.rm(profile,{recursive:true,force:true});}
});

test('M12 cancellation, unavailable storage, EXIF normalization and zero upload requests',async({page})=>{
  await library(page);await page.getByRole('button',{name:'Room',exact:true}).click();
  await page.evaluate(()=>{const original=IDBFactory.prototype.open;(window as any).__restoreOpen=()=>IDBFactory.prototype.open=original;IDBFactory.prototype.open=function(){throw new DOMException('Storage blocked for test','SecurityError');};});
  await library(page);await expect(page.getByRole('alert')).toContainText('Storage blocked');await page.evaluate(()=>(window as any).__restoreOpen());await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('alert')).not.toBeVisible();
  // A native JPEG carrying EXIF orientation 6 must be normalized exactly once.
  const { createCanvas }=await import('@napi-rs/canvas');const canvas=createCanvas(600,400),ctx=canvas.getContext('2d');ctx.fillStyle='#ed4020';ctx.fillRect(0,0,300,400);ctx.fillStyle='#2090ed';ctx.fillRect(300,0,300,400);
  const jpeg=canvas.toBuffer('image/jpeg'),exif=Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');
  const oriented={name:'orientation6.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([jpeg.subarray(0,2),exif,jpeg.subarray(2)])};
  await start(page,'Orientation review','645',[oriented]);await page.getByRole('button',{name:'Cancel draft'}).click();expect(await dbRolls(page)).toEqual([]);
  const network:string[]=[];page.on('request',r=>{if(r.method()!=='GET'||r.url().includes('orientation6')||(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:')))network.push(r.url());});
  await start(page,'Oriented scan','645',[oriented]);await save(page);
  const frame=await page.evaluate(async()=>new Promise<any>(resolve=>{const req=indexedDB.open('darkroom-guest-rolls');req.onsuccess=()=>{const db=req.result;const q=db.transaction('frames').objectStore('frames').getAll();q.onsuccess=()=>{db.close();resolve(q.result.find((frame:any)=>frame.rollId!=='roll-01'));};};}));expect([frame.width,frame.height,frame.rotation]).toEqual([400,600,0]);expect(network).toEqual([]);
});

test('M12 repeated switching restores roll settings and releases owned object URLs',async({page})=>{
  await page.goto('/guest?fixture=36&mode=inspect&reduced_motion=true');
  await page.evaluate(()=>{const live=new Set<string>();const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=function(blob){const url=create.call(this,blob);live.add(url);return url;};URL.revokeObjectURL=function(url){live.delete(url);revoke.call(this,url);};(window as any).__liveRollUrls=live;});
  await start(page,'Switch A');await save(page);expect(page.url()).not.toContain('fixture=36');await openFrame(page,2);await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');await page.keyboard.press('b');
  await expect.poll(async()=>(await dbRolls(page)).find(r=>r.name==='Switch A')?.view?.brightness).toBe(.75);
  await start(page,'Switch B','66',[photo('square1.png',400,400),photo('square2.png',400,400,1)]);await details(page);await page.getByRole('dialog').getByLabel('Film stock',{exact:true}).selectOption('ektachrome-e100');await save(page);
  for(const name of ['Switch A','Switch B','Switch A','Switch B']){await library(page);await openRoll(page,name);await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true');await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');if(name==='Switch A'){await expect(page.locator('main')).toHaveAttribute('data-selected-frame','2');await openViewingTools(page);await expect(page.getByRole('slider',{name:'Light Table Brightness'})).toHaveValue('0.75');}else{await expect(page.locator('main')).toHaveAttribute('data-film-mode','positive');}await expect.poll(()=>page.evaluate(()=>(window as any).__liveRollUrls.size)).toBe(4);}
  await fs.writeFile(`${OUT}/resource-switching.json`,JSON.stringify({switches:4,liveRuntimeObjectUrls:await page.evaluate(()=>(window as any).__liveRollUrls.size),expectedForTwoFrames:4},null,2));
  await page.goto('/guest?roll=local');await page.getByRole('link',{name:'Return to shelf',exact:true}).click();await openRoll(page,'Roll 01');await expect(page.locator('main')).toHaveAttribute('data-roll-id','roll-01');
  await library(page);await openRoll(page,'Switch B');await expect(page.getByRole('dialog')).not.toBeVisible();await library(page);await openRoll(page,'Roll 01');await page.reload();await expect(page.locator('main')).toHaveAttribute('data-roll-id','roll-01');
});

test('M12 cancellation during processing leaves no committed roll and modal owns keyboard focus',async({page})=>{
  await library(page);await shelfAction(page, 'New roll');
  await page.getByLabel('Choose photographs').setInputFiles(Array.from({length:72},(_,i)=>photo(`cancel${i}.png`,600,400,i)));
  await page.getByRole('button',{name:'Cancel processing',exact:true}).first().click();await expect(page.getByRole('button',{name:'Cancel draft',exact:true})).toBeEnabled();expect(await dbRolls(page)).toEqual([]);await expect(page.getByRole('button',{name:'Save and open',exact:true})).toBeDisabled();
  await page.getByLabel('Choose photographs',{exact:true}).focus();await page.keyboard.press('l');await page.keyboard.press('ArrowRight');await expect(page.locator('main')).toHaveAttribute('data-loupe-active','false');await expect(page.locator('main')).toHaveAttribute('data-selected-frame','1');await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('button',{name:'More options',exact:true})).toBeFocused();
});


test('M12 crop fills the full gate at every rotation and survives reload',async({page})=>{
  const make=(name:string,width:number)=>{const png=new PNG({width,height:300});for(let y=0;y<300;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;const center=width===300||(x>=300&&x<600);png.data[i]=center?35:230;png.data[i+1]=center?210:25;png.data[i+2]=45;png.data[i+3]=255;}return {name,mimeType:'image/png',buffer:PNG.sync.write(png)};};
  await start(page,'Crop review','66',[make('1-reference.png',300),make('2-wide.png',900)]);
  await page.getByRole('button',{name:'Select frame 2',exact:true}).click();await expect(page.getByText('Aspect mismatch: edges will be cropped.',{exact:false})).toBeVisible();await save(page);
  await openViewingTools(page);await page.getByTestId('mode-toggle').click();await openFrame(page,1);await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
  const ref=PNG.sync.read(await captureCanvas(page));const cx=ref.width/2,cy=ref.height/2;
  const rgb=(p:PNG,x:number,y:number)=>[...p.data.subarray((Math.round(y)*p.width+Math.round(x))*4,(Math.round(y)*p.width+Math.round(x))*4+3)];
  const green=(p:PNG,x:number,y:number)=>{const c=rgb(p,x,y);return c[1]>c[0]+60;};
  let left=cx,right=cx,top=cy,bottom=cy;while(left>0&&green(ref,left-1,cy))left--;while(right<ref.width-1&&green(ref,right+1,cy))right++;while(top>0&&green(ref,cx,top-1))top--;while(bottom<ref.height-1&&green(ref,cx,bottom+1))bottom++;
  expect(right-left).toBeGreaterThan(200);
  // Filtering the clear photo aperture must not leave a white inversion fringe.
  const centerMax=Math.max(...rgb(ref,cx,cy));
  for(let d=-2;d<=3;d++)for(const [x,y] of [[left+d,cy],[right-d,cy],[cx,top+d],[cx,bottom-d]])expect(Math.max(...rgb(ref,x,y))).toBeLessThanOrEqual(centerMax+8);
  await openViewingTools(page);await page.getByTestId('mode-toggle').click();await page.waitForTimeout(300);const negative=PNG.sync.read(await captureCanvas(page, {path:`${OUT}/crop-negative-edge.png`}));
  for(let d=-2;d<=3;d++)for(const [x,y] of [[left+d,cy],[right-d,cy],[cx,top+d],[cx,bottom-d]])expect(Math.max(...rgb(negative,x,y)),`dark seam ${x},${y}`).toBeGreaterThan(100);
  await openViewingTools(page);await page.getByTestId('mode-toggle').click();

  await openFrame(page,2);await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
  for(const rotation of [0,90,180,270]){
    if(rotation){await library(page);await editRoll(page,'Crop review');await rotate(page,2,rotation>90);await page.screenshot({path:`${OUT}/crop-draft-${rotation}.png`});await save(page);await openFrame(page,2);await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');}
    const shot=PNG.sync.read(await captureCanvas(page, {path:`${OUT}/crop-filled-${rotation}.png`}));
    for(const x of [left+4,cx,right-4])for(const y of [top+4,cy,bottom-4])expect(green(shot,x,y),`rotation ${rotation}, gate ${x},${y}`).toBe(true);
  }
  await page.reload();await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true');await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');const restored=PNG.sync.read(await captureCanvas(page));expect(green(restored,cx,top+4)).toBe(true);
});
