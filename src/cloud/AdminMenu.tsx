import { useEffect, useRef, useState } from 'react';
import { ownerClient } from './ownerClient';

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

export function AdminMenu({ loggedIn }: { loggedIn: boolean }) {
  const loginEndpoint = import.meta.env.VITE_FILM_PHOTO_ADMIN_LOGIN_URL || '/api/owner/session';
  const loginUrl = loginEndpoint === '/api/dev-auth/login'
    ? `${loginEndpoint}?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}` : loginEndpoint;
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    container.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const dismiss = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div className="owner-nav-actions">
    <a href="/guest?welcome=1" target="_blank" rel="noopener noreferrer">Create Your Own ↗</a>
    <div className="admin-menu" ref={container} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); setOpen(true); container.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }
    }}>
      <button ref={trigger} aria-label="Admin menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      {open && <div className="admin-menu-dropdown" role="menu" aria-label="Admin">
        {loggedIn ? <button role="menuitem" aria-disabled="true">Logged in</button>
          : <a role="menuitem" href={loginUrl}>Admin Login</a>}
      </div>}
    </div>
  </div>;
}
