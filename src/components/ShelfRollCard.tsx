import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RollRepository, StoredRoll, storageMessage } from '../storage/rollRepository';
import { getFilmStock } from '../data/filmStocks';
import { FILM_ISO } from '../data/filmPackaging';
import { rollFormatLabel } from '../data/filmFormats';
import { FilmShelfState } from '../utils/useFilmShelf';

export function ShelfRollCard({ shelf, roll, repository, activeId, onOpen, onEdit, onMove, onDelete, onRestore, readOnly = false, thumbnailUrl, thumbnailRotation = 0 }: {
  onEdit?: (id: string) => void; onMove?: (roll: StoredRoll) => void; onDelete?: (roll: StoredRoll) => Promise<void>; onRestore?: (id: string) => Promise<void>;
  shelf: FilmShelfState; roll: StoredRoll; repository?: RollRepository; activeId: string; onOpen: (id: string) => Promise<void>;
  readOnly?: boolean; thumbnailUrl?: string; thumbnailRotation?: number;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [localCover, setLocalCover] = useState<{ url: string; rotation: number } | null>(null);
  const [publicCoverFailed, setPublicCoverFailed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const stock = getFilmStock(roll.stockId);
  const anchor = shelf.selection!.anchor;
  useEffect(() => {
    if (readOnly || !repository) return;
    let cancelled = false, url = '';
    setLocalCover(null); setError('');
    void repository.thumbnail(roll.id, roll.coverId).then(image => {
      if (cancelled) return;
      url = URL.createObjectURL(image.blob); setLocalCover({ url, rotation: image.rotation });
    }).catch(() => { /* A missing cover never blocks opening a roll. */ });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [readOnly, repository, roll.id, roll.coverId, roll.updatedAt]);
  useEffect(() => { setPublicCoverFailed(false); }, [thumbnailUrl]);
  const cover = readOnly ? !publicCoverFailed && thumbnailUrl ? { url: thumbnailUrl, rotation: thumbnailRotation } : null : localCover;
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!card.current?.contains(event.target as Node) && !anchor.contains(event.target as Node)) shelf.close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); shelf.close(); anchor.focus({ preventScroll: true }); }
    };
    document.addEventListener('pointerdown', dismiss, true); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', dismiss, true); window.removeEventListener('keydown', key, true); };
  }, [anchor, shelf.close]);
  useEffect(() => {
    if (shelf.selection?.pinned) card.current?.focus({ preventScroll: true });
  }, [roll.id, shelf.selection?.pinned]);
  // The paper panel stays below the focused compartment, outside canvas containment.
  return createPortal(<div ref={card} className="shelf-roll-card" role="dialog" aria-label={`${roll.name} — roll details`} tabIndex={-1}
    onPointerEnter={shelf.keep} onPointerLeave={shelf.leave} onFocus={shelf.keep}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) shelf.leave(); }}
    onKeyDown={event => event.stopPropagation()}>
    <div className="shelf-card-heading"><span>{readOnly ? 'PUBLISHED ROLL' : roll.trashedAt === null ? 'SAVED ROLL' : 'TRASH'}</span><button aria-label="Close roll details" onClick={() => { shelf.close(); anchor.focus({ preventScroll: true }); }}>×</button></div>
    <div className="shelf-card-layout"><div className="shelf-card-cover">{cover ? <img src={cover.url} alt={`Cover photograph of ${roll.name}`} loading="lazy" crossOrigin={readOnly ? 'anonymous' : undefined} referrerPolicy={readOnly ? 'no-referrer' : undefined} style={{ transform: `rotate(${cover.rotation}deg)` }} onError={() => readOnly ? setPublicCoverFailed(true) : setLocalCover(null)} /> : <span>Cover unavailable</span>}</div>
    <div className="shelf-card-identity"><h2>{roll.name}</h2><p className="shelf-card-stock">{stock.displayName}</p></div>
    <dl><div><dt>Format</dt><dd>{rollFormatLabel(roll.format, roll.sizing)}</dd></div><div><dt>Sensitivity</dt><dd>ISO {FILM_ISO[roll.stockId]}</dd></div><div><dt>Film</dt><dd>{stock.type === 'reversal' ? 'Color reversal' : 'Color negative'}</dd></div><div><dt>Process</dt><dd>{stock.process}</dd></div></dl>
    <p className="shelf-card-count">{roll.frameIds.length} {roll.frameIds.length === 1 ? 'photograph' : 'photographs'}{activeId === roll.id && <span>On the light table</span>}</p>
    </div>
    {error && <p role="alert" className="shelf-card-error">{error}</p>}
    {(readOnly || roll.trashedAt === null) ? <div className="shelf-card-buttons">
      <button className="shelf-card-open" disabled={busy} onClick={async () => { shelf.show(roll, anchor, true); setBusy(true); setError(''); try { await onOpen(roll.id); shelf.close(); } catch (failure) { setError(storageMessage(failure)); } finally { setBusy(false); } }}>{busy ? 'Opening…' : 'Open on light table'} <span aria-hidden="true">↗</span></button>
      {!readOnly && <><div className="shelf-card-actions"><button disabled={busy} aria-label={`Edit ${roll.name}`} onClick={() => onEdit?.(roll.id)}>Edit roll</button>{onMove && <button disabled={busy} aria-label={`Move ${roll.name}`} onClick={() => onMove(roll)}>Move</button>}<button disabled={busy} aria-label={`Delete ${roll.name}`} onClick={async () => { shelf.show(roll, anchor, true); setBusy(true); setError(''); try { await onDelete?.(roll); } catch (failure) { setError(storageMessage(failure)); } finally { setBusy(false); } }}>Delete roll</button></div>
      </>}
    </div> : <button className="shelf-card-open" disabled={busy} aria-label={`Restore ${roll.name}`} onClick={async () => { shelf.show(roll, anchor, true); setBusy(true); setError(''); try { await onRestore?.(roll.id); } catch (failure) { setError(storageMessage(failure)); } finally { setBusy(false); } }}>Restore roll</button>}

    {!readOnly && roll.trashedAt === null && <p className="shelf-card-help">Deleted rolls can be restored from Trash.</p>}
  </div>, document.body);
}
