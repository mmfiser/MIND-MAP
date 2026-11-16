/**
 * Tažení vazby myší: z konektoru uzlu (nová vazba) nebo z konce vybrané vazby
 * (přepojení). Cíl se pozná podle uzlu pod ukazatelem; po puštění se u nové
 * vazby otevře nabídka typu, u přepojení se vazba rovnou přepojí.
 */
import { create } from 'zustand';
import { reconnect } from '../../app/linkActions';
import { useUiStore } from '../../store/uiStore';

export type LinkDragKind = { mode: 'create'; sourceId: string } | { mode: 'reconnect'; edgeId: string; end: 'source' | 'target' };

interface DragLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const useDragLine = create<{ line: DragLine | null }>()(() => ({ line: null }));

function nodeIdAt(x: number, y: number): { id: string; el: HTMLElement } | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const n = (el as HTMLElement).closest?.<HTMLElement>('.react-flow__node');
    if (n?.dataset.id) return { id: n.dataset.id, el: n };
  }
  return null;
}

/** Spustí tažení. `from` = pevný bod čáry (obrazovka); výchozí je místo stisku. */
export function startLinkDrag(kind: LinkDragKind, e: PointerEvent, from?: { x: number; y: number }): void {
  const start = from ?? { x: e.clientX, y: e.clientY };
  const pointerId = e.pointerId;
  let hoverEl: HTMLElement | null = null;
  const selfId = kind.mode === 'create' ? kind.sourceId : null;
  useDragLine.setState({ line: { x1: start.x, y1: start.y, x2: e.clientX, y2: e.clientY } });
  document.body.classList.add('link-dragging');

  const setHover = (el: HTMLElement | null) => {
    if (hoverEl === el) return;
    hoverEl?.classList.remove('link-target');
    hoverEl = el;
    hoverEl?.classList.add('link-target');
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    ev.preventDefault();
    useDragLine.setState({ line: { x1: start.x, y1: start.y, x2: ev.clientX, y2: ev.clientY } });
    const hit = nodeIdAt(ev.clientX, ev.clientY);
    setHover(hit && hit.id !== selfId ? hit.el : null);
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    window.removeEventListener('keydown', onKey, true);
    setHover(null);
    useDragLine.setState({ line: null });
    document.body.classList.remove('link-dragging');
    if (ev.type === 'pointercancel') return;
    const hit = nodeIdAt(ev.clientX, ev.clientY);
    if (!hit) return;
    if (kind.mode === 'create') {
      if (hit.id === kind.sourceId) return;
      useUiStore.getState().set({ linkTypeMenu: { x: ev.clientX, y: ev.clientY, source: kind.sourceId, target: hit.id } });
    } else {
      reconnect(kind.edgeId, kind.end, hit.id);
    }
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    end(new PointerEvent('pointercancel', { pointerId }));
  };
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('keydown', onKey, true);
}

/** Čára během tažení (v souřadnicích obrazovky, nad plochou). */
export function LinkDragLayer() {
  const line = useDragLine((s) => s.line);
  if (!line) return null;
  return (
    <svg className="link-drag-layer" aria-hidden>
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      <circle cx={line.x2} cy={line.y2} r={5} />
    </svg>
  );
}
