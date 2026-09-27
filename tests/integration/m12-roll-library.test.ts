import { describe, it, expect, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { RollRepository, RollBundle, openRollDatabase } from '../../src/storage/rollRepository';
import { IMPORT_LIMITS, imageHeader, naturalFiles, processPhotos, releaseDraft } from '../../src/storage/importPhotos';
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
  it('restores an active roll in the room without starting a table journey', () => {
    const runtime = createRuntimeRoll(bundle());
    try {
      const state = viewerReducer(createInitialViewerState('room'), {
        type: 'LOAD_ROLL', roll: runtime.definition, roomMode: 'room', stockId: 'portra-400',
        view: { frameId: runtime.definition.frames[1].id, level: 'frame', mode: 'positive', brightness: .7, magnification: 4, zoom: .5, pan: { x: 0, z: 0 }, overview: null },
      });
      expect(state.roll.rollId).toBe(runtime.definition.rollId);
      expect(state.roomMode).toBe('room');
      expect(state.isTransitioning).toBe(false);
      expect(state.transitionKind).toBeNull();
      expect(state.activeFrameIndex).toBe(1);
      expect(state.tableBrightness).toBe(.7);
      expect(viewerReducer(state, { type: 'LOAD_ROLL', roll: runtime.definition }).roomMode).toBe('inspect');
    } finally { runtime.dispose(); }
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
    await expect(processPhotos(Array.from({length:IMPORT_LIMITS.files+1},()=>files[0]),'too-many',new AbortController().signal,()=>{})).rejects.toThrow(String(IMPORT_LIMITS.files));
  } finally { vi.unstubAllGlobals(); }
});

describe('M14 lazy originals and runtime ownership',()=>{
  it('opens viewing derivatives independently and reports a missing original only when requested',async()=>{
    const factory=new IDBFactory(),repo=new RollRepository(factory);await repo.save(bundle());expect(await (await repo.original('a')).text()).toBe('a');
    const db=await openRollDatabase(factory);await new Promise<void>(resolve=>{const tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').delete('a:original');tx.oncomplete=()=>resolve();});db.close();expect((await repo.read('r')).frames).toHaveLength(2);await expect(repo.original('a')).rejects.toThrow('Original unavailable');
  });
  it('keeps runtime URLs alive until the active cache releases them',()=>{
    const create=vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:${Math.random()}`),revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
    try{const runtime=createRuntimeRoll(bundle()),release=runtime.definition.retainResources!();runtime.dispose();expect(revoke).not.toHaveBeenCalled();release();expect(revoke).toHaveBeenCalledTimes(4);release();runtime.dispose();expect(revoke).toHaveBeenCalledTimes(4);}finally{create.mockRestore();revoke.mockRestore();}
  });
});

  it('M14 saved frame removal cleans owned blobs atomically, while aborted edits preserve them',async()=>{
    const factory=new IDBFactory(),repo=new RollRepository(factory),data=bundle();await repo.save(data);const edited={roll:{...data.roll,frameIds:['b'],coverId:'b'},frames:[data.frames[1]],blobs:[]};const controller=new AbortController();controller.abort();await expect(repo.save(edited,controller.signal)).rejects.toThrow();expect((await repo.read('r')).frames).toHaveLength(2);await repo.save(edited);expect((await repo.read('r')).frames.map(f=>f.id)).toEqual(['b']);await expect(repo.original('a')).rejects.toThrow();expect(await (await repo.original('b')).text()).toBe('b');const db=await openRollDatabase(factory);const count=await new Promise<number>(resolve=>{const q=db.transaction('blobs').objectStore('blobs').count();q.onsuccess=()=>resolve(q.result);});db.close();expect(count).toBe(3);
  });
