import { useReactFlow } from '@xyflow/react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Crosshair } from 'lucide-react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { arrowStep, clampToRadius, joystickVelocity, JOYSTICK, type ArrowDir } from '../../model/joystick';
import { nodeCenter, nodesBounds } from '../../model/viewport';
import { useDocStore } from '../../store/docStore';
import { MOTION, motion } from '../common/motion';
import { useUiStore } from '../../store/uiStore';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Kruhový ovladač posunu (telefon). Klepnutí na šipku posune plochu o třetinu
 * obrazovky, tažení palce od středu posouvá plynule všemi směry, střed vystředí
 * vybraný uzel (jinak celou mapu). Zachytává jen vlastní plochu.
 */
export function Joystick({ viewW, viewH }: { viewW: number; viewH: number }) {
  const rf = useReactFlow();
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(false);
  const state = useRef<{ id: number; cx: number; cy: number; sx: number; sy: number; dragging: boolean; dir: string | null; raf: number; last: number; off: { x: number; y: number } } | null>(null);

  const panBy = (dx: number, dy: number, duration: number) => {
    const v = rf.getViewport();
    void rf.setViewport({ x: v.x - dx, y: v.y - dy, zoom: v.zoom }, { duration: reducedMotion() ? 0 : duration });
  };

  const centerAction = () => {
    const doc = useDocStore.getState().doc;
    if (!doc) return;
    const sel = useUiStore.getState().selectedId;
    const n = sel ? doc.nodes[sel] : undefined;
    if (n && !n.deletedAt) {
      const c = nodeCenter(n);
      void rf.setCenter(c.x, c.y, { zoom: rf.getZoom(), duration: motion(MOTION.move) });
      return;
    }
    // Bez výběru: střed všech projektů.
    const projects = { nodes: Object.fromEntries(Object.entries(doc.nodes).filter(([, p]) => p.type === 'project')), edges: {} };
    const b = nodesBounds(projects) ?? nodesBounds(doc);
    if (b) void rf.setCenter(b.x + b.width / 2, b.y + b.height / 2, { zoom: rf.getZoom(), duration: motion(MOTION.move) });
  };

  const loop = () => {
    const s = state.current;
    if (!s || !s.dragging) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - s.last) / 1000);
    s.last = now;
    const { vx, vy } = joystickVelocity(s.off.x, s.off.y);
    if (vx || vy) {
      const v = rf.getViewport();
      void rf.setViewport({ x: v.x - vx * dt, y: v.y - vy * dt, zoom: v.zoom });
    }
    s.raf = requestAnimationFrame(loop);
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const dir = (e.target as HTMLElement).closest<HTMLElement>('[data-dir]')?.dataset.dir ?? null;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ukazatel už není aktivní – nevadí */
    }
    state.current = {
      id: e.pointerId,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      sx: e.clientX,
      sy: e.clientY,
      dragging: false,
      dir,
      raf: 0,
      last: performance.now(),
      off: { x: 0, y: 0 },
    };
    setActive(true);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s || e.pointerId !== s.id) return;
    if (!s.dragging && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) > JOYSTICK.dragThreshold) {
      s.dragging = true;
      s.last = performance.now();
      s.raf = requestAnimationFrame(loop);
    }
    if (s.dragging) {
      // Výchylka se měří od středu ovladače.
      s.off = clampToRadius(e.clientX - s.cx, e.clientY - s.cy);
      setKnob(s.off);
    }
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s || e.pointerId !== s.id) return;
    cancelAnimationFrame(s.raf);
    if (!s.dragging && e.type === 'pointerup') {
      if (s.dir === 'center') centerAction();
      else if (s.dir) {
        const { dx, dy } = arrowStep(s.dir as ArrowDir, viewW, viewH);
        panBy(dx, dy, MOTION.move);
      }
    }
    state.current = null;
    setKnob(null);
    setActive(false);
  };

  return (
    <div
      className={`joystick${active ? ' active' : ''}`}
      role="group"
      aria-label="Posun plochy"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button className="joy-arrow up" data-dir="up" aria-label="Posunout nahoru" tabIndex={-1}>
        <ChevronUp size={22} />
      </button>
      <button className="joy-arrow down" data-dir="down" aria-label="Posunout dolů" tabIndex={-1}>
        <ChevronDown size={22} />
      </button>
      <button className="joy-arrow left" data-dir="left" aria-label="Posunout doleva" tabIndex={-1}>
        <ChevronLeft size={22} />
      </button>
      <button className="joy-arrow right" data-dir="right" aria-label="Posunout doprava" tabIndex={-1}>
        <ChevronRight size={22} />
      </button>
      <button
        className="joy-center"
        data-dir="center"
        aria-label="Vystředit vybraný uzel (bez výběru celou mapu)"
        tabIndex={-1}
        style={knob ? { transform: `translate(${knob.x}px, ${knob.y}px)` } : undefined}
      >
        <Crosshair size={18} />
      </button>
    </div>
  );
}
