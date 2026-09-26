import { useEffect, useRef } from 'react';

export function GuestWelcome({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const enter = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const current = dialog.current;
    current?.showModal();
    enter.current?.focus();
    return () => {
      current?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className="library-dialog guest-welcome" aria-labelledby="guest-welcome-title" aria-describedby="guest-welcome-description" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <h1 id="guest-welcome-title">Your guest darkroom</h1>
    <div id="guest-welcome-description">
      <p>Add photographs, edit rolls and delete film here. Your guest rolls stay in this browser only. They are not uploaded or synced to the public gallery or another device.</p>
      <p>Clearing browser data or storage eviction may permanently remove your rolls. Export backups regularly so you can restore them later.</p>
    </div>
    <button ref={enter} className="primary" onClick={onClose}>Enter guest darkroom</button>
  </dialog>;
}
