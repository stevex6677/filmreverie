import { chromium } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
const phase=process.env.REVIEW_PHASE||'before',out=`artifacts/m14-candidates/${phase}`;await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:out}});await context.tracing.start({screenshots:true,snapshots:true});const page=await context.newPage();
await page.goto('http://127.0.0.1:5193/?mode=inspect&example=1');
await page.getByRole('button',{name:'Rolls',exact:true}).click();await page.getByRole('button',{name:'New roll',exact:true}).click();
const files=[];const names=await fs.readdir('photos/roll-01');
for(let i=0;i<24;i++){const image=await loadImage(`photos/roll-01/${names[i%names.length]}`);const canvas=createCanvas(2400,1600),ctx=canvas.getContext('2d');const inset=Math.floor(i/names.length)*.04;ctx.drawImage(image,image.width*inset,image.height*inset,image.width*(1-2*inset),image.height*(1-2*inset),0,0,2400,1600);files.push({name:`scan${i+1}.jpg`,mimeType:'image/jpeg',buffer:canvas.toBuffer('image/jpeg')});}
await page.getByLabel('Choose photographs',{exact:true}).setInputFiles(files);await page.getByText('Processed 24 / 24',{exact:true}).waitFor({timeout:120000});
if(phase!=='before')await page.getByRole('button',{name:'Continue to roll details'}).click();
await page.getByLabel('Roll name',{exact:true}).fill('Navigation study — 24 distinct crops');
if(phase!=='before')await page.getByRole('button',{name:'Review photographs'}).click();
await page.getByRole('button',{name:'Save and open',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('main')?.dataset.assetsReady==='true');
await page.evaluate(()=>{window.__samples=[];window.__running=true;let last=performance.now();function sample(now){const m=document.querySelector('main'),c=document.querySelector('canvas');window.__samples.push({dt:now-last,t:now,frame:m?.dataset.selectedFrame,ready:m?.dataset.assetsReady,moving:m?.dataset.isTransitioning,camera:c?.dataset.cameraPosition});last=now;if(window.__running)requestAnimationFrame(sample);}requestAnimationFrame(sample);});
for(const frame of [5,6,7,8,24,1]){await page.getByLabel(`Open frame ${frame}`,{exact:true}).click();await page.waitForTimeout(1800);}
await page.getByLabel('Open frame 5',{exact:true}).click();await page.waitForTimeout(1800);await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.waitForTimeout(2000);
const samples=await page.evaluate(()=>{window.__running=false;return window.__samples;});await fs.writeFile(`${out}/navigation.json`,JSON.stringify({provenance:'24 distinct 2400px crops from five repository photographs, imported through native chooser; synthetic distinct-source load study, not 24 independent photographs',samples},null,2));await page.screenshot({path:`${out}/navigation.png`});await context.tracing.stop({path:`${out}/trace.zip`});await context.close();await browser.close();
