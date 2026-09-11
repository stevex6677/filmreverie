import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const output='artifacts/m13-candidates';
const browser=await chromium.launch({channel:'chrome',args:['--use-gl=angle','--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:`${output}/recording`,size:{width:1280,height:800}}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=async()=>{await page.waitForFunction(()=>{const el=document.querySelector('main');return el?.dataset.assetsReady==='true'&&el?.dataset.isTransitioning==='false';});await page.waitForTimeout(600);};
await page.goto('http://127.0.0.1:5193/?mode=room&example=1');await ready();
await page.screenshot({path:`${output}/default-45.png`});
for(let i=0;i<3;i++){await page.mouse.move(1000,400);await page.mouse.down();await page.mouse.move(550,400,{steps:30});await page.mouse.up();await page.waitForTimeout(500);}
const slider=page.getByRole('slider',{name:'Room brightness',exact:true});await slider.press('End');await slider.blur();await page.waitForTimeout(800);
await page.getByRole('switch',{name:'Room lights',exact:true}).click();await page.waitForTimeout(800);await page.getByRole('switch',{name:'Room lights',exact:true}).click();await page.waitForTimeout(800);
await page.getByTestId('approach-table-btn').click();await ready();await page.getByTestId('loupe-toggle').click();await page.mouse.move(640,400);await page.waitForTimeout(1200);await page.getByTestId('return-room-btn').click();await ready();await page.getByRole('button',{name:'Face table',exact:true}).click();await page.waitForTimeout(800);
const video=page.video();await context.close();await video.saveAs(`${output}/look-light-inspect-return.webm`);await browser.close();await fs.writeFile(`${output}/recording-errors.json`,JSON.stringify(errors));if(errors.length)throw Error(JSON.stringify(errors));
