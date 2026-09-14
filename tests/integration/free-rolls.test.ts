import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FILM_UNIT, filmLengthUsage, frameAspect, FilmFormat, FrameSizing } from '../../src/data/filmFormats';
import { createRuntimeRoll } from '../../src/storage/rollRuntime';
import { RollBundle, RollRepository, validateBundle } from '../../src/storage/rollRepository';
import { createRollLayout, fitRollView, focusFrameLayout, locateFrame, mapRollPoint } from '../../src/utils/rollLayout';
import { getFrameBounds, getStripDimensions } from '../../src/utils/loupeMapping';
import { photoCropScale } from '../../src/utils/photoFraming';
import { createInitialViewerState, viewerReducer } from '../../src/state/viewerState';

function bundle(aspects: number[], format: FilmFormat = '135', sizing: FrameSizing = 'free'): RollBundle {
  const frames = aspects.map((aspect,i) => ({ id:`f${i}`, rollId:'r', filename:`${i}.png`, mime:'image/png', width:aspect*100, height:100, rotation:0, hash:`${i}`, originalKey:`${i}:o`, viewingKey:`${i}:v`, thumbnailKey:`${i}:t` }));
  return {roll:{id:'r',name:'Mixed roll',format,sizing,stockId:'portra-400',frameIds:frames.map(f=>f.id),coverId:'f0',createdAt:1,updatedAt:1,trashedAt:null},frames,blobs:frames.flatMap(f=>[f.originalKey,f.viewingKey,f.thumbnailKey].map(key=>({key,blob:new Blob([key])})))};
}
describe('Film length and variable-width rolls',()=>{
  it('allows extra length beyond typical rolls while enforcing a finite maximum',()=>{
    const frames=Array.from({length:46},()=>({width:3,height:2}));
    expect(filmLengthUsage('135','fixed',frames.slice(0,36))).toMatchObject({used:1404,capacity:1755,usingExtra:false,exceeded:false});
    expect(filmLengthUsage('135','fixed',frames.slice(0,40))).toMatchObject({used:1560,usingExtra:true,exceeded:false});
    expect(filmLengthUsage('135','fixed',frames.slice(0,45))).toMatchObject({used:1755,remaining:0,exceeded:false});
    expect(filmLengthUsage('135','fixed',frames).exceeded).toBe(true);
    expect(filmLengthUsage('135','free',[{width:36,height:24},{width:65,height:24}]).used).toBeCloseTo(107);
    expect(filmLengthUsage('66','free',[{width:56,height:56},{width:112,height:56}]).used).toBe(174);
    for(const [format,count] of [['645',20],['66',15],['67',12],['69',10]] as const){
      expect(filmLengthUsage(format,'fixed',frames.slice(0,count))).toMatchObject({capacity:910,usingExtra:true});
      expect(filmLengthUsage(format,'fixed',frames.slice(0,count)).exceeded).toBe(false);
      expect(filmLengthUsage(format,'fixed',frames.slice(0,count+1)).exceeded).toBe(true);
    }
  });
  for(const [format,count] of [['135',40],['66',15]] as const) it(`saves and fits an extended ${format} roll with ${count} frames`,async()=>{
    const data=bundle(Array(count).fill(1.5),format,'fixed'),repo=new RollRepository(new IDBFactory());
    await repo.save(data);expect((await repo.read('r')).frames).toHaveLength(count);
    const runtime=createRuntimeRoll(data);
    try{for(const strip of createRollLayout(runtime.definition)){
      const dimensions=getStripDimensions(strip.layout);
      expect(dimensions.width*strip.scale).toBeLessThanOrEqual(3.00001);
      expect(Math.abs(strip.y)+dimensions.height*strip.scale/2).toBeLessThan(.8);
    }}finally{runtime.dispose();}
  });
  it('uses rotation for free width and retains fixed crop behavior',()=>{
    const frame={width:65,height:24,rotation:90};
    expect(frameAspect('135','free',frame)).toBeCloseTo(24/65);
    const crop=photoCropScale(65/24,frameAspect('135','free',frame),90);
    expect(crop.x).toBeCloseTo(1);expect(crop.y).toBeCloseTo(1);
    expect(photoCropScale(65/24,frameAspect('135','fixed',frame),0).x).toBeLessThan(1);
  });
  it('persists mixed sizing and rejects overfull or invalid edits atomically',async()=>{
    const repo=new RollRepository(new IDBFactory()),data=bundle([1,2],'66');
    await repo.save(data);const loaded=await repo.read('r');expect(loaded.roll.sizing).toBe('free');
    data.frames[1].width=2000;await expect(repo.save(data)).rejects.toThrow('film length');
    expect((await repo.read('r')).frames[1].width).toBe(200);
    for(const width of [NaN,Infinity,0,-1]){data.frames[1].width=width;expect(()=>validateBundle(data)).toThrow('dimensions');}
    delete loaded.roll.sizing;expect(()=>validateBundle(loaded)).not.toThrow();
  });
  it('accepts more than 72 narrow images when their total length fits',()=>{
    expect(()=>validateBundle(bundle(Array(80).fill(.5)))).not.toThrow();
    expect(()=>validateBundle(bundle(Array(26).fill(65/24)))).toThrow('film length');
  });
  for(const format of ['135','66'] as const) it(`packs a full mixed ${format} roll without overlap and maps every point to its own image`,()=>{
    const aspects=format==='135'?Array.from({length:24},(_,i)=>i%2?65/24:1.5):[1,2,1,2,1,2,1,2];
    const data=bundle(aspects,format);validateBundle(data);
    const runtime=createRuntimeRoll(data),roll=runtime.definition;
    try{
      const strips=createRollLayout(roll);expect(strips.length).toBeGreaterThan(1);
      for(const strip of strips){
        const dim=getStripDimensions(strip.layout);
        expect(dim.width*roll.scale).toBeLessThanOrEqual(3.00001);
        expect(Math.abs(strip.y)+dim.height*roll.scale/2).toBeLessThan(.8);
        for(let i=1;i<strip.frames.length;i++)expect(getFrameBounds(i,strip.layout).minX).toBeGreaterThan(getFrameBounds(i-1,strip.layout).maxX);
      }
      roll.frames.forEach((photo,i)=>{
        const located=locateFrame(roll,i),gate=focusFrameLayout(roll,i);
        expect(gate.frameWidth/gate.frameHeight).toBeCloseTo(aspects[i]);
        expect(gate.frameHeight/FILM_UNIT).toBe(format==='135'?24:56);
        for(const u of [.01,.5,.99]){
          const mapped=mapRollPoint(roll,{x:located.x+(u-.5)*gate.frameWidth*roll.scale,y:located.y});
          expect(mapped.frameIndex).toBe(i);expect(mapped.localU).toBeCloseTo(u);expect(mapped.isWithinFrame).toBe(true);
        }
        expect(photoCropScale(photo.aspectRatio,gate.frameWidth/gate.frameHeight).x).toBeCloseTo(1);
        for(const aspect of [.46,1.6])expect(fitRollView(roll,'frame',i,aspect).zoom).toBeGreaterThan(0);
      });
      const initial=viewerReducer(createInitialViewerState(),{type:'LOAD_ROLL',roll,stockId:'portra-400'});
      const state={...initial,roomMode:'inspect' as const,isTransitioning:false};
      const down=viewerReducer(state,{type:'NAVIGATE',direction:'down'});
      expect(down.activeFrameIndex).toBe(strips[1].offset);
      const selected=viewerReducer(state,{type:'VIEW_LEVEL',level:'strip',stripIndex:1});
      expect(selected.activeFrameIndex).toBe(strips[1].offset);
    }finally{runtime.dispose();}
  });
  it('fits an exceptionally wide valid image without splitting or cropping it',()=>{
    const runtime=createRuntimeRoll(bundle([50]));
    try{const strips=createRollLayout(runtime.definition);expect(strips).toHaveLength(1);expect(getStripDimensions(strips[0].layout).width*runtime.definition.scale).toBeCloseTo(3);expect(focusFrameLayout(runtime.definition,0).frameWidth/strips[0].layout.frameHeight).toBeCloseTo(50);}finally{runtime.dispose();}
  });
});
