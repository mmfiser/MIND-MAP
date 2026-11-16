/**
 * Čisté funkce nad hierarchií (a obecně nad vazbami).
 * Nic nemutují – vždy vrací nová data, nebo { ok: false, reason } s českým vysvětlením.
 */
import { createEdge, nowIso } from './factory';
import { buildHierarchyIndex, childEdges, findEdge, parentEdges } from './graph';
import type { DocData, EdgeKind, MapEdge, MapNode, OpResult, Position } from './types';

const fail = (reason: string): OpResult => ({ ok: false, reason });
const ok = (data: DocData): OpResult => ({ ok: true, data });

function title(data: DocData, id: string): string {
  const t = data.nodes[id]?.title.trim();
  return t ? `„${t}“` : 'uzel bez názvu';
}

function exists(data: DocData, id: string): boolean {
  const n = data.nodes[id];
  return !!n && !n.deletedAt;
}

/**
 * Cesta, která by s novou vazbou source → target uzavřela cyklus:
 * [source, target, …, source] (po vazbách stejného druhu), jinak null.
 * Platí pro `hierarchy` a `dependency`; `related` cykly povoluje.
 * `ignoreEdgeId` – vazba, kterou při kontrole přeskočit (např. při přesunu).
 */
export function findCyclePath(
  data: DocData,
  kind: EdgeKind,
  source: string,
  target: string,
  ignoreEdgeId?: string,
): string[] | null {
  if (kind === 'related') return null;
  if (source === target) return [source, source];
  const out = new Map<string, string[]>();
  for (const e of Object.values(data.edges)) {
    if (e.kind !== kind || e.id === ignoreEdgeId) continue;
    // Vazby uzlů v koši jsou neaktivní.
    if (!exists(data, e.source) || !exists(data, e.target)) continue;
    let l = out.get(e.source);
    if (!l) out.set(e.source, (l = []));
    l.push(e.target);
  }
  // Hledání do šířky z `target` do `source` – nejkratší cesta pro srozumitelnou hlášku.
  const prev = new Map<string, string>();
  const seen = new Set<string>([target]);
  const queue = [target];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const next of out.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (next === source) {
        const path = [source];
        let p: string | undefined = source;
        while (p !== target) {
          p = prev.get(p!)!;
          path.push(p);
        }
        path.reverse(); // target … source
        return [source, ...path];
      }
      queue.push(next);
    }
  }
  return null;
}

/** Vznikl by přidáním vazby source → target cyklus? */
export function wouldCreateCycle(
  data: DocData,
  kind: EdgeKind,
  source: string,
  target: string,
  ignoreEdgeId?: string,
): boolean {
  return findCyclePath(data, kind, source, target, ignoreEdgeId) !== null;
}

const MAX_PATH_NAMES = 6;

/** Česky popsaný cyklus s názvy uzlů: „A“ → „B“ → „A“. */
export function describeCycle(data: DocData, kind: EdgeKind, path: string[]): string {
  if (path.length === 2 && path[0] === path[1]) {
    return `Uzel ${title(data, path[0]!)} nemůže být propojen sám se sebou.`;
  }
  let names = path.map((id) => title(data, id));
  if (names.length > MAX_PATH_NAMES) names = [...names.slice(0, MAX_PATH_NAMES - 2), '…', names[names.length - 1]!];
  const chain = names.join(' → ');
  return kind === 'dependency'
    ? `Vazbu nelze vytvořit: úkoly by na sebe čekaly v kruhu (${chain}).`
    : `Vazbu nelze vytvořit: vznikl by cyklus v hierarchii (${chain}).`;
}

function cycleReason(data: DocData, parentId: string, childId: string, ignoreEdgeId?: string): string {
  if (parentId === childId) return `Uzel ${title(data, childId)} nemůže být nadřazený sám sobě.`;
  const path = findCyclePath(data, 'hierarchy', parentId, childId, ignoreEdgeId);
  return path ? describeCycle(data, 'hierarchy', path) : 'Vznikl by cyklus.';
}

export const MILESTONE_NO_CHILDREN =
  'Milník nemůže mít poduzly. Další úkoly na něj navažte závislostí nebo souvislostí.';

/** Smí být uzel rodičem v hierarchii? (milník ne) */
export function parentRuleViolation(data: DocData, parentId: string): string | null {
  return data.nodes[parentId]?.type === 'milestone' ? MILESTONE_NO_CHILDREN : null;
}

function nextOrder(data: DocData, parentId: string): number {
  const kids = childEdges(data, parentId);
  return kids.length ? Math.max(...kids.map((e) => e.order)) + 1 : 0;
}

function withEdge(data: DocData, edge: MapEdge): DocData {
  return { nodes: data.nodes, edges: { ...data.edges, [edge.id]: edge } };
}

function withoutEdges(data: DocData, ids: Iterable<string>): DocData {
  const edges = { ...data.edges };
  for (const id of ids) delete edges[id];
  return { nodes: data.nodes, edges };
}

/** Přidá samostatný uzel (bez vazeb). */
export function addNode(data: DocData, node: MapNode): DocData {
  return { nodes: { ...data.nodes, [node.id]: node }, edges: data.edges };
}

/** Přidá nový uzel jako poslední dítě rodiče. */
export function addChild(data: DocData, parentId: string, node: MapNode): OpResult {
  if (!exists(data, parentId)) return fail('Nadřazený uzel neexistuje.');
  const rule = parentRuleViolation(data, parentId);
  if (rule) return fail(rule);
  const withNode = addNode(data, node);
  return ok(withEdge(withNode, createEdge('hierarchy', parentId, node.id, nextOrder(data, parentId))));
}

/**
 * Přidá sourozence za uzel `siblingId` (pod jeho nejstaršího rodiče).
 * Pokud uzel rodiče nemá, přidá nový volný uzel.
 */
export function addSibling(data: DocData, siblingId: string, node: MapNode): OpResult {
  if (!exists(data, siblingId)) return fail('Uzel neexistuje.');
  const parentEdge = parentEdges(data, siblingId)[0];
  if (!parentEdge) return ok(addNode(data, node));
  const parentId = parentEdge.source;
  const kids = childEdges(data, parentId);
  const order = parentEdge.order + 1;
  const edges = { ...data.edges };
  // Posuň následující sourozence o jedno místo.
  for (const e of kids) {
    if (e.order >= order) edges[e.id] = { ...e, order: e.order + 1 };
  }
  const edge = createEdge('hierarchy', parentId, node.id, order);
  edges[edge.id] = edge;
  return ok({ nodes: { ...data.nodes, [node.id]: node }, edges });
}

/** Přidá uzlu dalšího rodiče (vznikne sdílený uzel). */
export function addParent(data: DocData, childId: string, parentId: string): OpResult {
  if (!exists(data, childId) || !exists(data, parentId)) return fail('Uzel neexistuje.');
  const rule = parentRuleViolation(data, parentId);
  if (rule) return fail(rule);
  if (findEdge(data, 'hierarchy', parentId, childId)) {
    return fail(`${title(data, parentId)} už je nadřazeným uzlem ${title(data, childId)}.`);
  }
  if (wouldCreateCycle(data, 'hierarchy', parentId, childId)) {
    return fail(cycleReason(data, parentId, childId));
  }
  return ok(withEdge(data, createEdge('hierarchy', parentId, childId, nextOrder(data, parentId))));
}

/**
 * Odpojí uzel od jednoho rodiče. Po odpojení od posledního rodiče
 * zůstane uzel (i s větví) volně na ploše.
 */
export function detachFromParent(data: DocData, childId: string, parentId: string): OpResult {
  const edge = findEdge(data, 'hierarchy', parentId, childId);
  if (!edge) return fail('Uzel pod tímto rodičem není.');
  return ok(withoutEdges(data, [edge.id]));
}

/**
 * Přesune uzel (s celou větví) pod jiného rodiče.
 * `fromParentId` – od kterého rodiče se uzel odpojí (null = uzel byl volný,
 * jen se připojí). U sdíleného uzlu ostatní rodiče zůstanou.
 */
export function moveBranch(
  data: DocData,
  nodeId: string,
  fromParentId: string | null,
  toParentId: string,
): OpResult {
  if (!exists(data, nodeId) || !exists(data, toParentId)) return fail('Uzel neexistuje.');
  if (fromParentId === toParentId) return ok(data);
  const rule = parentRuleViolation(data, toParentId);
  if (rule) return fail(rule);
  let oldEdge: MapEdge | undefined;
  if (fromParentId) {
    oldEdge = findEdge(data, 'hierarchy', fromParentId, nodeId);
    if (!oldEdge) return fail('Uzel pod původním rodičem není.');
  }
  if (wouldCreateCycle(data, 'hierarchy', toParentId, nodeId, oldEdge?.id)) {
    return fail(cycleReason(data, toParentId, nodeId, oldEdge?.id));
  }
  let next = oldEdge ? withoutEdges(data, [oldEdge.id]) : data;
  // Pokud už je pod cílovým rodičem (sdílený uzel), stačí odpojit od původního.
  if (findEdge(next, 'hierarchy', toParentId, nodeId)) return ok(next);
  next = withEdge(next, createEdge('hierarchy', toParentId, nodeId, nextOrder(next, toParentId)));
  return ok(next);
}

/**
 * Množina uzlů, které smazání větve odstraní: kořen + potomci, jejichž
 * všichni rodiče leží uvnitř mazané větve. Sdílený uzel s rodičem mimo
 * větev přežije (jen ztratí vazbu do větve).
 */
export function branchNodesToDelete(data: DocData, rootId: string): Set<string> {
  const idx = buildHierarchyIndex(data);
  const del = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...del]) {
      for (const e of idx.children.get(id) ?? []) {
        const c = e.target;
        if (del.has(c)) continue;
        const parents = idx.parents.get(c) ?? [];
        if (parents.every((p) => del.has(p.source))) {
          del.add(c);
          changed = true;
        }
      }
    }
  }
  return del;
}

/** Trvale smaže větev (bez koše). Odstraní i všechny vazby smazaných uzlů. */
export function deleteBranch(data: DocData, rootId: string): OpResult {
  if (!data.nodes[rootId]) return fail('Uzel neexistuje.');
  const del = branchNodesToDelete(data, rootId);
  const nodes = { ...data.nodes };
  for (const id of del) delete nodes[id];
  const edges: Record<string, MapEdge> = {};
  for (const e of Object.values(data.edges)) {
    if (!del.has(e.source) && !del.has(e.target)) edges[e.id] = e;
  }
  return ok({ nodes, edges });
}

/** Nastaví stav uzlu (Hotovo, Znovu otevřít = Probíhá…). */
export function setStatus(data: DocData, id: string, status: MapNode['status']): OpResult {
  const n = data.nodes[id];
  if (!n) return fail('Uzel neexistuje.');
  if (n.status === status) return ok(data);
  return updateNode(data, id, { status });
}

/** Změní pole uzlu (kromě id). */
export function updateNode(
  data: DocData,
  id: string,
  patch: Partial<Omit<MapNode, 'id'>>,
): OpResult {
  const n = data.nodes[id];
  if (!n) return fail('Uzel neexistuje.');
  return ok({
    nodes: { ...data.nodes, [id]: { ...n, ...patch, updatedAt: nowIso() } },
    edges: data.edges,
  });
}

/** Nastaví pozice více uzlů najednou (konec tažení). */
export function setPositions(data: DocData, positions: Record<string, Position>): DocData {
  const nodes = { ...data.nodes };
  let changed = false;
  for (const [id, pos] of Object.entries(positions)) {
    const n = nodes[id];
    if (!n || (n.position.x === pos.x && n.position.y === pos.y)) continue;
    nodes[id] = { ...n, position: { x: pos.x, y: pos.y } };
    changed = true;
  }
  return changed ? { nodes, edges: data.edges } : data;
}

/**
 * Posune uzel a jeho větev o (dx, dy). Sdílené potomky, kteří mají
 * rodiče i mimo větev, nechá na místě.
 */
export function translateBranch(data: DocData, rootId: string, dx: number, dy: number): DocData {
  if (!dx && !dy) return data;
  const branch = branchNodesToDelete(data, rootId);
  const positions: Record<string, Position> = {};
  for (const id of branch) {
    const n = data.nodes[id];
    if (n) positions[id] = { x: n.position.x + dx, y: n.position.y + dy };
  }
  return setPositions(data, positions);
}
