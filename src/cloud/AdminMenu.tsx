import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ownerClient } from './ownerClient';
import type { LayoutPreference } from '../utils/useMobileLayout';

export function useAdminSession(enabled: boolean) {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | undefined;
    const check = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      void ownerClient.session(signal).then(() => { if (!signal.aborted) setLoggedIn(true); })
        .catch(() => { if (!signal.aborted) setLoggedIn(false); });
    };
    check();
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    return () => { controller?.abort(); window.removeEventListener('focus', check); window.removeEventListener('pageshow', check); };
  }, [enabled]);
  return loggedIn;
}

export function AdminMenu({ loggedIn, guest, layout, onLayoutChange }: {
  loggedIn: boolean; guest: boolean; layout: LayoutPreference; onLayoutChange: (next: LayoutPreference) => void;
}) {
  const loginEndpoint = import.meta.env.VITE_FILM_PHOTO_ADMIN_LOGIN_URL || '/api/owner/session';
  const loginUrl = loginEndpoint === '/api/dev-auth/login'
    ? `${loginEndpoint}?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}` : loginEndpoint;
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const anchor = container.current?.getBoundingClientRect(), menu = dropdown.current;
      if (!anchor || !menu) return;
      const left = Math.max(8, Math.min(anchor.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8));
      menu.style.left = `${left - anchor.left}px`; menu.style.right = 'auto';
    };
    position();
    const observer = new ResizeObserver(position);
    for (const node of [container.current, container.current?.closest('header')]) if (node) observer.observe(node);
    window.addEventListener('resize', position);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    container.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus();
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div className="owner-nav-actions">
    {!guest && <a href="/guest?welcome=1" target="_blank" rel="noopener noreferrer">Create Your Own ↗</a>}
    <div className="admin-menu" ref={container} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (!open) { setOpen(true); return; }
        const items = Array.from(container.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
      <button ref={trigger} aria-label="More options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⋮</button>
      {open && <div ref={dropdown} className="admin-menu-dropdown" role="menu" aria-label="More options">
        {!guest && (loggedIn ? <button role="menuitem" aria-disabled="true">Logged in</button>
          : <a role="menuitem" href={loginUrl}>Admin Login</a>)}
        <div className="layout-menu-options" role="group" aria-label="Layout">
          <p aria-hidden="true">Layout</p>
          {(['auto', 'desktop'] as const).map(value => <button key={value} role="menuitemradio" aria-checked={layout === value} onClick={() => { setOpen(false); onLayoutChange(value); trigger.current?.focus(); }}>
            {value === 'auto' ? 'Auto' : 'Desktop'}<span aria-hidden="true">{layout === value ? '✓' : ''}</span>
          </button>)}
        </div>
      </div>}
    </div>
  </div>;
}
