import { useRef, useState } from 'react';
import { DraftPhoto } from '../storage/importPhotos';
import { FILM_FORMATS, FilmFormat } from '../data/filmFormats';
import { CropPosition, photoCropOffset, photoCropPreview, photoCropScale } from '../utils/photoFraming';
export function CropInspector({photo,format,disabled=false,onChange}:{photo:DraftPhoto;format:FilmFormat;disabled?:boolean;onChange:(position:CropPosition)=>void}) {
  const [final,setFinal]=useState(false),[dragging,setDragging]=useState(false);
  const drag=useRef<{id:number;x:number;y:number;width:number;height:number;position:CropPosition}|null>(null);
  const frame=photo.frame;
  if(!frame)return <div className="crop-unavailable">{photo.error||'Preview unavailable'}</div>;
  const aspect=frame.width/frame.height,oriented=frame.rotation%180?1/aspect:aspect,gate=FILM_FORMATS[format],gateAspect=gate.width/gate.height;
  const crop=photoCropScale(aspect,gateAspect,frame.rotation),position=frame.cropPosition??{x:0,y:0};
  const offset=photoCropOffset(aspect,gateAspect,frame.rotation,position);
  const movable=crop.x<1||crop.y<1;
  const preview=photoCropPreview(aspect,final?gateAspect:oriented,frame.rotation,final?position:undefined);
  if(!final){preview.left=`${50-offset.x*100}%`;preview.top=`${50-offset.y*100}%`;}
  const change=(x:number,y:number)=>onChange({x:Math.max(-1,Math.min(1,x)),y:Math.max(-1,Math.min(1,y))});
  return <section className="crop-inspector" aria-label="Crop inspector">
    <div className="crop-heading"><span>{final?'Final photograph':'Full composition · shaded edges are excluded'}</span><button aria-pressed={final} onClick={()=>setFinal(!final)}>{final?'Show full composition':'Show final crop'}</button></div>
    <div className="crop-stage">
      <div aria-label="Drag photograph to recompose" className={`crop-composition ${final?'crop-final':'crop-full'} ${movable&&!disabled?'crop-movable':''} ${dragging?'is-dragging':''}`} style={{aspectRatio:final?gateAspect:oriented,width:`min(100%, ${final?gateAspect:oriented} * var(--crop-edge))`}}
        onPointerDown={e=>{if(disabled||!movable||e.button!==0)return;if(drag.current){drag.current=null;setDragging(false);return;}e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,width:rect.width/(final?crop.x:1),height:rect.height/(final?crop.y:1),position};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);}}
        onPointerMove={e=>{const start=drag.current;if(!start||start.id!==e.pointerId)return;change(crop.x<1?start.position.x-2*(e.clientX-start.x)/start.width/(1-crop.x):0,crop.y<1?start.position.y-2*(e.clientY-start.y)/start.height/(1-crop.y):0);}}
        onPointerCancel={()=>{drag.current=null;setDragging(false);}}
        onPointerUp={e=>{drag.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}>
        <img draggable={false} src={photo.reviewPreview??photo.preview} alt={`Crop review: ${photo.filename}`} style={preview} />
        {!final&&<div data-testid="crop-gate" className="crop-gate" style={{width:`${crop.x*100}%`,height:`${crop.y*100}%`}}/>}
      </div>
    </div>
    <p>{gate.label} · Originals stay unchanged</p>
    {movable?<><p>Aspect mismatch: edges will be cropped.</p><p>Drag the photograph to recompose within the crop.</p><div className="crop-position-controls">
      {crop.x<1&&<label>Horizontal position<input aria-label="Horizontal crop position" type="range" min="-1" max="1" step="0.01" value={position.x} disabled={disabled} onChange={e=>change(Number(e.target.value),position.y)}/></label>}
      {crop.y<1&&<label>Vertical position<input aria-label="Vertical crop position" type="range" min="-1" max="1" step="0.01" value={position.y} disabled={disabled} onChange={e=>change(position.x,Number(e.target.value))}/></label>}
      <button disabled={disabled||(!position.x&&!position.y)} onClick={()=>change(0,0)}>Center crop</button>
    </div></>:<p>The whole photograph fits this format.</p>}
  </section>;
}
