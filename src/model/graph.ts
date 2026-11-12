import type { DocData, EdgeKind, MapEdge, MapNode } from './types';

/** Řazení rodičovských vazeb: nejstarší první (createdAt, pak id) – deterministické. */
export function compareByAge(a: MapEdge, b: MapEdge): number {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Řazení sourozenců: podle order, pak podle stáří vazby. */
export function compareByOrder(a: MapEdge, b: MapEdge): number {
  if (a.order !== b.order) return a.order - b.order;
  return compareByAge(a, b);
}

export interface HierarchyIndex {
  /** dítě → rodičovské vazby (nejstarší první) */
  parents: Map<string, MapEdge[]>;
  /** rodič → vazby na děti (podle pořadí) */
  children: Map<string, MapEdge[]>;
}

function isLive(data: DocData, id: string): boolean {
  const n = data.nodes[id];
  return !!n && !n.deletedAt;
}

/** Index hierarchických vazeb mezi živými uzly (uzly v koši se ignorují). */
export function buildHierarchyIndex(data: DocData): HierarchyIndex {
  const parents = new Map<string, MapEdge[]>();
  const children = new Map<string, MapEdge[]>();
  for (const e of Object.values(data.edges)) {
    if (e.kind !== 'hierarchy') continue;
    if (!isLive(data, e.source) || !isLive(data, e.target)) continue;
    let p = parents.get(e.target);
    if (!p) parents.set(e.target, (p = []));
    p.push(e);
    let c = children.get(e.source);
    if (!c) children.set(e.source, (c = []));
    c.push(e);
  }
  for (const list of parents.values()) list.sort(compareByAge);
  for (const list of children.values()) list.sort(compareByOrder);
  return { parents, children };
}

export function parentEdges(data: DocData, childId: string, kind: EdgeKind = 'hierarchy'): MapEdge[] {
  return Object.values(data.edges)
    .filter((e) => e.kind === kind && e.target === childId && isLive(data, e.source))
    .sort(compareByAge);
}

export function childEdges(data: DocData, parentId: string, kind: EdgeKind = 'hierarchy'): MapEdge[] {
  return Object.values(data.edges)
    .filter((e) => e.kind === kind && e.source === parentId && isLive(data, e.target))
    .sort(compareByOrder);
}

export function findEdge(
  data: DocData,
  kind: EdgeKind,
  source: string,
  target: string,
): MapEdge | undefined {
  return Object.values(data.edges).find(
    (e) => e.kind === kind && e.source === source && e.target === target,
  );
}

/** Všichni potomci uzlu (bez něj samotného) přes hierarchické vazby. */
export function descendants(data: DocData, rootId: string, index?: HierarchyIndex): Set<string> {
  const idx = index ?? buildHierarchyIndex(data);
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const e of idx.children.get(id) ?? []) {
      if (!out.has(e.target) && e.target !== rootId) {
        out.add(e.target);
        stack.push(e.target);
      }
    }
  }
  return out;
}

/**
 * Projekt, ke kterému uzel patří: nejbližší předek typu `project`
 * (případně uzel sám). U sdílených uzlů se deterministicky jde
 * po nejstarší hierarchické vazbě.
 */
export function owningProject(
  data: DocData,
  nodeId: string,
  index?: HierarchyIndex,
): MapNode | undefined {
  const idx = index ?? buildHierarchyIndex(data);
  const seen = new Set<string>();
  let cur: string | undefined = nodeId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n: MapNode | undefined = data.nodes[cur];
    if (!n) return undefined;
    if (n.type === 'project') return n;
    cur = idx.parents.get(cur)?.[0]?.source;
  }
  return undefined;
}

/** Kořeny stromu = živé uzly bez rodiče. Projekty první, pak podle data vzniku. */
export function rootNodes(data: DocData, index?: HierarchyIndex): MapNode[] {
  const idx = index ?? buildHierarchyIndex(data);
  return Object.values(data.nodes)
    .filter((n) => !n.deletedAt && !idx.parents.has(n.id))
    .sort((a, b) => {
      if (a.type === 'project' && b.type !== 'project') return -1;
      if (b.type === 'project' && a.type !== 'project') return 1;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;
    });
}
