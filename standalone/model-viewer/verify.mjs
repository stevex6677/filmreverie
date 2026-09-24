import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root} from './catalog.mjs';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4180';
const out=path.resolve(root,`../../artifacts/model-viewer/${new Date().toISOString().replace(/[:.]/g,'-')}`);
fs.mkdirSync(out,{recursive:true});
const reports=[];
for(const [name,engine,options] of [['desktop',chromium,{viewport:{width:1200,height:850},deviceScaleFactor:1}],['ipad',chromium,{...devices['iPad Pro 11'],deviceScaleFactor:1}]] ){
 const browser=await engine.launch({headless:true,channel:'chrome',args:['--no-sandbox','--use-gl=angle',...(process.platform==='linux'?['--use-angle=vulkan']:[]),'--enable-webgl','--ignore-gpu-blocklist']});
 try{
 const context=await browser.newContext(options);const page=await context.newPage();const errors=[];
 page.setDefaultTimeout(30000);
 console.log(`Verifying standalone viewer: ${name}`);
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>document.documentElement.dataset.modelReady==='true',{},{timeout:120000});
 await page.waitForTimeout(1500);const initial=await page.evaluate(()=>window.previewDiagnostics());
 assert(initial.ready);assert(initial.triangles>10000);assert.equal(errors.length,0,errors.join('\n'));
 await page.screenshot({path:`${out}/${name}-front.png`,timeout:90000});
 await page.getByRole('button',{name:'Rear',exact:true}).click();await page.waitForTimeout(700);
 const rear=await page.evaluate(()=>window.previewDiagnostics());assert(rear.camera[2]<0);
 await page.screenshot({path:`${out}/${name}-rear.png`,timeout:90000});
 await page.getByRole('button',{name:'Home',exact:true}).click();
 if(name==='desktop'){
 await page.mouse.move(650,400);await page.mouse.down();await page.mouse.move(920,470,{steps:15});await page.mouse.up();
 }else{
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:450,y:430}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:650,y:450}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(300);
 const distanceBefore=await page.evaluate(()=>{const d=window.previewDiagnostics();return Math.hypot(...d.camera.map((v,i)=>v-d.target[i]));});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:380,y:500},{x:580,y:500}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:330,y:500},{x:630,y:500}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(300);
 const distanceAfter=await page.evaluate(()=>{const d=window.previewDiagnostics();return Math.hypot(...d.camera.map((v,i)=>v-d.target[i]));});
 assert(distanceAfter<distanceBefore,'pinch-out should zoom in');
 }
 await page.waitForTimeout(1000);const moved=await page.evaluate(()=>window.previewDiagnostics());
 assert.notDeepEqual(moved.camera,initial.camera);
 const beforeZoom=Math.hypot(...moved.camera.map((v,i)=>v-moved.target[i]));
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(300);
 const zoomed=await page.evaluate(()=>window.previewDiagnostics());assert(Math.hypot(...zoomed.camera.map((v,i)=>v-zoomed.target[i]))<beforeZoom);
 await page.getByRole('button',{name:'Auto Rotate'}).click();assert(await page.getByRole('button',{name:'Auto Rotate'}).getAttribute('aria-pressed')==='true');
 await page.waitForTimeout(600);await page.getByRole('button',{name:'Auto Rotate'}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 reports.push({name,engine:'Chromium',emulatedTablet:name==='ipad',initial,dragged:true,zoomed:true,autoRotate:true,errors});
 await context.close();
 }finally{await browser.close();}
}
const health=await fetch(base+'/health');assert.equal(health.status,200);
assert.equal((await fetch(base+'/package.json')).status,404);
assert.equal((await fetch(base+'/assets/model.glb',{headers:{Range:'bytes=0-11'}})).status,206);
fs.writeFileSync(out+'/verification.json',JSON.stringify(reports,null,2));console.log(JSON.stringify({out,reports},null,2));
