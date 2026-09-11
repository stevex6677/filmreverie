import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}});
await page.goto('http://127.0.0.1:5193/?mode=room&example=1');
await page.waitForFunction(()=>document.querySelector('main')?.dataset.assetsReady==='true');await page.waitForTimeout(1000);
const samples=page.evaluate(()=>new Promise(resolve=>{const values=[];let prior=performance.now(),start=prior;function frame(now){values.push(now-prior);prior=now;if(now-start<6000)requestAnimationFrame(frame);else{values.sort((a,b)=>a-b);resolve({median:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],samples:values.length});}}requestAnimationFrame(frame);}));
const box=await page.getByRole('slider',{name:'Room brightness',exact:true}).boundingBox();
for(let i=0;i<4;i++){await page.mouse.move(box.x+box.width*(i%2?.95:.05),box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*(i%2?.05:.95),box.y+box.height/2,{steps:20});await page.mouse.up();}
await fs.writeFile('artifacts/m13-candidates/performance-dimming.json',JSON.stringify({...(await samples),interaction:'Four real pointer sweeps of the room brightness slider; 1280×800, Chrome/SwiftShader as in performance-after.json.'},null,2));await browser.close();
