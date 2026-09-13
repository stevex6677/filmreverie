import { openViewingTools, captureCanvas } from "./helpers/viewing";
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
const output=process.env.M12_PANEL_CANDIDATE_DIR || 'artifacts/m12-panel-review';

for(const format of ['135','69']) test(`M12 ${format} exposed panel has no phantom strip at either brightness`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await fs.mkdir(output,{recursive:true});await page.goto('/?mode=inspect&reduced_motion=true');
  await page.getByRole('button',{name:'Rolls',exact:true}).click();await page.getByRole('button',{name:'New roll',exact:true}).click();
  await page.getByLabel('Choose photographs').setInputFiles(Array.from({length:format==='135'?7:3},(_,n)=>{
    const png=new PNG({width:180,height:120});for(let i=0;i<png.data.length;i+=4){png.data[i]=18+n*3;png.data[i+1]=150;png.data[i+2]=230;png.data[i+3]=255;}
    return {name:`frame${n+1}.png`,mimeType:'image/png',buffer:PNG.sync.write(png)};
  }));
  await page.getByRole('button',{name:'Continue to roll details',exact:true}).click();await page.getByLabel('Roll name',{exact:true}).fill('Uniform panel regression');await page.getByRole('radio',{name:format==='135'?'35mm':'120',exact:true}).check();await page.getByLabel('Film format',{exact:true}).selectOption(format);await page.getByRole('button',{name:'Review photographs',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save and open',exact:true})).toBeEnabled({timeout:60000});await page.getByRole('button',{name:'Save and open',exact:true}).click();
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true');await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
  await page.waitForTimeout(600);
  const measurements=[];
  for(const mode of ['negative','positive']){
    if(mode==='positive'){await openViewingTools(page);await page.getByTestId('mode-toggle').click();}
    const brightnessValues=[];
    for(const brightness of [30,100]){
      await openViewingTools(page);const slider=page.getByTestId('brightness-slider');await slider.focus();await slider.press(brightness===30?'Home':'End');await expect(slider).toHaveValue(brightness===30?'0.3':'1');await slider.blur();await page.waitForTimeout(500);
      const png=PNG.sync.read(await captureCanvas(page, {path:`${output}/${format}-${mode}-${brightness}.png`}));
      const values:number[]=[];
      // Broad exposed panel patches, rejecting photos, dark borders, tiny text,
      // and panel/chassis boundaries. The obsolete strip shadow lies in this area.
      for(let y=175;y<Math.min(595,png.height-10);y+=6)for(let x=180;x<Math.min(950,png.width-10);x+=6){
        const patch:number[]=[];let neutral=true;
        for(const dy of [-4,0,4])for(const dx of [-4,0,4]){const i=((y+dy)*png.width+x+dx)*4;const c=[png.data[i],png.data[i+1],png.data[i+2]];if(Math.max(...c)-Math.min(...c)>2||Math.min(...c)<100)neutral=false;patch.push(c[0]);}
        if(neutral&&Math.max(...patch)-Math.min(...patch)<=2)values.push(patch[4]);
      }
      expect(values.length).toBeGreaterThan(300);
      expect(Math.max(...values)-Math.min(...values),'all exposed panel patches must have the same luminance').toBeLessThanOrEqual(2);
      const mean=values.reduce((a,b)=>a+b,0)/values.length;brightnessValues.push(mean);measurements.push({mode,brightness,patches:values.length,min:Math.min(...values),max:Math.max(...values),mean});
    }
    expect(brightnessValues[1]-brightnessValues[0]).toBeGreaterThan(60);
  }
  await fs.writeFile(`${output}/${format}-measurements.json`,JSON.stringify(measurements,null,2));expect(errors).toEqual([]);
});
