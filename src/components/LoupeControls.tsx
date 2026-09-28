import { useEffect, useId, useRef, type Dispatch } from 'react';
import { type ViewerAction, type LoupeState } from '../state/viewerState';
import { usePanelDismiss } from '../utils/usePanelDismiss';
import { LoupeOptions } from './LoupeOptions';

/** One expandable control surface, with a disclosure rather than a dialog trigger. */
export function LoupeControls({ loupe, dispatch, open, onOpen }: {
  loupe: LoupeState; dispatch: Dispatch<ViewerAction>; open: boolean; onOpen: (open: boolean) => void;
}) {
  const root = useRef<HTMLElement>(null);
  const settings = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  usePanelDismiss(root, open, () => onOpen(false), '.canvas-wrapper');
  useEffect(() => {
    if (!open) return;
    settings.current?.focus({ preventScroll: true });
    return () => { if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true }); };
  }, [open]);

  return <nav ref={root} className={`loupe-controls${open ? ' is-expanded' : ''}`} aria-label="Loupe controls">
    {open && <section ref={settings} id={id} className="loupe-settings-content" aria-label="Loupe settings" tabIndex={-1}>
      <header className="loupe-settings-header"><h2>Loupe settings</h2><button type="button" onClick={() => onOpen(false)}>Done</button></header>
      <LoupeOptions loupe={loupe} dispatch={dispatch} />
    </section>}
    <div className="loupe-toolbar">
      <button type="button" ref={trigger} className="loupe-customize" data-panel-toggle data-testid="loupe-customize" aria-expanded={open} aria-controls={id} onClick={() => onOpen(!open)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg>
        Loupe settings
      </button>
      <div className="loupe-actions">
        <button type="button" data-testid="inspect-loupe" onClick={() => { onOpen(false); dispatch({ type: loupe.inspecting ? 'PULL_BACK_LOUPE' : 'INSPECT_LOUPE' }); }}>{loupe.inspecting ? '← Pull back' : 'Inspect'}</button>
        {!loupe.inspecting && <button type="button" data-testid="put-away-loupe" onClick={() => { onOpen(false); dispatch({ type: 'SET_LOUPE_ACTIVE', active: false }); }}>Put away</button>}
      </div>
    </div>
  </nav>;
}
