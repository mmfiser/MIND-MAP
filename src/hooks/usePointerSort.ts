import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface SortState {
  from: number;
  over: number;
}

/**
 * Přeřazení seznamu tažením za úchyt – myš i prst (Pointer Events).
 * Položky musí mít atribut `data-sort-index`. Úchyt má mít `touch-action: none`.
 */
export function usePointerSort(onMove: (from: number, to: number) => void) {
  const [state, setState] = useState<SortState | null>(null);
  const stateRef = useRef<SortState | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const start = useCallback((e: ReactPointerEvent, index: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    const list = target.closest('[data-sort-list]');
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* nevadí */
    }
    const s0 = { from: index, over: index };
    stateRef.current = s0;
    setState(s0);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const item = el?.closest<HTMLElement>('[data-sort-index]');
      if (!item || (list && !list.contains(item))) return;
      const over = Number(item.dataset.sortIndex);
      if (Number.isFinite(over) && stateRef.current && stateRef.current.over !== over) {
        stateRef.current = { ...stateRef.current, over };
        setState(stateRef.current);
      }
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const st = stateRef.current;
      stateRef.current = null;
      setState(null);
      if (st && ev.type === 'pointerup' && st.from !== st.over) onMoveRef.current(st.from, st.over);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, []);

  return { sort: state, startSort: start };
}
