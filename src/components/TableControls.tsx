import { FilmStrengthControl } from "./FilmStrengthControl";
import { useEffect, useRef, useState, Dispatch } from 'react';
import { ViewerAction, ViewerState } from '../state/viewerState';
import { FILM_STOCKS, getFilmStock, isFilmStockId } from '../data/filmStocks';
import { focusFrameLayout, fitRollView } from '../utils/rollLayout';
import { photoCropPreview } from '../utils/photoFraming';
import { MobileSheet } from './MobileControls';
import { DEFAULT_INSPECT_DISTANCE } from '../utils/cameraBounds';

export function TableControls({state,dispatch,onOpenLibrary,sheet,setSheet}:{state:ViewerState;dispatch:Dispatch<ViewerAction>;onOpenLibrary:()=>void;sheet:MobileSheet;setSheet:(sheet:MobileSheet)=>void}) {
  const root=useRef<HTMLDivElement>(null), panel=useRef<HTMLDialogElement>(null);
  const [quiet,setQuiet]=useState(false);
  const stock=getFilmStock(state.filmStockId), blocked=state.transitionKind==='journey';
  const focus=state.focusMode, number=state.activeFrameIndex+1;

  const frame=state.roll.frames[state.activeFrameIndex];
  const defaultZoom=fitRollView(state.roll,'frame',state.activeFrameIndex,state.viewportAspect).zoom;
  const detailZoom=focus && state.inspectZoom<defaultZoom*.92;
  const inspecting=state.loupe.inspecting;

  useEffect(()=>{
    setQuiet(false);
    if(!focus || sheet || state.loupe.isActive)return;
    let timer:ReturnType<typeof setTimeout>;
    const reveal=()=>{setQuiet(false);clearTimeout(timer);timer=setTimeout(()=>{if(!root.current?.contains(document.activeElement)||!document.activeElement?.matches(':focus-visible'))setQuiet(true);},3200);};
    const pointer=(event:PointerEvent)=>{if(event.pointerType==='mouse')reveal();};
    const container=root.current?.closest('main');
    container?.addEventListener('pointermove',pointer as EventListener);
    container?.addEventListener('film-reveal-controls',reveal);
    container?.addEventListener('focusin',reveal);
    container?.addEventListener('focusout',reveal);
    reveal();
    return()=>{clearTimeout(timer);container?.removeEventListener('pointermove',pointer as EventListener);container?.removeEventListener('film-reveal-controls',reveal);container?.removeEventListener('focusin',reveal);container?.removeEventListener('focusout',reveal);};
  },[focus,sheet,state.activeFrameIndex,state.loupe.isActive]);

  useEffect(()=>{
    if(!sheet)return;
    const previous=document.activeElement as HTMLElement|null;
    const dialog=panel.current;
    if(sheet==='frames') dialog?.showModal();
    else dialog?.show();
    return()=>{dialog?.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[sheet]);

  const next=(delta:number)=>dispatch({type:'OPEN_FRAME',frameIndex:state.activeFrameIndex+delta});
  return <div ref={root} className={`table-controls ${focus?'is-focus':''} ${inspecting?'is-loupe-inspection':''} ${state.loupe.isActive?'has-loupe':''}`} data-quiet={quiet} data-testid="controls-panel">
    {!inspecting&&<header className="table-header">
      {focus?<button className="table-back" onClick={()=>dispatch({type:'SHOW_OVERVIEW'})} disabled={blocked}>← Overview</button>:<div className="table-entry"><button onClick={onOpenLibrary}>Rolls</button><button data-testid="return-room-btn" onClick={()=>dispatch({type:'RETURN_TO_ROOM'})} disabled={blocked}>← Room</button></div>}
      <div className="table-identity"><span className="table-eyebrow">{focus?'FOCUS':'LIGHT TABLE'}</span><h1>{state.roll.label}</h1><span>{focus?`Frame ${String(number).padStart(2,'0')}`:`${state.roll.frames.length} frames · ${state.roll.format==='135'||!state.roll.format?'35 mm':'120'}`}</span></div>
      <div className="table-actions">{!state.loupe.isActive&&<button data-testid="loupe-activate" disabled={blocked||state.isTransitioning} onClick={()=>dispatch({type:'SET_LOUPE_ACTIVE',active:true})}>Loupe</button>}<button className="table-adjust" aria-haspopup="dialog" onClick={()=>setSheet('tools')}>Adjust</button></div>
    </header>}

    {state.loupe.isActive&&!sheet?<nav className="loupe-controls" aria-label="Loupe controls">
      <div className="loupe-actions"><button data-testid="inspect-loupe" disabled={!inspecting&&state.isTransitioning} onClick={()=>dispatch({type:inspecting?'PULL_BACK_LOUPE':'INSPECT_LOUPE'})}>{inspecting?'← Pull back':'Inspect'}</button>
      {!inspecting&&<button data-testid="put-away-loupe" disabled={state.isTransitioning} onClick={()=>dispatch({type:'SET_LOUPE_ACTIVE',active:false})}>Put away</button>}</div>
      <div className="table-magnification" role="group" aria-label="Loupe magnification">{[2,4,8].map(value=><button key={value} data-testid={`mag-btn-${value}x`} aria-pressed={state.loupe.magnification===value} onClick={()=>dispatch({type:'SET_LOUPE_MAGNIFICATION',magnification:value})}>{value}×</button>)}</div>
      {inspecting&&<button data-testid="loupe-effects" aria-pressed={state.loupe.opticalEffects} onClick={()=>dispatch({type:'SET_LOUPE_EFFECTS',enabled:!state.loupe.opticalEffects})}>Optical effects {state.loupe.opticalEffects?'on':'off'}</button>}
    </nav>:!state.loupe.isActive&&<nav className="table-navigation table-secondary" aria-label={focus?'Focused frame navigation':'Overview navigation'}>
      {focus?<>
        <button aria-label="Previous" disabled={blocked||number===1} onClick={()=>next(-1)}>←</button>
        <button aria-label="Choose frame" aria-haspopup="dialog" onClick={()=>setSheet('frames')}><span aria-live="polite">{String(number).padStart(2,'0')} <span className="table-muted">/ {state.roll.frames.length}</span></span></button>
        <button aria-label="Next" disabled={blocked||number===state.roll.frames.length} onClick={()=>next(1)}>→</button>
        <span className="table-divider"/>
        <button onClick={()=>dispatch({type:'FIT_VIEW'})}>Reset framing</button>
      </>:<>
        <button onClick={()=>dispatch({type:'OPEN_FRAME',frameIndex:state.activeFrameIndex})}>Focus frame {number}</button>
        <button aria-label="Choose frame" aria-haspopup="dialog" onClick={()=>setSheet('frames')}>Frames</button>
        <button data-testid="reset-view-btn" onClick={()=>dispatch({type:'RESET_TABLE_VIEW'})}>Fit roll</button>
      </>}
    </nav>}
    <div className="table-caption table-secondary">{state.loupe.isActive?(inspecting?'Drag to explore · Tap to pull back':'Drag the loupe · Tap its lens to inspect'):focus?(detailZoom?'Drag to inspect detail':''):'Drag to explore · Open a frame to focus'}</div>
    <div className="table-feedback">
      {state.assetsLoading?<p role="status">Loading photographs…</p>:state.detailStatus&&<p role="status">{state.detailStatus}{state.detailStatus.includes('unavailable')&&<button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry detail</button>}</p>}
      {!!state.assetFailures.length&&<p role="alert">Some photographs could not load. <button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry photographs</button></p>}
    </div>

    {sheet&&<dialog ref={panel} className={`table-panel ${sheet==='frames'?'table-frame-panel':''}`} aria-label={sheet==='tools'?'Viewing tools':'Choose frame'} onCancel={event=>{event.preventDefault();setSheet(null);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape')setSheet(null);}}>
      <header><div><span className="table-eyebrow">{sheet==='tools'?'ADJUST':'CURRENT ROLL'}</span><h2>{sheet==='tools'?'Viewing tools':'Your photographs'}</h2></div><button onClick={()=>setSheet(null)}>Close</button></header>
      {sheet==='frames'?<div className="table-frame-grid" role="group" aria-label="Frame map">{state.roll.frames.map((photo,index)=>{
        const layout=focusFrameLayout(state.roll,index);
        return <button key={photo.id} aria-label={`Open frame ${index+1}`} aria-current={index===state.activeFrameIndex?'true':undefined} data-testid={`frame-btn-${index+1}`} onClick={()=>{dispatch({type:'OPEN_FRAME',frameIndex:index});setSheet(null);}}>
          <div style={{aspectRatio:layout.frameWidth/layout.frameHeight}}><img src={photo.thumbnailSrc??photo.src} alt={photo.alt} loading="lazy" style={photoCropPreview(photo.aspectRatio,layout.frameWidth/layout.frameHeight,photo.rotation??0,photo.cropPosition)}/></div><span>{String(index+1).padStart(2,'0')}</span>
        </button>;
      })}</div>:<div className="table-fields">
        <label>Film stock<select id="film-stock" data-testid="film-stock-selector" aria-label="Film stock" value={stock.id} onChange={event=>{if(isFilmStockId(event.target.value))dispatch({type:'SET_FILM_STOCK',stockId:event.target.value});}}>{FILM_STOCKS.map(profile=><option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
        <FilmStrengthControl state={state} dispatch={dispatch}/>
        <div className="table-field"><span>Rendering <output data-testid="mode-badge">{stock.type==='reversal'?'POSITIVE · E-6':state.filmMode.toUpperCase()}</output></span>{stock.type==='negative'&&<button id="mode-toggle" data-testid="mode-toggle" onClick={()=>dispatch({type:'TOGGLE_FILM_MODE'})}>Switch to {state.filmMode==='positive'?'Negative':'Positive'}</button>}</div>
        <label data-testid="dimmer-controls">Table light <output data-testid="brightness-badge"><span data-testid="brightness-value">{Math.round(state.tableBrightness*100)}%</span></output><input id="brightness-slider" data-testid="brightness-slider" aria-label="Light Table Brightness" type="range" min=".3" max="1" step=".01" value={state.tableBrightness} onChange={event=>dispatch({type:'SET_TABLE_BRIGHTNESS',brightness:Number(event.target.value)})}/></label>
        <div className="table-field"><span>Inspection <output data-testid="loupe-badge">{state.loupe.isActive?`ACTIVE (${state.loupe.magnification}×)`:'RESTING'}</output></span><button id="loupe-toggle" data-testid="loupe-toggle" aria-pressed={state.loupe.isActive} onClick={()=>dispatch({type:'TOGGLE_LOUPE'})}>{state.loupe.isActive?'Rest Loupe':'Activate Loupe'}</button>
          <div className="table-magnification" data-testid="magnification-controls">{[2,4,8].map(value=><button key={value} data-testid={`mag-btn-${value}x`} aria-pressed={state.loupe.magnification===value} onClick={()=>dispatch({type:'SET_LOUPE_MAGNIFICATION',magnification:value})}>{value}×</button>)}</div>
          {state.loupe.isActive&&<><button onClick={()=>{setSheet(null);dispatch({type:'INSPECT_LOUPE'});}}>Inspect</button><p>Drag the loupe, then tap its lens to inspect. Two fingers move the table.</p></>}
        </div>
        <p className="table-muted" data-testid="frame-badge">#{state.loupe.isActive?state.loupe.frameIndex+1:number} — {state.loupe.isActive?state.roll.frames[state.loupe.frameIndex].title:frame.title}</p>
        <p className="table-muted">View scale <output data-testid="zoom-badge">{Math.round((focus?defaultZoom:DEFAULT_INSPECT_DISTANCE)/state.inspectZoom*100)}%</output></p>
      </div>}
    </dialog>}
  </div>;
}
