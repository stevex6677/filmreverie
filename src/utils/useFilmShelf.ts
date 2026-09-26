import { useCallback, useEffect, useRef, useState } from 'react';
import { RollRepository, StoredRoll, storageMessage } from '../storage/rollRepository';
import { ensureExampleRoll } from '../storage/exampleRoll';
import { shelfPageCount } from './shelfLayout';

export interface ShelfSelection { id: string; anchor: HTMLElement; pinned: boolean }
export interface FilmShelfState {
  rolls: StoredRoll[];
  allRolls: StoredRoll[];
  loaded: boolean;
  trash: boolean;
  changeTrash: (next: boolean) => void;
  retry: () => void;
  savedCount: number;
  trashCount: number;
  error: string;
  page: number;
  pages: number;
  changePage: (next: number) => void;
  selection: ShelfSelection | null;
  selectedRoll?: StoredRoll;
  show: (roll: StoredRoll, anchor: HTMLElement, pinned?: boolean) => void;
  leave: () => void;
  keep: () => void;
  close: () => void;
}
export function useFilmShelf(repository: RollRepository, visible: boolean, enabled = true): FilmShelfState {
  const [allRolls, setAllRolls] = useState<StoredRoll[]>([]), [error, setError] = useState('');
  const [trash, setTrash] = useState(false), [loaded, setLoaded] = useState(false), [revision, setRevision] = useState(0);
  const rolls = trash ? allRolls.filter(r => r.trashedAt !== null).sort((a,b) => b.trashedAt! - a.trashedAt!).map((r, shelfSlot) => ({ ...r, shelfSlot })) : allRolls.filter(r => r.trashedAt === null);
  const pages = trash ? Math.max(1, Math.ceil(rolls.length / 16)) : shelfPageCount(rolls);
  const [page, setPage] = useState(0), [selection, setSelection] = useState<ShelfSelection | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keep = useCallback(() => { clearTimeout(timer.current); }, []);
  const close = useCallback(() => { keep(); setSelection(null); }, [keep]);
  const show = useCallback((roll: StoredRoll, anchor: HTMLElement, pinned = false) => {
    keep();
    const select = () => setSelection(current => !pinned && current?.pinned ? current : { id: roll.id, anchor, pinned });
    if (pinned) select(); else timer.current = setTimeout(select, 180);
  }, [keep]);
  const leave = useCallback(() => {
    keep(); timer.current = setTimeout(() => setSelection(current => current?.pinned ? current : null), 220);
  }, [keep]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      try {
        let preparationError = '';
        try { await ensureExampleRoll(repository); } catch (failure) { preparationError = storageMessage(failure); }
        await repository.shelf();
        const saved = await repository.list();
        if (cancelled || request !== sequence) return;
        setAllRolls(saved); setLoaded(true); setError(preparationError);
        setPage(current => Math.min(current, (trash ? Math.max(1, Math.ceil(saved.filter(r => r.trashedAt !== null).length / 16)) : shelfPageCount(saved)) - 1));
        setSelection(current => current && saved.some(r => r.id === current.id && (trash ? r.trashedAt !== null : r.trashedAt === null)) ? current : null);
      } catch (failure) { if (!cancelled && request === sequence) setError(storageMessage(failure)); }
    };
    void refresh();
    const unsubscribe = repository.subscribe(() => { void refresh(); });
    const focus = () => { if (visible) void refresh(); };
    window.addEventListener('focus', focus);
    return () => { cancelled = true; unsubscribe(); window.removeEventListener('focus', focus); };
  }, [repository, visible, trash, revision, enabled]);
  useEffect(() => { if (!visible) close(); }, [visible, close]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const changePage = (next: number) => { close(); setPage(Math.max(0, Math.min(next, pages - 1))); };
  const changeTrash = (next: boolean) => { close(); setPage(0); setTrash(next); };
  return { rolls, allRolls, loaded, trash, changeTrash, retry: () => setRevision(r => r + 1), savedCount: allRolls.filter(r => r.trashedAt === null).length, trashCount: allRolls.filter(r => r.trashedAt !== null).length, error, page, pages, changePage, selection, selectedRoll: rolls.find(r => r.id === selection?.id), show, leave, keep, close };
}
