import { test, expect, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
import { openRoll } from './helpers/shelf';
import { offlineServer } from './helpers/offlineServer';
import { openFrame, openViewingTools, closeViewingTools, captureCanvas } from './helpers/viewing';
import { getRegionStats } from './helpers/pixelAnalysis';
import { PRIMARY_CAMERA } from '../../src/data/cameras';

test.use({ serviceWorkers: 'allow', ignoreHTTPSErrors: true });
const entry='/?mode=inspect&reduced_motion=true';
async function ready(page:Page) {
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true',{timeout:60000});
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false',{timeout:45000});
}
async function offlineReady(page:Page) {
  await expect.poll(()=>page.evaluate(async()=>{
    const worker=navigator.serviceWorker.controller;
    if(!worker)return false;
    return new Promise<boolean>(resolve=>{
      const channel=new MessageChannel();
      const timeout=setTimeout(()=>{channel.port1.close();resolve(false);},5000);
      channel.port1.onmessage=e=>{clearTimeout(timeout);channel.port1.close();resolve(e.data.ready===true);};
      worker.postMessage({type:'STATUS'},[channel.port2]);
    });
  }),{timeout:60000}).toBe(true);
}
async function panel(page:Page) {
  await library(page);
  if(await page.locator('.offline-panel').getAttribute('open')===null)await page.locator('.offline-panel summary').click();
}
async function shelf(page:Page) {
  const tools=page.getByRole('dialog',{name:'Backups and offline',exact:true});
  if(await tools.count())await tools.getByRole('button',{name:'Close',exact:true}).click();
  await closeViewingTools(page);
  if(await page.locator('main').getAttribute('data-focus-mode')==='true')await page.getByRole('button',{name:'← Overview',exact:true}).click();
  if(await page.locator('main').getAttribute('data-shelf-focused')!=='true')await page.getByRole('button',{name:'Rolls',exact:true}).click();
  await ready(page);
}
async function library(page:Page) {
  if(await page.getByRole('dialog',{name:'Backups and offline',exact:true}).count())return;
  await shelf(page);
  await page.getByRole('button',{name:'Backups & offline',exact:true}).click();
}
function photo(width=600,height=400) {
  const p=new PNG({width,height});
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;p.data[i]=x%200+40;p.data[i+1]=y%160+40;p.data[i+2]=60;p.data[i+3]=255;}
  return {name:'offline-source.png',mimeType:'image/png',buffer:PNG.sync.write(p)};
}
async function createRoll(page:Page,name='Offline roll',source=photo()) {
  await shelf(page);await page.getByRole('button',{name:'New roll',exact:true}).click();
  await page.getByLabel('Choose photographs',{exact:true}).setInputFiles(source);
  await expect(page.getByText('Processed 1 / 1',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Continue to roll details'}).click();await page.getByLabel('Roll name',{exact:true}).fill(name);
  await page.getByRole('button',{name:'Review photographs'}).click();await page.getByRole('button',{name:'Save and open'}).click();await expect(page.getByRole('dialog',{name:'Review roll'})).toHaveCount(0);await expect(page.locator('main')).not.toHaveAttribute('data-roll-id','roll-01');await ready(page);
}
async function dbRolls(page:Page) { return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const q=indexedDB.open('darkroom-rolls');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result;if(!db.objectStoreNames.contains('rolls')){db.close();resolve([]);return;}const r=db.transaction('rolls').objectStore('rolls').getAll();r.onsuccess=()=>{db.close();resolve(r.result.filter((roll:any)=>roll.id!=='roll-01'));};};})); }
async function reloadApp(page:Page) {
  // Navigate through the page, avoiding WebKit's automation-only reload path.
  await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.evaluate(()=>location.reload())]);
}
async function rendered(page:Page,minimumDeviation=4) { await ready(page);await expect.poll(async()=>{const image=PNG.sync.read(await captureCanvas(page));return getRegionStats(image,image.width/2|0,image.height/2|0,60).stdDev;}).toBeGreaterThan(minimumDeviation); }

test('M18 reopens offline, renders defaults and stocks, and imports local photos with source detail',async({page,context,browserName},info)=>{
  const server=await offlineServer();
  const url=server.url+entry;
  try {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await ready(page);await offlineReady(page);
  // Playwright WebKit's offline emulation rejects cached SW fetches before
  // dispatch. Exercise unavailable-network behavior by stopping this test's
  // server; Chrome additionally tests navigator.onLine=false. Physical iOS
  // airplane-mode/Home Screen validation remains an explicit review gate.
  if(browserName==='webkit')await server.stop();else await context.setOffline(true);
  await reloadApp(page);await ready(page);await offlineReady(page);
  await openFrame(page,1);await rendered(page);
  for(const brightness of ['Home','End']) {
    await openViewingTools(page);await page.getByTestId('brightness-slider').press(brightness);
    // Dimmed photographs retain detail with proportionally lower contrast.
    for(let mode=0;mode<2;mode++) {await page.getByTestId('mode-toggle').click();await rendered(page,brightness==='Home'?1.2:4);}
    await closeViewingTools(page);
  }
  for(const stock of ['portra-400','portra-160','portra-800','ektar-100','ektachrome-e100']) {
    await openViewingTools(page);await page.getByLabel('Film stock',{exact:true}).selectOption(stock);await closeViewingTools(page);await rendered(page);
  }
  await page.getByTestId('loupe-activate').click();await page.getByTestId('inspect-loupe').click();await ready(page);
  await page.screenshot({path:info.outputPath('default-offline-loupe.png')});
  await page.getByTestId('inspect-loupe').click();await page.getByTestId('put-away-loupe').click();
  const source=photo(3072,2048);await createRoll(page,'Offline roll',source);const [roll]=await dbRolls(page);await openFrame(page,1);await rendered(page);
  await page.getByTestId('loupe-activate').click();await page.getByTestId('inspect-loupe').click();await ready(page);
  await expect(page.locator('canvas')).toHaveAttribute('data-texture-edge','3072',{timeout:30000});
  await page.screenshot({path:info.outputPath('imported-offline-detail.png')});
  const bytes=await page.evaluate(()=>new Promise<number[]>((resolve)=>{const q=indexedDB.open('darkroom-rolls');q.onsuccess=()=>{const db=q.result,r=db.transaction('blobs').objectStore('blobs').getAll();r.onsuccess=()=>{db.close();resolve(r.result.map(x=>x.bytes.byteLength));};};}));expect(bytes).toContain(source.buffer.length);
  const other=await context.newPage();await other.goto(url);await ready(other);await expect(other.locator('main')).toHaveAttribute('data-roll-id',roll.id);await rendered(other);await other.close();
  await reloadApp(page);await ready(page);await expect(page.locator('main')).toHaveAttribute('data-roll-id',roll.id);expect(errors).toEqual([]);
  } finally {await server.stop();}
});

test('M18 works with the production server stopped while the device remains online',async({page,context},info)=>{
  const server=await offlineServer();
  try {
    await page.goto(server.url+entry);await ready(page);await offlineReady(page);await createRoll(page,'Server stopped');
    const savedId=(await dbRolls(page))[0].id;
    await server.stop();expect(await page.evaluate(()=>navigator.onLine)).toBe(true);
    await reloadApp(page);await expect(page.locator('main')).toHaveAttribute('data-roll-id',savedId);await rendered(page);await panel(page);
    await expect(page.locator('.offline-panel')).toContainText('Server: unavailable',{timeout:15000});
    const other=await context.newPage();await other.goto(server.url+entry);await expect(other.locator('main')).toHaveAttribute('data-roll-id',savedId);await rendered(other);await other.screenshot({path:info.outputPath('server-stopped-reopen.png')});await other.close();
  }finally{await server.stop();}
});

test('M18 interrupted preparation and an incomplete cache never claim offline readiness; retry repairs them',async({page})=>{
  const server=await offlineServer();server.fail('/assets/film-stocks/portra-800.json');
  try {
    await page.goto(server.url+entry);await ready(page);await panel(page);
    await expect(page.locator('.offline-panel')).toContainText('Download incomplete',{timeout:60000});
    await expect(page.locator('.offline-panel')).not.toContainText('The app and built-in photographs are downloaded.');
    server.fail('');await page.getByRole('button',{name:'Retry offline preparation'}).click();await offlineReady(page);
    await page.evaluate(async()=>{for(const key of await caches.keys())if(key.startsWith('darkroom-app-'))await(await caches.open(key)).delete('/assets/photos/frame-05-road.jpg');});
    await page.locator('.offline-panel summary').click();await panel(page);
    await expect(page.locator('.offline-panel')).not.toContainText('The app and built-in photographs are downloaded.');
    await expect(page.locator('.offline-panel')).toContainText('Some downloads are missing');
    await page.getByRole('button',{name:'Retry offline preparation'}).click();await offlineReady(page);
  }finally{await server.stop();}
});

test('M18 update download is atomic and activation protects drafts, other tabs and saved rolls',async({page,context})=>{
  const server=await offlineServer();
  try {
    await page.goto(server.url+entry);await ready(page);await offlineReady(page);await createRoll(page);
    const id=(await dbRolls(page))[0].id;
    // The optional, content-addressed model cache must survive app releases.
    const modelBytes = await page.evaluate(async url => (await (await fetch(url)).arrayBuffer()).byteLength, PRIMARY_CAMERA.url);
    expect(modelBytes).toBeGreaterThan(1000000);
    server.release('m18-update-candidate');server.fail('/assets/film-stocks/portra-800.json');
    await panel(page);await page.getByRole('button',{name:'Retry offline preparation'}).click();
    await expect(page.locator('.offline-panel')).toContainText('Download incomplete',{timeout:60000});
    await offlineReady(page);await expect(page.getByRole('button',{name:'Update Available'})).toHaveCount(0);
    server.fail('');await page.getByRole('button',{name:'Retry offline preparation'}).click();
    await expect(page.locator('.update-notice')).toContainText('Update Available',{timeout:60000});
    await shelf(page);await page.getByRole('button',{name:'New roll',exact:true}).click();
    // A modal makes the update control inert; invoke its actual click handler to
    // verify the underlying guard also rejects programmatic activation.
    await page.getByRole('button',{name:'Update Available'}).evaluate((el:HTMLButtonElement)=>el.click());
    await expect(page.locator('.update-notice [role="alert"]')).toContainText('Save or cancel');
    await expect(page.getByLabel('Choose photographs',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Cancel draft'}).click();
    const other=await context.newPage();await other.goto(server.url+entry);await ready(other);
    await page.getByRole('button',{name:'Update Available'}).click();await expect(page.locator('.update-notice [role="alert"]')).toContainText('Close other');await other.close();
    await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.getByRole('button',{name:'Update Available'}).click()]);await ready(page);await offlineReady(page);
    await expect.poll(()=>page.evaluate(async()=>(await caches.keys()).filter(key => key.startsWith('darkroom-app-')))).toEqual(['darkroom-app-m18-update-candidate']);
    expect(await page.evaluate(async url => {
      const model = await (await caches.open('darkroom-camera-models-v1')).match(url);
      return model ? (await model.arrayBuffer()).byteLength : 0;
    }, PRIMARY_CAMERA.url)).toBe(modelBytes);
    await expect(page.locator('main')).toHaveAttribute('data-roll-id',id);expect(await dbRolls(page)).toHaveLength(1);
  }finally{await server.stop();}
});

test('M18 storage denial is explained and failed backup imports preserve the library',async({page},info)=>{
  await page.addInitScript(()=>{if(navigator.storage)Object.defineProperty(navigator.storage,'persist',{value:async()=>false});});
  await page.goto(entry);await ready(page);await offlineReady(page);await panel(page);
  await page.getByRole('button',{name:'Protect saved storage'}).click();await expect(page.locator('.offline-panel')).toContainText('not granted');
  await createRoll(page);await library(page);
  await page.getByLabel('Import backup',{exact:true}).setInputFiles({name:'broken.darkroom',mimeType:'application/octet-stream',buffer:Buffer.from('broken')});
  await expect(page.getByRole('alert')).toContainText('Invalid or damaged');expect(await dbRolls(page)).toHaveLength(1);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export all rolls'}).click();const file=await download;const archive=info.outputPath('quota.darkroom');await file.saveAs(archive);
  await page.evaluate(()=>{const original=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args:Parameters<IDBObjectStore['add']>){if(this.name==='blobs')throw new DOMException('No space','QuotaExceededError');return original.apply(this,args);};});
  await page.getByLabel('Import backup',{exact:true}).setInputFiles(archive);await expect(page.getByRole('alert')).toContainText('storage is full');expect(await dbRolls(page)).toHaveLength(1);await fs.unlink(archive);
});

test('M18 backup migrates HTTP to an independent HTTPS origin and leaves the old library intact',async({page,context},info)=>{
  const old=await offlineServer(),secure=await offlineServer(true);
  try {
    await page.goto(old.url+entry);await ready(page);await createRoll(page,'Migrated roll');await library(page);await page.getByLabel('Roll to export').selectOption({label:'Migrated roll'});
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export selected roll'}).click();const file=await download;const archive=info.outputPath('migration.darkroom');await file.saveAs(archive);await page.close();
    // A non-loopback HTTP origin has no SubtleCrypto or service worker. Seed
    // its library through the backup UI, then export there before moving HTTPS.
    const legacy=await context.newPage(),legacyUrl=old.url.replace('127.0.0.1','old-darkroom.test');
    await legacy.route(legacyUrl+'/**',async route=>{const response=await route.fetch({url:route.request().url().replace('old-darkroom.test','127.0.0.1')});await route.fulfill({response});});
    await legacy.goto(legacyUrl+entry);await ready(legacy);expect(await legacy.evaluate(()=>window.isSecureContext)).toBe(false);
    await panel(legacy);await expect(legacy.locator('.offline-panel')).toContainText('Server: reachable');
    await library(legacy);await legacy.getByLabel('Import backup',{exact:true}).setInputFiles(archive);await expect(legacy.getByText('Imported 1 roll as separate copies.',{exact:false})).toBeVisible();
    await legacy.getByLabel('Roll to export').selectOption({label:'Migrated roll'});const legacyDownload=legacy.waitForEvent('download');await legacy.getByRole('button',{name:'Export selected roll'}).click();await(await legacyDownload).saveAs(archive);
    const source=(await dbRolls(legacy))[0];
    // Migrate by navigating the same tab; old-origin storage survives without
    // keeping two software-rendered WebGL scenes resident on the test host.
    const target=legacy;await target.goto(secure.url+entry);await ready(target);await library(target);
    expect(await dbRolls(target)).toEqual([]);
    await target.getByLabel('Import backup',{exact:true}).setInputFiles(archive);await expect(target.getByText('Imported 1 roll as separate copies.',{exact:false})).toBeVisible();
    await shelf(target);await openRoll(target,'Migrated roll');
    await expect(target.getByRole('dialog',{name:'Backups and offline',exact:true})).toHaveCount(0);
    await expect(target.locator('main')).not.toHaveAttribute('data-roll-id','roll-01');await rendered(target);
    const copy=(await dbRolls(target))[0];expect(copy.id).not.toBe(source.id);expect(copy.name).toBe(source.name);expect(copy.frameIds).toHaveLength(1);
    await target.screenshot({path:info.outputPath('migrated-https-library.png')});
    await target.goto(legacyUrl+entry);await ready(target);expect(await dbRolls(target)).toEqual([source]);
    await target.close();await fs.unlink(archive);
  } finally {await old.stop();await secure.stop();}
});

test('M18 update notice reserves space above every viewing mode and appears without reloading',async({page},info)=>{
  const server=await offlineServer();
  try {
    await page.goto(server.url+entry);await ready(page);await offlineReady(page);
    await expect(page.getByText('Available offline',{exact:true})).toHaveCount(0);
    await expect(page.locator('.update-notice')).toHaveCount(0);
    const initial=await page.locator('main').boundingBox();expect(initial!.y).toBe(0);expect(initial!.height).toBe(page.viewportSize()!.height);
    server.release('m18-layout-update');
    // A reconnect checks for a new version in the already-open application.
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await expect(page.getByRole('button',{name:'Update Available',exact:true})).toBeVisible({timeout:60000});
    const clearOfControls=async()=>{
      await expect.poll(()=>page.evaluate(()=>{
        const notice=document.querySelector('.update-notice')!.getBoundingClientRect();
        const main=document.querySelector('main')!.getBoundingClientRect();
        const overlaps=Array.from(document.querySelectorAll('main button, main h1, main p, main span, main input, main select, main dialog[open]')).filter(el=>{
          const r=el.getBoundingClientRect(),style=getComputedStyle(el);
          return r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none'&&Number(style.opacity)>0&&r.top<notice.bottom-.5&&r.bottom>notice.top&&r.left<notice.right&&r.right>notice.left;
        }).map(el=>el.textContent?.trim().slice(0,80)||el.tagName);
        return {overlaps,above:notice.bottom<=main.top+.5,contained:main.bottom<=innerHeight+.5};
      })).toEqual({overlaps:[],above:true,contained:true});
      await expect(page.getByRole('button',{name:'Update Available',exact:true})).toBeInViewport();
    };
    const sizes=info.project.name==='desktop'?[[1280,800],[768,1024]]:[[390,844],[844,390],[320,568]];
    for(const [width,height] of sizes){
      await page.setViewportSize({width,height});await ready(page);await clearOfControls();
      await page.screenshot({path:info.outputPath(`update-overview-${width}x${height}.png`)});
      await openViewingTools(page);await clearOfControls();await closeViewingTools(page);
      await openFrame(page,1);await ready(page);await clearOfControls();
      await page.getByTestId('loupe-activate').click();await page.getByTestId('inspect-loupe').click();await ready(page);await clearOfControls();
      await page.screenshot({path:info.outputPath(`update-loupe-${width}x${height}.png`)});
      await page.getByTestId('inspect-loupe').click();await ready(page);await page.getByTestId('put-away-loupe').click();
      await page.getByRole('button',{name:'← Overview',exact:true}).click();await ready(page);
      await page.getByRole('button',{name:'← Room',exact:true}).click();await ready(page);await clearOfControls();
      const approach = page.getByTestId('approach-table-btn');
      if (await approach.isVisible()) {
        await approach.click();
      } else {
        await page.locator('.canvas-wrapper').focus();
        await page.keyboard.press('Enter');
      }
      await expect(page.locator('main')).toHaveAttribute('data-room-mode', 'inspect');
      await ready(page);
    }
    await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.getByRole('button',{name:'Update Available',exact:true}).click()]);
    await ready(page);await offlineReady(page);await expect(page.locator('.update-notice')).toHaveCount(0);
    const restored=await page.locator('main').boundingBox();expect(restored!.y).toBe(0);expect(restored!.height).toBe(page.viewportSize()!.height);
  }finally{await server.stop();}
});
