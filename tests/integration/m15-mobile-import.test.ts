import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { isHeic, normalizeNativeImage } from '../../src/storage/nativeImage';
import { processPhotos, releaseDraft } from '../../src/storage/importPhotos';
import { RollRepository, openRollDatabase } from '../../src/storage/rollRepository';
const heic=()=>{const b=new Uint8Array(24);new DataView(b.buffer).setUint32(0,24);b.set(new TextEncoder().encode('ftypheic'),4);return b;};
afterEach(()=>vi.unstubAllGlobals());
it('uses actual bytes for native conversion and leaves compatible files untouched',async()=>{
  const original=new File(['jpeg bytes'],'unchanged.jpg',{type:'image/jpeg'});const result=await normalizeNativeImage(original,new Uint8Array(await original.arrayBuffer()),new AbortController().signal);expect(result.file).toBe(original);expect(result.notice).toBeUndefined();
  expect(isHeic(heic())).toBe(true);expect(isHeic(new TextEncoder().encode('renamed.heic'))).toBe(false);
});
it('normalizes native decode through the existing draft and atomic repository, preserving JPEG bytes and duplicate identity',async()=>{
  const {createCanvas,loadImage}=await import('@napi-rs/canvas');const source=createCanvas(120,80);source.getContext('2d').fillRect(0,0,120,80);const jpg=source.toBuffer('image/jpeg');
  // Only the unavailable OS HEIC decoder is adapted; actual canvas JPEG encoding,
  // import decode/hash/derivatives and IndexedDB transactions run normally.
  vi.stubGlobal('Image',class {onload:(()=>void)|null=null;onerror:(()=>void)|null=null;naturalWidth=120;naturalHeight=80;set src(value:string){if(value)queueMicrotask(()=>this.onload?.());}});
  vi.stubGlobal('document',{createElement:()=>{const c=createCanvas(1,1) as any,ctx=c.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(image:any,...args:any[])=>draw(image.naturalWidth?source:image,...args);c.toBlob=(cb:(b:Blob)=>void)=>cb(new Blob([c.toBuffer('image/jpeg')],{type:'image/jpeg'}));return c;}});
  vi.stubGlobal('createImageBitmap',async(blob:Blob)=>Object.assign(await loadImage(Buffer.from(await blob.arrayBuffer())),{close:()=>{}}));
  const original=new File([new Uint8Array(jpg)],'first.jpg',{type:'image/jpeg'});
  const photos=await processPhotos([original,new File([heic()],'phone.heic',{type:'image/heic'}),new File([heic()],'same.heic',{type:'image/heic'})],'r',new AbortController().signal,()=>{});
  try {
    expect(photos.every(p=>p.frame)).toBe(true);expect(await photos[0].blobs[0].blob.arrayBuffer()).toEqual(await original.arrayBuffer());expect(photos[1].filename).toBe('phone.jpg');expect(photos[1].notice).toContain('Converted on this device');expect(photos[2].duplicate).toBe(true);
    expect(photos[1].frame!.rotation).toBe(0);expect(photos[1].frame!.mime).toBe('image/jpeg');expect(photos[1].frame!.width).toBe(120);
    const repo=new RollRepository(new IDBFactory());await repo.save({roll:{id:'r',name:'Phone roll',stockId:'portra-400',format:'135',frameIds:photos.map(p=>p.id),coverId:photos[0].id,createdAt:1,updatedAt:1,trashedAt:null},frames:photos.map(p=>p.frame!),blobs:photos.flatMap(p=>p.blobs)});
    expect((await repo.read('r')).frames.map(f=>f.mime)).toEqual(['image/jpeg','image/jpeg','image/jpeg']);
  } finally {releaseDraft(photos);}
});
it('native decoding failure is a recoverable per-file issue and cancellation retains the previous draft',async()=>{
  vi.stubGlobal('Image',class {onerror:(()=>void)|null=null;onload=null;set src(v:string){if(v)queueMicrotask(()=>this.onerror?.());}});
  vi.stubGlobal('document',{createElement:()=>({width:1,height:1})});
  const photos=await processPhotos([new File([heic()],'unsupported.heic')],'r',new AbortController().signal,()=>{});
  expect(photos[0].error).toContain('Shortcuts');expect(photos[0].blobs).toEqual([]);
  const abort=new AbortController();abort.abort();await expect(processPhotos([new File([heic()],'again.heic')],'r',abort.signal,()=>{},photos)).rejects.toThrow();expect(photos[0].filename).toBe('unsupported.heic');
});
it('reads old Blob records alongside binary records without migration or rewriting originals',async()=>{
  const factory=new IDBFactory(),repo=new RollRepository(factory);
  const frame={id:'f',rollId:'r',filename:'original.jpg',mime:'image/jpeg',width:100,height:80,rotation:0,hash:'unchanged',originalKey:'o',viewingKey:'v',thumbnailKey:'t'};
  const blobs=['o','v','t'].map(key=>({key,blob:new Blob([`bytes-${key}`],{type:'image/jpeg'})}));
  await repo.save({roll:{id:'r',name:'Existing',stockId:'portra-400',format:'135',frameIds:['f'],coverId:'f',createdAt:1,updatedAt:1,trashedAt:null},frames:[frame],blobs});
  expect(await (await repo.original('f')).text()).toBe('bytes-o');
  const db=await openRollDatabase(factory);
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(blobs[0]);tx.objectStore('blobs').put(blobs[2]);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
  expect(await (await repo.original('f')).text()).toBe('bytes-o');expect(await (await repo.thumbnail('r','f')).blob.text()).toBe('bytes-t');
  const b=await repo.read('r');expect(await b.blobs.find(x=>x.key==='v')!.blob.text()).toBe('bytes-v');
  await repo.save({...b,roll:{...b.roll,name:'Edited'},blobs:[]});expect(await (await repo.original('f')).text()).toBe('bytes-o');
});

it('imports rolls and detects duplicates over unsecured connections without crypto.subtle or crypto.randomUUID',async()=>{
  const {createCanvas,loadImage}=await import('@napi-rs/canvas');
  const source=createCanvas(100,75);source.getContext('2d').fillRect(0,0,100,75);
  const jpg=source.toBuffer('image/jpeg');

  vi.stubGlobal('Image',class {onload:(()=>void)|null=null;onerror:(()=>void)|null=null;naturalWidth=100;naturalHeight=75;set src(value:string){if(value)queueMicrotask(()=>this.onload?.());}});
  vi.stubGlobal('document',{createElement:()=>{const c=createCanvas(1,1) as any,ctx=c.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(image:any,...args:any[])=>draw(image.naturalWidth?source:image,...args);c.toBlob=(cb:(b:Blob)=>void)=>cb(new Blob([c.toBuffer('image/jpeg')],{type:'image/jpeg'}));return c;}});
  vi.stubGlobal('createImageBitmap',async(blob:Blob)=>Object.assign(await loadImage(Buffer.from(await blob.arrayBuffer())),{close:()=>{}}));

  // Simulate insecure context: no crypto.subtle, no crypto.randomUUID
  const originalCrypto = globalThis.crypto;
  const insecureCrypto = {
    getRandomValues: (arr: any) => originalCrypto.getRandomValues(arr)
  };
  vi.stubGlobal('crypto', insecureCrypto);

  const file1 = new File([new Uint8Array(jpg)], 'one.jpg', { type: 'image/jpeg' });
  const file2 = new File([new Uint8Array(jpg)], 'duplicate.jpg', { type: 'image/jpeg' });

  const photos = await processPhotos([file1, file2], 'unsecured-roll', new AbortController().signal, () => {});
  try {
    expect(photos).toHaveLength(2);
    expect(photos[0].frame).toBeDefined();
    expect(photos[1].frame).toBeDefined();
    // UUID format check: 8-4-4-4-12
    expect(photos[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(photos[1].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(photos[0].id).not.toEqual(photos[1].id);
    // Duplicate detection based on hash
    expect(photos[0].duplicate).toBe(false);
    expect(photos[1].duplicate).toBe(true);
    expect(photos[0].frame!.hash).toBe(photos[1].frame!.hash);
    expect(photos[0].frame!.hash).toHaveLength(64);
  } finally {
    releaseDraft(photos);
  }
});

