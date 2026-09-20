export interface OfflineState {
  phase: 'preparing' | 'ready' | 'incomplete' | 'unsupported' | 'development';
  server: 'checking' | 'reachable' | 'unreachable';
  update: boolean; message: string; version: string;
  cameraReady?: boolean;
}
let state: OfflineState = { phase: 'preparing', server: 'checking', update: false, message: '', version: '' };
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let started = false, applying = false;
const blockers = new Set<string>();
export function blockUpdate(key: string, blocked: boolean) { if (blocked) blockers.add(key); else blockers.delete(key); }
function publish(change: Partial<OfflineState>) { state = { ...state, ...change }; listeners.forEach(fn => fn()); }
export const offlineStore = { subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }, snapshot: () => state };
function request(worker: ServiceWorker, type: string): Promise<{ ready: boolean; cameraReady: boolean; version: string }> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Offline preparation did not finish. Reconnect and retry.')); }, ['REPAIR', 'PREPARE_CAMERAS'].includes(type) ? 180000 : 10000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data); };
    worker.postMessage({ type }, [channel.port2]);
  });
}
export async function checkOffline() {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return;
  try {
    const result = await request(worker, 'STATUS');
    publish({ phase: result.ready ? 'ready' : 'incomplete', version: result.version, cameraReady: result.cameraReady,
      message: result.ready ? (state.phase === 'incomplete' ? '' : state.message) : 'Some downloads are missing. Reconnect and retry preparation.' });
  } catch (error) { publish({ phase: 'incomplete', message: (error as Error).message }); }
}
export async function prepareCamerasOffline() {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) throw new Error('Prepare the app at its private HTTPS address before downloading the camera for offline use.');
  await request(worker, 'PREPARE_CAMERAS'); await checkOffline();
}
export async function checkServer() {
  try {
    const response = await fetch(`/offline-health.json?check=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    const body = await response.json();
    publish({ server: response.ok && body.app === 'darkroom' ? 'reachable' : 'unreachable' });
  } catch { publish({ server: 'unreachable' }); }
}
const watched = new WeakSet<ServiceWorker>();
function watch(worker: ServiceWorker) {
  if (watched.has(worker)) return; watched.add(worker);
  const changed = () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) publish({ update: true });
    if (worker.state === 'redundant') publish({ message: 'Download incomplete. Check the connection and browser storage, then retry preparation.', ...(navigator.serviceWorker.controller ? {} : { phase: 'incomplete' as const }) });
    if (worker.state === 'activated') void checkOffline();
  };
  worker.addEventListener('statechange', changed); changed();
}
function watchRegistration(reg: ServiceWorkerRegistration) {
  reg.addEventListener('updatefound', () => { if (reg.installing) watch(reg.installing); });
  if (reg.installing) watch(reg.installing);
  publish({ update: !!reg.waiting });
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The server did not respond. Your existing offline copy is retained; retry when connected.')), 15000);
    })]);
  } finally { clearTimeout(timer!); }
}
export async function retryOffline() {
  publish({ message: '' });
  try {
    if (navigator.serviceWorker.controller) {
      await checkOffline();
      try { await request(navigator.serviceWorker.controller, 'REPAIR'); }
      catch (error) { publish({ phase: 'incomplete', message: (error as Error).message }); }
      await checkOffline();
      // A missing old asset may no longer exist on the server. Still check for
      // a complete new release so the user can recover by explicitly updating.
    } else publish({ phase: 'preparing' });
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing && (existing.active || existing.waiting || existing.installing)) {
      registration = existing; watchRegistration(existing);
      if (!existing.installing) await bounded(existing.update());
    } else {
      registration = await bounded(navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }));
      watchRegistration(registration);
    }
    await checkOffline();
  } catch (error) { publish({ message: `Preparation incomplete: ${(error as Error).message}`, ...(navigator.serviceWorker.controller ? {} : { phase: 'incomplete' as const }) }); }
  void checkServer();
}
export async function applyUpdate(beforeReload: () => Promise<void>) {
  if (blockers.size || document.querySelector('dialog[open]')) throw new Error('Save or cancel your draft and close any dialogs before applying the update.');
  if (!registration?.waiting) return;
  await beforeReload();
  if (blockers.size || document.querySelector('dialog[open]')) throw new Error('Finish your current work before updating.');
  applying = true;
  try { await request(registration.waiting, 'ACTIVATE'); }
  catch (error) { applying = false; throw error; }
}
export function startOffline() {
  if (started) return; started = true;
  if (!import.meta.env.PROD) { publish({ phase: 'development', message: 'Offline preparation is available in the production app.' }); return; }
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    publish({ phase: 'unsupported', message: 'Use the private HTTPS address for offline access. Export your rolls here before changing addresses.' });
    void checkServer(); return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (applying) location.reload(); else void checkOffline(); });
  // Long-lived installed windows must discover releases without a reload.
  let checkingUpdate = false;
  const checkUpdate = async () => {
    if (document.hidden || !navigator.onLine || !registration || checkingUpdate || registration.installing || registration.waiting) return;
    checkingUpdate = true;
    try { await registration.update(); } catch { /* Retain the working offline release. */ }
    finally { checkingUpdate = false; }
  };
  const refresh = () => { if (!document.hidden) { void checkOffline(); void checkServer(); } };
  document.addEventListener('visibilitychange', () => { void checkUpdate(); });
  window.addEventListener('online', () => { void checkUpdate(); });
  setInterval(() => { void checkUpdate(); }, 60000);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
  setInterval(refresh, 30000);
  void retryOffline();
}
