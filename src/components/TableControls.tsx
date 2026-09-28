import { LoupeOptions } from './LoupeOptions';
import { LoupeControls } from './LoupeControls';
import { FilmPanelFrames } from './FilmPanelFrames';
import { usePanelDismiss } from '../utils/usePanelDismiss';
import { FilmStrengthControl } from "./FilmStrengthControl";
import { useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { ViewerAction, ViewerState } from '../state/viewerState';
import { getFilmStock } from '../data/filmStocks';
import { focusFrameLayout, fitRollView } from '../utils/rollLayout';
import { photoCropPreview } from '../utils/photoFraming';
import { MobileSheet } from './MobileControls';
import { FilmStockInfo } from './FilmStockInfo';
import { FilmStripHeader } from './FilmStripHeader';

export function TableControls({state,dispatch,onOpenLibrary,onOpenRoom,onOpenTable,onOpenCameras,sheet,setSheet,ownerActions,createAction}:{state:ViewerState;dispatch:Dispatch<ViewerAction>;onOpenLibrary:()=>void;onOpenRoom:()=>void;onOpenTable:()=>void;onOpenCameras:()=>void;sheet:MobileSheet;setSheet:(sheet:MobileSheet)=>void;createAction?:ReactNode;ownerActions?:ReactNode}) {
  const root=useRef<HTMLDivElement>(null), panel=useRef<HTMLDialogElement>(null);
  const [quiet,setQuiet]=useState(false);
  const stock=getFilmStock(state.filmStockId);
  const focus=state.focusMode, number=state.activeFrameIndex+1;

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
    if(!sheet || sheet==='loupe')return;
    const previous=document.activeElement as HTMLElement|null;
    const dialog=panel.current;
    if(sheet==='frames') dialog?.showModal();
    else dialog?.show();
    dialog?.focus({preventScroll:true});
    if(dialog)dialog.scrollTop=0;
    return()=>{dialog?.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[sheet]);

  usePanelDismiss(panel, !!sheet && sheet!=='loupe', ()=>setSheet(null));
  const next=(delta:number)=>dispatch({type:'OPEN_FRAME',frameIndex:state.activeFrameIndex+delta});
  return <div ref={root} className={`table-controls ${focus?'is-focus':''} ${inspecting?'is-loupe-inspection':''} ${state.loupe.isActive?'has-loupe':''}`} data-quiet={quiet} data-testid="controls-panel">
    {!focus && !inspecting && <FilmStripHeader state={state} onOpenRoom={onOpenRoom} onOpenLibrary={onOpenLibrary} onOpenTable={onOpenTable} onOpenCameras={onOpenCameras} onOpenSettings={()=>setSheet(sheet==='tools'?null:'tools')} settingsOpen={sheet==='tools'} onToggleLoupe={()=>{setSheet(null);dispatch({type:'TOGGLE_LOUPE'});}} ownerActions={ownerActions} createAction={createAction} />}
    {focus&&!inspecting&&<header className="table-header">
      <button className="table-back" onClick={()=>dispatch({type:'SHOW_OVERVIEW'})}>← Overview</button>
      <div className="table-actions">{!state.loupe.isActive&&<button data-testid="loupe-activate" onClick={()=>dispatch({type:'SET_LOUPE_ACTIVE',active:true})}>Loupe</button>}<button data-panel-toggle className="table-adjust" aria-haspopup="dialog" onClick={()=>setSheet('tools')}>Settings</button>{ownerActions}</div>
    </header>}

    {state.adjustingView && <nav className="table-navigation table-angle-controls" aria-label="View angle">
      <button onClick={()=>dispatch({type:'SET_ADJUSTING_VIEW',active:false})}>Done</button>
      <output aria-label="Current view angle">Tilt {Math.round(state.tableAngle.tilt*180/Math.PI)}° · Yaw {Math.round(state.tableAngle.yaw*180/Math.PI)}°</output>
      <button onClick={()=>dispatch({type:'TOP_DOWN'})}>Top-down</button>
    </nav>}
    {!state.adjustingView && (state.loupe.isActive&&(!sheet||sheet==='loupe')?<LoupeControls loupe={state.loupe} dispatch={dispatch} open={sheet==='loupe'} onOpen={open=>setSheet(open?'loupe':null)}/>:!state.loupe.isActive&&focus&&<nav className="table-navigation table-secondary" aria-label="Focused frame navigation">
        <button aria-label="Previous" disabled={number===1} onClick={()=>next(-1)}>←</button>
        <button aria-label="Choose frame" aria-haspopup="dialog" onClick={()=>setSheet('frames')}><span aria-live="polite">{String(number).padStart(2,'0')} <span className="table-muted">/ {state.roll.frames.length}</span></span></button>
        <button aria-label="Next" disabled={number===state.roll.frames.length} onClick={()=>next(1)}>→</button>
        <span className="table-divider"/>
        <button onClick={()=>dispatch({type:'FIT_VIEW'})}>Reset framing</button>
    </nav>)}
    {(state.adjustingView || state.loupe.isActive || (focus && detailZoom)) && <div className="table-caption table-secondary">{state.adjustingView?'Drag ↔ to turn · Drag ↕ to tilt · Pinch or scroll to zoom':state.loupe.isActive?(inspecting?'Drag to explore · Tap to pull back':'Drag the loupe · Tap its lens to inspect'):'Drag to inspect detail'}</div>}
    <div className="table-feedback">
      {state.assetsLoading?<p role="status">Loading photographs…</p>:state.detailStatus&&<p role="status">{state.detailStatus}{state.detailStatus.includes('unavailable')&&<button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry detail</button>}</p>}
      {!!state.assetFailures.length&&<p role="alert">Some photographs could not load. <button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry photographs</button></p>}
    </div>

    {sheet&&sheet!=='loupe'&&<dialog tabIndex={-1} ref={panel} className={`film-panel table-panel ${sheet==='frames'?'table-frame-panel':''}`} aria-label={sheet==='tools'?'Viewing tools':'Choose frame'} onCancel={event=>{event.preventDefault();setSheet(null);}} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape')setSheet(null);}}>
      {sheet==='frames'?<FilmPanelFrames stockId={state.filmStockId}><div className="table-frame-grid" role="group" aria-label="Frame map">{state.roll.frames.map((photo,index)=>{
        const layout=focusFrameLayout(state.roll,index);
        return <button key={photo.id} aria-label={`Open frame ${index+1}`} aria-current={index===state.activeFrameIndex?'true':undefined} data-testid={`frame-btn-${index+1}`} onClick={()=>{dispatch({type:'OPEN_FRAME',frameIndex:index});setSheet(null);}}>
          <div style={{aspectRatio:layout.frameWidth/layout.frameHeight}}><img src={photo.thumbnailSrc??photo.src} alt={photo.alt} loading="lazy" style={photoCropPreview(photo.aspectRatio,layout.frameWidth/layout.frameHeight,photo.rotation??0,photo.cropPosition)}/></div><span>{String(index+1).padStart(2,'0')}</span>
        </button>;
      })}</div></FilmPanelFrames>:<FilmPanelFrames stockId={state.filmStockId} className="table-fields">
        <FilmStockInfo stockId={state.filmStockId}/>
        <FilmStrengthControl state={state} dispatch={dispatch}/>
        <div className="table-field"><span>Rendering <output data-testid="mode-badge">{stock.type==='reversal'?'POSITIVE · E-6':state.filmMode.toUpperCase()}</output></span>{stock.type==='negative'&&<button id="mode-toggle" data-testid="mode-toggle" onClick={()=>dispatch({type:'TOGGLE_FILM_MODE'})}>Switch to {state.filmMode==='positive'?'Negative':'Positive'}</button>}</div>
        <label data-testid="dimmer-controls">Table light <output data-testid="brightness-badge"><span data-testid="brightness-value">{Math.round(state.tableBrightness*100)}%</span></output><input id="brightness-slider" data-testid="brightness-slider" aria-label="Light Table Brightness" type="range" min=".3" max="1" step=".01" value={state.tableBrightness} onChange={event=>dispatch({type:'SET_TABLE_BRIGHTNESS',brightness:Number(event.target.value)})}/></label>
        <div className="table-field"><span>Inspection <output data-testid="loupe-badge">{state.loupe.isActive?`ACTIVE (${state.loupe.magnification}×)`:'RESTING'}</output></span><button id="loupe-toggle" data-testid="loupe-toggle" aria-pressed={state.loupe.isActive} onClick={()=>dispatch({type:'TOGGLE_LOUPE'})}>{state.loupe.isActive?'Rest Loupe':'Activate Loupe'}</button>
          <LoupeOptions loupe={state.loupe} dispatch={dispatch}/>

          {state.loupe.isActive&&<><button onClick={()=>{setSheet(null);dispatch({type:'INSPECT_LOUPE'});}}>Inspect</button><p>Drag the loupe, then tap its lens to inspect. Two fingers move the table.</p></>}
        </div>
        {!focus && !inspecting && <div className="table-field">
          <button aria-pressed={state.adjustingView} onClick={()=>{setSheet(null);dispatch({type:'SET_ADJUSTING_VIEW',active:!state.adjustingView});}}>Drag to tilt and turn</button>
          <label>Tilt <output>{Math.round(state.tableAngle.tilt*180/Math.PI)}°</output><input aria-label="Table tilt" title="Double-click to reset to 0°" onDoubleClick={()=>dispatch({type:'SET_TABLE_ANGLE',angle:{...state.tableAngle,tilt:0}})} type="range" min="0" max="50" step="1" value={state.tableAngle.tilt*180/Math.PI} onChange={event=>dispatch({type:'SET_TABLE_ANGLE',angle:{...state.tableAngle,tilt:Number(event.target.value)*Math.PI/180}})}/></label>
          <label>Yaw <output>{Math.round(state.tableAngle.yaw*180/Math.PI)}°</output><input aria-label="Table yaw" title="Double-click to reset to 0°" onDoubleClick={()=>dispatch({type:'SET_TABLE_ANGLE',angle:{...state.tableAngle,yaw:0}})} type="range" min="-60" max="60" step="1" value={state.tableAngle.yaw*180/Math.PI} onChange={event=>dispatch({type:'SET_TABLE_ANGLE',angle:{...state.tableAngle,yaw:Number(event.target.value)*Math.PI/180}})}/></label>
          <button onClick={()=>dispatch({type:'TOP_DOWN'})}>Top-down</button>
        </div>}
      </FilmPanelFrames>}
    </dialog>}
  </div>;
}
