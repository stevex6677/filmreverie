import {chromium,devices} from '../../standalone/model-viewer/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4180';
const out=new URL(process.env.OM1_REVIEW_DIR||'../../artifacts/model-viewer/olympus-om1/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const reports=[];
try{
 for(const [name,options] of [['desktop',{viewport:{width:1400,height:1050}}],['tablet',{...devices['iPad Pro 11'],deviceScaleFactor:1}]]){
  const context=await browser.newContext(options);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?model=olympus-om1');await page.waitForFunction(()=>document.documentElement.dataset.modelReady==='true',null,{timeout:120000});
  const initial=await page.evaluate(()=>window.previewDiagnostics());assert.equal(initial.modelId,'olympus-om1');assert(initial.triangles>100000);assert(initial.ready);
  await page.waitForTimeout(1500);await page.screenshot({path:new URL(name+'-home.png',out).pathname});
  for(const view of ['Front','Rear','Side']){await page.getByRole('button',{name:view,exact:true}).click();await page.waitForTimeout(700);await page.screenshot({path:new URL(name+'-'+view.toLowerCase()+'.png',out).pathname});}
  await page.getByRole('button',{name:'Front',exact:true}).click();await page.waitForTimeout(500);
  const before=await page.evaluate(()=>window.previewDiagnostics());
  if(name==='desktop'){
   await page.mouse.move(700,510);await page.mouse.down();await page.mouse.move(820,740,{steps:18});await page.mouse.up();
  }else{
   const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:430,y:500}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:630,y:570}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   const distance=()=>page.evaluate(()=>{const d=window.previewDiagnostics();return Math.hypot(...d.camera.map((v,i)=>v-d.target[i]));});
   await page.waitForTimeout(400);const d1=await distance();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:350,y:500},{x:550,y:500}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:300,y:500},{x:600,y:500}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(400);assert(await distance()<d1);
  }
  await page.waitForTimeout(900);const after=await page.evaluate(()=>window.previewDiagnostics());assert.notDeepEqual(after.camera,before.camera);await page.screenshot({path:new URL(name+'-orbit.png',out).pathname});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  reports.push({name,initial,orbitVerified:true,pinchVerified:name==='tablet',errors});await context.close();
 }
 const response=await fetch(base+'/assets/models/olympus-om1.glb');assert.equal(response.status,200);const bytes=(await response.arrayBuffer()).byteLength;assert(bytes<10000000);
 const range=await fetch(base+'/assets/models/olympus-om1.glb',{headers:{Range:'bytes=0-11'}});assert.equal(range.status,206);
 fs.writeFileSync(new URL('verification.json',out),JSON.stringify({base,bytes,reports,physicalDeviceTested:false},null,2));console.log(JSON.stringify({out:out.pathname,bytes,reports},null,2));
}finally{await browser.close();}
