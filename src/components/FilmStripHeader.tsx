import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { ViewerState } from '../state/viewerState';

type Props = {
  state: ViewerState;
  onOpenRoom: () => void;
  onOpenLibrary: () => void;
  onOpenTable: () => void;
  onOpenCameras?: () => void;
  onOpenSettings: () => void;
  settingsOpen?: boolean;
  onToggleLoupe?: () => void;
  ownerActions?: ReactNode;
  createAction?: ReactNode;
};

/** One continuous piece of film; only the image and its caption change polarity. */
export function FilmStripHeader({ state, onOpenRoom, onOpenLibrary, onOpenTable, onOpenCameras, onOpenSettings, settingsOpen = false, onToggleLoupe, ownerActions, createAction }: Props) {
  const id = useId().replace(/:/g, '');
  const active = state.shelfFocused ? state.shelfId : state.roomMode === 'room' ? 'room' : 'table';
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current, selected = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !selected) return;
    const reveal = () => {
      const bounds = nav.getBoundingClientRect(), frame = selected.getBoundingClientRect();
      if (frame.left < bounds.left) nav.scrollLeft += frame.left - bounds.left - 3;
      else if (frame.right > bounds.right) nav.scrollLeft += frame.right - bounds.right + 3;
    };
    reveal();
    window.addEventListener('resize', reveal);
    return () => window.removeEventListener('resize', reveal);
  }, [active]);
  const frames = [
    { id: 'room', label: 'Room', action: onOpenRoom },
    { id: 'film', label: 'Film Shelf', action: onOpenLibrary },
    { id: 'table', label: 'Light Table', action: onOpenTable },
    { id: 'camera', label: 'Cameras', action: onOpenCameras },
  ];
  return <header className={`mobile-header film-strip-header${onToggleLoupe ? ' has-loupe-control' : ''}${createAction ? ' has-create-action' : ''}`} aria-label="Darkroom navigation">
    <img className="film-cartridge" src="/assets/navigation/film-reverie-cartridge.png" alt="film reverie · 160 color negative film" draggable={false} />
    <div className="film-strip-body">
      <svg className="film-strip-base" width="100%" height="88" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-base`} x2="0" y2="1">
            <stop stopColor="#392519" /><stop offset=".45" stopColor="#241912" /><stop offset="1" stopColor="#352319" />
          </linearGradient>
          <pattern id={`${id}-holes`} width="18" height="8" patternUnits="userSpaceOnUse"><rect x="5" width="7" height="8" rx="1.4" fill="black" /></pattern>
          <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="88">
            <rect width="100%" height="88" fill="white" />
            <rect y="8" width="100%" height="8" fill={`url(#${id}-holes)`} />
            <rect y="72" width="100%" height="8" fill={`url(#${id}-holes)`} />
          </mask>
          <filter id={`${id}-grain`}><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
        </defs>
        <g mask={`url(#${id}-mask)`}>
          <rect x=".5" y=".5" width="99.9%" height="87" rx="2" fill={`url(#${id}-base)`} stroke="#78502c" strokeOpacity=".55" />
          <rect width="100%" height="88" filter={`url(#${id}-grain)`} opacity=".055" />
        </g>
      </svg>
      <span className="film-leader" aria-hidden="true" />
      <nav ref={navigation} className="film-strip-frames" aria-label="Explore the darkroom" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
        buttons[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }}>
        {frames.map((frame, index) => <div className="film-frame-slot" key={frame.id}>
          <span className="film-edge-code film-edge-top" aria-hidden="true"><span>{index + 1}</span><span>FILM REVERIE 160</span></span>
          <button type="button" className="film-nav-frame" data-testid={frame.id === 'room' ? 'return-room-btn' : undefined} aria-current={active === frame.id ? 'page' : undefined} disabled={!frame.action} onClick={frame.action}>
            <span className="film-frame-exposure" data-frame={frame.id}>
              <span className="film-frame-label">{frame.label}</span>
            </span>
          </button>
          <span className="film-edge-code film-edge-bottom" aria-hidden="true"><span>{index + 1}</span><i /><span>▸ {index + 1}A</span><i /></span>
        </div>)}
      </nav>
      {createAction}
      <div className="film-strip-tools">
        {onToggleLoupe && <button type="button" className="film-loupe" data-testid="loupe-activate" aria-label="Loupe" title={state.loupe.isActive ? 'Put away loupe' : 'Activate loupe'} aria-pressed={state.loupe.isActive} onClick={onToggleLoupe}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="5" ry="2.5"/><path d="m7 6-2 12c0 1.9 3.1 3 7 3s7-1.1 7-3L17 6M5.6 15c1.5 2.7 11.3 2.7 12.8 0"/><path d="M10 6h4" strokeOpacity=".5"/></svg>
        </button>}
        <button type="button" data-panel-toggle className="film-settings" aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={onOpenSettings}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="m9.5 3-.6 2.2-1.5.9-2.2-.6-2.5 4.3 1.6 1.6v1.7l-1.6 1.6L5.2 19l2.2-.6 1.5.9.6 2.2h5l.6-2.2 1.5-.9 2.2.6 2.5-4.3-1.6-1.6v-1.7l1.6-1.6-2.5-4.3-2.2.6-1.5-.9L14.5 3Z" /><circle cx="12" cy="12.25" r="3.25" /></svg>
        </button>
        {ownerActions}
      </div>
    </div>
  </header>;
}
