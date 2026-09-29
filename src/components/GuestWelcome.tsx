import { useEffect, useRef } from 'react';

export function GuestWelcome({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const current = dialog.current;
    current?.showModal();
    title.current?.focus({ preventScroll: true });
    return () => {
      current?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className="library-dialog guest-welcome" aria-labelledby="guest-welcome-title" aria-describedby="guest-welcome-description" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <div className="guest-welcome-body">
      <div className="guest-welcome-brand" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none"><rect x="4" y="5" width="24" height="22" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M10 5v22M22 5v22M4 11h6m-6 10h6m12-10h6m-6 10h6" stroke="currentColor" strokeWidth="1.5"/><circle cx="16" cy="16" r="3" fill="currentColor"/></svg>
        <span>FilmReverie</span>
        <span className="guest-welcome-edition">Guest darkroom</span>
      </div>
      <h1 ref={title} autoFocus tabIndex={-1} id="guest-welcome-title" className="guest-welcome-title">Your guest darkroom</h1>
      <p className="guest-welcome-intro">A little space for your life on film.</p>
      <div id="guest-welcome-description">
        <p className="guest-welcome-copy">Bring in your photographs, arrange your rolls, and make the film shelf your own.</p>
        <div className="guest-welcome-privacy">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M9 14.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div><strong>Yours, in this browser.</strong><p>Your guest rolls stay in this browser only. They are not uploaded or synced to the public gallery or another device.</p></div>
        </div>
      </div>
      <button className="primary guest-welcome-enter" onClick={onClose}>Enter guest darkroom <span aria-hidden="true">→</span></button>
    </div>
    <div className="guest-welcome-project">
      <div><p className="guest-welcome-project-title">Made for the love of film.</p><p>Explore the code. Share an idea.</p></div>
      <a href="https://github.com/stevex6677/filmreverie" target="_blank" rel="noopener noreferrer" aria-label="View on GitHub (opens in a new tab)">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542 0-.267-.01-.974-.015-1.912-3.13.68-3.791-1.508-3.791-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.022-.699.077-.685.077-.685 1.13.08 1.725 1.16 1.725 1.16 1.005 1.722 2.637 1.225 3.279.937.102-.728.393-1.225.715-1.507-2.499-.284-5.126-1.25-5.126-5.562 0-1.228.439-2.233 1.16-3.02-.116-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.154a10.79 10.79 0 0 1 2.812-.378c.956.005 1.919.13 2.818.378 2.148-1.457 3.09-1.154 3.09-1.154.615 1.55.228 2.695.112 2.98.722.787 1.158 1.792 1.158 3.02 0 4.323-2.63 5.275-5.136 5.553.404.35.766 1.043.766 2.1 0 1.517-.014 2.741-.014 3.113 0 .301.203.651.774.541A11.252 11.252 0 0 0 12 .75Z"/></svg>
        GitHub <span className="guest-welcome-external" aria-hidden="true">↗</span>
      </a>
    </div>
  </dialog>;
}
