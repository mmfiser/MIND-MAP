/**
 * Vazby mezi uzly (fáze 3): hierarchie, závislost, souvislost.
 * Čisté funkce – vrací nová data, nebo { ok: false, reason } s českým vysvětlením.
 *
 *  - hierarchy: source = rodič, target = potomek; cykly zakázané
 *  - dependency: source = blokující uzel, target = blokovaný; cykly zakázané
 *  - related: bez směru a bez logiky; cykly povolené
 */
import { createEdge } from './factory';
import { childEdges, compareByAge } from './graph';
import { describeCycle, findCyclePath, parentRuleViolation } from './hierarchy';
import type { DocData, EdgeKind, MapEdge, OpResult } from './types';

const fail = (reason: string): OpResult => ({ ok: false, reason });

function live(data: DocData, id: string): boolean {
  const n = data.nodes[id];
  return !!n && !n.deletedAt;
}

function name(data: DocData, id: string): string {
  const t = data.nodes[id]?.title.trim();
  return t ? `„${t}“` : 'uzel bez názvu';
}

export const KIND_LABEL: Record<EdgeKind, string> = {
  hierarchy: 'hierarchie',
  dependency: 'závislost',
  related: 'souvislost',
};

/** Existující vazba stejného druhu mezi dvojicí (u souvislosti v obou směrech). */
export function findDuplicate(
  data: DocData,
  kind: EdgeKind,
  source: string,
  target: string,
  ignoreEdgeId?: string,
): MapEdge | undefined {
  for (const e of Object.values(data.edges)) {
    if (e.kind !== kind || e.id === ignoreEdgeId) continue;
    if (e.source === source && e.target === target) return e;
    if (kind === 'related' && e.source === target && e.target === source) return e;
  }
  return undefined;
}

/** Proč vazbu nelze vytvořit (null = lze). */
export function validateLink(
  data: DocData,
  kind: EdgeKind,
  source: string,
  target: string,
  ignoreEdgeId?: string,
): string | null {
  if (!live(data, source) || !live(data, target)) return 'Uzel neexistuje.';
  if (source === target) return `Uzel ${name(data, source)} nemůže být propojen sám se sebou.`;
  if (kind === 'hierarchy') {
    const rule = parentRuleViolation(data, source);
    if (rule) return rule;
  }
  if (findDuplicate(data, kind, source, target, ignoreEdgeId)) {
    return kind === 'hierarchy'
      ? `${name(data, source)} už je nadřazeným uzlem ${name(data, target)}.`
      : kind === 'dependency'
        ? `${name(data, source)} už blokuje ${name(data, target)}.`
        : `Souvislost mezi ${name(data, source)} a ${name(data, target)} už existuje.`;
  }
  const path = findCyclePath(data, kind, source, target, ignoreEdgeId);
  if (path) return describeCycle(data, kind, path);
  return null;
}

function nextOrder(data: DocData, parentId: string): number {
  const kids = childEdges(data, parentId);
  return kids.length ? Math.max(...kids.map((e) => e.order)) + 1 : 0;
}

/** Vytvoří vazbu. U hierarchie se nový potomek zařadí na konec sourozenců. */
export function addLink(data: DocData, kind: EdgeKind, source: string, target: string, edgeId?: string): OpResult {
  const reason = validateLink(data, kind, source, target);
  if (reason) return fail(reason);
  const order = kind === 'hierarchy' ? nextOrder(data, source) : 0;
  const edge = createEdge(kind, source, target, order, undefined, edgeId);
  return { ok: true, data: { nodes: data.nodes, edges: { ...data.edges, [edge.id]: edge } } };
}

/** Odstraní vazbu. Uzly nikdy nemaže. */
export function removeLink(data: DocData, edgeId: string): OpResult {
  if (!data.edges[edgeId]) return fail('Vazba neexistuje.');
  const edges = { ...data.edges };
  delete edges[edgeId];
  return { ok: true, data: { nodes: data.nodes, edges } };
}

function replaceEdge(data: DocData, edge: MapEdge): OpResult {
  return { ok: true, data: { nodes: data.nodes, edges: { ...data.edges, [edge.id]: edge } } };
}

/** Otočí směr závislosti (B blokuje A místo A blokuje B). */
export function reverseDependency(data: DocData, edgeId: string): OpResult {
  const e = data.edges[edgeId];
  if (!e || e.kind !== 'dependency') return fail('Vazba není závislost.');
  const reason = validateLink(data, 'dependency', e.target, e.source, e.id);
  if (reason) return fail(reason);
  return replaceEdge(data, { ...e, source: e.target, target: e.source });
}

/**
 * Změní druh vazby mezi závislostí a souvislostí. `reverse` – u změny na
 * závislost otočit směr (blokuje cíl → blokuje zdroj).
 */
export function changeLinkKind(data: DocData, edgeId: string, kind: 'dependency' | 'related', reverse = false): OpResult {
  const e = data.edges[edgeId];
  if (!e || e.kind === 'hierarchy') return fail('Hierarchickou vazbu nelze změnit na jiný druh.');
  const source = reverse ? e.target : e.source;
  const target = reverse ? e.source : e.target;
  if (e.kind === kind && source === e.source) return { ok: true, data };
  const reason = validateLink(data, kind, source, target, e.id);
  if (reason) return fail(reason);
  return replaceEdge(data, { ...e, kind, source, target, order: 0 });
}

/**
 * Přepojí jeden konec vazby na jiný uzel. U hierarchie: nový zdroj = přesun
 * pod jiného rodiče, nový cíl = jiný poduzel. Platí stejná pravidla jako při vytvoření.
 */
export function reconnectLink(data: DocData, edgeId: string, end: 'source' | 'target', nodeId: string): OpResult {
  const e = data.edges[edgeId];
  if (!e) return fail('Vazba neexistuje.');
  const source = end === 'source' ? nodeId : e.source;
  const target = end === 'target' ? nodeId : e.target;
  if (source === e.source && target === e.target) return { ok: true, data };
  const reason = validateLink(data, e.kind, source, target, e.id);
  if (reason) return fail(reason);
  const order = e.kind === 'hierarchy' && end === 'source' ? nextOrder(data, source) : e.order;
  return replaceEdge(data, { ...e, source, target, order });
}

export interface NodeLinks {
  parents: MapEdge[];
  children: MapEdge[];
  /** závislosti, kde je uzel blokující (source) */
  blocks: MapEdge[];
  /** závislosti, kde je uzel blokovaný (target) */
  blockedBy: MapEdge[];
  related: MapEdge[];
}

/** Aktivní vazby uzlu rozdělené podle významu (vazby uzlů v koši se vynechají). */
export function nodeLinks(data: DocData, id: string): NodeLinks {
  const r: NodeLinks = { parents: [], children: [], blocks: [], blockedBy: [], related: [] };
  for (const e of Object.values(data.edges)) {
    if (e.source !== id && e.target !== id) continue;
    if (!live(data, e.source) || !live(data, e.target)) continue;
    if (e.kind === 'hierarchy') (e.target === id ? r.parents : r.children).push(e);
    else if (e.kind === 'dependency') (e.target === id ? r.blockedBy : r.blocks).push(e);
    else r.related.push(e);
  }
  for (const l of Object.values(r)) (l as MapEdge[]).sort(compareByAge);
  return r;
}

/** Druhý konec vazby z pohledu uzlu `id`. */
export const otherEnd = (e: MapEdge, id: string): string => (e.source === id ? e.target : e.source);
