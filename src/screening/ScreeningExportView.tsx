import { useEffect, useRef, useState } from 'react';
import { exportScreening, ExportUnsupportedError, type ExportProgress } from './export/exporter';
import { EXPORT_FORMATS, type ExportFormat, type ScreeningSession } from './session';
import { formatDuration } from './ScreeningUI';

type Phase = 'rendering' | 'done' | 'unsupported' | 'error';

/** Full-screen, frame-stepped export with progress, Cancel and share/save. */
export default function ScreeningExportView({ session, format, fileName, maxSeconds, onClose }: {
  session: ScreeningSession; format: ExportFormat; fileName: string; maxSeconds?: number; onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('rendering');
  const [progress, setProgress] = useState<Omit<ExportProgress, 'preview'>>({ frame: 0, total: 0, elapsed: 0, remaining: null, paused: false });
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const preview = useRef<HTMLCanvasElement>(null), root = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const { width, height } = EXPORT_FORMATS[format];

  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    let lock: WakeLockSentinel | null = null, painted = 0, finished = false;
    const wake = async () => { try { if (document.visibilityState === 'visible' && 'wakeLock' in navigator) lock = await navigator.wakeLock.request('screen'); } catch { /* Optional: the export still completes. */ } };
    // The system releases the lock when hidden; take it again on return.
    const visibility = () => { if (!finished && document.visibilityState === 'visible' && (!lock || lock.released)) void wake(); };
    document.addEventListener('visibilitychange', visibility);
    void wake();
    session.setExporting(true);
    root.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    exportScreening(session, format, { signal: abort.signal, maxSeconds, onProgress: next => {
      const { preview: frame, ...rest } = next;
      setProgress(rest);
      const now = performance.now();
      // Show the actual encoded frame, a few times a second.
      if (frame && preview.current && now - painted > 200) { painted = now; preview.current.getContext('2d')?.drawImage(frame, 0, 0, preview.current.width, preview.current.height); }
    } }).then(blob => {
      if (abort.signal.aborted) return;
      const result = new File([blob], fileName, { type: 'video/mp4' });
      setFile(result); setUrl(URL.createObjectURL(result)); setPhase('done');
    }, error => {
      if (abort.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      if (error instanceof ExportUnsupportedError) setPhase('unsupported');
      else { setMessage(error instanceof Error ? error.message : String(error)); setPhase('error'); }
    }).finally(() => {
      finished = true;
      session.setExporting(false);
      void lock?.release().catch(() => {}); lock = null;
    });
    return () => { abort.abort(); document.removeEventListener('visibilitychange', visibility); };
  }, [session, format, fileName, maxSeconds]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { root.current?.querySelector<HTMLButtonElement>('.is-primary, button')?.focus({ preventScroll: true }); }, [phase]);

  const share = async () => {
    if (!file) return;
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: fileName.replace(/\.mp4$/, '') }); return; }
    } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
    download();
  };
  const download = () => {
    const link = document.createElement('a'); link.href = url; link.download = fileName;
    document.body.append(link); link.click(); link.remove();
  };
  const cancel = () => { controller.current?.abort(); onClose(); };
  const percent = progress.total ? Math.round(progress.frame / progress.total * 100) : 0;
  const canShare = !!file && !!navigator.canShare?.({ files: [file] });
  return <div ref={root} className="screening-export" role="dialog" aria-modal="true" aria-labelledby="screening-export-title" data-testid="screening-export-view" data-phase={phase}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (phase === 'rendering') cancel(); else onClose(); } }}>
    <h2 id="screening-export-title">{phase === 'done' ? 'Your video is ready' : phase === 'unsupported' ? 'Video export is not available' : phase === 'error' ? 'The video could not be finished' : 'Exporting video'}</h2>
    {phase === 'rendering' && <>
      <canvas ref={preview} className="screening-export-preview" width={Math.round(width / 2)} height={Math.round(height / 2)} style={{ aspectRatio: `${width} / ${height}` }} aria-label="Current frame" />
      <progress data-testid="screening-export-progress" max={progress.total || 1} value={progress.frame} aria-label="Export progress" />
      <p role="status" data-testid="screening-export-status">{progress.paused ? 'Paused while the app is in the background.' : progress.total ? `${percent}% · Frame ${progress.frame} of ${progress.total}${progress.remaining !== null && progress.frame > 15 ? ` · about ${formatDuration(progress.remaining / 1000)} left` : ''}` : 'Preparing photographs…'}</p>
      <p className="screening-note">{width} × {height} · 30 fps · H.264 · silent. Keep this screen open; nothing is uploaded.</p>
      <button type="button" data-testid="screening-export-cancel" onClick={cancel}>Cancel</button>
    </>}
    {phase === 'done' && <>
      <video className="screening-export-preview" data-testid="screening-export-video" src={url} controls playsInline muted style={{ aspectRatio: `${width} / ${height}` }} />
      <p className="screening-note">{fileName} · {(file!.size / 1e6).toFixed(1)} MB</p>
      <div className="screening-export-actions">
        {canShare && <button type="button" className="is-primary" data-testid="screening-share" onClick={() => void share()}>Save or share video</button>}
        <button type="button" className={canShare ? '' : 'is-primary'} data-testid="screening-download" onClick={download}>Download</button>
        <button type="button" data-testid="screening-export-done" onClick={onClose}>Done</button>
      </div>
    </>}
    {phase === 'unsupported' && <><p>This browser cannot encode H.264 video. Try Safari on iPadOS 17 or later, or a current desktop browser. Your rolls are unchanged.</p><button type="button" onClick={onClose}>Close</button></>}
    {phase === 'error' && <><p role="alert">{message || 'The device ran out of resources.'} Your rolls and the light table are unchanged.</p><button type="button" onClick={onClose}>Close</button></>}
  </div>;
}
