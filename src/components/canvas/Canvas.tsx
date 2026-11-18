import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  applyNodeChanges,
  type EdgeMouseHandler,
  useReactFlow,
  type Edge,
  type NodeChange,
  type NodeMouseHandler,
  type OnMove,
  type OnMoveEnd,
  type Viewport,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { GRID, NODE_SIZE, canvasApi, commitPositions, createProject } from '../../app/actions';
import { blockedText, handlePickTarget } from '../../app/linkActions';
import { blockersIndex } from '../../model/blocking';
import { describeConflict, findDateConflicts, type ConflictReport } from '../../model/conflicts';
import { computeVisibility, routeEdges, type VisibilityInfo } from '../../model/visibility';
import { LOD_MAX_DEPTH, lodLevel, type LodLevel } from '../../model/lod';
import { nodeScaleFactors, overlapCaps, type KindRect, type NodeScale } from '../../model/nodeScale';
import { fitViewport, nodeCenter, zoomPresetViewport } from '../../model/viewport';
import { projectsOf } from '../../model/filters';
import { filterResult, searchResult } from '../../app/viewQueries';
import { getSettings, updateSettings } from '../../app/session';
import { formatShort } from '../../model/dates';
import { deadlineState } from '../../model/deadline';
import { daysOverdue } from '../../model/messages';
import { buildHierarchyIndex, owningProject, type HierarchyIndex } from '../../model/graph';
import { checklistProgress, projectProgress, subtaskProgress } from '../../model/progress';
import { colorHex, contrastText } from '../../model/labels';
import type { DocData, MapNode, Position } from '../../model/types';
import { isMobileNow } from '../../hooks/useIsMobile';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { FloatingEdge, type FloatingEdgeType } from './FloatingEdge';
import { LinkDragLayer } from './LinkDrag';
import { EdgeMenu, LinkPickBar, LinkTypeMenu } from './LinkMenus';
import { MapNodeView, type FlowNode, type FlowNodeData } from './MapNodeView';
import { ZoomControls } from './ZoomControls';
import { FilterBar } from '../toolbar/Filter';

const nodeTypes = { mm: MapNodeView };
const edgeTypes = { floating: FloatingEdge };
const SNAP: [number, number] = [GRID, GRID];
const LONG_PRESS_MS = 550;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches;
/** Délka animace sbalení / rozbalení (prolnutí). */
const FADE_MS = 160;

const MAX_TAGS_ON_NODE = 2;

interface CacheEntry {
  /** Podpis dat uzlu – při shodě (a stejné pozici/výběru) se uzel nepřekresluje. */
  sig: string;
  selected: boolean;
  className: string;
  node: FlowNode;
}

interface Derived {
  vis: VisibilityInfo;
  conflicts: ConflictReport;
  blockers: Map<string, MapNode[]>;
  /** úroveň detailu pro zjednodušené vykreslení */
  detail: LodLevel;
  /** projekt → počet aktivních úkolů po termínu (souhrn v přehledu) */
  overdue: Map<string, number>;
}

/** Odvozená data uzlu pro zobrazení (procenta, termíny, počty…). */
function buildData(n: MapNode, d: DocData, index: HierarchyIndex, today: string, x: Derived): FlowNodeData {
  const fill = n.type === 'project' ? colorHex(n.color) : undefined;
  const blockers = n.type !== 'project' ? x.blockers.get(n.id) : undefined;
  const data: FlowNodeData = {
    title: n.title,
    kind: n.type,
    fill,
    textColor: fill ? contrastText(fill) : undefined,
    shared: (index.parents.get(n.id)?.length ?? 0) > 1,
    borderColor: n.borderColor,
    hasNotes: n.notes.trim().length > 0,
    status: n.status,
    priority: n.priority,
    icon: n.icon,
    dueState: deadlineState(n.dueDate, today, n.status, n.type),
    tags: n.tags.slice(0, MAX_TAGS_ON_NODE),
    moreTags: Math.max(0, n.tags.length - MAX_TAGS_ON_NODE),
    conflicts: (x.conflicts.byNode.get(n.id) ?? []).map((c) => describeConflict(d, c, n.id, today)),
    collapsible: x.vis.hasChildren.has(n.id),
    collapsed: n.collapsed && x.vis.hasChildren.has(n.id),
    hiddenCount: x.vis.hiddenCount.get(n.id) ?? 0,
    lodLimited: x.vis.lodLimited.has(n.id),
    marks: x.vis.hiddenMarks.get(n.id) ?? 0,
    detail: x.detail,
  };
  // Souhrn úkolů po termínu jen při nižší úrovni detailu (při plném jsou vidět přímo).
  if (n.type === 'project' && x.detail !== 'full' && x.overdue.get(n.id)) data.overdue = x.overdue.get(n.id);
  if (blockers?.length) data.blocked = blockedText(blockers);
  if (n.type === 'milestone') {
    const p = owningProject(d, n.id, index);
    data.accent = p ? colorHex(p.color) : undefined;
  }
  if (n.dueDate) data.due = formatShort(n.dueDate, today);
  if (n.dueDate && data.dueState === 'overdue') data.overdueDays = daysOverdue(n.dueDate, today);
  if (n.type === 'project') {
    const p = projectProgress(d, n.id, index);
    data.progress = { percent: p.percent, open: p.open, done: p.done };
  } else if (n.type === 'task') {
    const sp = subtaskProgress(d, n.id, index);
    if (sp) data.subtasks = { done: sp.done, total: sp.total };
  }
  const cl = checklistProgress(n);
  if (cl) data.checklist = cl;
  return data;
}

export function Canvas() {
  const doc = useDocStore((s) => s.doc);
  const selectedId = useUiStore((s) => s.selectedId);
  const gridVisible = useUiStore((s) => s.gridVisible);
  const theme = useUiStore((s) => s.theme);
  const focusRequest = useUiStore((s) => s.focusRequest);
  const fitRequest = useUiStore((s) => s.fitRequest);
  const zoomPresetRequest = useUiStore((s) => s.zoomPresetRequest);
  const today = useUiStore((s) => s.today);
  const highlightLinks = useUiStore((s) => s.highlightLinks);
  const picking = useUiStore((s) => !!s.linkPick);
  const autoDetail = useUiStore((s) => s.autoDetail);
  const level = useUiStore((s) => s.lodLevel);
  const filter = useUiStore((s) => s.filter);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const searchPick = useUiStore((s) => s.searchPick);
  const scaleNodes = useUiStore((s) => s.scaleNodes);
  const nodeScale = useUiStore((s) => s.nodeScale);
  const rf = useReactFlow<FlowNode, Edge>();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const cache = useRef(new Map<string, CacheEntry>());

  const index = useMemo(() => (doc ? buildHierarchyIndex(doc) : null), [doc?.nodes, doc?.edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Odvozené informace – přepočet jen při změně dat (ne při posunu plochy).
  const fres = useMemo(() => filterResult(doc, filter, today), [index, filter, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const searchIds = useMemo(
    () => searchResult(doc, searchQuery).results.map((r) => r.id),
    [doc?.nodes, searchQuery], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const maxDepth = autoDetail ? LOD_MAX_DEPTH[level] : Infinity;
  // Výjimky z úrovně detailu: vybraný uzel, kliknutý výsledek hledání, shody filtru.
  const keep = useMemo(() => {
    if (maxDepth === Infinity) return [];
    const out: string[] = [];
    if (selectedId) out.push(selectedId);
    if (searchPick) out.push(searchPick);
    if (fres) out.push(...fres.matches);
    return out;
  }, [maxDepth, selectedId, searchPick, fres]);
  // Označené uzly: skryté shody filtru a hledání se spočítají u viditelného předka.
  const marks = useMemo(() => [...(fres?.matches ?? []), ...searchIds], [fres, searchIds]);
  const vis = useMemo(
    () => (doc && index ? computeVisibility(doc, index, { maxDepth, keep, marks }) : null),
    [index, maxDepth, keep, marks], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Souhrn projektu v přehledu: počet aktivních úkolů po termínu (přes kteroukoli cestu).
  const overdue = useMemo(() => {
    const m = new Map<string, number>();
    if (!doc || !index) return m;
    for (const n of Object.values(doc.nodes)) {
      if (n.deletedAt || n.type === 'project' || !n.dueDate || n.dueDate >= today) continue;
      if (n.status === 'done' || n.status === 'cancelled' || n.type === 'milestone') continue;
      for (const p of projectsOf(doc, n.id, index)) m.set(p, (m.get(p) ?? 0) + 1);
    }
    return m;
  }, [index, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const routed = useMemo(() => (doc && vis ? routeEdges(doc, vis) : []), [vis]); // eslint-disable-line react-hooks/exhaustive-deps
  const conflicts = useMemo(() => (doc ? findDateConflicts(doc) : null), [index]); // eslint-disable-line react-hooks/exhaustive-deps
  const blockers = useMemo(() => (doc ? blockersIndex(doc, today) : null), [index, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zvýraznění vazeb vybraného uzlu: sousedé (po vykreslených čarách) + uzel sám.
  const focusSet = useMemo(() => {
    if (!highlightLinks || !selectedId || !vis?.visible.has(selectedId)) return null;
    const set = new Set<string>([selectedId]);
    for (const r of routed) {
      if (r.source === selectedId) set.add(r.target);
      else if (r.target === selectedId) set.add(r.source);
    }
    return set;
  }, [highlightLinks, selectedId, vis, routed]);

  // Animace sbalení / rozbalení: nově viditelné uzly se prolnou, skryté chvíli doznívají.
  const prevVisible = useRef<Set<string> | null>(null);
  const appearUntil = useRef(new Map<string, number>());
  const vanishUntil = useRef(new Map<string, number>());
  const [animTick, setAnimTick] = useState(0);

  // Synchronizace dokument → uzly React Flow. Uzel si drží identitu, dokud se
  // nezmění jeho zobrazená data, výběr, třída nebo pozice (memo komponenty pak nepřekresluje).
  useEffect(() => {
    if (!doc || !index || !vis || !conflicts || !blockers) {
      setNodes([]);
      return;
    }
    const now = performance.now();
    const prevVis = prevVisible.current;
    if (prevVis && prevVis !== vis.visible && !reducedMotion()) {
      for (const id of vis.visible) if (!prevVis.has(id) && doc.nodes[id]) appearUntil.current.set(id, now + 2 * FADE_MS);
      for (const id of prevVis) {
        const n = doc.nodes[id];
        if (n && !n.deletedAt && !vis.visible.has(id)) vanishUntil.current.set(id, now + FADE_MS);
      }
    }
    prevVisible.current = vis.visible;
    let nextWake = 0;
    for (const m of [appearUntil.current, vanishUntil.current]) {
      for (const [id, until] of m) {
        if (until <= now) m.delete(id);
        else nextWake = Math.max(nextWake, until);
      }
    }
    const derived: Derived = { vis, conflicts, blockers, detail: autoDetail ? level : 'full', overdue };
    const dimmedByFilter = (id: string) => !!fres && !fres.matches.has(id) && !fres.ancestors.has(id);
    setNodes((prevNodes) => {
      const prevById = new Map(prevNodes.map((n) => [n.id, n]));
      const nextCache = new Map<string, CacheEntry>();
      const out: FlowNode[] = [];
      for (const n of Object.values(doc.nodes)) {
        if (n.deletedAt) continue;
        const shown = vis.visible.has(n.id);
        const vanishing = !shown && vanishUntil.current.has(n.id);
        const c = cache.current.get(n.id);
        const prev = prevById.get(n.id);
        if (!shown && !vanishing) {
          // Skrytý uzel (sbalení, úroveň detailu) zůstává v React Flow jako `hidden`:
          // zachová si rozměry i interní údaje, takže se po zobrazení nemusí všechny
          // uzly znovu vykreslit a měřit – vykreslí se jen ty v záběru.
          if (prev) {
            const node = prev.hidden ? prev : { ...prev, hidden: true, selected: false };
            nextCache.set(n.id, { sig: c?.sig ?? '', selected: false, className: c?.className ?? '', node });
            out.push(node);
          }
          continue;
        }
        const data = buildData(n, doc, index, today, derived);
        const sig = JSON.stringify(data);
        const selected = n.id === selectedId;
        const className = [
          focusSet && !focusSet.has(n.id) ? 'mm-dim' : '',
          // Sbalený uzel se skrytými shodami se netlumí – je potřeba ho rozbalit.
          dimmedByFilter(n.id) && !vis.hiddenMarks.has(n.id) ? 'mm-filtered-out' : '',
          appearUntil.current.has(n.id) ? 'mm-appear' : '',
          vanishing ? 'mm-vanish' : '',
        ]
          .filter(Boolean)
          .join(' ');
        let node: FlowNode;
        // c.node === prev: mezipaměť musí odpovídat skutečně vykreslenému uzlu
        // (aktualizační funkce může React zavolat dvakrát).
        if (c && prev && !prev.hidden && c.node === prev && c.sig === sig && c.selected === selected && c.className === className && prev.position === n.position) {
          node = prev;
        } else {
          node = {
            id: n.id,
            type: 'mm',
            position: n.position,
            selected,
            draggable: !n.positionLocked && !vanishing,
            className,
            data: c && c.sig === sig ? c.node.data : data,
            // Rozměry si pamatujeme i pro dočasně skryté uzly (sbalení, úroveň detailu):
            // React Flow pak vykreslí jen uzly v záběru, místo aby všechny znovu měřil.
            ...(prev?.measured ? { measured: prev.measured } : {}),
          };
        }
        nextCache.set(n.id, { sig, selected, className, node });
        out.push(node);
      }
      cache.current = nextCache;
      return out;
    });
    if (nextWake) {
      const t = setTimeout(() => setAnimTick((x) => x + 1), nextWake - now + 10);
      return () => clearTimeout(t);
    }
  }, [doc, index, vis, conflicts, blockers, selectedId, today, focusSet, animTick, autoDetail, level, overdue, fres]);

  const edges = useMemo<FloatingEdgeType[]>(() => {
    if (!doc || !index || !conflicts) return [];
    const colorOf = new Map<string, string>();
    const projectColor = (id: string) => {
      let color = colorOf.get(id);
      if (!color) {
        const p = owningProject(doc, id, index);
        color = p ? colorHex(p.color) : 'var(--border-strong)';
        colorOf.set(id, color);
      }
      return color;
    };
    const interactionWidth = coarsePointer() ? 32 : 18;
    const sel = focusSet ? selectedId : null;
    return routed.map((r): FloatingEdgeType => {
      const first = doc.edges[r.edgeIds[0]!]!;
      const conflict = r.edgeIds.some((id) => conflicts.edgeIds.has(id));
      // Barva podle projektu rodiče / blokujícího uzlu; souvislost neutrálně.
      const color = r.kind === 'related' ? 'var(--edge-related)' : projectColor(first.source);
      const touches = !!sel && (r.source === sel || r.target === sel);
      const out = (id: string) => !!fres && !fres.matches.has(id) && !fres.ancestors.has(id) && !vis?.hiddenMarks.has(id);
      return {
        id: r.id,
        source: r.source,
        target: r.target,
        type: 'floating',
        sourceHandle: 'r',
        targetHandle: 'l',
        selectable: false,
        focusable: false,
        interactionWidth,
        zIndex: touches ? 1 : 0,
        markerEnd:
          r.kind === 'dependency'
            ? { type: MarkerType.ArrowClosed, color: conflict ? 'var(--warn)' : color, width: 16, height: 16 }
            : undefined,
        data: {
          kind: r.kind,
          color,
          bend: r.bend,
          edgeIds: r.edgeIds,
          redirected: r.redirected,
          conflict,
          dim: (!!sel && !touches) || out(r.source) || out(r.target),
          focus: touches,
        },
      };
    });
  }, [doc, index, routed, conflicts, focusSet, selectedId, fres, vis]);

  // Kompenzace zoomu – strop proti překrývání projektů v Přehledu (pozice se neposouvají).
  const scaleLevel: LodLevel = autoDetail ? level : lodLevel(rf.getZoom());
  // Strop proti překrývání viditelných uzlů (pozice se neposouvají). Počítá se až po
  // vykreslení – React Flow má pak aktuální rozměry (v Přehledu mají projekty vyšší písmo).
  // Přepočet při změně dat, úrovně nebo rozměrů, ne při každém pohybu při tažení.
  const [measureTick, setMeasureTick] = useState(0);
  const [projectCap, setProjectCap] = useState<{ node: number; projectFor: (fn: number) => number }>(() => ({
    node: Infinity,
    projectFor: () => Infinity,
  }));
  useEffect(() => {
    if (!scaleNodes || !doc || !vis || scaleLevel === 'full') {
      setProjectCap({ node: Infinity, projectFor: () => Infinity });
      return;
    }
    const rects: KindRect[] = [];
    for (const id of vis.visible) {
      const n = doc.nodes[id];
      if (!n) continue;
      const internal = rf.getInternalNode(id);
      // Vykreslený uzel: skutečné rozměry z DOM (bez CSS scale); mimo záběr poslední známé.
      const el = wrapRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
      const size = NODE_SIZE[n.type];
      const w = el?.offsetWidth || internal?.measured.width || size.w;
      const h = el?.offsetHeight || internal?.measured.height || size.h;
      const p = n.position;
      rects.push({ cx: p.x + w / 2, cy: p.y + h / 2, w, h, kind: n.type === 'project' ? 'project' : 'node' });
    }
    // Mezera v souřadnicích plochy: v Přehledu větší (při zoomu 0,1 ≈ 6 px na obrazovce).
    setProjectCap(overlapCaps(rects, scaleLevel === 'overview' ? 60 : 16));
  }, [scaleNodes, doc, vis, scaleLevel, measureTick, rf]);
  const capRef = useRef(projectCap);
  capRef.current = projectCap;

  /** Faktory zvětšení pro zoom (kvantované po 0,1 – mění se jen při změně kroku). */
  const scaleFor = useCallback((zoom: number, lvl: LodLevel): NodeScale => {
    const ui = useUiStore.getState();
    if (!ui.scaleNodes) return { project: 1, node: 1 };
    // Bez automatického detailu se úroveň pro zvětšení řídí jen zoomem.
    const l = ui.autoDetail ? lvl : lodLevel(zoom);
    const caps = capRef.current;
    const f = nodeScaleFactors(zoom, l, { overviewText: ui.autoDetail && l === 'overview', nodeCap: caps.node });
    return { node: f.node, project: Math.max(1, Math.min(f.project, caps.projectFor(f.node))) };
  }, []);

  // Úroveň detailu a zvětšení: přepočet jen při překročení prahu / kroku (ne při každém posunu).
  const onMove: OnMove = useCallback(
    (_e, vp) => {
      const ui = useUiStore.getState();
      const next = lodLevel(vp.zoom, ui.lodLevel);
      const s = scaleFor(vp.zoom, next);
      const patch: { lodLevel?: LodLevel; nodeScale?: NodeScale } = {};
      if (next !== ui.lodLevel) patch.lodLevel = next;
      if (s.project !== ui.nodeScale.project || s.node !== ui.nodeScale.node) patch.nodeScale = s;
      if (patch.lodLevel || patch.nodeScale) ui.set(patch);
    },
    [scaleFor],
  );
  useEffect(() => {
    const ui = useUiStore.getState();
    const s = scaleFor(rf.getZoom(), ui.lodLevel);
    if (s.project !== ui.nodeScale.project || s.node !== ui.nodeScale.node) ui.set({ nodeScale: s });
  }, [scaleFor, rf, projectCap, scaleNodes, autoDetail, level]);
  useEffect(() => {
    const t = setTimeout(() => {
      const ui = useUiStore.getState();
      ui.set({ lodLevel: lodLevel(rf.getZoom()) });
    }, 0);
    return () => clearTimeout(t);
  }, [rf]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const relevant = changes.filter((c) => c.type === 'position' || c.type === 'dimensions');
    if (changes.some((c) => c.type === 'dimensions')) setMeasureTick((t) => t + 1);
    if (relevant.length) setNodes((ns) => applyNodeChanges(relevant, ns));
  }, []);

  const onNodeDragStop = useCallback((_e: unknown, _n: FlowNode, dragged: FlowNode[]) => {
    const positions: Record<string, Position> = {};
    for (const n of dragged) positions[n.id] = { x: n.position.x, y: n.position.y };
    commitPositions(positions);
  }, []);

  const onNodeClick: NodeMouseHandler<FlowNode> = useCallback((e, node) => {
    if (handlePickTarget(node.id, e.clientX, e.clientY)) return;
    const ui = useUiStore.getState();
    ui.select(node.id, true);
    if (isMobileNow()) ui.focusNode(node.id);
  }, []);

  const onNodeDoubleClick: NodeMouseHandler<FlowNode> = useCallback((_e, node) => {
    useUiStore.getState().select(node.id, true);
    useUiStore.getState().set({ notesFor: node.id });
  }, []);

  const onPaneClick = useCallback(() => {
    const ui = useUiStore.getState();
    if (ui.contextMenu) ui.set({ contextMenu: null });
    else if (ui.selectedEdge) ui.set({ selectedEdge: null, edgeMenu: null });
    else if (!ui.linkPick) ui.select(null);
  }, []);

  const onEdgeClick: EdgeMouseHandler<Edge> = useCallback((e, edge) => {
    const ui = useUiStore.getState();
    const data = edge.data as FloatingEdgeType['data'];
    if (ui.linkPick || !data) return;
    ui.set({
      selectedEdge: edge.id,
      contextMenu: null,
      edgeMenu: { x: e.clientX, y: e.clientY, routedId: edge.id, edgeIds: data.edgeIds },
    });
  }, []);

  // --- kontextová nabídka (pravé tlačítko / dlouhé podržení) ---
  const suppressNativeMenuUntil = useRef(0);
  const openMenu = useCallback(
    (x: number, y: number, nodeId: string | null) => {
      const ui = useUiStore.getState();
      if (nodeId) ui.select(nodeId, false);
      ui.set({
        contextMenu: { x, y, nodeId, flowPos: nodeId ? undefined : rf.screenToFlowPosition({ x, y }) },
      });
    },
    [rf],
  );

  const onNodeContextMenu: NodeMouseHandler<FlowNode> = useCallback(
    (e, node) => {
      e.preventDefault();
      if (Date.now() < suppressNativeMenuUntil.current) return;
      openMenu(e.clientX, e.clientY, node.id);
    },
    [openMenu],
  );

  const onPaneContextMenu = useCallback(
    (e: ReactMouseEvent | MouseEvent) => {
      e.preventDefault();
      if (Date.now() < suppressNativeMenuUntil.current) return;
      openMenu(e.clientX, e.clientY, null);
    },
    [openMenu],
  );

  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    const target = e.target as Element;
    const nodeEl = target.closest('.react-flow__node');
    const onPane = target.classList.contains('react-flow__pane');
    if (!nodeEl && !onPane) return;
    const nodeId = nodeEl?.getAttribute('data-id') ?? null;
    const { clientX: x, clientY: y } = e;
    cancelPress();
    press.current = {
      x,
      y,
      timer: setTimeout(() => {
        press.current = null;
        suppressNativeMenuUntil.current = Date.now() + 900;
        navigator.vibrate?.(15);
        openMenu(x, y, nodeId);
      }, LONG_PRESS_MS),
    };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!press.current) return;
    if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) cancelPress();
  };

  // --- dvojklik na prázdnou plochu = nový projekt ---
  const onDoubleClick = (e: ReactMouseEvent) => {
    if (!(e.target as Element).classList.contains('react-flow__pane')) return;
    createProject(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  // --- střed plochy pro nově vytvářené projekty ---
  useEffect(() => {
    canvasApi.viewCenter = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
  }, [rf]);

  // --- vystředění uzlu / zobrazení všeho ---
  useEffect(() => {
    if (!focusRequest) return;
    const src = useDocStore.getState().doc?.nodes[focusRequest.id];
    if (!src) return;
    // Základní rozměry (×1): výsledek nezávisí na zvětšení uzlů ani na úrovni detailu.
    const c = nodeCenter(src);
    // Výchozí přiblížení 0,75 je nad prahem plného detailu, takže uzel bude vidět.
    const zoom = focusRequest.zoom !== undefined ? Math.max(rf.getZoom(), focusRequest.zoom) : Math.max(rf.getZoom(), 0.75);
    // Telefon: spodní panel detailu zakrývá dolní část plochy – uzel posuň do horní části.
    let dy = 0;
    if (isMobileNow() && useUiStore.getState().detailOpen) {
      const ch = wrapRef.current?.clientHeight ?? window.innerHeight;
      dy = (ch * 0.28) / zoom;
    }
    void rf.setCenter(c.x, c.y + dy, { zoom, duration: reducedMotion() ? 0 : 350 });
  }, [focusRequest, rf]);

  // Úvodní zobrazení / po otevření souboru: celá mapa podle základních rozměrů uzlů
  // (ne podle aktuálně vykreslených a zvětšených – ty závisí na zoomu).
  const viewSize = () => ({ w: wrapRef.current?.clientWidth ?? window.innerWidth, h: wrapRef.current?.clientHeight ?? window.innerHeight });
  useEffect(() => {
    if (!fitRequest) return;
    const t = setTimeout(() => {
      const d = useDocStore.getState().doc;
      if (!d) return;
      const { w, h } = viewSize();
      void rf.setViewport(fitViewport(d, w, h, { minZoom: 0.1, maxZoom: 1.2 }), { duration: reducedMotion() ? 0 : 350 });
    }, 60);
    return () => clearTimeout(t);
  }, [fitRequest, rf]);

  // „Zoom 80 %“: přesně 0,8, vystředěno na střed všech uzlů mimo koš.
  useEffect(() => {
    if (!zoomPresetRequest) return;
    const d = useDocStore.getState().doc;
    if (!d) return;
    const { w, h } = viewSize();
    void rf.setViewport(zoomPresetViewport(d, w, h), { duration: reducedMotion() ? 0 : 350 });
  }, [zoomPresetRequest, rf]);

  // Bez uloženého pohledu: úvodní zobrazení celé mapy (stejný výpočet jako po otevření souboru).
  useEffect(() => {
    if (!getSettings().viewport) useUiStore.getState().fitAll();
  }, []);

  // --- uložení viewportu ---
  const vpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMoveEnd: OnMoveEnd = useCallback((_e, vp: Viewport) => {
    if (vpTimer.current) clearTimeout(vpTimer.current);
    vpTimer.current = setTimeout(() => void updateSettings({ viewport: { x: vp.x, y: vp.y, zoom: vp.zoom } }), 400);
  }, []);

  const initialViewport = useMemo(() => getSettings().viewport ?? undefined, []);

  return (
    <div
      className={`canvas-wrap${picking ? ' picking' : ''}`}
      style={{ '--s-project': nodeScale.project, '--s-node': nodeScale.node } as CSSProperties}
      ref={wrapRef}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
    >
      <ReactFlow<FlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={cancelPress}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onMoveStart={cancelPress}
        onMove={onMove}
        onMoveEnd={onMoveEnd}
        defaultViewport={initialViewport}
        colorMode={theme}
        minZoom={0.1}
        maxZoom={2.5}
        snapToGrid
        snapGrid={SNAP}
        nodesConnectable={false}
        elementsSelectable={false}
        selectionOnDrag={false}
        panOnDrag={[0, 1]}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        {gridVisible && <Background variant={BackgroundVariant.Dots} gap={20} size={1.6} color="var(--grid-dot)" />}
        <ZoomControls />
      </ReactFlow>
      <div className="canvas-bars">
        <FilterBar />
        <LinkPickBar />
      </div>
      <LinkDragLayer />
      <EdgeMenu />
      <LinkTypeMenu />
    </div>
  );
}
