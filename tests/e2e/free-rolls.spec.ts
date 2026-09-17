import { test, expect, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { openFrame, captureCanvas } from './helpers/viewing';
const OUT=process.env.FREE_ROLLS_ARTIFACTS_DIR || '/tmp/free-rolls-review';
function photo(i:number,aspect=1.5){
  const width=Math.round(120*aspect),height=120,png=new PNG({width,height});
  for(let j=0;j<png.data.length;j+=4){png.data[j]=25;png.data[j+1]=175+i;png.data[j+2]=45;png.data[j+3]=255;}
  return {name:`scan${i+1}.png`,mimeType:'image/png',buffer:PNG.sync.write(png)};
}
async function begin(page:Page,count:number,aspects:number[]=[1.5]){
  await page.goto('/?mode=inspect&reduced_motion=true');
  await page.getByRole('button',{name:'Rolls',exact:true}).click();
  await page.getByRole('button',{name:'New roll',exact:true}).click();
  await page.getByLabel('Choose photographs').setInputFiles(Array.from({length:count},(_,i)=>photo(i,aspects[i%aspects.length])));
  await expect(page.getByRole('status').filter({hasText:'Processed'})).toContainText(`${count} / ${count}`);
  await page.getByRole('button',{name:'Continue to roll details'}).click();
  await page.getByLabel('Roll name',{exact:true}).fill('Mixed sizes');
}
async function save(page:Page){
  await page.getByRole('button',{name:'Save and open',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true');
  await expect(page.locator('main')).toHaveAttribute('data-is-transitioning','false');
}
for(const film of ['35mm','120']) test(`${film} free frames preserve proportions through review, rendering and reload`,async({page},testInfo)=>{
  const out=`${OUT}/${testInfo.project.name}`;
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const aspects=film==='35mm'?[1.5,2.7]:[1,2];
  await begin(page,film==='35mm'?24:8,aspects);
  await page.getByRole('radio',{name:film,exact:true}).check();
  if(film==='35mm'){
    await expect(page.getByLabel('Film format',{exact:true})).toHaveValue('135');
    await page.getByLabel('Film format',{exact:true}).selectOption('free');
  }else await expect(page.getByLabel('Film format',{exact:true})).toHaveValue('free');
  await page.getByRole('dialog').getByLabel('Film stock',{exact:true}).selectOption('ektachrome-e100');
  await page.getByRole('button',{name:'Review photographs',exact:true}).click();
  await expect(page.getByText('Full composition · no cropping',{exact:true})).toBeVisible();
  await expect(page.getByRole('slider',{name:/crop position/})).toHaveCount(0);
  const previews=await page.locator('.draft-preview').evaluateAll(nodes=>nodes.slice(0,2).map(n=>{const r=n.getBoundingClientRect();return r.width/r.height;}));
  previews.forEach((ratio,i)=>expect(ratio).toBeCloseTo(aspects[i],1));
  await page.screenshot({path:`${out}/${film}-review.png`});await save(page);
  await page.screenshot({path:`${out}/${film}-whole-roll.png`});
  const overview=PNG.sync.read(await captureCanvas(page));
  const photoRows:number[]=[];
  for(let y=0;y<overview.height;y++)for(let x=0;x<overview.width;x++){
    const p=(y*overview.width+x)*4;
    if(overview.data[p+1]>overview.data[p]+60){photoRows.push(y);break;}
  }
  expect(photoRows[0]).toBeGreaterThan(90);
  expect(photoRows.at(-1)).toBeLessThan(overview.height-90);
  for(const n of [1,2]){
    await openFrame(page,n);
    const png=PNG.sync.read(await captureCanvas(page,{path:`${out}/${film}-frame-${n}.png`}));
    const cx=Math.floor(png.width/2),cy=Math.floor(png.height/2);
    const green=(x:number,y:number)=>{const i=(y*png.width+x)*4;return png.data[i+1]>png.data[i]+40;};
    expect(green(cx,cy)).toBe(true);
    let l=cx,r=cx,t=cy,b=cy;
    while(l>0&&green(l-1,cy))l--;while(r<png.width-1&&green(r+1,cy))r++;
    while(t>0&&green(cx,t-1))t--;while(b<png.height-1&&green(cx,b+1))b++;
    expect((r-l)/(b-t)).toBeCloseTo(aspects[n-1],1);
  }
  const last=film==='35mm'?24:8;
  await openFrame(page,last);
  // View persistence waits for camera/asset settlement; reload after the write commits.
  await expect.poll(()=>page.evaluate(async(index)=>new Promise<boolean>((resolve,reject)=>{
    const request=indexedDB.open('darkroom-rolls');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result,read=db.transaction('rolls').objectStore('rolls').getAll();read.onsuccess=()=>{db.close();resolve(read.result.find((r:any)=>r.id!=='roll-01')?.view?.frameId===read.result.find((r:any)=>r.id!=='roll-01')?.frameIds[index]);};read.onerror=()=>{db.close();reject(read.error);};};
  }),last-1)).toBe(true);
  await page.reload();
  await expect(page.locator('main')).toHaveAttribute('data-assets-ready','true');
  await expect(page.locator('main')).toHaveAttribute('data-selected-frame',film==='35mm'?'24':'8');
  await page.getByRole('button',{name:'← Overview',exact:true}).click();
  await page.getByRole('button',{name:'Rolls',exact:true}).click();
  await page.getByRole('button',{name:'Show saved roll Mixed sizes',exact:true}).click();
  await expect(page.getByLabel('Film format',{exact:true})).toHaveValue('free');

  await page.getByRole('button',{name:'Select frame 2',exact:true}).click();
  await page.getByLabel('Rotate frame 2',{exact:true}).click();
  const ratio=await page.locator('.draft-preview').nth(1).evaluate(n=>{const r=n.getBoundingClientRect();return r.width/r.height;});
  expect(ratio).toBeCloseTo(1/aspects[1],1);
  await save(page);expect(errors).toEqual([]);
});
test('length limit blocks saving and recovers after removing a photograph',async({page})=>{
  await begin(page,46);
  await expect(page.getByLabel('Film format',{exact:true})).toHaveValue('135');
  await expect(page.getByLabel('Film length',{exact:true})).toContainText('39 mm over capacity');
  await page.getByRole('button',{name:'Review photographs',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save and open',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Remove scan1.png',exact:true}).click();
  await expect(page.getByLabel('Film length',{exact:true})).toContainText('1755 / 1755 mm');
  await expect(page.getByRole('button',{name:'Save and open',exact:true})).toBeEnabled();await save(page);
});
test('120 capacity recalculates when free panoramas are cropped to a preset',async({page})=>{
  await begin(page,8,[2]);await page.getByRole('radio',{name:'120',exact:true}).check();
  await expect(page.getByLabel('Film length',{exact:true})).toContainText('10 mm over capacity');
  await page.getByLabel('Film format',{exact:true}).selectOption('66');
  await expect(page.getByLabel('Film length',{exact:true})).toContainText('472 / 910 mm');
  await page.getByRole('button',{name:'Review photographs',exact:true}).click();
  await expect(page.getByText('Aspect mismatch: edges will be cropped.',{exact:true})).toBeVisible();
  await expect(page.getByRole('slider',{name:'Horizontal crop position',exact:true})).toBeVisible();await save(page);
});

for(const [film,count,used,capacity] of [['35mm',40,1560,1755],['120',15,885,910]] as const) test(`${film} saves an extended roll with ${count} images`,async({page})=>{
  await begin(page,count,[film==='35mm'?1.5:1]);
  await page.getByRole('radio',{name:film,exact:true}).check();
  if(film==='120')await page.getByLabel('Film format',{exact:true}).selectOption('66');
  const meter=page.getByLabel('Film length',{exact:true});
  await expect(meter).toContainText(`${used} / ${capacity} mm`);
  await expect(meter).toContainText('Using extra allowance');
  await page.getByRole('button',{name:'Review photographs',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save and open',exact:true})).toBeEnabled();
  await save(page);await openFrame(page,count);
  await expect(page.locator('main')).toHaveAttribute('data-selected-frame',String(count));
});
