import {
  Background,
  BackgroundVariant,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type NodeChange,
  type NodeMouseHandler,
  type OnMoveEnd,
  type Viewport,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { GRID, canvasApi, commitPositions, createProject } from '../../app/actions';
import { getSettings, updateSettings } from '../../app/session';
import { buildHierarchyIndex, owningProject } from '../../model/graph';
import { colorHex, contrastText } from '../../model/labels';
import type { MapNode, Position } from '../../model/types';
import { isMobileNow } from '../../hooks/useIsMobile';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { FloatingEdge, type FloatingEdgeType } from './FloatingEdge';
import { MapNodeView, type FlowNode } from './MapNodeView';
import { ZoomControls } from './ZoomControls';

const nodeTypes = { mm: MapNodeView };
const edgeTypes = { floating: FloatingEdge };
const SNAP: [number, number] = [GRID, GRID];
const LONG_PRESS_MS = 550;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface CacheEntry {
  src: MapNode;
  shared: boolean;
  selected: boolean;
  node: FlowNode;
}

function toFlowNode(n: MapNode, shared: boolean, selected: boolean, prev?: FlowNode): FlowNode {
  const fill = n.type === 'project' ? colorHex(n.color) : undefined;
  return {
    id: n.id,
    type: 'mm',
    position: n.position,
    selected,
    draggable: !n.positionLocked,
    data: {
      title: n.title,
      kind: n.type,
      fill,
      textColor: fill ? contrastText(fill) : undefined,
      shared,
      borderColor: n.borderColor,
      hasNotes: n.notes.trim().length > 0,
    },
    ...(prev?.measured ? { measured: prev.measured } : {}),
  };
}

export function Canvas() {
  const doc = useDocStore((s) => s.doc);
  const selectedId = useUiStore((s) => s.selectedId);
  const gridVisible = useUiStore((s) => s.gridVisible);
  const theme = useUiStore((s) => s.theme);
  const focusRequest = useUiStore((s) => s.focusRequest);
  const fitRequest = useUiStore((s) => s.fitRequest);
  const rf = useReactFlow<FlowNode, Edge>();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const cache = useRef(new Map<string, CacheEntry>());

  const index = useMemo(() => (doc ? buildHierarchyIndex(doc) : null), [doc?.nodes, doc?.edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronizace dokument → uzly React Flow (nezměněné uzly si drží identitu).
  useEffect(() => {
    if (!doc || !index) {
      setNodes([]);
      return;
    }
    setNodes((prevNodes) => {
      const prevById = new Map(prevNodes.map((n) => [n.id, n]));
      const nextCache = new Map<string, CacheEntry>();
      const out: FlowNode[] = [];
      for (const n of Object.values(doc.nodes)) {
        if (n.deletedAt) continue;
        const shared = (index.parents.get(n.id)?.length ?? 0) > 1;
        const selected = n.id === selectedId;
        const c = cache.current.get(n.id);
        const prev = prevById.get(n.id);
        let node: FlowNode;
        if (c && prev && c.src === n && c.shared === shared && c.selected === selected && prev.position === n.position) {
          node = prev;
        } else {
          node = toFlowNode(n, shared, selected, prev);
        }
        nextCache.set(n.id, { src: n, shared, selected, node });
        out.push(node);
      }
      cache.current = nextCache;
      return out;
    });
  }, [doc, index, selectedId]);

  const edges = useMemo<FloatingEdgeType[]>(() => {
    if (!doc || !index) return [];
    const colorOf = new Map<string, string>();
    const out: FloatingEdgeType[] = [];
    for (const list of index.children.values()) {
      for (const e of list) {
        let color = colorOf.get(e.source);
        if (!color) {
          const p = owningProject(doc, e.source, index);
          color = p ? colorHex(p.color) : 'var(--border-strong)';
          colorOf.set(e.source, color);
        }
        out.push({
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'floating',
          // Skryté handly zůstávají kvůli React Flow; místo uchycení počítá FloatingEdge.
          sourceHandle: 'r',
          targetHandle: 'l',
          data: { kind: e.kind },
          selectable: false,
          focusable: false,
          style: { stroke: color, strokeWidth: 2.25 },
        });
      }
    }
    return out;
  }, [doc, index]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    const relevant = changes.filter((c) => c.type === 'position' || c.type === 'dimensions');
    if (relevant.length) setNodes((ns) => applyNodeChanges(relevant, ns));
  }, []);

  const onNodeDragStop = useCallback((_e: unknown, _n: FlowNode, dragged: FlowNode[]) => {
    const positions: Record<string, Position> = {};
    for (const n of dragged) positions[n.id] = { x: n.position.x, y: n.position.y };
    commitPositions(positions);
  }, []);

  const onNodeClick: NodeMouseHandler<FlowNode> = useCallback((_e, node) => {
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
    else ui.select(null);
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
    const n = rf.getInternalNode(focusRequest.id);
    const src = useDocStore.getState().doc?.nodes[focusRequest.id];
    if (!n && !src) return;
    const pos = n?.internals.positionAbsolute ?? src!.position;
    const w = n?.measured.width ?? 180;
    const h = n?.measured.height ?? 44;
    const zoom = Math.max(rf.getZoom(), 0.75);
    // Telefon: spodní panel detailu zakrývá dolní část plochy – uzel posuň do horní části.
    let dy = 0;
    if (isMobileNow() && useUiStore.getState().detailOpen) {
      const ch = wrapRef.current?.clientHeight ?? window.innerHeight;
      dy = (ch * 0.28) / zoom;
    }
    void rf.setCenter(pos.x + w / 2, pos.y + h / 2 + dy, { zoom, duration: reducedMotion() ? 0 : 350 });
  }, [focusRequest, rf]);

  useEffect(() => {
    if (!fitRequest) return;
    // počkej na vykreslení (např. po otevření souboru)
    const t = setTimeout(() => void rf.fitView({ padding: 0.2, maxZoom: 1.2, duration: reducedMotion() ? 0 : 350 }), 60);
    return () => clearTimeout(t);
  }, [fitRequest, rf]);

  // --- uložení viewportu ---
  const vpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMoveEnd: OnMoveEnd = useCallback((_e, vp: Viewport) => {
    if (vpTimer.current) clearTimeout(vpTimer.current);
    vpTimer.current = setTimeout(() => void updateSettings({ viewport: { x: vp.x, y: vp.y, zoom: vp.zoom } }), 400);
  }, []);

  const initialViewport = useMemo(() => getSettings().viewport ?? undefined, []);

  return (
    <div
      className="canvas-wrap"
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
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onMoveStart={cancelPress}
        onMoveEnd={onMoveEnd}
        defaultViewport={initialViewport}
        fitView={!initialViewport}
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
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
    </div>
  );
}
