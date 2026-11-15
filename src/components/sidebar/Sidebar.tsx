import { ChevronDown, ChevronRight, GripVertical, Link2, X } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { detachFrom, moveUnder } from '../../app/actions';
import { useIsMobile } from '../../hooks/useIsMobile';
import { buildHierarchyIndex, rootNodes, type HierarchyIndex } from '../../model/graph';
import { wouldCreateCycle } from '../../model/hierarchy';
import { colorHex } from '../../model/labels';
import { projectIcon } from '../common/projectIcons';
import type { MapDocument } from '../../model/types';
import { useDocStore } from '../../store/docStore';
import { toast, useUiStore } from '../../store/uiStore';

interface DragState {
  nodeId: string;
  fromParentId: string | null;
  title: string;
  x: number;
  y: number;
  /** cíl: id uzlu, 'root' (odpojit) nebo null */
  over: string | null;
  overKey: string | null;
  valid: boolean;
  reason?: string;
}

/** Část stavu tažení, kterou potřebují řádky (bez souřadnic – nepřekreslují se při každém pohybu). */
interface DragInfo {
  nodeId: string;
  fromParentId: string | null;
  overKey: string | null;
  valid: boolean;
}

interface RowProps {
  doc: MapDocument;
  index: HierarchyIndex;
  nodeId: string;
  parentId: string | null;
  depth: number;
  pathKey: string;
  ancestors: Set<string>;
  collapsed: Set<string>;
  selectedId: string | null;
  drag: DragInfo | null;
  onToggle: (key: string) => void;
  onSelect: (id: string) => void;
  onDragStart: (e: ReactPointerEvent, nodeId: string, parentId: string | null) => void;
}

const TreeRow = memo(function TreeRow(p: RowProps) {
  const nextAncestors = useMemo(() => new Set([...p.ancestors, p.nodeId]), [p.ancestors, p.nodeId]);
  const n = p.doc.nodes[p.nodeId];
  if (!n) return null;
  const kids = p.index.children.get(n.id) ?? [];
  const shared = (p.index.parents.get(n.id)?.length ?? 0) > 1;
  const isCollapsed = p.collapsed.has(p.pathKey);
  // Ochrana proti nekonečné rekurzi (cykly by v datech být neměly).
  const cyclic = p.ancestors.has(n.id);
  const dragging = p.drag?.nodeId === n.id && p.drag.fromParentId === p.parentId;
  const isOver = p.drag?.overKey === p.pathKey;
  const cls = [
    'tree-row',
    p.selectedId === n.id ? 'selected' : '',
    dragging ? 'dragging' : '',
    isOver ? (p.drag?.valid ? 'drop-target' : 'drop-invalid') : '',
  ].join(' ');
  return (
    <>
      <div
        className={cls}
        style={{ paddingLeft: 4 + p.depth * 16 }}
        data-tree-node={n.id}
        data-tree-key={p.pathKey}
        onClick={() => p.onSelect(n.id)}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button === 0) p.onDragStart(e, n.id, p.parentId);
        }}
        role="treeitem"
        aria-expanded={kids.length ? !isCollapsed : undefined}
        aria-selected={p.selectedId === n.id}
      >
        {kids.length > 0 && !cyclic ? (
          <button
            className="tree-toggle"
            aria-label={isCollapsed ? 'Rozbalit' : 'Sbalit'}
            onClick={(e) => {
              e.stopPropagation();
              p.onToggle(p.pathKey);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        ) : (
          <span style={{ width: 26, flex: 'none' }} />
        )}
        {projectIcon(n.icon) ? (
          (() => {
            const pi = projectIcon(n.icon)!;
            return (
              <pi.Icon
                size={16}
                className="tree-icon"
                style={{ color: n.type === 'project' ? colorHex(n.color) : 'var(--text-2)' }}
                aria-label={pi.label}
              />
            );
          })()
        ) : (
          <span
            className={`tree-dot${n.type === 'project' ? '' : ' task'}`}
            style={{ background: n.type === 'project' ? colorHex(n.color) : 'var(--text-3)' }}
          />
        )}
        <span
          className={`tree-title${n.type === 'project' ? ' project' : ''}${n.title.trim() ? '' : ' empty'}${n.status === 'done' || n.status === 'cancelled' ? ' finished' : ''}`}
        >
          {n.title.trim() || 'Bez názvu'}
        </span>
        {shared && (
          <span className="tree-shared" title="Sdílený uzel – je i pod jiným rodičem">
            <Link2 size={14} />
          </span>
        )}
        <span
          className="tree-grip"
          title="Přetáhněte pod jiný uzel"
          onPointerDown={(e) => {
            e.stopPropagation();
            p.onDragStart(e, n.id, p.parentId);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </span>
      </div>
      {!isCollapsed &&
        !cyclic &&
        kids.map((e) => (
          <TreeRow key={e.id} {...p} nodeId={e.target} parentId={n.id} depth={p.depth + 1} pathKey={`${p.pathKey}/${e.target}`} ancestors={nextAncestors} />
        ))}
    </>
  );
});

const DRAG_THRESHOLD = 6;

export function Sidebar() {
  const mobile = useIsMobile();
  const open = useUiStore((s) => s.sidebarOpen);
  const doc = useDocStore((s) => s.doc);
  const selectedId = useUiStore((s) => s.selectedId);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const index = useMemo(() => (doc ? buildHierarchyIndex(doc) : null), [doc]);
  const roots = useMemo(() => (doc && index ? rootNodes(doc, index) : []), [doc, index]);
  const count = useMemo(() => (doc ? Object.values(doc.nodes).filter((n) => !n.deletedAt).length : 0), [doc]);
  const emptySet = useMemo(() => new Set<string>(), []);
  const dragInfo = useMemo<DragInfo | null>(
    () => (drag ? { nodeId: drag.nodeId, fromParentId: drag.fromParentId, overKey: drag.overKey, valid: drag.valid } : null),
    [drag?.nodeId, drag?.fromParentId, drag?.overKey, drag?.valid], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const close = () => useUiStore.getState().set({ sidebarOpen: false });

  const onToggle = useCallback((key: string) => {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const onSelect = useCallback(
    (id: string) => {
      const ui = useUiStore.getState();
      ui.select(id, true);
      ui.focusNode(id);
      if (mobile) ui.set({ sidebarOpen: false });
    },
    [mobile],
  );

  const evaluate = (state: DragState, x: number, y: number): DragState => {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest<HTMLElement>('[data-tree-node]');
    const rootDrop = el?.closest('.tree-root-drop');
    const d = useDocStore.getState().doc;
    let over: string | null = null;
    let overKey: string | null = null;
    let valid = false;
    let reason: string | undefined;
    if (row && d) {
      over = row.dataset.treeNode ?? null;
      overKey = row.dataset.treeKey ?? null;
      if (over === state.nodeId) {
        valid = false;
      } else if (over === state.fromParentId) {
        valid = false;
      } else if (over) {
        const fromEdge = Object.values(d.edges).find(
          (e) => e.kind === 'hierarchy' && e.source === state.fromParentId && e.target === state.nodeId,
        );
        valid = !wouldCreateCycle(d, 'hierarchy', over, state.nodeId, fromEdge?.id);
        if (!valid) {
          const t = d.nodes[over]?.title.trim() || 'bez názvu';
          reason = `Nelze: „${t}“ leží ve větvi uzlu „${state.title}“, vznikl by cyklus.`;
        }
      }
    } else if (rootDrop) {
      over = 'root';
      overKey = 'root';
      valid = state.fromParentId !== null;
    }
    // automatické posouvání seznamu u okrajů
    const body = bodyRef.current;
    if (body) {
      const r = body.getBoundingClientRect();
      if (y < r.top + 40) body.scrollBy(0, -12);
      else if (y > r.bottom - 40) body.scrollBy(0, 12);
    }
    return { ...state, x, y, over, overKey, valid, reason };
  };

  const onDragStart = useCallback((e: ReactPointerEvent, nodeId: string, parentId: string | null) => {
    const target = e.currentTarget as HTMLElement;
    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    let started = false;
    const title = useDocStore.getState().doc?.nodes[nodeId]?.title.trim() || 'bez názvu';
    const immediate = e.pointerType !== 'mouse'; // úchyt na dotyk táhne hned

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!started) {
        if (!immediate && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        started = true;
        try {
          target.setPointerCapture(pointerId);
        } catch {
          /* nevadí */
        }
      }
      ev.preventDefault();
      const base: DragState = dragRef.current ?? {
        nodeId,
        fromParentId: parentId,
        title,
        x: ev.clientX,
        y: ev.clientY,
        over: null,
        overKey: null,
        valid: false,
      };
      setDrag(evaluate(base, ev.clientX, ev.clientY));
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const st = dragRef.current;
      setDrag(null);
      if (!started || !st || ev.type === 'pointercancel') return;
      // potlač klik, který následuje po tažení myší
      const swallow = (ce: MouseEvent) => {
        ce.stopPropagation();
        ce.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 50);
      if (!st.over) return;
      if (!st.valid) {
        if (st.reason) toast(st.reason, 'error');
        return;
      }
      if (st.over === 'root') {
        if (st.fromParentId) detachFrom(st.nodeId, st.fromParentId);
      } else if (moveUnder(st.nodeId, st.fromParentId, st.over)) {
        toast('Přesunuto.', 'success');
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open || !doc || !index) return null;

  return (
    <>
      {mobile && <div className="sidebar-backdrop" onClick={close} />}
      <nav className="sidebar" aria-label="Rejstřík">
        <div className="sidebar-head">
          <span>Rejstřík</span>
          <span className="count">{count} uzlů</span>
          <div style={{ flex: 1 }} />
          <button className="icon-btn" onClick={close} aria-label="Zavřít rejstřík" title="Zavřít rejstřík">
            <X size={18} />
          </button>
        </div>
        {drag && drag.fromParentId && (
          <div className={`tree-root-drop${drag.overKey === 'root' ? ' drop-target' : ''}`}>Pusťte sem pro odpojení od rodiče (volný uzel)</div>
        )}
        <div className="sidebar-body" ref={bodyRef} role="tree">
          {roots.length === 0 && <div className="muted" style={{ padding: '8px 10px' }}>Zatím žádné projekty.</div>}
          {roots.map((r) => (
            <TreeRow
              key={r.id}
              doc={doc}
              index={index}
              nodeId={r.id}
              parentId={null}
              depth={0}
              pathKey={r.id}
              ancestors={emptySet}
              collapsed={collapsed}
              selectedId={selectedId}
              drag={dragInfo}
              onToggle={onToggle}
              onSelect={onSelect}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      </nav>
      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {drag.title}
        </div>
      )}
    </>
  );
}
