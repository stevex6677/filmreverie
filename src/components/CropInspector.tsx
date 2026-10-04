import { useRef, useState } from 'react';
import { DraftPhoto } from '../storage/importPhotos';
import { FilmFormat, FrameSizing, frameAspect, rollFormatLabel } from '../data/filmFormats';
import { CropPosition, photoCropOffset, photoCropPreview, photoCropScale } from '../utils/photoFraming';
import { cameraTurn, filmCropPosition, followsAutomatic, placeAutomatically, setCameraTurn, turnImage, uprightCropPosition, uprightRotation } from '../utils/frameOrientation';
import { StoredFrame } from '../storage/rollRepository';
import { FilmLook, FilmLookCanvas, useDecodedImage } from './FilmLookPreview';
export function CropInspector({photo,format,sizing='fixed',disabled=false,look,onChange,onOrient}:{photo:DraftPhoto;format:FilmFormat;sizing?:FrameSizing;disabled?:boolean;look?:FilmLook;onChange:(position:CropPosition)=>void;onOrient?:(change:(frame:StoredFrame)=>StoredFrame)=>void}) {
  const [final,setFinal]=useState(false),[dragging,setDragging]=useState(false);
  // With a film look, the composition is shown as it will appear on the light table.
  const image=useDecodedImage(look?photo.reviewPreview??photo.preview:undefined);
  const drag=useRef<{id:number;x:number;y:number;width:number;height:number;position:CropPosition}|null>(null);
  const frame=photo.frame;
  if(!frame)return <div className="crop-unavailable">{photo.error||'Preview unavailable'}</div>;
  // The photograph stands upright; a vertical shot's gate turns with the camera.
  const upright=uprightRotation(frame),turn=cameraTurn(frame),filmGate=frameAspect(format,sizing,frame);
  const aspect=frame.width/frame.height,oriented=upright%180?1/aspect:aspect,gateAspect=turn%180?1/filmGate:filmGate;
  const crop=photoCropScale(aspect,gateAspect,upright),position=uprightCropPosition(frame);
  const offset=photoCropOffset(aspect,gateAspect,upright,position);
  const movable=sizing!=='free'&&(crop.x<1-1e-10||crop.y<1-1e-10);
  const preview=photoCropPreview(aspect,final?gateAspect:oriented,upright,final?position:undefined);
  if(!final){preview.left=`${50-offset.x*100}%`;preview.top=`${50-offset.y*100}%`;}
  const change=(x:number,y:number)=>onChange(filmCropPosition(frame,{x:Math.max(-1,Math.min(1,x)),y:Math.max(-1,Math.min(1,y))}));
  const automatic=followsAutomatic(frame,{format,sizing});
  return <section className="crop-inspector" aria-label="Crop inspector">
    <div className="crop-heading"><span>{sizing==='free'?'Full composition · no cropping':final?'Final photograph':'Full composition · shaded edges are excluded'}</span>{sizing!=='free'&&<button aria-pressed={final} onClick={()=>setFinal(!final)}>{final?'Show full composition':'Show final crop'}</button>}</div>
    <div className="crop-stage">
      <div aria-label="Drag photograph to recompose" className={`crop-composition ${final?'crop-final':'crop-full'} ${movable&&!disabled?'crop-movable':''} ${dragging?'is-dragging':''}`} style={{aspectRatio:final?gateAspect:oriented,width:`min(100%, ${final?gateAspect:oriented} * var(--crop-edge))`}}
        onPointerDown={e=>{if(disabled||!movable||e.button!==0)return;if(drag.current){drag.current=null;setDragging(false);return;}e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,width:rect.width/(final?crop.x:1),height:rect.height/(final?crop.y:1),position};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);}}
        onPointerMove={e=>{const start=drag.current;if(!start||start.id!==e.pointerId)return;change(crop.x<1?start.position.x-2*(e.clientX-start.x)/start.width/(1-crop.x):0,crop.y<1?start.position.y-2*(e.clientY-start.y)/start.height/(1-crop.y):0);}}
        onPointerCancel={()=>{drag.current=null;setDragging(false);}}
        onPointerUp={e=>{drag.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
        onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}>
        {look?<FilmLookCanvas image={image} frame={frame} format={format} sizing={sizing} look={look} style={preview} role="img" aria-label={`Crop review: ${photo.filename}`}/>
          :<img draggable={false} src={photo.reviewPreview??photo.preview} alt={`Crop review: ${photo.filename}`} style={preview} />}
        {!final&&<div data-testid="crop-gate" className="crop-gate" style={{width:`${crop.x*100}%`,height:`${crop.y*100}%`}}/>}
      </div>
    </div>
    {onOrient&&<div className="crop-orientation" role="group" aria-label="Orientation">
      <span className="crop-orientation-choice" role="group" aria-label="Camera held" title="How the camera was held: a vertical shot lies across the film">Camera held
        <button aria-pressed={turn%180===0} disabled={disabled} onClick={()=>onOrient(f=>setCameraTurn(f,0))}>Horizontally</button>
        <button aria-pressed={turn%180!==0} disabled={disabled} onClick={()=>onOrient(f=>cameraTurn(f)%180?f:setCameraTurn(f,90))}>Vertically</button></span>
      {turn%180!==0&&<span className="crop-orientation-choice is-side" role="group" aria-label="Top edge on the film">Top edge on film
        <button aria-pressed={turn===270} disabled={disabled} onClick={()=>onOrient(f=>setCameraTurn(f,270))}>Left</button>
        <button aria-pressed={turn===90} disabled={disabled} onClick={()=>onOrient(f=>setCameraTurn(f,90))}>Right</button></span>}
      <button disabled={disabled} title="Use when the picture itself is sideways or upside down" onClick={()=>onOrient(turnImage)}><span aria-hidden="true">↻ </span>Turn image</button>
      {automatic?<span className="crop-orientation-end">Automatic for this frame size</span>
        :<button className="crop-orientation-end" disabled={disabled} title="Choose the placement that keeps the most of this photograph" onClick={()=>onOrient(f=>placeAutomatically(f,{format,sizing}))}>Use automatic</button>}
    </div>}
    <div className="crop-notes"><p className="crop-format-note">{rollFormatLabel(format,sizing)} · Originals stay unchanged</p>{look&&<p className="crop-look-note">Film effect {look.strength}</p>}
    {movable?<><p>Aspect mismatch: edges will be cropped.</p><p>Drag the photograph to recompose within the crop.</p></>:<p>The whole photograph fits this format.</p>}</div>
    {movable&&<div className="crop-position-controls">
      {crop.x<1&&<label>Horizontal position<input aria-label="Horizontal crop position" type="range" min="-1" max="1" step="0.01" value={position.x} disabled={disabled} onChange={e=>change(Number(e.target.value),position.y)}/></label>}
      {crop.y<1&&<label>Vertical position<input aria-label="Vertical crop position" type="range" min="-1" max="1" step="0.01" value={position.y} disabled={disabled} onChange={e=>change(position.x,Number(e.target.value))}/></label>}
      <button disabled={disabled||(!position.x&&!position.y)} onClick={()=>change(0,0)}>Center crop</button>
    </div>}
  </section>;
}
