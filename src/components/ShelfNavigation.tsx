import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

// Own a shelf drag through the return journey, even after its HTML labels
// unmount. A tap still belongs to the saved-roll button; UI controls are excluded.
export function ShelfNavigation({ enabled, onLeave, onLook }: { enabled: boolean; onLeave: () => void; onLook: (dx: number, dy: number) => void }) {
  const { gl } = useThree();
  const live = useRef({ enabled, onLeave, onLook }); live.current = { enabled, onLeave, onLook };
  useEffect(() => {
    const canvas = gl.domElement;
    let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
    let suppressClickUntil = 0;
    const accepts = (target: EventTarget | null) => target === canvas || (target instanceof Element && !!target.closest('.shelf-roll-target'));
    const consume = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const down = (event: PointerEvent) => {
      // A fresh press is a new action, including toolbar clicks immediately
      // after a reduced-motion return. Suppress only the drag's trailing click.
      suppressClickUntil = 0;
      if (drag || !live.current.enabled || event.button !== 0 || !accepts(event.target)) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) {
        drag.moved = true;
        canvas.setPointerCapture(event.pointerId);
        live.current.onLeave();
      }
      if (drag.moved) {
        live.current.onLook(event.clientX - drag.x, event.clientY - drag.y);
        drag.x = event.clientX; drag.y = event.clientY;
        consume(event);
      }
    };
    const release = () => {
      const id = drag?.id; drag = null;
      if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    const up = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      move(event); // Include the final sample on browsers that coalesce moves.
      if (drag.moved) { suppressClickUntil = performance.now() + 500; consume(event); }
      release();
    };
    const click = (event: MouseEvent) => {
      if (event.detail > 0 && performance.now() < suppressClickUntil) { consume(event); suppressClickUntil = 0; }
    };
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('click', click, true);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    return () => {
      release();
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
    };
  }, [gl]);
  return null;
}
