import { useEffect, useRef, useState } from 'react';
import { blockUpdate } from '../offline/client';
import { exportRolls, importRolls } from '../storage/rollArchive';
import { RollRepository, rollRepository, StoredRoll, storageMessage } from '../storage/rollRepository';
import { OfflinePanel } from './OfflinePanel';

export function ShelfTools({ onClose, beforeExport, repository = rollRepository, showLegacyImport = false }: { onClose: () => void; beforeExport: () => Promise<void>; repository?: RollRepository; showLegacyImport?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rolls, setRolls] = useState<StoredRoll[]>([]), [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); } catch (cause) { setError(storageMessage(cause)); } finally { setBusy(false); }
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.showModal(); blockUpdate('shelf-tools', true);
    void run(async () => setRolls(await repository.list()));
    return () => { blockUpdate('shelf-tools', false); previous?.focus(); };
  }, [repository]);
  const backup = (ids: string[]) => void run(async () => {
    await beforeExport();
    const blob = await exportRolls(repository, ids), url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `darkroom-${new Date().toISOString().slice(0, 10)}.darkroom`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setNotice('Backup prepared. Keep the downloaded .darkroom file for recovery or importing at another address.');
  });
  return <dialog ref={dialog} className="library-dialog shelf-tools-dialog" aria-label="Backups and offline" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><h1>Backups and offline</h1><button disabled={busy} onClick={onClose}>Close</button></header>
    <div className="archive-actions">
      <button disabled={busy || !rolls.length} onClick={() => backup(rolls.map(roll => roll.id))}>Export all rolls</button>
      <label>Import backup<input aria-label="Import backup" type="file" accept=".darkroom,application/vnd.darkroom.rolls" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (file) void run(async () => { const ids = await importRolls(repository, file); setRolls(await repository.list()); setNotice(`Imported ${ids.length} ${ids.length === 1 ? 'roll' : 'rolls'} as separate copies. Existing rolls are unchanged. Rolls from Trash remain in Trash.`); });
      }} /></label>
      {showLegacyImport && <button disabled={busy} onClick={() => void run(async () => {
        const previous = await rollRepository.list();
        if (!previous.length) { setNotice('No rolls found in the previous darkroom library at this address. Nothing was changed.'); return; }
        const archive = await exportRolls(rollRepository, previous.map(roll => roll.id));
        const ids = await importRolls(repository, archive);
        setRolls(await repository.list());
        setNotice(`Copied ${ids.length} previous ${ids.length === 1 ? 'roll' : 'rolls'} into this guest darkroom. The previous library remains unchanged; export a backup and verify the copies.`);
      })}>Copy previous darkroom rolls</button>}
    </div>
    <div className="archive-actions"><label>Single roll<select aria-label="Roll to export" disabled={busy} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose a roll</option>{rolls.map(roll => <option key={roll.id} value={roll.id}>{roll.name}{roll.trashedAt !== null ? ' (Trash)' : ''}</option>)}</select></label><button disabled={busy || !selected} onClick={() => backup([selected])}>Export selected roll</button></div>
    <p>Backups include originals, edits and saved views, including Trash. Importing creates separate copies. Up to 512 MB per backup.</p>
    {showLegacyImport && <p>Previous browser rolls are never copied automatically. Copy only if you recognize the earlier library at this exact address. Repeating the copy creates duplicates; the previous library stays in place.</p>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    <footer className="storage-footer"><details><summary>Stored in this browser</summary><p>Clearing site data removes your rolls. Export backups before changing the protocol, hostname or port; each address has separate storage. Photographs stay on this device.</p></details><OfflinePanel /></footer>
  </dialog>;
}
