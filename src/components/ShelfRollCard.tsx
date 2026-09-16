import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RollRepository, StoredRoll, storageMessage } from '../storage/rollRepository';
import { getFilmStock } from '../data/filmStocks';
import { FILM_ISO } from '../data/filmPackaging';
import { rollFormatLabel } from '../data/filmFormats';
import { FilmShelfState } from '../utils/useFilmShelf';

export function ShelfRollCard({ shelf, roll, repository, activeId, onOpen, onEdit, onDelete, onRestore }: {
  onEdit: (id: string) => void; onDelete: (roll: StoredRoll) => Promise<void>; onRestore: (id: string) => Promise<void>;
  shelf: FilmShelfState; roll: StoredRoll; repository: RollRepository; activeId: string; onOpen: (id: string) => Promise<void>;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [cover, setCover] = useState<{ url: string; rotation: number } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const stock = getFilmStock(roll.stockId);
  const anchor = shelf.selection!.anchor;
  useEffect(() => {
    let cancelled = false, url = '';
    setCover(null); setError('');
    void repository.thumbnail(roll.id, roll.coverId).then(image => {
      if (cancelled) return;
      url = URL.createObjectURL(image.blob); setCover({ url, rotation: image.rotation });
    }).catch(() => { /* A missing cover never blocks opening a roll. */ });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [repository, roll.id, roll.coverId, roll.updatedAt]);
  useLayoutEffect(() => {
    const position = () => {
      const node = card.current; if (!node) return;
      const rect = anchor.getBoundingClientRect(), margin = 12;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      const ox = viewport?.offsetLeft ?? 0, oy = viewport?.offsetTop ?? 0;
      const x = rect.right + node.offsetWidth + margin <= width + ox ? rect.right + 12 : rect.left - node.offsetWidth - 12;
      node.style.left = `${Math.max(ox + margin, Math.min(x, ox + width - node.offsetWidth - margin))}px`;
      node.style.top = `${Math.max(oy + margin, Math.min(rect.top, oy + height - node.offsetHeight - margin))}px`;
    };
    position(); const resize = new ResizeObserver(position); if (card.current) resize.observe(card.current);
    window.addEventListener('resize', position); window.visualViewport?.addEventListener('resize', position);
    return () => { resize.disconnect(); window.removeEventListener('resize', position); window.visualViewport?.removeEventListener('resize', position); };
  }, [anchor]);
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
  return <div ref={card} className="shelf-roll-card" role="dialog" aria-label={`${roll.name} — roll details`} tabIndex={-1}
    onPointerEnter={shelf.keep} onPointerLeave={shelf.leave} onFocus={shelf.keep}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) shelf.leave(); }}
    onKeyDown={event => event.stopPropagation()}>
    <div className="shelf-card-heading"><span>{roll.trashedAt === null ? 'SAVED ROLL' : 'TRASH'}</span><button aria-label="Close roll details" onClick={() => { shelf.close(); anchor.focus({ preventScroll: true }); }}>×</button></div>
    <div className="shelf-card-cover">{cover ? <img src={cover.url} alt={`Cover of ${roll.name}`} style={{ transform: `rotate(${cover.rotation}deg)` }} onError={() => setCover(null)} /> : <span>Cover unavailable</span>}</div>
    <h2>{roll.name}</h2><p className="shelf-card-stock">{stock.displayName}</p>
    <dl><div><dt>Format</dt><dd>{rollFormatLabel(roll.format, roll.sizing)}</dd></div><div><dt>Sensitivity</dt><dd>ISO {FILM_ISO[roll.stockId]}</dd></div><div><dt>Film</dt><dd>{stock.type === 'reversal' ? 'Color reversal' : 'Color negative'}</dd></div><div><dt>Process</dt><dd>{stock.process}</dd></div></dl>
    <p className="shelf-card-count">{roll.frameIds.length} {roll.frameIds.length === 1 ? 'photograph' : 'photographs'}{activeId === roll.id && <span>On the light table</span>}</p>
    {error && <p role="alert" className="shelf-card-error">{error}</p>}
    {roll.trashedAt === null ? <>
      <button className="shelf-card-open" disabled={busy} onClick={async () => { shelf.show(roll, anchor, true); setBusy(true); setError(''); try { await onOpen(roll.id); shelf.close(); } catch (failure) { setError(storageMessage(failure)); } finally { setBusy(false); } }}>{busy ? 'Opening…' : 'Open on light table'} <span aria-hidden="true">↗</span></button>
      <div className="shelf-card-actions"><button disabled={busy} aria-label={`Edit ${roll.name}`} onClick={() => onEdit(roll.id)}>Edit roll</button><button disabled={busy} aria-label={`Delete ${roll.name}`} onClick={async () => { shelf.show(roll, anchor, true); setBusy(true); setError(''); try { await onDelete(roll); } catch (failure) { setError(storageMessage(failure)); } finally { setBusy(false); } }}>Delete roll</button></div>
      <p className="shelf-card-help">Deleted rolls can be restored from Trash.</p>
    </> : <button className="shelf-card-open" disabled={busy} aria-label={`Restore ${roll.name}`} onClick={async () => { shelf.show(roll, anchor, true); setBusy(true); setError(''); try { await onRestore(roll.id); } catch (failure) { setError(storageMessage(failure)); } finally { setBusy(false); } }}>Restore roll</button>}

  </div>;
}
