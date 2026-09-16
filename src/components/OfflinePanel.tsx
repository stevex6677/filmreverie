import { useState, useSyncExternalStore } from 'react';
import { applyUpdate, checkOffline, checkServer, offlineStore, retryOffline } from '../offline/client';
export function OfflinePanel({ beforeUpdate }: { beforeUpdate: () => Promise<void> }) {
  const state = useSyncExternalStore(offlineStore.subscribe, offlineStore.snapshot);
  const [error, setError] = useState(''), [storage, setStorage] = useState(''), [busy, setBusy] = useState(false);
  const perform = async (fn: () => Promise<void>) => { setError(''); setBusy(true); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <details className="offline-panel" onKeyDown={e => e.stopPropagation()} onToggle={e => { if (e.currentTarget.open) { void checkOffline(); void checkServer(); } }}>
    <summary>{state.phase === 'ready' ? 'Available offline' : state.phase === 'preparing' ? 'Preparing offline…' : 'Offline setup'}{state.update ? ' · Update available' : ''}</summary>
    <div>
      <p role="status">{state.phase === 'ready' ? 'The app and built-in photographs are downloaded. Saved rolls stay in this browser.' : state.message || 'Keep this page open until the downloads finish.'}</p>
      {state.message && state.phase === 'ready' && <p role="status">{state.message}</p>}
      <p>Server: {state.server === 'reachable' ? 'reachable' : state.server === 'unreachable' ? 'unavailable' : 'checking'}. {state.server === 'unreachable' && state.phase === 'ready' ? 'You can keep viewing saved photographs.' : ''}</p>
      <p>Files stored only on a server or in iCloud must be downloaded before going offline. Clearing site data removes saved rolls. Export backups in Your rolls.</p>
      {['ready','incomplete','preparing'].includes(state.phase) && <button disabled={busy} onClick={() => void perform(retryOffline)}>Retry offline preparation</button>}
      {state.update && <button disabled={busy} onClick={() => void perform(() => applyUpdate(beforeUpdate))}>Apply update and reload</button>}
      <button disabled={busy} onClick={() => void perform(async () => {
        if (!navigator.storage?.persist) { setStorage('This browser does not support a persistent-storage request. Keep exported backups.'); return; }
        const granted = await navigator.storage.persist();
        setStorage(granted ? 'Persistent storage granted. Export backups for recovery or a new address.' : 'Persistent storage was not granted. Your browser may remove data under storage pressure; keep exported backups.');
      })}>Protect saved storage</button>
      {storage && <p role="status">{storage}</p>}{error && <p role="alert">{error}</p>}
      <p>On iPhone or iPad, open the private HTTPS address in Safari, then Share → Add to Home Screen. Open the installed app online and check “Available offline” before disconnecting.</p>
    </div>
  </details>;
}
