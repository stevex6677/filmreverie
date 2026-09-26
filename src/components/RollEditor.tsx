import { blockUpdate } from '../offline/client';
import { photoCropPreview } from '../utils/photoFraming';
import { useEffect, useRef, useState } from 'react';
import { FILM_STOCKS, DEFAULT_FILM_STOCK_ID, FilmStockId, getFilmStock } from '../data/filmStocks';
import { EXTRA_FILM_ALLOWANCE, FILM_FORMATS, FilmFormat, FrameSizing, frameAspect, filmLengthUsage, rollFormatLabel } from '../data/filmFormats';
import { RollBundle, RollRepository, StoredRoll, storageMessage, rollRepository } from '../storage/rollRepository';
import { DraftPhoto, processPhotos, releaseDraft } from '../storage/importPhotos';
import { generateUuid } from '../storage/crypto';
import { CropInspector } from './CropInspector';
interface Props { onDelete:(roll:StoredRoll)=>Promise<void>;editId?:string;onClose:()=>void;onOpen:(id:string)=>Promise<void>;repository?:RollRepository }
type Step='photos'|'details'|'review';
export function RollEditor({editId,onClose,onOpen,onDelete,repository=rollRepository}:Props) {
  const dialog=useRef<HTMLDialogElement>(null),abort=useRef<AbortController|null>(null),draftRef=useRef<DraftPhoto[]>([]),mounted=useRef(true),loadRequest=useRef(0);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[loading,setLoading]=useState(true);
  const [draft,setDraft]=useState<DraftPhoto[]|null>(null),[editing,setEditing]=useState<StoredRoll|null>(null),[rollId,setRollId]=useState(''),[step,setStep]=useState<Step>('photos'),[selected,setSelected]=useState('');
  const [name,setName]=useState(''),[stock,setStock]=useState<FilmStockId>(DEFAULT_FILM_STOCK_ID),[format,setFormat]=useState<FilmFormat>('135'),[sizing,setSizing]=useState<FrameSizing>('fixed'),[cover,setCover]=useState('');
  // Capture before the opening commit removes the shelf toolbar and roll card.
  const [opener]=useState(()=>document.activeElement instanceof HTMLElement?document.activeElement:null);
  useEffect(() => { blockUpdate('roll-editor', true); return () => blockUpdate('roll-editor', false); }, []);
  const drag=useRef<number|null>(null);
  const run=async(fn:()=>Promise<void>)=>{setError('');setBusy(true);try{await fn();}catch(e){setError(storageMessage(e));}finally{setBusy(false);setLoading(false);}};
  useEffect(()=>{
    mounted.current=true;
    dialog.current?.showModal();
    return()=>{
      mounted.current=false;++loadRequest.current;abort.current?.abort();releaseDraft(draftRef.current);
      requestAnimationFrame(()=>{
        if(mounted.current)return;
        // Saving opens the table; cancelling returns to the remounted shelf.
        for(const target of [opener,document.querySelector<HTMLElement>('.shelf-toolbar .shelf-add'),document.querySelector<HTMLElement>('.canvas-wrapper')]){
          if(!target?.isConnected||target===document.body||!target.getClientRects().length)continue;
          target.focus({preventScroll:true});
          if(document.activeElement===target)break;
        }
      });
    };
  },[]);
  useEffect(()=>{if(draft!==null){dialog.current?.querySelector<HTMLElement>('[data-step-title]')?.focus();dialog.current?.scrollTo(0,0);}},[step,draft===null]);
  const updateDraft=(photos:DraftPhoto[]|null)=>{draftRef.current=photos??[];setDraft(photos);};
  const reset=()=>{abort.current?.abort();releaseDraft(draftRef.current);updateDraft(null);setEditing(null);setError('');setProgress('');};
  const start=()=>{reset();setRollId(generateUuid());setName('');setStock(DEFAULT_FILM_STOCK_ID);setFormat('135');setSizing('fixed');setCover('');setSelected('');setStep('photos');updateDraft([]);};
  const choose=(files:File[])=>void run(async()=>{
    abort.current=new AbortController();const controller=abort.current,prior=draftRef.current;setProgress('Processing photographs…');
    try{const photos=await processPhotos(files,rollId,controller.signal,(done,total)=>setProgress(`Processed ${done} / ${total}`),prior);controller.signal.throwIfAborted();updateDraft([...prior,...photos]);if(!cover)setCover(photos.find(p=>p.frame)?.id??'');if(!selected)setSelected(photos[0]?.id??'');}
    catch(e){if(!controller.signal.aborted)throw e;setProgress('Processing cancelled. Your earlier photographs are retained.');}
  });
  useEffect(()=>{if(editId)edit(editId);else{start();setLoading(false);}},[]);
  const edit=(id:string)=>void run(async()=>{const request=++loadRequest.current,b=await repository.read(id);if(!mounted.current||request!==loadRequest.current)return;setEditing(b.roll);setRollId(id);setName(b.roll.name);setStock(b.roll.stockId);setFormat(b.roll.format);setSizing(b.roll.sizing??'fixed');setCover(b.roll.coverId);setSelected(b.frames[0]?.id??'');setStep('details');updateDraft(b.roll.frameIds.map(id=>{const frame=b.frames.find(f=>f.id===id)!;return {id,filename:frame.filename,frame,blobs:[],duplicate:false,keepDuplicate:true,preview:URL.createObjectURL(b.blobs.find(x=>x.key===frame.thumbnailKey)!.blob),reviewPreview:URL.createObjectURL(b.blobs.find(x=>x.key===frame.viewingKey)!.blob)};}));});
  const move=(from:number,to:number)=>{if(!draft||to<0||to>=draft.length)return;const next=[...draft], [p]=next.splice(from,1);next.splice(to,0,p);updateDraft(next);};
  const length=filmLengthUsage(format,sizing,draft?.flatMap(p=>p.frame?[p.frame]:[])??[]);
  const valid=!!draft?.length&&!draft.some(p=>!p.frame||p.duplicate&&!p.keepDuplicate);
  const save=()=>void run(async()=>{
    if(!valid||!draft)throw new Error('Resolve failed files and duplicates before saving.');
    const frames=draft.map(p=>p.frame!),ids=frames.map(f=>f.id),now=Date.now();
    const roll:StoredRoll={filmStrength:editing?.filmStrength,id:rollId,name,stockId:stock,format,sizing,frameIds:ids,coverId:ids.includes(cover)?cover:ids[0],createdAt:editing?.createdAt??now,updatedAt:now,trashedAt:null,view:editing?.view?{...editing.view,zoom:NaN,overview:null}:undefined};
    const bundle:RollBundle={roll,frames,blobs:draft.flatMap(p=>p.blobs)};abort.current=new AbortController();setProgress('Saving roll…');await repository.save(bundle,abort.current.signal);void navigator.storage?.persist?.().catch(()=>false);setProgress('Opening photographs…');await onOpen(rollId);reset();onClose();
  });
  const removePhoto=(id:string)=>{const i=draft!.findIndex(p=>p.id===id);releaseDraft([draft![i]]);const next=draft!.filter(p=>p.id!==id);updateDraft(next);if(cover===id)setCover(next.find(p=>p.frame)?.id??'');if(selected===id)setSelected(next[Math.min(i,next.length-1)]?.id??'');};
  const active=draft?.find(p=>p.id===selected)??draft?.[0],index=draft?.findIndex(p=>p.id===active?.id)??0;
  const go=(next:Step)=>{setError('');setStep(next);};
  const filmLengthMeter = <div className={`film-length ${length.exceeded?'is-overfull':''}`} aria-label="Film length">
        <div><strong>Film length</strong><span>{Math.ceil(length.used)} / {length.capacity} mm</span></div>
        <progress aria-label="Film length used" max={length.capacity} value={Math.min(length.used,length.capacity)}/>
        <p role="status">{length.exceeded?`${Math.ceil(length.used-length.capacity)} mm over capacity. Remove photographs in Review or choose another frame size.`:length.usingExtra?`Using extra allowance beyond the usual ${length.nominal} mm · ${Math.floor(length.remaining)} mm remaining. You can save this roll.`:`${Math.floor(length.remaining)} mm remaining · Includes ${EXTRA_FILM_ALLOWANCE*100}% extra length for special cases. Frame spacing is included.`}</p>
      </div>;
  return <dialog ref={dialog} className={`library-dialog ${editId ? 'roll-editor-dialog' : ''}`} aria-label="Review roll" onCancel={e=>{e.preventDefault();if(busy)abort.current?.abort();else onClose();}} onKeyDown={e=>e.stopPropagation()}>
    <header><div><p className="library-eyebrow">YOUR DARKROOM</p><h1>{editId?'Edit roll':'New roll'}</h1></div><button onClick={()=>busy?abort.current?.abort():onClose()}>{busy?'Cancel processing':'Close'}</button></header>
    {error&&<p role="alert" className="library-error">{error}{draft===null&&<button disabled={busy} onClick={()=>editId?edit(editId):start()}>Retry</button>}</p>}
    {progress&&draft&&(step==='photos'||busy)&&<p role="status">{progress}</p>}
    {draft?.some(p=>p.notice)&&<p role="status">{draft.filter(p=>p.notice).map(p=>`${p.filename}: ${p.notice}`).join(' ')}</p>}
    {draft===null ? loading&&<p role="status">Opening roll…</p> : <>
      {!editing && <nav className="import-steps" aria-label="Import progress">{(['photos','details','review'] as Step[]).filter(s=>!editing||s!=='photos').map((s,i)=><button key={s} aria-label={s==='photos'?'Photographs':s==='details'?'Roll details':'Review'} aria-current={step===s?'step':undefined} disabled={busy||(s!=='photos'&&!draft.length)||(s==='review'&&!name.trim())} onClick={()=>go(s)}><span>{i+1}</span>{s==='photos'?'Photographs':s==='details'?'Roll details':'Review'}</button>)}</nav>}
      {!editing && <h2 tabIndex={-1} data-step-title>{step==='photos'?'Choose your photographs':step==='details'?'Give this roll an identity':'Review every frame'}</h2>}
      {step==='photos'&&<>
        <p>Your photographs are not uploaded. This library belongs to this browser only and does not sync across devices. Clearing site data or storage eviction can remove it; export portable backups from Backups &amp; offline.</p>
        <div className="photo-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)choose(Array.from(e.dataTransfer.files));}}><h3>{draft.length?'Add to this roll':'Bring your scans into the darkroom'}</h3><p>Drop JPEG or PNG positive scans here</p><label className="choose-photos">{draft.length?'Add photographs':'Choose photographs'}<input aria-label="Choose photographs" type="file" accept="image/jpeg,image/png" multiple disabled={busy} onChange={e=>{choose(Array.from(e.target.files??[]));e.target.value='';}}/></label></div>
        <p>{draft.length} photographs selected · Your order and edits are retained when adding another batch.</p><details><summary>Supported files and limits</summary><p>JPEG/PNG positive scans. Up to 300 MB per draft. Roll capacity depends on image width and film length; 40 MB and 40 megapixels per file. Partial rolls are welcome.</p></details>
        {!!draft.length&&<div className="import-filmline">{draft.map(p=><div key={p.id}>{p.preview&&<img src={p.preview} alt={p.filename}/>}<span>{p.filename}</span>{p.error&&<span role="alert">{p.error}</span>}{p.duplicate&&<span>Duplicate — resolve in Review</span>}</div>)}</div>}
      </>}
      <div className={editing ? 'roll-editor-workspace' : undefined}>
      {(editing || step==='details')&&<section className="roll-editor-details" aria-label="Roll details">{editing && <h2 tabIndex={-1} data-step-title>Roll details</h2>}<div className="library-details"><label>Roll name<input maxLength={120} value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder="e.g. Summer on the coast"/></label>
        <fieldset disabled={busy}><legend>Film type</legend><label><input type="radio" name="film-type" checked={format==='135'} onChange={()=>{setFormat('135');setSizing('fixed');}}/>35mm</label><label><input type="radio" name="film-type" checked={format!=='135'} onChange={()=>{setFormat('66');setSizing('free');}}/>120</label></fieldset>
        <label>Frame size (optional)<select aria-label="Film format" value={sizing==='free'?'free':format} disabled={busy} onChange={e=>{if(e.target.value==='free')setSizing('free');else{setFormat(e.target.value as FilmFormat);setSizing('fixed');}}}>{(format==='135'?['135']:['645','66','67','69']).map(id=><option key={id} value={id}>{FILM_FORMATS[id as FilmFormat].label}</option>)}<option value="free">Free · keep original proportions</option></select><small>{sizing==='free'?'All photographs keep their full composition at the same height. Width varies with each photograph.':editing?'Photographs fill the selected frame size. Adjust the crop beside these details.':'Photographs fill the selected frame size. Adjust cropping in Review.'}</small></label>
        <label>Film stock<select aria-label="Film stock" value={stock} disabled={busy} onChange={e=>setStock(e.target.value as FilmStockId)}>{FILM_STOCKS.map(s=><option key={s.id} value={s.id}>{s.displayName}</option>)}</select></label></div><div className="live-roll-label"><span>{rollFormatLabel(format,sizing)} / {getFilmStock(stock).displayName}</span><h3>{name||'Untitled roll'}</h3><p>{draft.length} photographs</p></div>{editing && filmLengthMeter}</section>}
      {(editing || step==='review')&&<section className="roll-editor-frames" aria-label="Frames and crop">{editing && <h2>Frames</h2>}<p className="review-summary">{name} · {rollFormatLabel(format,sizing)} · {draft.length} photographs</p><div className="review-layout"><div><ol className="draft-photos">{draft.map((p,i)=><li key={p.id} draggable={!busy} onDragStart={()=>{drag.current=i;setSelected(p.id);}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(drag.current!==null)move(drag.current,i);drag.current=null;}}><button aria-label={`Select frame ${i+1}`} aria-pressed={active?.id===p.id} onClick={()=>setSelected(p.id)}><div className="draft-preview" style={{aspectRatio:frameAspect(format,sizing,p.frame),width:`min(100%, ${(editing?80:190)*frameAspect(format,sizing,p.frame)}px)`}}>{p.preview&&<img src={p.preview} alt={p.filename} style={photoCropPreview(p.frame?p.frame.width/p.frame.height:1,frameAspect(format,sizing,p.frame),p.frame?.rotation??0,p.frame?.cropPosition)}/>}</div><strong>Frame {i+1}{cover===p.id?' · Cover':''}</strong><span>{p.filename}</span>{p.error&&<span className="photo-issue">Cannot read file</span>}{p.duplicate&&!p.keepDuplicate&&<span className="photo-issue">Duplicate</span>}</button></li>)}</ol></div>
        {active&&<div className="selected-review"><CropInspector key={active.id} photo={active} format={format} sizing={sizing} disabled={busy} onChange={cropPosition=>updateDraft(draft.map(p=>p.id===active.id?{...p,frame:{...p.frame!,cropPosition}}:p))}/><h3>Frame {index+1} · {active.filename}</h3>{active.error&&<p role="alert">{active.error}</p>}{active.duplicate&&<label><input type="checkbox" checked={active.keepDuplicate} disabled={busy} onChange={e=>updateDraft(draft.map(p=>p.id===active.id?{...p,keepDuplicate:e.target.checked}:p))}/>Keep this duplicate content</label>}<div className="draft-actions"><button disabled={busy||index===0} aria-label={`Move frame ${index+1} earlier`} onClick={()=>move(index,index-1)}>Earlier</button><button disabled={busy||index===draft.length-1} aria-label={`Move frame ${index+1} later`} onClick={()=>move(index,index+1)}>Later</button><button disabled={busy||!active.frame} aria-label={`Rotate frame ${index+1}`} onClick={()=>updateDraft(draft.map(p=>p.id===active.id?{...p,frame:{...p.frame!,rotation:(p.frame!.rotation+90)%360,cropPosition:p.frame!.cropPosition?{x:-p.frame!.cropPosition.y,y:p.frame!.cropPosition.x}:undefined}}:p))}>Rotate 90°</button><button disabled={busy||!active.frame} aria-pressed={cover===active.id} onClick={()=>setCover(active.id)}>Cover</button><button disabled={busy} onClick={()=>removePhoto(active.id)}>Remove {active.filename}</button></div></div>}
      </div>{!valid&&<p role="status">Select flagged photographs to resolve issues before saving.</p>}</section>}
      </div>

      <footer className="import-footer">
      {!editing && filmLengthMeter}
      <div className="import-footer-actions">{editing && <button className="delete-roll" disabled={busy} aria-label={`Delete ${editing.name}`} onClick={()=>void run(async()=>{await onDelete(editing);onClose();})}>Delete roll</button>}<button onClick={()=>{if(busy)abort.current?.abort();else{reset();onClose();}}}>{busy?'Cancel processing':editing?'Cancel edits':'Cancel draft'}</button><div>{!editing&&step!=='photos'&&<button disabled={busy} onClick={()=>go(step==='review'?'details':'photos')}>Back</button>}{editing?<button className="primary" disabled={busy||!name.trim()||!valid||length.exceeded} onClick={save}>Save and open</button>:step==='photos'?<button className="primary" disabled={busy||!draft.length} onClick={()=>go('details')}>Continue to roll details</button>:step==='details'?<button className="primary" disabled={busy||!name.trim()||!draft.length} onClick={()=>go('review')}>Review photographs</button>:<button className="primary" disabled={busy||!name.trim()||!valid||length.exceeded} onClick={save}>Save and open</button>}</div></div></footer>
    </>}
  </dialog>;
}
