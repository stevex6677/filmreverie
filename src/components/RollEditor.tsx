import { blockUpdate } from '../offline/client';
import { DragEvent, useEffect, useRef, useState } from 'react';
import { FILM_STOCKS, DEFAULT_FILM_STOCK_ID, FilmStockId, getFilmStock, supportsFilmFormat } from '../data/filmStocks';
import { EXTRA_FILM_ALLOWANCE, FILM_FORMATS, FilmFormat, FrameSizing, filmLengthUsage, rollFormatLabel } from '../data/filmFormats';
import { RollBundle, RollRepository, StoredRoll, storageMessage, rollRepository } from '../storage/rollRepository';
import { DraftPhoto, processPhotos, releaseDraft } from '../storage/importPhotos';
import { generateUuid } from '../storage/crypto';
import { clampFilmStrength, DEFAULT_FILM_STRENGTH, FILM_LOOKS } from '../data/filmLooks';
import { RollFrameEditor, StrengthMode } from './RollFrameEditor';
interface Props { publication?:boolean; onDelete:(roll:StoredRoll)=>Promise<void>;editId?:string;onClose:()=>void;onOpen:(id:string)=>Promise<void>;repository?:RollRepository }
const photoCount=(n:number)=>`${n} ${n===1?'photograph':'photographs'}`;
/** New and existing rolls share one workspace: roll details beside the frame workbench. */
export function RollEditor({publication=false,editId,onClose,onOpen,onDelete,repository=rollRepository}:Props) {
  const dialog=useRef<HTMLDialogElement>(null),abort=useRef<AbortController|null>(null),draftRef=useRef<DraftPhoto[]>([]),mounted=useRef(true),loadRequest=useRef(0);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[saving,setSaving]=useState(''),[loading,setLoading]=useState(true),[dropping,setDropping]=useState(false);
  const [draft,setDraft]=useState<DraftPhoto[]|null>(null),[editing,setEditing]=useState<StoredRoll|null>(null),[rollId,setRollId]=useState(''),[selected,setSelected]=useState('');
  const [name,setName]=useState(''),[camera,setCamera]=useState(''),[stock,setStock]=useState<FilmStockId>(DEFAULT_FILM_STOCK_ID),[format,setFormat]=useState<FilmFormat>('135'),[sizing,setSizing]=useState<FrameSizing>('fixed'),[cover,setCover]=useState('');
  const [strengthMode,setStrengthMode]=useState<StrengthMode>('roll'),[rollStrength,setRollStrength]=useState(DEFAULT_FILM_STRENGTH);
  // The last whole-roll strength the user chose is the darkroom's starting strength for new rolls.
  const preferredStrength=useRef(DEFAULT_FILM_STRENGTH),strengthChosen=useRef(false),pendingStrength=useRef<number|null>(null),strengthTimer=useRef(0);
  const rememberStrength=()=>{window.clearTimeout(strengthTimer.current);const value=pendingStrength.current;pendingStrength.current=null;if(value!==null)void repository.savePreferences({filmStrength:value}).catch(()=>{/* Optional preference. */});};
  const chooseRollStrength=(value:number)=>{strengthChosen.current=true;preferredStrength.current=value;setRollStrength(value);pendingStrength.current=value;window.clearTimeout(strengthTimer.current);strengthTimer.current=window.setTimeout(rememberStrength,400);};
  // Capture before the opening commit removes the shelf menu and roll card.
  const [opener]=useState(()=>document.activeElement instanceof HTMLElement?document.activeElement:null);
  useEffect(() => { blockUpdate('roll-editor', true); return () => blockUpdate('roll-editor', false); }, []);
  const draftCreatedAt=useRef(Date.now());
  const run=async(fn:()=>Promise<void>)=>{setError('');setBusy(true);try{await fn();}catch(e){setError(storageMessage(e));}finally{if(mounted.current){setBusy(false);setLoading(false);setSaving('');}}};
  useEffect(()=>{
    mounted.current=true;
    dialog.current?.showModal();
    return()=>{
      mounted.current=false;++loadRequest.current;abort.current?.abort();releaseDraft(draftRef.current);rememberStrength();
      requestAnimationFrame(()=>{
        if(mounted.current)return;
        // Saving opens the table; cancelling returns to the remounted shelf.
        for(const target of [opener,document.querySelector<HTMLElement>('button[aria-label="More options"]'),document.querySelector<HTMLElement>('.canvas-wrapper')]){
          if(!target?.isConnected||target===document.body||!target.getClientRects().length)continue;
          target.focus({preventScroll:true});
          if(document.activeElement===target)break;
        }
      });
    };
  },[]);
  useEffect(()=>{if(draft!==null){dialog.current?.querySelector<HTMLElement>('[data-step-title]')?.focus();dialog.current?.scrollTo(0,0);}},[draft===null]);
  const updateDraft=(photos:DraftPhoto[]|null)=>{draftRef.current=photos??[];setDraft(photos);};
  const reset=()=>{abort.current?.abort();releaseDraft(draftRef.current);updateDraft(null);setEditing(null);setError('');setProgress('');};
  const start=()=>{reset();draftCreatedAt.current=Date.now();setRollId(generateUuid());setName('');setCamera('');setStock(DEFAULT_FILM_STOCK_ID);setFormat('135');setSizing('fixed');setCover('');setSelected('');setStrengthMode('roll');setRollStrength(preferredStrength.current);updateDraft([]);};
  const choose=(files:File[])=>void run(async()=>{
    abort.current=new AbortController();const controller=abort.current,prior=draftRef.current;setProgress('Processing photographs…');
    try{const photos=await processPhotos(files,rollId,controller.signal,(done,total)=>setProgress(`Processed ${done} / ${total}`),prior);controller.signal.throwIfAborted();updateDraft([...prior,...photos]);if(!cover)setCover(photos.find(p=>p.frame)?.id??'');if(!selected)setSelected(photos[0]?.id??'');}
    catch(e){if(!controller.signal.aborted)throw e;setProgress('Processing cancelled. Your earlier photographs are retained.');}
  });
  useEffect(()=>{
    if(editId){edit(editId);return;}
    start();setLoading(false);
    void repository.preferences().then(({filmStrength})=>{
      if(filmStrength===undefined||!mounted.current||strengthChosen.current)return;
      preferredStrength.current=clampFilmStrength(filmStrength);setRollStrength(preferredStrength.current);
    }).catch(()=>{/* New rolls keep the default strength. */});
  },[]);
  const edit=(id:string)=>void run(async()=>{const request=++loadRequest.current,b=await repository.read(id);if(!mounted.current||request!==loadRequest.current)return;setEditing(b.roll);setRollId(id);setName(b.roll.name);setCamera(b.roll.camera??'');setStock(b.roll.stockId);setFormat(b.roll.format);setSizing(b.roll.sizing??'fixed');setCover(b.roll.coverId);setRollStrength(clampFilmStrength(b.roll.filmStrength));setStrengthMode(b.frames.some(f=>f.filmStrength!==undefined)?'frame':'roll');setSelected(b.roll.frameIds[0]??'');updateDraft(b.roll.frameIds.map(id=>{const frame=b.frames.find(f=>f.id===id)!;return {id,filename:frame.filename,frame,blobs:[],duplicate:false,keepDuplicate:true,preview:URL.createObjectURL(b.blobs.find(x=>x.key===frame.thumbnailKey)!.blob),reviewPreview:URL.createObjectURL(b.blobs.find(x=>x.key===frame.viewingKey)!.blob)};}));});
  const move=(from:number,to:number)=>{if(!draft||to<0||to>=draft.length)return;const next=[...draft], [p]=next.splice(from,1);next.splice(to,0,p);updateDraft(next);};
  const length=filmLengthUsage(format,sizing,draft?.flatMap(p=>p.frame?[p.frame]:[])??[]);
  const valid=!!draft?.length&&!draft.some(p=>!p.frame||p.duplicate&&!p.keepDuplicate);
  const save=()=>void run(async()=>{
    if(!valid||!draft)throw new Error('Resolve failed files and duplicates before saving.');
    // Whole-roll strength is stored on the roll; frame strengths only exist while adjusting each frame.
    const frames=draft.map(p=>{const {filmStrength,...frame}=p.frame!;return strengthMode==='frame'?{...frame,filmStrength:clampFilmStrength(filmStrength??rollStrength)}:frame;}),ids=frames.map(f=>f.id);
    const roll:StoredRoll={filmStrength:rollStrength,id:rollId,name,camera:camera.trim()||undefined,stockId:stock,format,sizing,frameIds:ids,coverId:ids.includes(cover)?cover:ids[0],createdAt:editing?.createdAt??draftCreatedAt.current,updatedAt:editing?.updatedAt??draftCreatedAt.current,trashedAt:null,view:editing?.view?{...editing.view,zoom:NaN,overview:null}:undefined};
    const bundle:RollBundle={roll,frames,blobs:draft.flatMap(p=>p.blobs)};abort.current=new AbortController();setSaving(publication?'Saving and publishing roll…':'Saving roll…');await repository.save(bundle,abort.current.signal);setSaving('Opening photographs…');await onOpen(rollId);reset();onClose();
  });
  const removePhoto=(id:string)=>{const i=draft!.findIndex(p=>p.id===id);releaseDraft([draft![i]]);const next=draft!.filter(p=>p.id!==id);updateDraft(next);if(cover===id)setCover(next.find(p=>p.frame)?.id??'');if(selected===id)setSelected(next[Math.min(i,next.length-1)]?.id??'');};
  const active=draft?.find(p=>p.id===selected)??draft?.[0];
  // A file input keeps native picking and keyboard access; its label is the visible button.
  const picker=(label:string,className:string)=><label className={className}>{label}<input aria-label="Choose photographs" type="file" accept="image/jpeg,image/png" multiple disabled={busy} onChange={e=>{choose(Array.from(e.target.files??[]));e.target.value='';}}/></label>;
  // Only files dropped from outside the dialog add photographs; frame reordering drags stay in the strip.
  const dropTarget=editing?{}:{
    onDragOver:(e:DragEvent<HTMLElement>)=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();e.dataTransfer.dropEffect=busy?'none':'copy';setDropping(true);},
    onDragLeave:(e:DragEvent<HTMLElement>)=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDropping(false);},
    onDrop:(e:DragEvent<HTMLElement>)=>{if(!e.dataTransfer.files.length)return;e.preventDefault();setDropping(false);if(!busy)choose(Array.from(e.dataTransfer.files));},
  };
  const progressStatus=progress&&<span role="status" className="roll-editor-progress">{progress}</span>;
  const blocker=!draft?.length?'Add photographs to begin this roll.':!name.trim()?'Name this roll to save it.':!valid?'Select flagged photographs to resolve issues before saving.':length.exceeded?'Remove photographs or choose another frame size to fit the film.':'';
  const filmLengthMeter = <div className={`film-length ${length.exceeded?'is-overfull':''}`} aria-label="Film length">
        <div><strong>Film length</strong><span>{Math.ceil(length.used)} / {length.capacity} mm</span></div>
        <progress aria-label="Film length used" max={length.capacity} value={Math.min(length.used,length.capacity)}/>
        <p role="status">{length.exceeded?`${Math.ceil(length.used-length.capacity)} mm over capacity. Remove photographs or choose another frame size.`:length.usingExtra?`Using extra allowance beyond the usual ${length.nominal} mm · ${Math.floor(length.remaining)} mm remaining. You can save this roll.`:`${Math.floor(length.remaining)} mm remaining · Includes ${EXTRA_FILM_ALLOWANCE*100}% extra length for special cases. Frame spacing is included.`}</p>
      </div>;
  return <dialog ref={dialog} className="library-dialog roll-editor-dialog" aria-label="Review roll" onCancel={e=>{e.preventDefault();if(busy)abort.current?.abort();else onClose();}} onKeyDown={e=>e.stopPropagation()}>
    <header><div><p className="library-eyebrow">YOUR DARKROOM</p><h1>{editId?'Edit roll':'New roll'}</h1>{draft&&<p className="roll-editor-summary">{name.trim()||'Untitled roll'} · {rollFormatLabel(format,sizing)} · {getFilmStock(stock).displayName} · {photoCount(draft.length)}</p>}</div><button onClick={()=>busy?abort.current?.abort():onClose()}>{busy?'Cancel processing':'Close'}</button></header>
    {error&&<p role="alert" className="library-error">{error}{draft===null&&<button disabled={busy} onClick={()=>editId?edit(editId):start()}>Retry</button>}</p>}
    {draft?.some(p=>p.notice)&&<p role="status">{draft.filter(p=>p.notice).map(p=>`${p.filename}: ${p.notice}`).join(' ')}</p>}
    {draft===null ? loading&&<p role="status">Opening roll…</p> : <>
      <div className={`roll-editor-workspace ${draft.length?'':'is-empty'}`}>
      <section className="roll-editor-details" aria-label="Roll details"><h2 tabIndex={-1} data-step-title>Roll details</h2><div className="library-details"><label>Roll name<input maxLength={120} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="e.g. Summer on the coast"/></label>
        <label>Camera (optional)<input aria-label="Camera (optional)" type="text" maxLength={120} value={camera} disabled={busy} onChange={e=>setCamera(e.target.value)} placeholder="e.g. Nikon F3"/><small>The camera used to shoot this roll.</small></label>
        <fieldset disabled={busy} className="segmented"><legend>Film type</legend><label><input type="radio" name="film-type" checked={format==='135'} onChange={()=>{setFormat('135');setSizing('fixed');}}/>35mm</label><label><input type="radio" name="film-type" disabled={!supportsFilmFormat(stock, '120')} checked={format!=='135'} onChange={()=>{setFormat('66');setSizing('free');}}/>120</label></fieldset>
        <label>Frame size (optional)<select aria-label="Film format" value={sizing==='free'?'free':format} disabled={busy} onChange={e=>{if(e.target.value==='free')setSizing('free');else{setFormat(e.target.value as FilmFormat);setSizing('fixed');}}}>{(format==='135'?['135']:['645','66','67','69']).map(id=><option key={id} value={id}>{FILM_FORMATS[id as FilmFormat].label}</option>)}<option value="free">Free · keep original proportions</option></select><small>{sizing==='free'?'All photographs keep their full composition at the same height. Width varies with each photograph.':'Photographs fill the selected frame size. Adjust each crop in the Crop tab.'}</small></label>
        <label>Film stock<select aria-label="Film stock" value={stock} disabled={busy} onChange={e=>setStock(e.target.value as FilmStockId)}>{FILM_STOCKS.map(s=><option key={s.id} value={s.id} disabled={!supportsFilmFormat(s.id, format)}>{s.displayName}{s.formats.length === 1 ? ' · 35mm only' : ''}</option>)}</select><small>{!supportsFilmFormat(stock, '120') && '35mm only. '}{FILM_LOOKS[stock].description}. Preview and adjust its strength in the Film effect tab.</small></label></div>
        {filmLengthMeter}
        {!editing&&<p className="roll-editor-note">{publication?'Saving publishes this roll to the gallery. Only viewing images and thumbnails are uploaded; originals stay on this device.':'Your photographs stay in this browser. They are not uploaded or synced across devices.'}</p>}</section>
      <section className={`roll-editor-frames ${dropping?'is-dropping':''}`} aria-label="Frames and crop" {...dropTarget}>
        {draft.length ? <RollFrameEditor photos={draft} onPhotos={updateDraft} selected={active} onSelect={setSelected} cover={cover} onCover={setCover} onMove={move} onRemove={removePhoto}
          format={format} sizing={sizing} stock={stock} busy={busy} strengthMode={strengthMode} onStrengthMode={setStrengthMode} rollStrength={rollStrength} onRollStrength={chooseRollStrength}
          stripActions={editing?undefined:<>{progressStatus}{picker('+ Add photographs','frame-add')}</>}/>
        : <div className="roll-drop" aria-busy={busy}>
          <svg className="roll-drop-film" viewBox="0 0 132 60" aria-hidden="true"><rect width="132" height="60" rx="4" fill="currentColor"/>{Array.from({length:11},(_,i)=><g key={i} fill="var(--editor-panel)"><rect x={5+i*11.6} y="4" width="6" height="5" rx="1"/><rect x={5+i*11.6} y="51" width="6" height="5" rx="1"/></g>)}{[0,1,2].map(i=><rect key={i} x={5+i*41.3} y="14" width="39" height="32" rx="1.5" fill="var(--editor-panel)" opacity=".9"/>)}</svg>
          <h3>Bring your scans into the darkroom</h3>
          <p>Drop JPEG or PNG positive scans anywhere here, or choose them from this device. You can add more photographs at any time.</p>
          {picker(busy?'Processing photographs…':'Choose photographs','choose-photos')}
          <small>Up to 40 MB and 40 megapixels per photograph · 300 MB per draft · Partial rolls are welcome</small>
          {progressStatus}
        </div>}
      </section>
      </div>

      <footer className="import-footer">
      <div className="import-footer-actions">{editing && <button className="delete-roll" disabled={busy} aria-label={`Delete ${editing.name}`} onClick={()=>void run(async()=>{await onDelete(editing);onClose();})}>Delete roll</button>}<button onClick={()=>{if(busy)abort.current?.abort();else{reset();onClose();}}}>{busy?'Cancel processing':editing?'Cancel edits':'Cancel draft'}</button>{saving?<p role="status" className="roll-editor-hint">{saving}</p>:blocker&&!busy&&<p className="roll-editor-hint">{blocker}</p>}<div><button className="primary" disabled={busy||!!blocker} onClick={save}>Save and open</button></div></div></footer>
    </>}
  </dialog>;
}
