import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const output='artifacts/m12-border-review';await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-gl=angle','--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:`${output}/recording`,size:{width:1280,height:800}}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const ready=async()=>{await page.waitForFunction(()=>{const e=document.querySelector('main');return e?.dataset.assetsReady==='true'&&e?.dataset.isTransitioning==='false';});await page.waitForTimeout(500);};
try {
 await page.goto('http://127.0.0.1:5193/?mode=inspect');await ready();
 await page.getByRole('button',{name:'Rolls',exact:true}).click();await page.getByRole('button',{name:'New roll',exact:true}).click();await page.getByLabel('Roll name',{exact:true}).fill('120 border and crop review');await page.getByLabel('Film format',{exact:true}).selectOption('66');await page.getByRole('dialog').getByLabel('Film stock',{exact:true}).selectOption('ektar-100');
 await page.getByLabel('Choose photographs').setInputFiles(['frame-01-harbor','frame-02-diner','frame-03-bicycle'].map(p=>path.resolve(`photos/roll-01/${p}.png`)));
 await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Save and open');return b&&!b.disabled;});await page.screenshot({path:`${output}/real-crop-preview.png`});await page.getByRole('button',{name:'Save and open',exact:true}).click();await ready();
 for(const stock of ['ektar-100','portra-160','portra-400','portra-800','ektachrome-e100']){
  await page.getByLabel('Film stock',{exact:true}).selectOption(stock);await ready();await page.getByRole('button',{name:'Whole roll',exact:true}).click();await ready();
  if(stock!=='ektachrome-e100' && await page.locator('main').getAttribute('data-film-mode')==='positive')await page.getByTestId('mode-toggle').click();
  await page.screenshot({path:`${output}/${stock}-whole-${stock==='ektachrome-e100'?'positive':'negative'}.png`});
  if(stock!=='ektachrome-e100'){await page.getByTestId('mode-toggle').click();await page.waitForTimeout(500);await page.screenshot({path:`${output}/${stock}-whole-positive.png`});}
 }
 await page.getByLabel('Film stock',{exact:true}).selectOption('ektar-100');await page.getByLabel('Open frame 2',{exact:true}).click();await ready();await page.screenshot({path:`${output}/120-frame-negative.png`});await page.getByTestId('mode-toggle').click();await page.waitForTimeout(500);await page.screenshot({path:`${output}/120-frame-positive.png`});
 await page.keyboard.down('Space');await page.mouse.move(640,400);await page.mouse.down();await page.mouse.move(640,545,{steps:12});await page.mouse.up();await page.keyboard.up('Space');await page.waitForTimeout(400);await page.getByTestId('loupe-toggle').click();await page.getByTestId('mag-btn-4x').click();await page.mouse.move(550,315);await page.waitForTimeout(600);await page.screenshot({path:`${output}/120-border-loupe.png`});
 await fs.writeFile(`${output}/visual-review.json`,JSON.stringify({errors,fixture:'Three bundled positive masters imported in an isolated browser; 6x6 center crops, five stock borders, and whole-strip inversion.'},null,2));if(errors.length)throw Error(JSON.stringify(errors));
} finally {const video=page.video();await context.close();if(video)await fs.rename(await video.path(),`${output}/border-review.webm`);await browser.close();}
