import { shelfAction } from './helpers/shelf';
import { test, expect, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { offlineServer } from './helpers/offlineServer';
import { openFrame, openViewingTools, closeViewingTools, captureCanvas } from './helpers/viewing';
import { getRegionStats } from './helpers/pixelAnalysis';
import { PRIMARY_CAMERA } from '../../src/data/cameras';

test.use({ serviceWorkers: 'allow', ignoreHTTPSErrors: true });
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('darkroom-guest-welcome', 'done'));
});
const entry='/guest?mode=inspect&reduced_motion=true';
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
async function shelf(page:Page) {
  await closeViewingTools(page);
  if(await page.locator('main').getAttribute('data-focus-mode')==='true')await page.getByRole('button',{name:'← Overview',exact:true}).click();
  if(await page.locator('main').getAttribute('data-shelf-focused')!=='true')await page.getByRole('button',{name:'Film Shelf',exact:true}).click();
  await ready(page);
}
function photo(width=600,height=400) {
  const p=new PNG({width,height});
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;p.data[i]=x%200+40;p.data[i+1]=y%160+40;p.data[i+2]=60;p.data[i+3]=255;}
  return {name:'offline-source.png',mimeType:'image/png',buffer:PNG.sync.write(p)};
}
async function createRoll(page:Page,name='Offline roll',source=photo()) {
  await shelf(page);await shelfAction(page, 'New roll');
  await page.getByLabel('Choose photographs',{exact:true}).setInputFiles(source);
  await expect(page.getByText('Processed 1 / 1',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Continue to roll details'}).click();await page.getByLabel('Roll name',{exact:true}).fill(name);
  await page.getByRole('button',{name:'Review photographs'}).click();await page.getByRole('button',{name:'Save and open'}).click();await expect(page.getByRole('dialog',{name:'Review roll'})).toHaveCount(0);await expect(page.locator('main')).not.toHaveAttribute('data-roll-id','roll-01');await ready(page);
}
async function dbRolls(page:Page) { return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const q=indexedDB.open('darkroom-guest-rolls');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result;if(!db.objectStoreNames.contains('rolls')){db.close();resolve([]);return;}const r=db.transaction('rolls').objectStore('rolls').getAll();r.onsuccess=()=>{db.close();resolve(r.result.filter((roll:any)=>roll.id!=='roll-01'));};};})); }
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
  const bytes=await page.evaluate(()=>new Promise<number[]>((resolve)=>{const q=indexedDB.open('darkroom-guest-rolls');q.onsuccess=()=>{const db=q.result,r=db.transaction('blobs').objectStore('blobs').getAll();r.onsuccess=()=>{db.close();resolve(r.result.map(x=>x.bytes.byteLength));};};}));expect(bytes).toContain(source.buffer.length);
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
    await reloadApp(page);await expect(page.locator('main')).toHaveAttribute('data-roll-id',savedId);await rendered(page);
    const other=await context.newPage();await other.goto(server.url+entry);await expect(other.locator('main')).toHaveAttribute('data-roll-id',savedId);await rendered(other);await other.screenshot({path:info.outputPath('server-stopped-reopen.png')});await other.close();
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
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration('/'); await registration?.update(); });
    await expect.poll(() => page.evaluate(async () => !(await navigator.serviceWorker.getRegistration('/'))?.installing)).toBe(true);
    await offlineReady(page);await expect(page.getByRole('button',{name:'Update Available'})).toHaveCount(0);
    server.fail('');await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('.update-notice')).toContainText('Update Available',{timeout:60000});
    await shelf(page);await shelfAction(page, 'New roll');
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

test('M18 update notice reserves space above every viewing mode and appears without reloading',async({page},info)=>{
  const server=await offlineServer();
  try {
    await page.goto(server.url+entry);await ready(page);await offlineReady(page);
    await expect(page.getByText('Available offline',{exact:true})).toHaveCount(0);
    await expect(page.locator('.update-notice')).toHaveCount(0);
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
  }finally{await server.stop();}
});
