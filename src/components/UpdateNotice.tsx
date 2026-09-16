import { useState, useSyncExternalStore } from 'react';
import { applyUpdate, offlineStore } from '../offline/client';

export function UpdateNotice({ beforeUpdate }: { beforeUpdate: () => Promise<void> }) {
  const { update } = useSyncExternalStore(offlineStore.subscribe, offlineStore.snapshot);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!update) return null;
  const install = async () => {
    setError(''); setBusy(true);
    try { await applyUpdate(beforeUpdate); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <aside className="update-notice" aria-label="App update" onKeyDown={e => e.stopPropagation()}>
    <div className="update-notice-row">
      <p role="status">Update Available</p>
      <button disabled={busy} onClick={() => void install()}>{busy ? 'Updating…' : 'Update now'}</button>
    </div>
    {error && <p className="update-error" role="alert">{error}</p>}
  </aside>;
}
