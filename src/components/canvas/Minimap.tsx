import { useReactFlow, useStore } from '@xyflow/react';
import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useFilterResult } from '../../app/viewQueries';
import { useIsMobile } from '../../hooks/useIsMobile';
import { buildHierarchyIndex, owningProject } from '../../model/graph';
import { colorHex } from '../../model/labels';
import { fromMinimap, minimapFrame, toMinimap, viewportRect } from '../../model/minimap';
import { BASE_NODE_SIZE } from '../../model/viewport';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';

/**
 * Minimapa přes <canvas>: uzly se kreslí do skrytého plátna jen při změně dat,
 * filtru nebo tématu; při posunu / zoomu se jen složí hotový obrázek s rámečkem výřezu.
 */
export function Minimap({ viewW, viewH }: { viewW: number; viewH: number }) {
  const mobile = useIsMobile();
  const doc = useDocStore((s) => s.doc);
  const theme = useUiStore((s) => s.theme);
  const fres = useFilterResult();
  const [tx, ty, zoom] = useStore((s) => s.transform);
  const rf = useReactFlow();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const width = mobile ? 150 : 200;
  const height = mobile ? 100 : 140;
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  const frame = useMemo(() => (doc ? minimapFrame(doc, width, height) : null), [doc?.nodes, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vrstva s uzly – jen při změně dat, filtru, tématu nebo velikosti.
  const layer = useMemo(() => {
    if (!doc || !frame) return null;
    const c = document.createElement('canvas');
    c.width = width * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d');
    if (!g) return null;
    g.scale(dpr, dpr);
    const idx = buildHierarchyIndex(doc);
    const colorOf = new Map<string, string>();
    const neutral = theme === 'dark' ? '#6b7385' : '#9aa1ae';
    const colorFor = (id: string) => {
      let col = colorOf.get(id);
      if (!col) {
        const p = owningProject(doc, id, idx);
        col = p ? colorHex(p.color) : neutral;
        colorOf.set(id, col);
      }
      return col;
    };
    const nodes = Object.values(doc.nodes).filter((n) => !n.deletedAt);
    // Nejdřív úkoly, projekty navrch (výrazněji).
    nodes.sort((a, b) => (a.type === 'project' ? 1 : 0) - (b.type === 'project' ? 1 : 0));
    for (const n of nodes) {
      const s = BASE_NODE_SIZE[n.type];
      const p = toMinimap(frame, n.position.x, n.position.y);
      const w = Math.max(2, s.w * frame.scale);
      const h = Math.max(1.5, s.h * frame.scale);
      const dim = !!fres && !fres.matches.has(n.id) && !fres.ancestors.has(n.id);
      g.globalAlpha = dim ? 0.15 : n.type === 'project' ? 1 : 0.55;
      g.fillStyle = colorFor(n.id);
      g.fillRect(p.x, p.y, w, h);
      if (n.type === 'project' && !dim) {
        g.globalAlpha = 1;
        g.strokeStyle = theme === 'dark' ? '#eceef3' : '#16181d';
        g.lineWidth = 0.75;
        g.strokeRect(p.x + 0.5, p.y + 0.5, w - 1, h - 1);
      }
    }
    g.globalAlpha = 1;
    return c;
  }, [doc?.nodes, doc?.edges, frame, fres, theme, width, height, dpr]); // eslint-disable-line react-hooks/exhaustive-deps

  // Složení: vrstva uzlů + výřez. Překresluje se při změně výřezu nebo vrstvy.
  useEffect(() => {
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    if (!layer || !frame) return;
    g.drawImage(layer, 0, 0, width, height);
    const v = viewportRect(tx, ty, zoom, viewW, viewH);
    const a = toMinimap(frame, v.x, v.y);
    const w = v.width * frame.scale;
    const h = v.height * frame.scale;
    const accent = getComputedStyle(c).getPropertyValue('--accent').trim() || '#4f46e5';
    g.fillStyle = accent;
    g.globalAlpha = 0.1;
    g.fillRect(a.x, a.y, w, h);
    g.globalAlpha = 1;
    g.strokeStyle = accent;
    g.lineWidth = 1.5;
    g.strokeRect(a.x, a.y, w, h);
  }, [layer, frame, tx, ty, zoom, viewW, viewH, width, height, dpr]);

  // Klik / tažení: vystředit plochu na bod v minimapě (zoom zůstává).
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!frame) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = fromMinimap(frame, e.clientX - r.left, e.clientY - r.top);
    void rf.setCenter(p.x, p.y, { zoom: rf.getZoom() });
  };

  if (!doc || !frame) return null;
  return (
    <canvas
      ref={canvasRef}
      className="minimap nodrag nopan"
      width={width * dpr}
      height={height * dpr}
      style={{ width, height }}
      aria-label="Minimapa – klepnutím nebo tažením posunete plochu"
      role="img"
      onPointerDown={(e) => {
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* nevadí */
        }
        dragging.current = true;
        move(e);
      }}
      onPointerMove={(e) => {
        if (dragging.current) move(e);
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
