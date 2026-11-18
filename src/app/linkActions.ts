/**
 * Fáze 3: akce nad vazbami, milníky a sbalováním. Logiku dělají čisté funkce v model/.
 */
import { listNames } from '../model/blocking';
import { conflictKey, findDateConflicts } from '../model/conflicts';
import { conflictToast } from '../model/messages';
import { createNode } from '../model/factory';
import { buildHierarchyIndex, childEdges, parentEdges } from '../model/graph';
import * as H from '../model/hierarchy';
import * as L from '../model/links';
import type { DocData, EdgeKind, MapEdge, MapNode, NodeType } from '../model/types';
import { minZoomForDepth, nodeDepth } from '../model/lod';
import { collapseAllToProjects, collapsedAncestors, expandAll, setCollapsed } from '../model/visibility';
import { toast, useUiStore } from '../store/uiStore';
import { NODE_SIZE, canvasApi, data, run } from './actions';

export const nodeName = (d: DocData | null, id: string): string => `„${d?.nodes[id]?.title.trim() || 'bez názvu'}“`;

/**
 * Po změně porovná kolize termínů a ohlásí ty nové, kterých se účastní `ids`
 * (bez „termín před začátkem“ – to hlásí setDateOf). Vrací text pro oznámení.
 */
export function newConflictMessage(before: DocData, after: DocData, ids: string[]): string | null {
  const old = new Set(findDateConflicts(before).list.map(conflictKey));
  const fresh = findDateConflicts(after).list.filter(
    (c) => c.kind !== 'dueBeforeStart' && !old.has(conflictKey(c)) && (ids.includes(c.nodeId) || (c.otherId && ids.includes(c.otherId))),
  );
  if (!fresh.length) return null;
  const today = useUiStore.getState().today;
  // Změna termínu jednoho uzlu: „Termín koliduje s: „A“. <popis z pohledu uzlu>“
  if (ids.length === 1) return conflictToast(after, fresh, ids[0]!, today);
  // Nová / změněná vazba: z pohledu blokovaného uzlu / poduzlu.
  const byNode = new Map<string, typeof fresh>();
  for (const c of fresh) byNode.set(c.nodeId, [...(byNode.get(c.nodeId) ?? []), c]);
  return [...byNode].map(([id, list]) => conflictToast(after, list, id, today, true)).join(' ');
}

/** Provede operaci a ohlásí nově vzniklé kolize termínů. */
function runChecked(op: Parameters<typeof run>[0], ids: string[]): boolean {
  const before = data();
  const ok = run(op);
  const after = data();
  if (ok && before && after) {
    const msg = newConflictMessage(before, after, ids);
    if (msg) toast(msg, 'info');
  }
  return ok;
}

// ---------- vytváření a úprava vazeb ----------

export function createLink(kind: EdgeKind, source: string, target: string): boolean {
  return runChecked((x) => L.addLink(x, kind, source, target), [source, target]);
}

export function removeLinkById(edgeId: string): void {
  const d = data();
  const e = d?.edges[edgeId];
  if (!d || !e) return;
  const lastParent = e.kind === 'hierarchy' && parentEdges(d, e.target).length === 1;
  if (run((x) => L.removeLink(x, edgeId))) {
    clearEdgeSelection();
    toast(lastParent ? 'Vazba odstraněna, uzel zůstal volně na ploše.' : 'Vazba odstraněna.', 'success');
  }
}

export function reverseLink(edgeId: string): void {
  const e = data()?.edges[edgeId];
  if (e) runChecked((x) => L.reverseDependency(x, edgeId), [e.source, e.target]);
}

export function changeLinkKind(edgeId: string, kind: 'dependency' | 'related', reverse = false): void {
  const e = data()?.edges[edgeId];
  if (e) runChecked((x) => L.changeLinkKind(x, edgeId, kind, reverse), [e.source, e.target]);
}

export function reconnect(edgeId: string, end: 'source' | 'target', nodeId: string): boolean {
  const e = data()?.edges[edgeId];
  if (!e) return false;
  if ((end === 'source' ? e.source : e.target) === nodeId) return true;
  return runChecked((x) => L.reconnectLink(x, edgeId, end, nodeId), [e.source, e.target, nodeId]);
}

export function clearEdgeSelection(): void {
  useUiStore.getState().set({ selectedEdge: null, edgeMenu: null });
}

/** Režim „Klepněte na cílový uzel“ (tlačítko Propojit). */
export function startLinkPick(sourceId: string | null): void {
  if (!sourceId || !data()?.nodes[sourceId]) {
    toast('Nejdřív vyberte uzel, ze kterého vazba povede.', 'info');
    return;
  }
  useUiStore.getState().set({ linkPick: { mode: 'create', sourceId }, contextMenu: null, edgeMenu: null });
}

export function startReconnectPick(edgeId: string, end: 'source' | 'target'): void {
  useUiStore.getState().set({ linkPick: { mode: 'reconnect', edgeId, end }, edgeMenu: null });
}

export function cancelLinkPick(): void {
  useUiStore.getState().set({ linkPick: null });
}

/** Klepnutí na uzel v režimu výběru cíle. Vrací true, pokud se klepnutí zpracovalo. */
export function handlePickTarget(nodeId: string, x: number, y: number): boolean {
  const ui = useUiStore.getState();
  const pick = ui.linkPick;
  if (!pick) return false;
  if (pick.mode === 'create') {
    if (nodeId === pick.sourceId) {
      toast('Klepněte na jiný uzel, než ze kterého vazba vede.', 'info');
      return true;
    }
    ui.set({ linkPick: null, linkTypeMenu: { x, y, source: pick.sourceId, target: nodeId } });
    return true;
  }
  ui.set({ linkPick: null });
  reconnect(pick.edgeId, pick.end, nodeId);
  return true;
}

// ---------- popisy vazeb ----------

export function describeEdge(d: DocData, e: MapEdge): string {
  const s = nodeName(d, e.source);
  const t = nodeName(d, e.target);
  if (e.kind === 'hierarchy') return `${s} → ${t} (poduzel)`;
  if (e.kind === 'dependency') return `${s} blokuje ${t}`;
  return `${s} – ${t} (souvislost)`;
}

// ---------- sbalování ----------

function hasChildren(d: DocData, id: string): boolean {
  return childEdges(d, id).length > 0;
}

export function toggleCollapse(id: string | null): void {
  const d = data();
  const n = id ? d?.nodes[id] : undefined;
  if (!d || !n || !id) return;
  if (!n.collapsed && !hasChildren(d, id)) {
    toast('Uzel nemá žádné poduzly ke sbalení.', 'info');
    return;
  }
  run((x) => setCollapsed(x, [id], !n.collapsed));
}

export function collapseAll(): void {
  const d = data();
  if (!d) return;
  if (!run((x) => collapseAllToProjects(x))) return;
  if (data() === d || data()?.nodes === d.nodes) toast('Žádný projekt nemá co sbalit.', 'info');
}

export function expandEverything(): void {
  run((x) => expandAll(x));
}

/** Rozbalí sbalené předky, aby byl uzel vidět (výběr z rejstříku, z detailu…). */
export function revealNode(id: string): void {
  const d = data();
  if (!d) return;
  const ids = collapsedAncestors(d, id, buildHierarchyIndex(d));
  if (ids.length) run((x) => setCollapsed(x, ids, false));
}

/** „+N“ u uzlu omezeného oddálením: přiblíží tak, aby byly vidět jeho poduzly. */
export function zoomIntoNode(id: string): void {
  const d = data();
  if (!d) return;
  useUiStore.getState().focusNode(id, minZoomForDepth(nodeDepth(d, id) + 1));
}

/** Vybere uzel, případně rozbalí jeho předky a vystředí ho. */
export function goToNode(id: string, openDetail = true): void {
  revealNode(id);
  const ui = useUiStore.getState();
  ui.select(id, openDetail);
  ui.focusNode(id);
}

// ---------- milníky ----------

const snap = (v: number) => Math.round(v / 10) * 10;

function placeNear(d: DocData, parentId: string | null): { x: number; y: number } {
  if (!parentId) {
    const c = canvasApi.viewCenter();
    return { x: snap(c.x - NODE_SIZE.milestone.w / 2), y: snap(c.y - NODE_SIZE.milestone.h / 2) };
  }
  const p = d.nodes[parentId]!;
  const kids = childEdges(d, parentId)
    .map((e) => d.nodes[e.target])
    .filter((k): k is MapNode => !!k && !k.deletedAt);
  if (!kids.length) return { x: snap(p.position.x + NODE_SIZE[p.type].w + 70), y: snap(p.position.y) };
  const lowest = Math.max(...kids.map((k) => k.position.y + NODE_SIZE[k.type].h));
  return { x: snap(Math.min(...kids.map((k) => k.position.x))), y: snap(lowest + 16) };
}

function afterCreate(id: string): void {
  const ui = useUiStore.getState();
  ui.select(id, true);
  ui.set({ editTitleRequest: Date.now() });
  ui.focusNode(id);
}

/**
 * Nový milník. `mode`: child = poduzel `refId`, sibling = sourozenec `refId`,
 * auto = podle výběru (projekt/úkol → poduzel, milník → sourozenec, nic → volně uprostřed).
 */
export function addMilestone(refId: string | null, mode: 'child' | 'sibling' | 'auto' = 'auto'): void {
  const d = data();
  if (!d) return;
  const ref = refId ? d.nodes[refId] : undefined;
  let m = mode;
  if (m === 'auto') m = !ref ? 'child' : ref.type === 'milestone' ? 'sibling' : 'child';
  if (!ref) {
    const node = createNode({ type: 'milestone', title: 'Nový milník', position: placeNear(d, null) });
    if (run((x) => H.addNode(x, node))) afterCreate(node.id);
    return;
  }
  if (m === 'child') {
    if (ref.type === 'milestone') {
      toast(H.MILESTONE_NO_CHILDREN, 'error');
      return;
    }
    const node = createNode({ type: 'milestone', title: 'Nový milník', position: placeNear(d, ref.id) });
    if (run((x) => H.addChild(x, ref.id, node))) {
      if (ref.collapsed) run((x) => setCollapsed(x, [ref.id], false));
      afterCreate(node.id);
    }
    return;
  }
  const parent = parentEdges(d, ref.id)[0]?.source ?? null;
  const pos = parent
    ? placeNear(d, parent)
    : { x: ref.position.x, y: snap(ref.position.y + NODE_SIZE[ref.type].h + 60) };
  const node = createNode({ type: 'milestone', title: 'Nový milník', position: pos });
  if (run((x) => H.addSibling(x, ref.id, node))) afterCreate(node.id);
}

/** Text zámku: na čem uzel čeká. */
export function blockedText(blockers: MapNode[]): string {
  return `Čeká na: ${listNames(blockers, 5)}.`;
}

export type { NodeType };
