/**
 * Uživatelské akce nad uzly – sdílené lištou, kontextovou nabídkou,
 * zkratkami, rejstříkem i detailem. Logiku dělají čisté funkce v model/.
 */
import { DEFAULT_PROJECT_COLOR, PROJECT_PALETTE } from '../model/labels';
import { createNode } from '../model/factory';
import { buildHierarchyIndex, childEdges, parentEdges } from '../model/graph';
import * as H from '../model/hierarchy';
import type { DocData, MapNode, NodeType, OpResult, Position } from '../model/types';
import { useDocStore, type ApplyOptions } from '../store/docStore';
import { confirmDialog, toast, useUiStore } from '../store/uiStore';

export const GRID = 10;
export const NODE_SIZE: Record<NodeType, { w: number; h: number }> = {
  project: { w: 240, h: 76 },
  task: { w: 180, h: 44 },
  milestone: { w: 160, h: 44 },
};

/** Pomocník pro plochu – nastavuje Canvas (střed viditelné oblasti v souřadnicích plochy). */
export const canvasApi: { viewCenter: () => Position } = {
  viewCenter: () => ({ x: 0, y: 0 }),
};

const snap = (v: number) => Math.round(v / GRID) * GRID;
const snapPos = (p: Position): Position => ({ x: snap(p.x), y: snap(p.y) });

/** Posune pozici dolů, dokud se nový uzel nepřekrývá s existujícím (přibližné rozměry). */
function freeSpot(d: DocData, pos: Position, type: NodeType): Position {
  const { w, h } = NODE_SIZE[type];
  const gap = 12;
  const boxes = Object.values(d.nodes)
    .filter((n) => !n.deletedAt)
    .map((n) => ({ x: n.position.x, y: n.position.y, w: NODE_SIZE[n.type].w, h: NODE_SIZE[n.type].h }));
  const p = { ...pos };
  for (let i = 0; i < 200; i++) {
    const hit = boxes.find(
      (b) => p.x < b.x + b.w + gap && p.x + w + gap > b.x && p.y < b.y + b.h + gap && p.y + h + gap > b.y,
    );
    if (!hit) break;
    p.y = hit.y + hit.h + gap + 4;
  }
  return snapPos(p);
}

function run(op: (d: DocData) => OpResult | DocData, opts?: ApplyOptions): boolean {
  const r = useDocStore.getState().apply(op, opts);
  if (!r.ok) {
    toast(r.reason, 'error');
    return false;
  }
  return true;
}

function data(): DocData | null {
  const d = useDocStore.getState().doc;
  return d ? { nodes: d.nodes, edges: d.edges } : null;
}

function afterCreate(id: string): void {
  const ui = useUiStore.getState();
  ui.select(id, true);
  ui.set({ editTitleRequest: Date.now() });
  ui.focusNode(id);
}

/** Barva pro nový projekt – první z palety, kterou ještě žádný projekt nepoužívá. */
function nextProjectColor(d: DocData): string {
  const used = new Set(Object.values(d.nodes).filter((n) => n.type === 'project').map((n) => n.color));
  return PROJECT_PALETTE.find((c) => !used.has(c.key))?.key ?? DEFAULT_PROJECT_COLOR;
}

export function createProject(at?: Position): void {
  const d = data();
  if (!d) return;
  const c = at ?? canvasApi.viewCenter();
  const size = NODE_SIZE.project;
  const node = createNode({
    type: 'project',
    position: freeSpot(d, { x: c.x - size.w / 2, y: c.y - size.h / 2 }, 'project'),
    color: nextProjectColor(d),
  });
  if (run((x) => H.addNode(x, node))) afterCreate(node.id);
}

function childPosition(d: DocData, parentId: string): Position {
  const parent = d.nodes[parentId]!;
  const ps = NODE_SIZE[parent.type];
  const kids = childEdges(d, parentId)
    .map((e) => d.nodes[e.target])
    .filter((n): n is MapNode => !!n);
  const x = parent.position.x + ps.w + 70;
  if (!kids.length) return snapPos({ x, y: parent.position.y + (ps.h - NODE_SIZE.task.h) / 2 });
  const lowest = Math.max(...kids.map((k) => k.position.y + NODE_SIZE[k.type].h));
  const left = Math.min(...kids.map((k) => k.position.x));
  return snapPos({ x: left, y: lowest + 16 });
}

export function addChildTo(parentId: string | null): void {
  const d = data();
  if (!d || !parentId || !d.nodes[parentId]) {
    toast('Nejdřív vyberte uzel.', 'info');
    return;
  }
  const node = createNode({ type: 'task', position: freeSpot(d, childPosition(d, parentId), 'task') });
  if (run((x) => H.addChild(x, parentId, node))) afterCreate(node.id);
}

export function addSiblingTo(nodeId: string | null): void {
  const d = data();
  if (!d || !nodeId || !d.nodes[nodeId]) {
    toast('Nejdřív vyberte uzel.', 'info');
    return;
  }
  const n = d.nodes[nodeId];
  const parent = parentEdges(d, nodeId)[0];
  let node: MapNode;
  if (parent) {
    const kids = childEdges(d, parent.source)
      .map((e) => d.nodes[e.target])
      .filter((k): k is MapNode => !!k);
    const lowest = Math.max(...kids.map((k) => k.position.y + NODE_SIZE[k.type].h));
    node = createNode({ type: 'task', position: freeSpot(d, { x: n.position.x, y: lowest + 16 }, 'task') });
  } else {
    // Volný uzel / projekt: sourozenec stejného typu pod ním.
    const type: NodeType = n.type === 'project' ? 'project' : 'task';
    node = createNode({
      type,
      position: freeSpot(d, { x: n.position.x, y: n.position.y + NODE_SIZE[n.type].h + 120 }, type),
      color: type === 'project' ? nextProjectColor(d) : undefined,
    });
  }
  if (run((x) => H.addSibling(x, nodeId, node))) afterCreate(node.id);
}

export async function deleteWithConfirm(nodeId: string | null): Promise<void> {
  const d = data();
  if (!d || !nodeId || !d.nodes[nodeId]) {
    toast('Nejdřív vyberte uzel.', 'info');
    return;
  }
  const n = d.nodes[nodeId];
  const branch = H.branchNodesToDelete(d, nodeId);
  const others = branch.size - 1;
  const name = n.title.trim() || 'bez názvu';
  const msg =
    others > 0
      ? `Smaže se „${name}“ a ${others} ${others === 1 ? 'podřízený uzel' : others < 5 ? 'podřízené uzly' : 'podřízených uzlů'}. Sdílené uzly, které mají rodiče i jinde, zůstanou.`
      : `Smaže se „${name}“.`;
  const ok = await confirmDialog('Smazat?', `${msg} Akci lze vrátit tlačítkem Zpět.`, 'Smazat', true);
  if (!ok) return;
  if (run((x) => H.deleteBranch(x, nodeId))) {
    const ui = useUiStore.getState();
    if (ui.selectedId && branch.has(ui.selectedId)) ui.select(null);
  }
}

/**
 * Přesune uzel s větví pod nového rodiče. Pokud se uzel připojuje nově
 * (byl volný nebo se přesouvá od jiného rodiče), větev se posune vedle cíle.
 */
export function moveUnder(nodeId: string, fromParentId: string | null, toParentId: string): boolean {
  const d = data();
  if (!d) return false;
  if (fromParentId === toParentId) return true;
  return run((x) => {
    const r = H.moveBranch(x, nodeId, fromParentId, toParentId);
    if (!r.ok) return r;
    // Pokud má uzel po přesunu jen nového rodiče, posuň větev k němu.
    const parents = parentEdges(r.data, nodeId);
    if (parents.length === 1 && parents[0]!.source === toParentId) {
      const target = childPositionExcluding(r.data, toParentId, nodeId);
      const n = r.data.nodes[nodeId]!;
      return { ok: true, data: H.translateBranch(r.data, nodeId, target.x - n.position.x, target.y - n.position.y) };
    }
    return r;
  });
}

function childPositionExcluding(d: DocData, parentId: string, excludeId: string): Position {
  const without: DocData = {
    nodes: d.nodes,
    edges: Object.fromEntries(
      Object.entries(d.edges).filter(([, e]) => !(e.source === parentId && e.target === excludeId)),
    ),
  };
  return childPosition(without, parentId);
}

export function addParentTo(childId: string, parentId: string): boolean {
  const ok = run((x) => H.addParent(x, childId, parentId));
  if (ok) toast('Uzel je teď sdílený.', 'success');
  return ok;
}

export function detachFrom(childId: string, parentId: string): void {
  const d = data();
  if (!d) return;
  const last = parentEdges(d, childId).length === 1;
  if (run((x) => H.detachFromParent(x, childId, parentId)) && last) {
    toast('Uzel zůstal volně na ploše.', 'info');
  }
}

export function updateNodeFields(
  id: string,
  patch: Partial<Omit<MapNode, 'id'>>,
  coalesceKey?: string,
): void {
  run((x) => H.updateNode(x, id, patch), coalesceKey ? { coalesceKey } : undefined);
}

export function setNodeType(id: string, type: NodeType): void {
  const d = data();
  const n = d?.nodes[id];
  if (!d || !n || n.type === type) return;
  const patch: Partial<MapNode> = { type };
  if (type === 'project' && !n.color) patch.color = nextProjectColor(d);
  run((x) => H.updateNode(x, id, patch));
}

export function commitPositions(positions: Record<string, Position>): void {
  run((x) => H.setPositions(x, positions));
}

/** Možní cíloví rodiče pro „Přesunout pod…“ / „Přidat rodiče“ + důvod, proč nelze. */
export function parentCandidates(
  nodeId: string,
  mode: 'move' | 'addParent',
  fromParentId: string | null,
): { node: MapNode; disabledReason?: string }[] {
  const d = data();
  if (!d) return [];
  const idx = buildHierarchyIndex(d);
  const current = new Set((idx.parents.get(nodeId) ?? []).map((e) => e.source));
  const fromEdge = fromParentId
    ? (idx.parents.get(nodeId) ?? []).find((e) => e.source === fromParentId)
    : undefined;
  return Object.values(d.nodes)
    .filter((n) => !n.deletedAt && n.id !== nodeId)
    .sort((a, b) => a.title.localeCompare(b.title, 'cs'))
    .map((node) => {
      let disabledReason: string | undefined;
      if (mode === 'addParent' && current.has(node.id)) disabledReason = 'už je rodičem';
      else if (mode === 'move' && node.id === fromParentId) disabledReason = 'současný rodič';
      else if (H.wouldCreateCycle(d, 'hierarchy', node.id, nodeId, fromEdge?.id))
        disabledReason = 'vznikl by cyklus';
      return { node, disabledReason };
    });
}
