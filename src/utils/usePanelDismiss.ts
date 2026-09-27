import { useEffect, useRef, type RefObject } from 'react';

/** Dismiss on an outside tap, not a slider drag that ends outside the panel. */
export function usePanelDismiss(ref: RefObject<HTMLElement>, open: boolean, onDismiss: () => void) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    let outsideStart = false;
    const inside = (event: MouseEvent) => {
      const element = ref.current;
      if (!element) return false;
      const box = element.getBoundingClientRect();
      return element.contains(event.target as Node) && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    };
    const toggle = (event: Event) => (event.target as Element).closest?.('[data-panel-toggle]');
    const down = (event: PointerEvent) => {
      outsideStart = !inside(event) && !toggle(event);
      // A dismissal gesture must not begin a scene drag underneath the panel.
      if (outsideStart && !(event.target as Element).closest?.('button,a,input,select')) event.stopPropagation();
    };
    const click = (event: MouseEvent) => {
      if (!outsideStart || inside(event) || toggle(event)) return;
      const navigation = (event.target as Element).closest?.('button,a');
      if (!navigation) { event.preventDefault(); event.stopPropagation(); }
      dismiss.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); dismiss.current();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, ref]);
}
