import { useEffect, useRef } from 'react';

/**
 * Calls `onAway` when a mousedown/touchstart happens outside the returned ref,
 * or when the user presses Escape. Use to make dropdown menus self-dismiss.
 */
export function useClickAway<T extends HTMLElement>(
  active: boolean,
  onAway: () => void
) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const node = ref.current;
      if (!node) return;
      const target = e.target as Node | null;
      if (target && node.contains(target)) return;
      onAway();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAway();
    };
    // Use capture-phase mousedown so we fire before child onClick handlers swallow.
    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('touchstart', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('touchstart', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [active, onAway]);
  return ref;
}
