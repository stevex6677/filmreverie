import { FilmStrengthControl } from "./FilmStrengthControl";
import { useEffect, useRef } from 'react';
import { ViewerAction, ViewerState } from '../state/viewerState';
import { FILM_STOCKS, getFilmStock, isFilmStockId } from '../data/filmStocks';
import { focusFrameLayout } from '../utils/rollLayout';
import { photoCropPreview } from '../utils/photoFraming';
export type MobileSheet = 'tools' | 'frames' | null;
export function MobileControls({state,dispatch,onOpenLibrary,sheet,setSheet}:{state:ViewerState;dispatch:React.Dispatch<ViewerAction>;onOpenLibrary:()=>void;sheet:MobileSheet;setSheet:(s:MobileSheet)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const room=state.roomMode==='room',blocked=state.transitionKind==='journey',stock=getFilmStock(state.filmStockId);

  useEffect(()=>{
    if(!sheet)return;
    const previous=document.activeElement as HTMLElement;
    dialog.current?.showModal();
    if(sheet==='frames')dialog.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({block:'nearest'});
    return()=>{dialog.current?.close();previous?.focus({preventScroll:true});};
  },[sheet]);
  const next=(delta:number)=>dispatch({type:'OPEN_FRAME',frameIndex:state.activeFrameIndex+delta});
  return <>
    <header className="mobile-header">
      <button aria-label={room?'Open roll library':'Back one level'} disabled={blocked} onClick={()=>room?onOpenLibrary():dispatch({type:'ESCAPE_INSPECTION'})}>{room?'Rolls':'← Back'}</button>
      <div><span className="mobile-eyebrow">{room?'DARKROOM':state.inspectionLevel.toUpperCase()}</span><h1 title={state.roll.label}>{state.roll.label}</h1></div>
      <button aria-pressed={state.focusMode} onClick={()=>room?setSheet('tools'):dispatch({type:'TOGGLE_FOCUS'})}>{room?'Lights':state.focusMode?'Exit focus':'Focus'}</button>
    </header>
    <footer className="mobile-footer">
      {room?<div className="mobile-sequence"><button disabled={blocked} onClick={()=>dispatch({type:'FACE_TABLE'})}>Face table</button><button className="primary" data-testid="approach-table-btn" disabled={blocked} onClick={()=>dispatch({type:'APPROACH_TABLE'})}>Approach table</button></div>:<>
        <nav className="mobile-sequence" aria-label="Frame navigation"><button disabled={blocked||state.activeFrameIndex===0} onClick={()=>next(-1)}>Previous</button><button aria-label="Choose frame" aria-haspopup="dialog" onClick={()=>setSheet('frames')}>{state.activeFrameIndex+1} / {state.roll.frames.length}</button><button disabled={blocked||state.activeFrameIndex===state.roll.frames.length-1} onClick={()=>next(1)}>Next</button></nav>
        <div className="mobile-secondary"><button aria-pressed={state.loupe.isActive} data-testid="loupe-toggle" onClick={()=>dispatch({type:'TOGGLE_LOUPE'})}>{state.loupe.isActive?'Exit loupe':'Loupe'}</button><button disabled={blocked} onClick={()=>dispatch({type:'FIT_VIEW'})}>Fit</button><button aria-haspopup="dialog" onClick={()=>setSheet('tools')}>Tools</button></div>
      </>}
      {state.assetsLoading?<p role="status">Loading photographs…</p>:state.detailStatus&&<p role="status">{state.detailStatus}{state.detailStatus.includes('unavailable')&&<button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry detail</button>}</p>}
      {!!state.assetFailures.length&&<p role="alert">Some photographs could not load.<button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry photographs</button></p>}
      {!room&&state.loupe.isActive&&!state.assetsLoading&&!state.assetFailures.length&&<p className="touch-hint">Touch film to place the loupe · Two fingers move the view</p>}
    </footer>
    {sheet&&<dialog ref={dialog} className={`mobile-sheet ${sheet==='frames'?'frame-sheet':''}`} aria-label={sheet==='tools'?'Viewing tools':'Choose frame'} onCancel={e=>{e.preventDefault();setSheet(null);}} onKeyDown={e=>e.stopPropagation()}>
      <header><h2>{sheet==='tools'?'Viewing tools':'Your photographs'}</h2><button onClick={()=>setSheet(null)}>Close</button></header>
      {sheet==='frames'?<div className="mobile-frame-grid">{state.roll.frames.map((frame,i)=>{const layout=focusFrameLayout(state.roll,i);return <button key={frame.id} aria-label={`Open frame ${i+1}`} aria-current={i===state.activeFrameIndex?'true':undefined} onClick={()=>{dispatch({type:'OPEN_FRAME',frameIndex:i});setSheet(null);}}><div style={{aspectRatio:layout.frameWidth/layout.frameHeight}}><img loading="lazy" src={frame.thumbnailSrc??frame.src} alt={frame.alt} style={photoCropPreview(frame.aspectRatio,layout.frameWidth/layout.frameHeight,frame.rotation??0,frame.cropPosition)}/></div><span>Frame {i+1}</span></button>;})}</div>:<div className="mobile-tool-content">
        {!room&&<>
          <fieldset><legend>View</legend><div className="mobile-sequence">{(['roll','strip','frame'] as const).map(level=><button key={level} aria-pressed={state.inspectionLevel===level} onClick={()=>dispatch({type:'VIEW_LEVEL',level})}>{level[0].toUpperCase()+level.slice(1)}</button>)}</div></fieldset>
          <label>Film stock<select aria-label="Film stock" value={stock.id} onChange={e=>{if(isFilmStockId(e.target.value))dispatch({type:'SET_FILM_STOCK',stockId:e.target.value});}}>{FILM_STOCKS.map(s=><option key={s.id} value={s.id}>{s.displayName}</option>)}</select></label>
        <FilmStrengthControl state={state} dispatch={dispatch}/>
          {stock.type==='negative'?<button onClick={()=>dispatch({type:'TOGGLE_FILM_MODE'})}>Switch to {state.filmMode==='positive'?'Negative':'Positive'}</button>:<p>Positive · reversal film</p>}
          <label>Table light · {Math.round(state.tableBrightness*100)}%<input aria-label="Light Table Brightness" type="range" min=".3" max="1" step=".01" value={state.tableBrightness} onChange={e=>dispatch({type:'SET_TABLE_BRIGHTNESS',brightness:Number(e.target.value)})}/></label>
          <fieldset><legend>Loupe magnification</legend><div className="mobile-sequence">{[2,4,8].map(m=><button key={m} aria-pressed={state.loupe.magnification===m} onClick={()=>dispatch({type:'SET_LOUPE_MAGNIFICATION',magnification:m})}>{m}×</button>)}</div></fieldset>
        </>}
        <label>Room light · {Math.round(state.roomBrightness*100)}%<input aria-label="Room brightness" type="range" min="0" max="1" step=".01" value={state.roomBrightness} onChange={e=>dispatch({type:'SET_ROOM_BRIGHTNESS',brightness:Number(e.target.value)})}/></label>
        <button role="switch" aria-checked={state.roomBrightness>0} onClick={()=>dispatch({type:'TOGGLE_ROOM_LIGHTS'})}>Room lights</button>
        <button onClick={()=>{setSheet(null);onOpenLibrary();}}>Rolls</button>
        {!room&&<button data-testid="return-room-btn" onClick={()=>{setSheet(null);dispatch({type:'RETURN_TO_ROOM'});}}>Return to Room</button>}
      </div>}
    </dialog>}
  </>;
}
