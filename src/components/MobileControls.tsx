import { FilmPanelFrames } from './FilmPanelFrames';
import { usePanelDismiss } from '../utils/usePanelDismiss';
import { FilmStockInfo } from './FilmStockInfo';
import { useEffect, useRef, type ReactNode } from 'react';
import { ViewerAction, ViewerState } from '../state/viewerState';
import { getFilmStock } from '../data/filmStocks';
import { focusFrameLayout } from '../utils/rollLayout';
import { uprightThumbnail } from '../utils/photoFraming';
import { FilmStripHeader } from './FilmStripHeader';
export type MobileSheet = 'tools' | 'frames' | 'loupe' | null;
export function MobileControls({state,dispatch,onOpenLibrary,onOpenRoom,onOpenTable,onOpenCameras,sheet,setSheet,emptyRollMessage,ownerActions,createAction,roomNavigation=false,roomOnly=false}:{state:ViewerState;dispatch:React.Dispatch<ViewerAction>;onOpenLibrary:()=>void;onOpenRoom:()=>void;onOpenTable:()=>void;onOpenCameras?:()=>void;sheet:MobileSheet;setSheet:(s:MobileSheet)=>void;emptyRollMessage?:string;createAction?:ReactNode;ownerActions?:ReactNode;roomNavigation?:boolean;roomOnly?:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const room=roomOnly || state.roomMode==='room',stock=getFilmStock(state.filmStockId);

  useEffect(()=>{
    if(!sheet)return;
    const previous=document.activeElement as HTMLElement;
    const activeDialog=dialog.current;
    if(sheet==='frames') activeDialog?.showModal(); else activeDialog?.show();
    activeDialog?.focus({preventScroll:true});
    if(activeDialog)activeDialog.scrollTop=0;
    if(sheet==='frames')dialog.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({block:'nearest'});
    return()=>{activeDialog?.close();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[sheet]);
  usePanelDismiss(dialog, !!sheet, ()=>setSheet(null));
  const next=(delta:number)=>dispatch({type:'OPEN_FRAME',frameIndex:state.activeFrameIndex+delta});
  const lightControl = <button aria-pressed={state.focusMode} onClick={()=>room?setSheet('tools'):dispatch({type:'TOGGLE_FOCUS'})}>{room?'Lights':state.focusMode?'Exit focus':'Focus'}</button>;
  return <>
    {room ? <FilmStripHeader state={state} onOpenRoom={onOpenRoom} onOpenLibrary={onOpenLibrary} onOpenTable={onOpenTable} onOpenCameras={onOpenCameras} onOpenSettings={()=>setSheet(sheet==='tools'?null:'tools')} settingsOpen={sheet==='tools'} ownerActions={ownerActions} createAction={createAction} /> : <header className="mobile-header">
      <button aria-label={room?'Film Shelf':'Back one level'} onClick={()=>room?onOpenLibrary():dispatch({type:'ESCAPE_INSPECTION'})}>{room?'Film Shelf':'← Back'}</button>
      {room && onOpenCameras && <button onClick={onOpenCameras}>Camera Cabinet</button>}
      <div><span className="mobile-eyebrow">{room?'DARKROOM':state.inspectionLevel.toUpperCase()}</span><h1 title={emptyRollMessage ?? state.roll.label}>{emptyRollMessage ?? state.roll.label}</h1></div>
      {ownerActions ? <div className="mobile-header-actions">{lightControl}{ownerActions}</div> : lightControl}
    </header>}
    {!room && <footer className="mobile-footer">
      <nav className="mobile-sequence" aria-label="Frame navigation"><button disabled={state.activeFrameIndex===0} onClick={()=>next(-1)}>Previous</button><button aria-label="Choose frame" aria-haspopup="dialog" onClick={()=>setSheet('frames')}>{state.activeFrameIndex+1} / {state.roll.frames.length}</button><button disabled={state.activeFrameIndex===state.roll.frames.length-1} onClick={()=>next(1)}>Next</button></nav>
      <div className="mobile-secondary"><button aria-pressed={state.loupe.isActive} data-testid="loupe-toggle" onClick={()=>dispatch({type:'TOGGLE_LOUPE'})}>{state.loupe.isActive?'Exit loupe':'Loupe'}</button><button onClick={()=>dispatch({type:'FIT_VIEW'})}>Fit</button><button data-panel-toggle aria-haspopup="dialog" onClick={()=>setSheet('tools')}>Tools</button></div>
      {state.assetsLoading?<p role="status">Loading photographs…</p>:state.detailStatus&&<p role="status">{state.detailStatus}{state.detailStatus.includes('unavailable')&&<button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry detail</button>}</p>}
      {!!state.assetFailures.length&&<p role="alert">Some photographs could not load.<button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry photographs</button></p>}
      {state.loupe.isActive&&!state.assetsLoading&&!state.assetFailures.length&&<p className="touch-hint">Touch film to place the loupe · Two fingers move the view</p>}
    </footer>}
    {room && (state.assetsLoading || (state.detailStatus && state.detailStatus.includes('unavailable')) || !!state.assetFailures.length) && (
      <div className="asset-status" role="status">
        {state.assetsLoading ? 'Loading photographs…' : state.detailStatus}
        {state.detailStatus?.includes('unavailable') && <button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry detail</button>}
        {!!state.assetFailures.length && <p role="alert">Some photographs could not load.<button onClick={()=>dispatch({type:'RETRY_ASSETS'})}>Retry photographs</button></p>}
      </div>
    )}
    {sheet&&<dialog tabIndex={-1} ref={dialog} className={`film-panel mobile-sheet ${sheet==='frames'?'frame-sheet':''}`} aria-label={sheet==='tools'?'Viewing tools':'Choose frame'} onCancel={e=>{e.preventDefault();setSheet(null);}} onKeyDown={e=>e.stopPropagation()}>
      {sheet==='frames'?<FilmPanelFrames stockId={state.filmStockId}><div className="mobile-frame-grid">{state.roll.frames.map((frame,i)=>{const layout=focusFrameLayout(state.roll,i),thumbnail=uprightThumbnail(frame,layout.frameWidth/layout.frameHeight);return <button key={frame.id} aria-label={`Open frame ${i+1}`} aria-current={i===state.activeFrameIndex?'true':undefined} onClick={()=>{dispatch({type:'OPEN_FRAME',frameIndex:i});setSheet(null);}}><div style={thumbnail.box}><img loading="lazy" src={frame.thumbnailSrc??frame.src} alt={frame.alt} style={thumbnail.image}/></div><span>Frame {i+1}</span></button>;})}</div></FilmPanelFrames>:<FilmPanelFrames stockId={state.filmStockId} className="mobile-tool-content">
        {!room&&<>
          <fieldset><legend>View</legend><div className="mobile-sequence">{(['roll','strip','frame'] as const).map(level=><button key={level} aria-pressed={state.inspectionLevel===level} onClick={()=>dispatch({type:'VIEW_LEVEL',level})}>{level[0].toUpperCase()+level.slice(1)}</button>)}</div></fieldset>
          <FilmStockInfo stockId={state.filmStockId}/>
          {stock.type==='negative'?<button onClick={()=>dispatch({type:'TOGGLE_FILM_MODE'})}>Switch to {state.filmMode==='positive'?'Negative':'Positive'}</button>:<p>Positive · reversal film</p>}
          <label>Table light · {Math.round(state.tableBrightness*100)}%<input aria-label="Light Table Brightness" type="range" min=".3" max="1" step=".01" value={state.tableBrightness} onChange={e=>dispatch({type:'SET_TABLE_BRIGHTNESS',brightness:Number(e.target.value)})}/></label>
          <fieldset><legend>Loupe magnification</legend><div className="mobile-sequence">{[2,4,8].map(m=><button key={m} aria-pressed={state.loupe.magnification===m} onClick={()=>dispatch({type:'SET_LOUPE_MAGNIFICATION',magnification:m})}>{m}×</button>)}</div></fieldset>
        </>}
        <div className="table-field"><label>Room light · {Math.round(state.roomBrightness*100)}%<input aria-label="Room brightness" type="range" min="0" max="1" step=".01" value={state.roomBrightness} onChange={e=>dispatch({type:'SET_ROOM_BRIGHTNESS',brightness:Number(e.target.value)})}/></label>
        <button role="switch" aria-checked={state.roomBrightness>0} onClick={()=>dispatch({type:'TOGGLE_ROOM_LIGHTS'})}>Room lights</button></div>
        {room && roomNavigation && <div className="room-navigation-actions">
          <button onClick={()=>{setSheet(null);dispatch({type:'FACE_TABLE'});}}>Face table</button>
          <button data-testid="approach-table-btn" onClick={()=>{setSheet(null);dispatch({type:'APPROACH_TABLE'});}}>Approach table</button>
        </div>}
        {!room&&<button data-testid="return-room-btn" onClick={()=>{setSheet(null);dispatch({type:'RETURN_TO_ROOM'});}}>Return to Room</button>}
      </FilmPanelFrames>}
    </dialog>}
  </>;
}
