import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({channel:'chrome',args:['--use-gl=angle','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
await page.goto('http://127.0.0.1:5193/?mode=room&example=1');
await page.waitForFunction(()=>document.querySelector('main')?.dataset.assetsReady==='true');
await page.waitForTimeout(1500);
const measure=page.evaluate(()=>new Promise(resolve=>{const times=[];let last=performance.now(),start=last;function frame(now){times.push(now-last);last=now;if(now-start<6000)requestAnimationFrame(frame);else {times.sort((a,b)=>a-b);const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');resolve({median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],samples:times.length,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),userAgent:navigator.userAgent});}}requestAnimationFrame(frame);}));
for(let i=0;i<4;i++){await page.mouse.move(700,450);await page.mouse.down();await page.mouse.move(i%2?850:450,420,{steps:12});await page.mouse.up();}
const result=await measure;await fs.writeFile(`artifacts/m13-candidates/performance-${process.env.REVIEW_PHASE||'before'}.json`,JSON.stringify(result,null,2));await browser.close();
