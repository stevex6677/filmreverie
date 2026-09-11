import { photoCropPreview } from "../utils/photoFraming";
import { useEffect, useRef, useState } from 'react';
import { FILM_STOCKS, DEFAULT_FILM_STOCK_ID, FilmStockId, getFilmStock } from '../data/filmStocks';
import { FILM_FORMATS, FilmFormat } from '../data/filmFormats';
import { RollBundle, RollRepository, StoredRoll, storageMessage } from '../storage/rollRepository';
import { DraftPhoto, processPhotos, releaseDraft } from '../storage/importPhotos';
export const rollRepository = new RollRepository();
interface Props { onClose: () => void; onOpen: (id: string) => Promise<void>; onExample: () => void; activeId: string; onRemoved: (id: string) => void }
export function RollLibrary({ onClose, onOpen, onExample, activeId, onRemoved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), abort = useRef<AbortController | null>(null), draftRef = useRef<DraftPhoto[]>([]);
  const [rolls,setRolls] = useState<StoredRoll[]>([]), [error,setError] = useState(''), [busy,setBusy] = useState(false), [progress,setProgress] = useState('');
  const [draft,setDraft] = useState<DraftPhoto[] | null>(null), [editing,setEditing] = useState<StoredRoll | null>(null), [rollId,setRollId] = useState('');
  const [name,setName] = useState(''), [stock,setStock] = useState<FilmStockId>(DEFAULT_FILM_STOCK_ID), [format,setFormat] = useState<FilmFormat>('135'), [cover,setCover] = useState('');
  const [trash,setTrash] = useState(false), [usage,setUsage] = useState(''), [covers,setCovers] = useState<Record<string,{url:string;rotation:number}>>({});
  const drag = useRef<number | null>(null);
  const refresh = async () => { setRolls(await rollRepository.list()); const estimate = await navigator.storage?.estimate?.(); if (estimate?.usage !== undefined) setUsage(`${(estimate.usage / 1048576).toFixed(1)} MB used by this site`); };
  const run = async (fn: () => Promise<void>) => { setError(''); setBusy(true); try { await fn(); } catch (e) { setError(storageMessage(e)); } finally { setBusy(false); } };
  useEffect(() => { const previous = document.activeElement as HTMLElement; dialog.current?.showModal(); void run(refresh); return () => { abort.current?.abort(); releaseDraft(draftRef.current); previous?.focus(); }; }, []);
  useEffect(() => { let cancelled = false; const urls: string[] = []; void Promise.all(rolls.map(async r => { try { const cover = await rollRepository.thumbnail(r.id, r.coverId); const url = URL.createObjectURL(cover.blob); urls.push(url); return [r.id,{url,rotation:cover.rotation}] as const; } catch { return [r.id,{url:'',rotation:0}] as const; } })).then(entries => { if (!cancelled) setCovers(Object.fromEntries(entries)); else urls.forEach(URL.revokeObjectURL); }); return () => { cancelled = true; urls.forEach(URL.revokeObjectURL); }; }, [rolls]);
  const updateDraft = (photos: DraftPhoto[] | null) => { draftRef.current = photos ?? []; setDraft(photos); };
  const reset = () => { abort.current?.abort(); releaseDraft(draftRef.current); updateDraft(null); setEditing(null); setError(''); setProgress(''); };
  const start = () => { reset(); const id = crypto.randomUUID(); setRollId(id); setName(''); setStock(DEFAULT_FILM_STOCK_ID); setFormat('135'); setCover(''); updateDraft([]); };
  const choose = (files: File[]) => void run(async () => {
    if (draft?.length) throw new Error('Cancel this draft to choose a different batch.');
    abort.current = new AbortController();
    try { const photos = await processPhotos(files, rollId, abort.current.signal, (done,total) => setProgress(`Processed ${done} / ${total}`)); updateDraft(photos); setCover(photos.find(p => p.frame)?.id ?? ''); } catch (e) { if (!abort.current.signal.aborted) throw e; }
  });
  const edit = (id: string) => void run(async () => {
    const bundle = await rollRepository.read(id); setEditing(bundle.roll); setRollId(id); setName(bundle.roll.name); setStock(bundle.roll.stockId); setFormat(bundle.roll.format); setCover(bundle.roll.coverId);
    updateDraft(bundle.frames.map(frame => ({ id: frame.id, filename: frame.filename, frame, blobs: [], duplicate: false, keepDuplicate: true, preview: URL.createObjectURL(bundle.blobs.find(b => b.key === frame.thumbnailKey)!.blob) })));
  });
  const move = (from: number, to: number) => { if (!draft || to < 0 || to >= draft.length) return; const next = [...draft]; const [photo] = next.splice(from,1); next.splice(to,0,photo); updateDraft(next); };
  const save = () => void run(async () => {
    if (!draft?.length || draft.some(p => !p.frame || p.duplicate && !p.keepDuplicate)) throw new Error('Remove failed files and explicitly retain or remove duplicates before saving.');
    const frames = draft.map(p => p.frame!), ids = frames.map(f => f.id), now = Date.now();
    const roll: StoredRoll = { id: rollId, name, stockId: stock, format, frameIds: ids, coverId: ids.includes(cover) ? cover : ids[0], createdAt: editing?.createdAt ?? now, updatedAt: now, trashedAt: null, view: editing?.view ? { ...editing.view, zoom: NaN, overview: null } : undefined };
    const bundle: RollBundle = { roll, frames, blobs: draft.flatMap(p => p.blobs) };
    abort.current = new AbortController(); await rollRepository.save(bundle,abort.current.signal);
    await navigator.storage?.persist?.().catch(() => false);
    await refresh(); reset(); await onOpen(rollId); onClose();
  });
  const removePhoto = (id: string) => { const photo = draft!.find(p => p.id === id)!; releaseDraft([photo]); updateDraft(draft!.filter(p => p.id !== id)); };
  const visible = rolls.filter(r => trash ? r.trashedAt !== null : r.trashedAt === null);
  return <dialog ref={dialog} className="library-dialog" aria-label={draft ? 'Review roll' : 'Roll library'} onCancel={e => { e.preventDefault(); if (busy) abort.current?.abort(); else onClose(); }} onKeyDown={e => e.stopPropagation()}>
    <header><div><p className="library-eyebrow">YOUR DARKROOM</p><h1>{draft ? editing ? 'Edit roll' : 'New roll' : trash ? 'Trash' : 'Rolls'}</h1></div><button onClick={() => { if (busy) abort.current?.abort(); else onClose(); }}>{busy ? 'Cancel processing' : 'Close'}</button></header>
    <p>Stored in this browser. Clearing site data removes your rolls. Keep your originals. {usage}</p>
    {error && <p role="alert" className="library-error">{error} <button disabled={busy} onClick={() => void run(refresh)}>Retry storage</button></p>}
    {progress && <p role="status">{progress}</p>}
    {draft === null ? <>
      <div className="library-toolbar"><button disabled={busy} onClick={start}>New roll</button><button disabled={busy} onClick={() => setTrash(!trash)}>{trash ? 'Back to rolls' : 'Trash'}</button><button disabled={busy} onClick={() => { onExample(); onClose(); }}>Open built-in example</button></div>
      {!visible.length && <p className="library-empty">{trash ? 'Trash is empty. Removed rolls stay here until you restore them.' : 'Your photographs, on the light table. Add a roll to begin.'}</p>}
      <div className="library-cards">{visible.map(r => <article key={r.id} data-roll-id={r.id}>
        {covers[r.id]?.url && <img style={{transform:`rotate(${covers[r.id].rotation}deg)`,width:covers[r.id].rotation % 180 ? 145 : undefined,margin:"auto",display:"block"}} src={covers[r.id].url} alt={`Cover of ${r.name}`} />}<h2>{r.name}</h2><p>{FILM_FORMATS[r.format].label} · {r.frameIds.length} frames</p><p>{getFilmStock(r.stockId).displayName}{activeId === r.id ? ' · Open' : ''}</p>
        {trash ? <button disabled={busy} onClick={() => void run(async () => { await rollRepository.trash(r.id,false); await refresh(); })}>Restore {r.name}</button> : <>
          <button disabled={busy} onClick={() => void run(async () => { await onOpen(r.id); onClose(); })}>Open {r.name}</button>
          <button disabled={busy} onClick={() => edit(r.id)}>Edit {r.name}</button>
          <button disabled={busy} onClick={() => void run(async () => { await rollRepository.trash(r.id); onRemoved(r.id); await refresh(); })}>Move {r.name} to Trash</button>
        </>}
      </article>)}</div>
    </> : <>
      <div className="library-details"><label>Roll name<input maxLength={120} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <label>Film stock<select aria-label="Film stock" value={stock} disabled={busy} onChange={e => setStock(e.target.value as FilmStockId)}>{FILM_STOCKS.map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}</select></label>
      <label>Film format<select aria-label="Film format" value={format} disabled={busy} onChange={e => setFormat(e.target.value as FilmFormat)}>{(["135","645","66","67","69"] as FilmFormat[]).map(id => <option key={id} value={id}>{FILM_FORMATS[id].label}</option>)}</select></label></div>
      <p>{draft.length} photographs · Photos are center-cropped to fill the frame. Originals stay unchanged. Partial rolls are welcome.</p>
      {draft.length > FILM_FORMATS[format].typicalCount && <p role="status">This exceeds the usual {FILM_FORMATS[format].typicalCount} exposures for this format. Every imported frame will be retained.</p>}
      {!editing && !draft.length && <div className="photo-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) choose(Array.from(e.dataTransfer.files)); }}>
        <label>Choose photographs<input type="file" accept="image/jpeg,image/png" multiple disabled={busy} onChange={e => choose(Array.from(e.target.files ?? []))} /></label><p>Or drop JPEG/PNG positive scans here. Up to 72 files, 40 MB / 40 MP each, 300 MB per batch. Images process one at a time.</p>
      </div>}
      <ol className="draft-photos">{draft.map((p,i) => {
        const f = p.frame, a = f ? (f.rotation % 180 ? f.height/f.width : f.width/f.height) : 1, gate = FILM_FORMATS[format];
        return <li key={p.id} draggable={!busy} onDragStart={() => { drag.current = i; }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag.current !== null) move(drag.current,i); drag.current = null; }}>
          <div className="draft-preview" style={{ aspectRatio: `${gate.width}/${gate.height}` }}>{p.preview && <img src={p.preview} alt={p.filename} style={photoCropPreview(f ? f.width/f.height : 1, gate.width/gate.height, f?.rotation ?? 0)} />}</div>
          <div><strong>Frame {i+1}</strong><p>{p.filename}</p>{p.error && <p role="alert">{p.error}</p>}{f && Math.abs(a / (gate.width/gate.height)-1) > .08 && <p>Aspect mismatch: edges will be cropped. Rotate or choose another format to change the crop.</p>}
          {p.duplicate && <label><input type="checkbox" checked={p.keepDuplicate} disabled={busy} onChange={e => updateDraft(draft.map(x => x.id === p.id ? { ...x,keepDuplicate:e.target.checked } : x))} />Keep this duplicate content</label>}
          <div className="draft-actions"><button disabled={busy || i === 0} onClick={() => move(i,i-1)} aria-label={`Move frame ${i+1} earlier`}>Earlier</button><button disabled={busy || i === draft.length-1} onClick={() => move(i,i+1)} aria-label={`Move frame ${i+1} later`}>Later</button>
          <button disabled={busy || !f} onClick={() => updateDraft(draft.map(x => x.id === p.id ? { ...x,frame: { ...x.frame!,rotation: (x.frame!.rotation+90)%360 } } : x))} aria-label={`Rotate frame ${i+1}`}>Rotate 90°</button>
          <button disabled={busy || !f} aria-pressed={cover === p.id} onClick={() => setCover(p.id)}>Cover</button>{!editing && <button disabled={busy} onClick={() => removePhoto(p.id)}>Remove {p.filename}</button>}</div></div>
        </li>;
      })}</ol>
      <footer><button onClick={() => busy ? abort.current?.abort() : reset()}>{busy ? 'Cancel processing' : 'Cancel draft'}</button><button disabled={busy || !name.trim() || !draft.length || draft.some(p => !p.frame || p.duplicate && !p.keepDuplicate)} onClick={save}>Save and open</button></footer>
    </>}
  </dialog>;
}
