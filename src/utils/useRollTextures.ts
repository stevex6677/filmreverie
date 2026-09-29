import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { BASELINE_ROLL, RollDefinition } from "./rollLayout";
export const TEXTURE_BUDGET = 192 * 1024 * 1024; // RGBA GPU estimate; decoded backing may double this.
export const uniqueRollSources = (roll: RollDefinition) => [...new Set(roll.frames.map(frame => frame.src))];
export function prioritizedSources(roll: RollDefinition, selected: number) {
  return [...new Set(roll.frames.map((f,i)=>({src:f.src,d:Math.abs(i-selected)})).sort((a,b)=>a.d-b.d).map(f=>f.src))];
}
export function detailEdge(width: number, height: number, demand: number, limit: number) {
  const edge=Math.max(width,height);
  return demand>2048 && edge>2048 ? Math.min(edge,4096,limit,Math.ceil(demand/1024)*1024) : 0;
}
type Resident={texture:THREE.Texture;bytes:number;used:number;close?:()=>void};
type Snapshot={loaded:Map<string,THREE.Texture>;failed:string[];settled:boolean;bytes:number;detailStatus:string};
/** One owner per roll. A single async worker reprioritizes after each completion. */
/** `upload`, when given, returns a GPU-resident texture without stalling a frame (see progressiveTextures.ts). */
export function useRollTextures(roll:RollDefinition,priority:number,retry:number,demand=0,maxTextureSize=4096,upload?:(url:string)=>Promise<THREE.Texture>,prefetch?:(urls:readonly string[])=>void) {
  const [snapshot,setSnapshot]=useState<Snapshot>({loaded:new Map(),failed:[],settled:false,bytes:0,detailStatus:''});
  const inputs=useRef({priority,retry,demand,maxTextureSize,upload,prefetch});inputs.current={priority,retry,demand,maxTextureSize,upload,prefetch};
  const wake=useRef<()=>void>(()=>{});
  const placeholder=useMemo(()=>{const t=new THREE.DataTexture(new Uint8Array([65,65,65,255]),1,1);t.needsUpdate=true;return t;},[]);
  useEffect(()=>()=>placeholder.dispose(),[placeholder]);
  useEffect(()=>{
    const releaseResources=roll.retainResources?.();
    let cancelled=false,running=false,clock=0,previous=priority,lastPriority=priority,lastRetry=retry,detailStatus='';
    const residents=new Map<string,Resident>(),errors=new Set<string>();
    const thumbnails=roll===BASELINE_ROLL?[]:[...new Set(roll.frames.flatMap(f=>f.thumbnailSrc?[f.thumbnailSrc]:[]))];
    const loader=new THREE.TextureLoader();
    const bytes=()=>[...residents.values()].reduce((n,r)=>n+r.bytes,0);
    const publish=(settled:boolean)=>{if(!cancelled)setSnapshot({loaded:new Map([...residents].map(([k,r])=>[k,r.texture])),failed:[...errors].filter(k=>!k.startsWith('detail:')),settled,bytes:bytes(),detailStatus});};
    const dispose=(key:string)=>{const r=residents.get(key);if(r){r.texture.dispose();r.close?.();residents.delete(key);}};
    const viewKeys=()=>roll.imported?prioritizedSources(roll,inputs.current.priority).slice(0,5):uniqueRollSources(roll);
    const protectedKeys=()=>new Set([...thumbnails,...roll.frames.slice(Math.max(0,inputs.current.priority-1),inputs.current.priority+2).map(f=>f.src),roll.frames[previous]?.src]);
    const evict=(reserve=0)=>{
      const protectedSet=protectedKeys();
      for(const [key] of [...residents].sort((a,b)=>a[1].used-b[1].used)){
        if(bytes()+reserve<=TEXTURE_BUDGET)break;
        if(!protectedSet.has(key))dispose(key);
      }
    };
    const worker=async()=>{
      if(running||cancelled)return;running=true;
      try{while(!cancelled){
        if(lastRetry!==inputs.current.retry){lastRetry=inputs.current.retry;errors.clear();}
        const selected=inputs.current.priority,frame=roll.frames[selected];
        const edge=frame?.original||frame?.loadOriginal?detailEdge(frame.sourceWidth!,frame.sourceHeight!,inputs.current.demand,inputs.current.maxTextureSize):0;
        const detailKey=edge?`detail:${frame.src}:${edge}`:'';
        const desired=[...thumbnails,...viewKeys(),...(detailKey?[detailKey]:[])];
        for(const key of viewKeys()){const resident=residents.get(key);if(resident)resident.used=++clock;}
        const key=desired.find(k=>!residents.has(k)&&!errors.has(k));
        if(!key){detailStatus=detailKey?(errors.has(detailKey)?'Detail unavailable. Viewing image retained.':`Detail ready · ${edge}px`):inputs.current.demand>2048&&roll.imported?(frame.original||frame.loadOriginal?'At source resolution.':'Original unavailable. Viewing image retained.'):'';publish(true);break;}
        const isDetail=key.startsWith('detail:');
        inputs.current.prefetch?.(desired.filter(k=>k!==key&&!k.startsWith('detail:')&&!thumbnails.includes(k)&&!residents.has(k)&&!errors.has(k)));
        evict(isDetail?64*1024*1024:thumbnails.includes(key)?256*256*4:2048*2048*4);
        detailStatus=isDetail?'Loading finer detail…':'';publish(false);
        try{
          let texture:THREE.Texture,close:(()=>void)|undefined;
          if(isDetail){
            const ratio=edge/Math.max(frame.sourceWidth!,frame.sourceHeight!);
            const original=frame.original??await frame.loadOriginal!();if(cancelled)break;
            const bitmap=await createImageBitmap(original,{imageOrientation:'from-image',resizeWidth:Math.round(frame.sourceWidth!*ratio),resizeHeight:Math.round(frame.sourceHeight!*ratio),resizeQuality:'high'});
            const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;try{const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Detail canvas unavailable');ctx.drawImage(bitmap,0,0);}finally{bitmap.close();}texture=new THREE.CanvasTexture(canvas);close=()=>{canvas.width=canvas.height=1;};
          }else{
            // Thumbnails upload in well under a millisecond; only full-size photographs go through the worker.
            const progressive=thumbnails.includes(key)?undefined:inputs.current.upload;
            texture=progressive?await progressive(key).catch(()=>loader.loadAsync(key)):await loader.loadAsync(key);
          }
          if(cancelled){texture.dispose();close?.();break;}
          // A stale detail decode must never replace the new destination.
          if(isDetail&&inputs.current.priority!==selected){texture.dispose();close?.();continue;}
          texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
          const image=texture.image;residents.set(key,{texture,bytes:image.width*image.height*4,used:++clock,close});
          evict();publish(false);
        }catch{if(!cancelled){errors.add(key);publish(false);}}
      }}finally{running=false;if(cancelled)releaseResources?.();}
    };
    wake.current=()=>{if(lastPriority!==inputs.current.priority){previous=lastPriority;lastPriority=inputs.current.priority;}void worker();};
    publish(false);void worker();
    return()=>{cancelled=true;wake.current=()=>{};for(const key of residents.keys())dispose(key);if(!running)releaseResources?.();};
  },[roll]);
  useEffect(()=>{wake.current();},[priority,retry,demand,maxTextureSize]);
  const textures=roll.frames.map((frame,i)=>{
    const detail=i===priority?[...snapshot.loaded].filter(([k])=>k.startsWith(`detail:${frame.src}:`)).sort((a,b)=>Number(b[0].split(':').at(-1))-Number(a[0].split(':').at(-1)))[0]?.[1]:undefined;
    return detail??snapshot.loaded.get(frame.src)??(frame.thumbnailSrc?snapshot.loaded.get(frame.thumbnailSrc):undefined)??placeholder;
  });
  // Viewing-resolution readiness per frame (a failed source is final, not pending).
  const ready=roll.frames.map(frame=>snapshot.loaded.has(frame.src)||snapshot.failed.includes(frame.src));
  return {textures,ready,failed:snapshot.failed,settled:snapshot.settled,loadedCount:snapshot.loaded.size,bytes:snapshot.bytes,detailStatus:snapshot.detailStatus};
}
