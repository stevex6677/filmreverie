export const NATIVE_IMAGE_LIMITS = { bytes: 40*1024*1024, sourcePixels: 40_000_000, outputPixels: 12_000_000, edge: 4096 };
const fallback = 'This browser could not convert the HEIC photograph. On iPhone or iPad, use Shortcuts → Convert Image → JPEG, save to Files, then add that JPEG. Your earlier photographs are retained.';
export function isHeic(bytes: Uint8Array) {
  if(bytes.length<16||String.fromCharCode(...bytes.slice(4,8))!=='ftyp')return false;
  const length=Math.min(new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0),bytes.length,128);
  for(let i=8;i+4<=length;i+=4)if(['heic','heix','hevc','hevx'].includes(String.fromCharCode(...bytes.slice(i,i+4))))return true;
  return false;
}
export async function normalizeNativeImage(file:File,bytes:Uint8Array,signal:AbortSignal):Promise<{file:File;notice?:string}> {
  if(!isHeic(bytes))return {file};
  signal.throwIfAborted();
  if(file.size>NATIVE_IMAGE_LIMITS.bytes)throw new Error('File exceeds the 40 MB limit.');
  // HEIF spatial extents can be inspected before handing the image to the native
  // decoder. This is a resource guard, not an image codec or metadata rewrite.
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=4;i+16<Math.min(bytes.length,1024*1024);i++) {
    if(bytes[i]===105&&bytes[i+1]===115&&bytes[i+2]===112&&bytes[i+3]===101) {
      const w=view.getUint32(i+8),h=view.getUint32(i+12);
      if(w*h>NATIVE_IMAGE_LIMITS.sourcePixels)throw new Error('HEIC image exceeds the 40 megapixel limit. Convert it to a smaller JPEG first.');
    }
  }
  const url=URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>],{type:'image/heic'}));
  const image=new Image();
  const canvas=document.createElement('canvas');
  let cancel:()=>void=()=>{};
  try {
    await new Promise<void>((resolve,reject)=>{
      cancel=()=>{image.src='';reject(signal.reason??new DOMException('Cancelled','AbortError'));};
      signal.addEventListener('abort',cancel,{once:true});
      image.onload=()=>resolve();image.onerror=()=>reject(new Error(fallback));image.src=url;
    });
    signal.throwIfAborted();
    const w=image.naturalWidth,h=image.naturalHeight;
    if(!w||!h||w*h>NATIVE_IMAGE_LIMITS.sourcePixels)throw new Error('HEIC image exceeds the 40 megapixel limit or has invalid dimensions.');
    const ratio=Math.min(1,NATIVE_IMAGE_LIMITS.edge/Math.max(w,h),Math.sqrt(NATIVE_IMAGE_LIMITS.outputPixels/(w*h)));
    canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error(fallback);
    ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error(fallback)),'image/jpeg',.94));
    signal.throwIfAborted();
    const name=file.name.replace(/\.(heic|heif)$/i,'')+'.jpg';
    return {file:new File([blob],name,{type:'image/jpeg',lastModified:file.lastModified}),notice:`Converted on this device to JPEG (${canvas.width} × ${canvas.height}). The Photos original stays unchanged.`};
  } finally { signal.removeEventListener('abort',cancel);image.onload=image.onerror=null;image.src='';URL.revokeObjectURL(url);canvas.width=canvas.height=1; }
}
