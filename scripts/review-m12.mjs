import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const output='artifacts/m12-candidates';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:`${output}/recording`,size:{width:1280,height:800}}});
await context.addInitScript(() => {
 const live = new Set(); let created=0,deleted=0;
 for (const type of [WebGLRenderingContext,WebGL2RenderingContext]) {const create=type.prototype.createTexture,remove=type.prototype.deleteTexture;type.prototype.createTexture=function(){const texture=create.call(this);if(texture){live.add(texture);created++;}return texture;};type.prototype.deleteTexture=function(texture){if(live.delete(texture))deleted++;return remove.call(this,texture);};}
 window.__m12TextureStats=()=>({live:live.size,created,deleted});
});
const page=await context.newPage(),errors=[],uploads=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());});
const ready=async()=>{await page.waitForFunction(()=>{const el=document.querySelector('main');return el?.dataset.assetsReady==='true'&&el?.dataset.isTransitioning==='false';});await page.waitForTimeout(600);};
const library=async()=>{await page.getByRole('button',{name:'Rolls',exact:true}).click();};
const make=async(name,format,photos)=>{await library();await page.getByRole('button',{name:'New roll',exact:true}).click();await page.getByLabel('Roll name',{exact:true}).fill(name);await page.getByRole('dialog').getByLabel('Film format',{exact:true}).selectOption(format);await page.getByRole('dialog').getByLabel('Film stock',{exact:true}).selectOption('ektachrome-e100');await page.getByLabel('Choose photographs').setInputFiles(photos.map(p=>path.resolve(`photos/roll-01/${p}.png`)));await page.getByRole('button',{name:'Save and open',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Save and open');return b&&!b.disabled;});await page.screenshot({path:`${output}/real-${format}-draft.png`});await page.getByRole('button',{name:'Save and open',exact:true}).click();await ready();};
try{
 await page.goto('http://127.0.0.1:5193/?mode=room');await ready();
 await make('Harbor evening · review example','135',['frame-01-harbor','frame-02-diner','frame-03-bicycle','frame-04-laundromat','frame-05-road']);
 await page.getByRole('button',{name:'Open frame 2',exact:true}).click();await ready();await page.getByTestId('loupe-toggle').click();await page.waitForTimeout(1200);await page.screenshot({path:`${output}/real-35mm-loupe.png`});
 await make('Medium format · fit review','69',['frame-01-harbor','frame-02-diner','frame-03-bicycle']);await page.screenshot({path:`${output}/real-120-whole-roll.png`});
 await page.getByRole('button',{name:'Open frame 3',exact:true}).click();await ready();await page.getByTestId('loupe-toggle').click();await page.waitForTimeout(1200);await page.screenshot({path:`${output}/real-120-loupe.png`});
 await library();await page.screenshot({path:`${output}/real-library.png`});await page.getByRole('button',{name:'Open Harbor evening · review example',exact:true}).click();await ready();
 const beforeReloadResources=await page.evaluate(()=>window.__m12TextureStats());
 await page.reload();await ready();await page.screenshot({path:`${output}/real-restored.png`});
 const performance=await page.evaluate(async()=>{const times=[];let last=performance.now();await new Promise(resolve=>{const frame=now=>{times.push(now-last);last=now;if(times.length<60)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});times.sort((a,b)=>a-b);return {medianMs:times[30],p95Ms:times[57],textureStats:window.__m12TextureStats()};});
 const evidence=await page.evaluate(()=>({title:document.title,selectedFrame:document.querySelector('main').dataset.selectedFrame,rollId:document.querySelector('main').dataset.rollId,browser:navigator.userAgent,renderer:(()=>{const gl=document.querySelector('canvas').getContext('webgl2');return gl?.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);})()}));
 await fs.writeFile(`${output}/normal-browser-review.json`,JSON.stringify({...evidence,performance,beforeReloadResources,errors,uploads,fixture:'Five existing positive PNG masters imported into an isolated review browser; no user library data accessed.'},null,2));
 if(errors.length||uploads.length)throw new Error(JSON.stringify({errors,uploads}));
}finally{const video=page.video();await context.close();if(video)await fs.rename(await video.path(),`${output}/m12-interaction.webm`);await browser.close();}
