import { useState, useSyncExternalStore } from 'react';
import { checkOffline, checkServer, offlineStore, retryOffline, prepareCamerasOffline } from '../offline/client';
export function OfflinePanel() {
  const state = useSyncExternalStore(offlineStore.subscribe, offlineStore.snapshot);
  const [error, setError] = useState(''), [storage, setStorage] = useState(''), [busy, setBusy] = useState(false);
  const perform = async (fn: () => Promise<void>) => { setError(''); setBusy(true); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <details className="offline-panel" onKeyDown={e => e.stopPropagation()} onToggle={e => { if (e.currentTarget.open) { void checkOffline(); void checkServer(); } }}>
    <summary>Offline &amp; storage</summary>
    <div>
      <p role="status">{state.phase === 'ready' ? 'The app and built-in photographs are downloaded. Saved rolls stay in this browser.' : state.message || 'Keep this page open until the downloads finish.'}</p>
      {state.message && state.phase === 'ready' && <p role="status">{state.message}</p>}
      <p>Server: {state.server === 'reachable' ? 'reachable' : state.server === 'unreachable' ? 'unavailable' : 'checking'}. {state.server === 'unreachable' && state.phase === 'ready' ? 'You can keep viewing saved photographs.' : ''}</p>
      <p>Files stored only on a server or in iCloud must be downloaded before going offline. Clearing site data removes saved rolls. Export backups from the shelf’s Backups & offline controls.</p>
      <p>Camera model: {state.cameraReady ? 'downloaded for offline inspection' : 'optional download, about 19 MB'}. Film viewing does not require this download.</p>
      <button disabled={busy} onClick={() => void perform(prepareCamerasOffline)}>Download camera for offline use</button>
      {['ready','incomplete','preparing'].includes(state.phase) && <button disabled={busy} onClick={() => void perform(retryOffline)}>Retry offline preparation</button>}
      <button disabled={busy} onClick={() => void perform(async () => {
        if (!navigator.storage?.persist) { setStorage('This browser does not support a persistent-storage request. Keep exported backups.'); return; }
        const granted = await navigator.storage.persist();
        setStorage(granted ? 'Persistent storage granted. Export backups for recovery or a new address.' : 'Persistent storage was not granted. Your browser may remove data under storage pressure; keep exported backups.');
      })}>Protect saved storage</button>
      {storage && <p role="status">{storage}</p>}{error && <p role="alert">{error}</p>}
      <p>On iPhone or iPad, open the private HTTPS address in Safari, then Share → Add to Home Screen. Open the installed app online to download the app and built-in photographs before disconnecting.</p>
    </div>
  </details>;
}
