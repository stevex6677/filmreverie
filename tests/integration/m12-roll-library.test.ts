import { describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { RollRepository, RollBundle, openRollDatabase } from '../../src/storage/rollRepository';
import { imageHeader, naturalFiles, processPhotos, releaseDraft } from '../../src/storage/importPhotos';
import { FILM_FORMATS, formatLayout } from '../../src/data/filmFormats';
import { createRuntimeRoll } from '../../src/storage/rollRuntime';
import { createRollLayout, locateFrame, mapRollPoint } from '../../src/utils/rollLayout';
import { getPerforationPositions } from '../../src/utils/loupeMapping';
import { createInitialViewerState, viewerReducer } from '../../src/state/viewerState';
function bundle(): RollBundle {
  return { roll: { id:'r', name:'Test roll', stockId:'portra-400', format:'135', frameIds:['a','b'], coverId:'a', createdAt:1, updatedAt:1, trashedAt:null }, frames:['a','b'].map(id => ({ id, rollId:'r', filename:`${id}.jpg`, mime:'image/jpeg', width:1200, height:800, rotation:0, hash:id, originalKey:`${id}:original`, viewingKey:`${id}:view`, thumbnailKey:`${id}:thumb` })), blobs:['a','b'].flatMap(id => ['original','view','thumb'].map(type => ({ key:`${id}:${type}`, blob:new Blob([id]) }))) };
}
describe('M12 browser-local roll repository and import contracts', () => {
  it('sorts naturally with stable ties and validates actual headers before decode', () => {
    expect(naturalFiles(['scan10.jpg','scan2.jpg','scan2.jpg'].map(name => new File([''],name))).map(f => f.name)).toEqual(['scan2.jpg','scan2.jpg','scan10.jpg']);
    expect(() => imageHeader(new TextEncoder().encode('not a JPEG'))).toThrow('unsupported');
    const png = new Uint8Array(24); png.set([137,80,78,71,13,10,26,10]); const v = new DataView(png.buffer); v.setUint32(16,500); v.setUint32(20,400); expect(imageHeader(png)).toEqual({ mime:'image/png',width:500,height:400 });
  });
  it('atomically commits originals and metadata, edits order, restores trash without destroying data', async () => {
    const repo = new RollRepository(new IDBFactory()); const data = bundle(); await repo.save(data);
    expect((await repo.read('r')).frames.map(f => f.id)).toEqual(['a','b']);
    data.roll.frameIds.reverse(); data.frames[0].rotation=90; await repo.save({ ...data, blobs:[] });
    expect((await repo.read('r')).frames.map(f => f.id)).toEqual(['b','a']);
    await repo.trash('r'); expect((await repo.list())[0].trashedAt).not.toBeNull(); await repo.trash('r',false); expect((await repo.read('r')).roll.trashedAt).toBeNull();
  });
  it('rejects invalid metadata and pre-cancelled saves without partial rolls', async () => {
    const repo = new RollRepository(new IDBFactory()); const data=bundle(); const ctrl=new AbortController();ctrl.abort();
    await expect(repo.save(data,ctrl.signal)).rejects.toThrow(); expect(await repo.list()).toEqual([]);
    data.roll.name=''; await expect(repo.save(data)).rejects.toThrow('name'); expect(await repo.list()).toEqual([]);
  });
  it('rolls back write failure and detects missing records', async () => {
    const factory=new IDBFactory(),repo=new RollRepository(factory); const data=bundle(); await repo.save(data);
    const broken={...data,roll:{...data.roll,name:'Uncommitted',invalid:()=>{}}}; await expect(repo.save(broken)).rejects.toThrow(); expect((await repo.read('r')).roll.name).toBe('Test roll');
    const db=await openRollDatabase(factory); await new Promise<void>(resolve=>{const tx=db.transaction('frames','readwrite');tx.objectStore('frames').delete('a');tx.oncomplete=()=>resolve();});db.close(); await expect(repo.read('r')).rejects.toThrow('missing');
  });
  it('upgrades version one without losing existing rolls', async () => {
    const factory=new IDBFactory(); await new Promise<void>((resolve,reject)=>{const req=factory.open('upgrade',1);req.onupgradeneeded=()=>{req.result.createObjectStore('rolls',{keyPath:'id'}).put(bundle().roll);};req.onerror=()=>reject(req.error);req.onsuccess=()=>{req.result.close();resolve();};});
    expect((await new RollRepository(factory,'upgrade').list())[0].name).toBe('Test roll');
  });
  for (const format of Object.keys(FILM_FORMATS) as (keyof typeof FILM_FORMATS)[]) it(`maps partial ${format} strips and restores edited E100 state`, () => {
    const data=bundle();data.roll.format=format; const runtime=createRuntimeRoll(data);try {
      const strips=createRollLayout(runtime.definition);expect(strips.at(-1)!.frames).toHaveLength(2);expect(strips[0].layout.frameWidth/strips[0].layout.frameHeight).toBeCloseTo(FILM_FORMATS[format].width/FILM_FORMATS[format].height);
      expect(getPerforationPositions(strips[0].layout).top.length>0).toBe(format==='135');
      const pt=locateFrame(runtime.definition,1);expect(mapRollPoint(runtime.definition,pt).frameIndex).toBe(1);
      const state=viewerReducer(createInitialViewerState(),{type:'LOAD_ROLL',roll:runtime.definition,stockId:'ektachrome-e100',view:{frameId:'missing',level:'frame',mode:'negative',brightness:9,magnification:-1,zoom:NaN,pan:{x:NaN,z:NaN},overview:null}});
      expect(state.filmMode).toBe('positive');expect(state.activeFrameIndex).toBe(0);expect(state.tableBrightness).toBe(1);expect(state.loupe.magnification).toBe(1.5);expect(Number.isFinite(state.inspectZoom)).toBe(true);
      expect(formatLayout(format).perforated).toBe(format==='135');
    } finally {runtime.dispose();}
  });
});

it('processes real image bytes through an explicit canvas adapter, commits the draft, and cancels without assets', async () => {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const source = createCanvas(120,80); source.getContext('2d').fillRect(0,0,120,80);
  const bytes = source.toBuffer('image/png');
  vi.stubGlobal('document', { createElement: () => { const canvas = createCanvas(1,1) as any; canvas.toBlob = (callback: (blob: Blob) => void) => callback(new Blob([canvas.toBuffer('image/jpeg')])); return canvas; } });
  vi.stubGlobal('createImageBitmap', async (blob: Blob) => { const image = await loadImage(Buffer.from(await blob.arrayBuffer())); return Object.assign(image,{ close: () => {} }); });
  const files = [new File([new Uint8Array(bytes)],'scan10.png'),new File([new Uint8Array(bytes)],'scan2.png'),new File(['invalid'],'failed.jpg')];
  try {
    const photos = await processPhotos(files,'processed',new AbortController().signal,()=>{});
    expect(photos.map(p=>p.filename)).toEqual(['failed.jpg','scan2.png','scan10.png']);expect(photos[0].error).toContain('unsupported');expect(photos[2].duplicate).toBe(true);
    const selected=photos.slice(1); const repo = new RollRepository(new IDBFactory());
    await repo.save({ roll:{ ...bundle().roll,id:'processed',frameIds:selected.map(p=>p.id),coverId:selected[0].id },frames:selected.map(p=>p.frame!),blobs:selected.flatMap(p=>p.blobs) });
    expect((await repo.read('processed')).frames[0].width).toBe(120);expect(await selected[0].blobs[0].blob.arrayBuffer()).toEqual(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));releaseDraft(photos);
    const signal=new AbortController();await expect(processPhotos(files.slice(1),'cancelled',signal.signal,()=>signal.abort())).rejects.toThrow();expect(await repo.list()).toHaveLength(1);
    await expect(processPhotos(Array.from({length:73},()=>files[0]),'too-many',new AbortController().signal,()=>{})).rejects.toThrow('72');
  } finally { vi.unstubAllGlobals(); }
});
