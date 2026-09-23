// Actual Draco delivery, decoder response, desktop orbit and tablet pinch gate.
import {chromium, devices} from '../../standalone/model-viewer/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root, loadCatalog} from '../../standalone/model-viewer/catalog.mjs';
const model=loadCatalog().models.find(m=>m.public.id==='canon-demi-ee17');
const out=path.dirname(model.file);
const expectedTriangles=JSON.parse(fs.readFileSync(path.join(out,'compact_export_report.json'),'utf8')).triangles;
const server=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PREVIEW_HOST:'127.0.0.1',PREVIEW_PORT:'0'},stdio:['ignore','pipe','inherit']});
try {
  const base=await new Promise((resolve,reject)=>{
    server.stdout.on('data',chunk=>{const match=chunk.toString().match(/http:\/\/[^\s]+/);if(match)resolve(match[0]);});
    server.once('exit',code=>reject(Error(`Server exited ${code}`)));
  });
  const asset=await fetch(base+model.public.url,{method:'HEAD'});
  assert.equal(asset.status,200);assert(Number(asset.headers.get('content-length'))<10_000_000);
  const wasm=await fetch(base+'/vendor/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm');
  assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');
  const reports=[];
  for(const [name,options] of [['desktop',{viewport:{width:1200,height:850}}],['ipad',{...devices['iPad Pro 11'],deviceScaleFactor:1}]]) {
    const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-webgl','--ignore-gpu-blocklist']});
    try {
      const context=await browser.newContext(options);const page=await context.newPage();const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base+'/?model=canon-demi-ee17');
      await page.waitForFunction(()=>document.documentElement.dataset.modelReady==='true',null,{timeout:120000});
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('#loading')).opacity==='0');
      const initial=await page.evaluate(()=>window.previewDiagnostics());
      assert.equal(initial.modelId,'canon-demi-ee17');assert.equal(initial.triangles,expectedTriangles);
      await page.screenshot({path:path.join(out,`browser-${name}-home-ready.png`)});
      await page.getByRole('button',{name:'Front',exact:true}).click();await page.waitForTimeout(500);
      await page.screenshot({path:path.join(out,`browser-${name}-front-ready.png`)});
      await page.getByRole('button',{name:'Rear',exact:true}).click();await page.waitForTimeout(500);
      assert((await page.evaluate(()=>window.previewDiagnostics())).camera[2]<0);
      await page.getByRole('button',{name:'Home',exact:true}).click();
      if(name==='ipad') {
        const cdp=await context.newCDPSession(page);
        const before=await page.evaluate(()=>Math.hypot(...window.previewDiagnostics().camera));
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:380,y:500},{x:580,y:500}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:330,y:500},{x:630,y:500}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(400);
        assert((await page.evaluate(()=>Math.hypot(...window.previewDiagnostics().camera)))<before);
      } else {
        await page.mouse.move(620,420);await page.mouse.down();await page.mouse.move(800,500,{steps:12});await page.mouse.up();
        await page.waitForTimeout(500);assert.notDeepEqual((await page.evaluate(()=>window.previewDiagnostics())).camera,initial.camera);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);reports.push({name,initial,errors,rear:true,orbitOrPinch:true});
    } finally {await browser.close();}
  }
  fs.writeFileSync(path.join(out,'browser_verification.json'),JSON.stringify({bytes:Number(asset.headers.get('content-length')),wasm:true,reports},null,2));
  console.log(JSON.stringify({out,reports},null,2));
} finally {server.kill('SIGTERM');}
