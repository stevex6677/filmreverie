import { useEffect, useRef, useState } from 'react';
import { CropInspector } from '../components/CropInspector';
import { FILM_FORMATS, filmLengthUsage, frameAspect, type FilmFormat, type FrameSizing } from '../data/filmFormats';
import { DEFAULT_FILM_STOCK_ID, FILM_STOCKS, supportsFilmFormat, type FilmStockId } from '../data/filmStocks';
import { blockUpdate } from '../offline/client';
import { generateUuid } from '../storage/crypto';
import { IMPORT_LIMITS, processPhotos, releaseDraft } from '../storage/importPhotos';
import { decodeArchive } from '../storage/rollArchive';
import { validateBundle, type RollBundle, type StoredRoll } from '../storage/rollRepository';
import { photoCropPreview } from '../utils/photoFraming';
import type { CloudDraft } from './contracts';
import { OwnerSessionRequired, ownerClient, uploadOwnerPhoto, type OwnerPhoto } from './ownerClient';
import { runPhotoUploads } from './uploadQueue';
import { adoptOwnerDraft, copyOwnerArchive, createOwnerPreview, loadOwnerPhotos, type OwnerPreview } from './ownerDraft';
import './owner.css';

export type { OwnerPreview } from './ownerDraft';
interface Props {
  onClose: () => void;
  onPreview: (preview: OwnerPreview) => void | Promise<void>;
  onPreviewActiveChange?: (active: boolean) => void;
}

export function OwnerPanel({ onClose, onPreview, onPreviewActiveChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false), operation = useRef<AbortController | null>(null);
  const photosRef = useRef<OwnerPhoto[]>([]), previewChange = useRef(onPreviewActiveChange);
  previewChange.current = onPreviewActiveChange;
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [progress, setProgress] = useState('');
  const [drafts, setDrafts] = useState<CloudDraft[]>([]), [archives, setArchives] = useState<RollBundle[]>([]);
  const [roll, setRoll] = useState<StoredRoll | null>(null), [photos, setPhotos] = useState<OwnerPhoto[]>([]);
  const [saved, setSaved] = useState<CloudDraft | null>(null), [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState(''), [previewed, setPreviewed] = useState(false), [previewActive, setPreviewActive] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false), [withdrawConfirmed, setWithdrawConfirmed] = useState(false);

  const updatePhotos = (next: OwnerPhoto[]) => { photosRef.current = next; setPhotos(next); };
  const edited = () => { setDirty(true); setPreviewed(false); setPublishConfirmed(false); setWithdrawConfirmed(false); setProgress(''); };
  const replaceDraft = (nextRoll: StoredRoll, nextPhotos: OwnerPhoto[], savedDraft: CloudDraft | null) => {
    releaseDraft(photosRef.current);
    updatePhotos(nextPhotos); setRoll(nextRoll); setSaved(savedDraft); setDirty(!savedDraft);
    setSelected(nextPhotos[0]?.id ?? ''); setPreviewed(false); setPublishConfirmed(false); setWithdrawConfirmed(false); setArchives([]);
  };
  const mayDiscard = () => !dirty || window.confirm('Discard unsaved admin edits? Saved private drafts and guest darkroom rolls will not be changed.');
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(''); setProgress('');
    try { await work(controller.signal); }
    catch (cause) {
      if (!mounted.current || operation.current !== controller) return;
      if (controller.signal.aborted) setProgress('Cancelled. Earlier completed uploads and your unsaved edits are retained. Refresh saved drafts after a cancelled save or publication to check its server outcome.');
      else {
        setProgress('');
        if (cause instanceof OwnerSessionRequired) setEmail('');
        setError(cause instanceof Error ? cause.message : 'Owner operation failed. Your draft and previous publication are retained.');
      }
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  };
  const checkSession = () => void run(async signal => {
    setProgress('Checking owner session…');
    const session = await ownerClient.session(signal);
    const list = await ownerClient.list(signal);
    signal.throwIfAborted(); setEmail(session.email); setDrafts(list); setProgress('Owner session verified. Photographs are uploaded only when you save a private draft.');
  });

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    blockUpdate('owner-panel', true); dialog.current?.showModal(); checkSession();
    return () => {
      mounted.current = false; operation.current?.abort(); operation.current = null; releaseDraft(photosRef.current);
      blockUpdate('owner-panel', false); previewChange.current?.(false);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);

  const start = () => {
    if (!mayDiscard()) return;
    const now = Date.now();
    replaceDraft({ id: generateUuid(), name: '', stockId: DEFAULT_FILM_STOCK_ID, format: '135', sizing: 'fixed', frameIds: [], coverId: '', createdAt: now, updatedAt: now, trashedAt: null }, [], null);
    setError(''); setProgress('Choose photographs. Nothing is uploaded until Save private draft.');
  };
  const choosePhotos = (files: File[]) => {
    if (!files.length || !roll) return;
    void run(async signal => {
      // Keep selected JPEG/PNG sources in browser memory; only canvas display JPEGs are uploaded.
      for (const file of files) {
        signal.throwIfAborted();
        const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        const jpeg = bytes[0] === 255 && bytes[1] === 216;
        const png = bytes.length === 8 && bytes.every((byte, i) => byte === [137, 80, 78, 71, 13, 10, 26, 10][i]);
        if (!jpeg && !png) throw new Error(`${file.name}: choose JPEG or PNG originals. No files from this selection were added.`);
      }
      setProgress('Preparing viewing images on this device…');
      const added = await processPhotos(files, roll.id, signal, (done, total) => setProgress(`Prepared ${done} / ${total} photographs`), photosRef.current);
      for (const photo of added) if (photo.frame && Math.max(photo.frame.width, photo.frame.height) > 16384) photo.error = 'The photograph exceeds the cloud limit of 16,384 pixels on one side. Remove this photograph before saving.';
      const next = [...photosRef.current, ...added];
      updatePhotos(next); setRoll({ ...roll, frameIds: next.map(photo => photo.id), coverId: roll.coverId || added.find(photo => photo.frame)?.id || '' });
      if (!selected) setSelected(added[0]?.id ?? '');
      edited(); setProgress(`${added.length} photographs prepared locally. Save explicitly to upload.`);
    });
  };
  const chooseArchive = (file?: File) => {
    if (!file || !mayDiscard()) return;
    void run(async signal => {
      setProgress('Checking the selected backup on this device…');
      const bundles = await decodeArchive(file); signal.throwIfAborted();
      if (bundles.length === 1) {
        const copy = await copyOwnerArchive(bundles[0], signal, (done, total) => setProgress(`Preparing backup photographs ${done} / ${total}`)); replaceDraft(copy.roll, copy.photos, null);
        setProgress('Backup opened as an independent cloud draft. Ordering, cover, crops and saved view are retained; originals remain only in this browser session. Nothing uploaded yet.');
      } else { setArchives(bundles); setProgress('Choose one roll from this backup. No local library was read and nothing has been uploaded.'); }
    });
  };
  const openArchiveRoll = (bundle: RollBundle) => {
    if (!mayDiscard()) return;
    void run(async signal => {
      const copy = await copyOwnerArchive(bundle, signal, (done, total) => setProgress(`Preparing backup photographs ${done} / ${total}`));
      replaceDraft(copy.roll, copy.photos, null); setProgress('Backup roll opened locally as an independent cloud draft. Save explicitly to upload.');
    });
  };
  const load = (id: string) => {
    if (!mayDiscard()) return;
    void run(async signal => {
      setProgress('Loading private draft…');
      const draft = await ownerClient.load(id, signal);
      const loaded = await loadOwnerPhotos(draft, signal, (done, total) => setProgress(`Loading private photographs ${done} / ${total}`));
      replaceDraft(draft.roll, loaded, draft); setProgress('Saved private draft loaded into memory. Preview it before publishing.');
    });
  };
  const changeRoll = (change: Partial<StoredRoll>) => { if (roll) { setRoll({ ...roll, ...change }); edited(); } };
  const changePhoto = (id: string, change: Partial<OwnerPhoto>) => { updatePhotos(photos.map(photo => photo.id === id ? { ...photo, ...change } : photo)); edited(); };
  const move = (from: number, to: number) => {
    if (busy || !roll || to < 0 || to >= photos.length) return;
    const next = [...photos], [photo] = next.splice(from, 1); next.splice(to, 0, photo);
    updatePhotos(next); changeRoll({ frameIds: next.map(item => item.id) });
  };
  const remove = (id: string) => {
    if (!roll) return;
    const index = photos.findIndex(photo => photo.id === id), next = photos.filter(photo => photo.id !== id);
    releaseDraft(photos.filter(photo => photo.id === id)); updatePhotos(next);
    changeRoll({ frameIds: next.map(photo => photo.id), coverId: roll.coverId === id ? next.find(photo => photo.frame)?.id ?? '' : roll.coverId,
      view: roll.view?.frameId === id ? { ...roll.view, frameId: next[0]?.id ?? '', zoom: NaN, overview: null } : roll.view });
    if (selected === id) setSelected(next[Math.min(index, next.length - 1)]?.id ?? '');
  };
  const length = filmLengthUsage(roll?.format ?? '135', roll?.sizing ?? 'fixed', photos.flatMap(photo => photo.frame ? [photo.frame] : []));
  const valid = !!roll?.name.trim() && !!photos.length && !length.exceeded && photos.every(photo => photo.frame && !photo.error && (!photo.duplicate || photo.keepDuplicate));
  const save = () => void run(async signal => {
    if (!roll || !valid) throw new Error('Resolve the roll name, failed photographs, duplicates and film length before saving.');
    const frames = photos.map(photo => photo.frame!);
    const metadata = { ...roll, name: roll.name.trim(), frameIds: frames.map(frame => frame.id) };
    validateBundle({ roll: metadata, frames, blobs: photos.flatMap(photo => photo.blobs) });
    let completed = 0;
    setProgress(`Uploading photographs · ${completed} / ${photos.length} complete`);
    const uploaded = await runPhotoUploads(photos, signal, async photo => {
      const frame = await uploadOwnerPhoto(photo, signal, () => {});
      setProgress(`Uploading photographs · ${++completed} / ${photos.length} complete`);
      return frame;
    });
    setProgress('Saving complete private draft…');
    const result = await ownerClient.save({ roll: metadata, frames: uploaded }, signal);
    signal.throwIfAborted();
    updatePhotos(adoptOwnerDraft(result, photos)); setRoll(result.roll); setSaved(result); setDirty(false); setPreviewed(false); setPublishConfirmed(false);
    setDrafts(previous => [result, ...previous.filter(draft => draft.roll.id !== result.roll.id)]);
    setProgress('Private draft saved. Preview the saved version, then return here to publish explicitly.');
  });
  const preview = () => void run(async signal => {
    if (!saved || dirty) throw new Error('Save your edits before previewing the version that can be published.');
    setProgress('Opening the saved private preview…');
    const draft = await ownerClient.load(saved.roll.id, signal);
    if (draft.roll.updatedAt !== saved.roll.updatedAt) throw new Error('This draft changed in another session. Reload the saved draft and review it before publishing.');
    const loaded = await loadOwnerPhotos(draft, signal, (done, total) => setProgress(`Preparing saved preview ${done} / ${total}`));
    let runtime: OwnerPreview;
    try { runtime = createOwnerPreview(draft, loaded); } finally { releaseDraft(loaded); }
    try {
      await onPreview(runtime);
      if (!mounted.current) return;
      setPreviewed(true); setPreviewActive(true); dialog.current?.close(); previewChange.current?.(true);
    } catch (cause) { runtime.dispose(); throw cause; }
  });
  const returnToOwner = () => {
    setPreviewActive(false); dialog.current?.showModal(); previewChange.current?.(false);
    setProgress('Saved preview reviewed. Publishing is a separate action below.');
  };
  const publish = () => void run(async signal => {
    if (!saved || dirty || !previewed || !publishConfirmed) throw new Error('Save and preview this revision, then confirm public publication.');
    setProgress('Publishing a complete gallery revision…');
    let batches = 0;
    const published = await ownerClient.publish(saved.roll.id, saved.roll.updatedAt, signal,
      () => setProgress(`Preparing gallery revision · ${++batches} batches completed…`));
    setPublishConfirmed(false); setProgress(`Published “${published.name}”. Only the approved viewing images, thumbnails and selected metadata are public. Keep your original files and backups separately.`);
  });
  const withdraw = () => void run(async signal => {
    if (!saved || !withdrawConfirmed) throw new Error('Confirm the withdrawal warning first.');
    setProgress('Withdrawing from the current gallery…');
    await ownerClient.withdraw(saved.roll.id, signal, () => setProgress('Removing published photographs in batches…'));
    setWithdrawConfirmed(false); setProgress('Withdrawn from the current gallery. Private drafts remain. Downloaded files, screenshots and previously saved offline copies cannot be revoked.');
  });
  const active = photos.find(photo => photo.id === selected) ?? photos[0], activeIndex = photos.findIndex(photo => photo.id === active?.id);
  const close = () => { if (busy) operation.current?.abort(); else if (mayDiscard()) onClose(); };

  return <>
    {previewActive && <button className="owner-return" onClick={returnToOwner}>Return to owner · Publish / edit</button>}
    <dialog ref={dialog} className="library-dialog owner-panel" aria-label="Owner publishing" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => event.stopPropagation()}>
      <header><div><p className="library-eyebrow">PRIVATE OWNER WORKSPACE</p><h1>Owner publishing</h1></div><button onClick={close}>{busy ? 'Cancel operation' : 'Close'}</button></header>
      <p>Admin photographs are separate from the guest darkroom. Nothing is read from browser-local rolls or uploaded automatically. Private images and drafts stay out of offline caches.</p>
      <section className="owner-session" aria-label="Owner session">
        <p>{email ? `Authenticated owner: ${email}` : 'Owner authentication is required. Access is enforced by the server, not this panel.'}</p>
        <a href="/api/owner/session" target="_blank" rel="noopener noreferrer">Owner login (new tab)</a>
        <button disabled={busy} onClick={checkSession}>Check session / Refresh drafts</button>
      </section>
      {error && <p role="alert" className="library-error">{error}</p>}
      {progress && <p role="status" className="owner-progress">{progress}</p>}
      <section aria-label="Private saved drafts" className="owner-saved">
        <h2>Private saved drafts</h2>
        {email && !drafts.length && <p>No saved cloud drafts. Choose photographs or a backup below.</p>}
        <ul>{drafts.map(draft => <li key={draft.roll.id}><button disabled={busy || !email} onClick={() => load(draft.roll.id)}><strong>{draft.roll.name}</strong><span>{draft.frames.length} frames · saved {new Date(draft.roll.updatedAt).toLocaleString()}</span></button></li>)}</ul>
        <div className="owner-source-actions"><button disabled={busy || !email} onClick={start}>New photo draft</button><label className="choose-photos">Open .darkroom backup<input aria-label="Open owner backup" type="file" accept=".darkroom,application/vnd.darkroom.rolls" disabled={busy || !email} onChange={event => { chooseArchive(event.target.files?.[0]); event.target.value = ''; }}/></label></div>
        <p>Choose a backup file explicitly; this does not import into, read, or modify your local library. Keep your original backup separately.</p>
        {!!archives.length && <div className="owner-archive-choice"><h3>Choose a roll from this backup</h3>{archives.map(bundle => <button key={bundle.roll.id} disabled={busy} onClick={() => openArchiveRoll(bundle)}>{bundle.roll.name} · {bundle.frames.length} frames</button>)}<button disabled={busy} onClick={() => setArchives([])}>Cancel backup selection</button></div>}
      </section>
      {roll && <>
        <section className="owner-editor" aria-label="Owner draft editor">
          <div className="owner-details"><h2>Private draft details {dirty && <small>· unsaved</small>}</h2>
            <div className="library-details">
              <label>Roll name<input aria-label="Owner roll name" value={roll.name} maxLength={120} disabled={busy} onChange={event => changeRoll({ name: event.target.value })}/></label>
              <label>Camera (optional)<input aria-label="Owner camera" type="text" value={roll.camera ?? ''} maxLength={120} disabled={busy} onChange={event => changeRoll({ camera: event.target.value })} placeholder="e.g. Nikon F3"/><small>The camera used to shoot this roll.</small></label>
              <fieldset disabled={busy}><legend>Film type</legend><label><input type="radio" name="owner-film-type" checked={roll.format === '135'} onChange={() => changeRoll({ format: '135', sizing: 'fixed' })}/>35mm</label><label><input type="radio" name="owner-film-type" disabled={!supportsFilmFormat(roll.stockId, '120')} checked={roll.format !== '135'} onChange={() => changeRoll({ format: '66', sizing: 'free' })}/>120</label></fieldset>
              <label>Frame size<select aria-label="Owner film format" value={roll.sizing === 'free' ? 'free' : roll.format} disabled={busy} onChange={event => changeRoll(event.target.value === 'free' ? { sizing: 'free' as FrameSizing } : { format: event.target.value as FilmFormat, sizing: 'fixed' })}>{(roll.format === '135' ? ['135'] : ['645', '66', '67', '69']).map(format => <option key={format} value={format}>{FILM_FORMATS[format as FilmFormat].label}</option>)}<option value="free">Free · keep original proportions</option></select></label>
              <label>Film stock<select aria-label="Owner film stock" value={roll.stockId} disabled={busy} onChange={event => changeRoll({ stockId: event.target.value as FilmStockId })}>{FILM_STOCKS.map(stock => <option key={stock.id} value={stock.id} disabled={!supportsFilmFormat(stock.id, roll.format)}>{stock.displayName}{stock.formats.length === 1 ? ' · 35mm only' : ''}</option>)}</select></label>
              <label>Film strength <output>{roll.filmStrength ?? 50}</output><input aria-label="Owner film strength" type="range" min="0" max="100" step="1" value={roll.filmStrength ?? 50} disabled={busy} onChange={event => changeRoll({ filmStrength: Number(event.target.value) })}/><small>0 Original · 50 Default · 100 Strong</small></label>
            </div>
            <label className="choose-photos">{photos.length ? 'Add photographs' : 'Choose photographs'}<input aria-label="Choose owner photographs" type="file" accept="image/jpeg,image/png" multiple disabled={busy} onChange={event => { choosePhotos(Array.from(event.target.files ?? [])); event.target.value = ''; }}/></label>
            <p>Original JPEG/PNG files stay in browser memory only for this session; keep your own originals and backups. Only canvas-rendered, metadata-free viewing JPEGs and thumbnails are saved privately or published. Up to {IMPORT_LIMITS.bytes / 1024 / 1024} MB and 40 megapixels per source file, 16,384 pixels per side, 300 MB per draft; film capacity also applies.</p>
            <div className={`film-length ${length.exceeded ? 'is-overfull' : ''}`}><strong>Film length · {Math.ceil(length.used)} / {length.capacity} mm</strong><progress aria-label="Owner film length" max={length.capacity} value={Math.min(length.used, length.capacity)}/><p>{length.exceeded ? 'Roll is over capacity. Remove photographs or change frame size.' : `${Math.floor(length.remaining)} mm remaining. Frame spacing and extra allowance included.`}</p></div>
            {roll.view && <p>Backup / saved viewer position is retained privately; it is not included in the public catalog.</p>}
          </div>
          <section className="owner-frames" aria-label="Owner frames and crop"><h2>Frames · {photos.length}</h2>
            <ol className="owner-filmline">{photos.map((photo, index) => <li key={photo.id}><button disabled={busy} aria-label={`Select owner frame ${index + 1}`} aria-pressed={active?.id === photo.id} onClick={() => setSelected(photo.id)}><div className="draft-preview" style={{ aspectRatio: frameAspect(roll.format, roll.sizing, photo.frame) }}>{photo.preview && photo.frame && <img src={photo.preview} alt={photo.filename} style={photoCropPreview(photo.frame.width / photo.frame.height, frameAspect(roll.format, roll.sizing, photo.frame), photo.frame.rotation, photo.frame.cropPosition)}/>}</div><span>{index + 1}{roll.coverId === photo.id ? ' · Cover' : ''}{photo.error ? ' · Failed' : photo.duplicate && !photo.keepDuplicate ? ' · Duplicate' : ''}</span></button></li>)}</ol>
            {active ? <div className="selected-review"><CropInspector key={active.id} photo={active} format={roll.format} sizing={roll.sizing} disabled={busy} onChange={cropPosition => changePhoto(active.id, { frame: { ...active.frame!, cropPosition } })}/><h3>Frame {activeIndex + 1} · {active.filename}</h3>
              {active.error && <p role="alert">{active.error}</p>}
              {active.duplicate && <label><input type="checkbox" checked={active.keepDuplicate} disabled={busy} onChange={event => changePhoto(active.id, { keepDuplicate: event.target.checked })}/>Keep this duplicate content</label>}
              <div className="draft-actions"><button disabled={busy || activeIndex === 0} onClick={() => move(activeIndex, activeIndex - 1)}>Earlier</button><button disabled={busy || activeIndex === photos.length - 1} onClick={() => move(activeIndex, activeIndex + 1)}>Later</button><button disabled={busy || !active.frame} onClick={() => changePhoto(active.id, { frame: { ...active.frame!, rotation: (active.frame!.rotation + 90) % 360 } })}>Rotate 90°</button><button disabled={busy || !active.frame || roll.coverId === active.id} onClick={() => changeRoll({ coverId: active.id })}>Use as cover</button><button disabled={busy} onClick={() => remove(active.id)}>Remove photograph</button></div>
            </div> : <p>Choose photographs to review ordering, cover, rotation and crop before upload.</p>}
          </section>
        </section>
        <section className="owner-publication" aria-label="Publication controls"><h2>Save → Preview → Publish</h2>
          <p>Edits remain private until you explicitly publish a complete saved revision. A failed upload or publication leaves the previous published revision intact.</p>
          <div className="owner-actions"><button disabled={busy || !email || !valid || !dirty} onClick={save}>Save private draft</button><button disabled={busy || !email || !saved || dirty} onClick={preview}>Preview saved draft</button></div>
          <label><input type="checkbox" checked={publishConfirmed} disabled={busy || !saved || dirty || !previewed} onChange={event => setPublishConfirmed(event.target.checked)}/>I reviewed this saved preview and want its viewing images, thumbnails, roll name and film settings public. Public photographs can be downloaded or captured.</label>
          <button className="primary" disabled={busy || !email || !saved || dirty || !previewed || !publishConfirmed} onClick={publish}>Publish revision</button>
          {saved && <details><summary>Withdraw this roll from Gallery</summary><p>Withdrawal removes the current publication; the private draft remains. It cannot revoke screenshots, downloaded files, browser-cached images or previously saved offline copies.</p><label><input type="checkbox" checked={withdrawConfirmed} disabled={busy} onChange={event => setWithdrawConfirmed(event.target.checked)}/>I understand previously saved copies cannot be revoked.</label><button disabled={busy || !email || !withdrawConfirmed} onClick={withdraw}>Withdraw publication</button></details>}
        </section>
      </>}
    </dialog>
  </>;
}
