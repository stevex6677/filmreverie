// Capture the real viewer from controlled close-up angles without changing its code.
import {chromium} from '../../standalone/model-viewer/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4180';
const out=new URL('../../artifacts/model-viewer/olympus-om1-top3/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1400,height:1100}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/viewer.js',async route=>{
  const response=await route.fetch();const body=await response.text();
  await route.fulfill({response,body:body+'\nwindow.reviewView=(position,target)=>{camera.position.set(...position);controls.target.set(...target);controls.update();requestRender();};'});
 });
 await page.goto(base+'/?model=olympus-om1');
 await page.waitForFunction(()=>document.documentElement.dataset.modelReady==='true',null,{timeout:120000});
 for(const [name,position,target] of [
  ['top',[0,3.2,-.25],[0,.36,-.2]],
  ['prism-front',[.95,2.0,1.4],[.06,.48,-.15]],
  ['prism-rear',[-.95,2.0,-1.6],[.06,.48,-.15]],
  ['dial',[-.322,1.32,-.333],[-.322,.462,-.332]],
 ]) {
  await page.evaluate(({position,target})=>window.reviewView(position,target),{position,target});
  await page.waitForTimeout(1600);await page.screenshot({path:new URL(name+'.png',out).pathname});
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({screenshots:out.pathname,diagnostics:await page.evaluate(()=>window.previewDiagnostics()),errors},null,2));
} finally {await browser.close();}
