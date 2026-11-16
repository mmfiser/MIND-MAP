/**
 * Koš. Smazání větve uzly jen označí (deletedAt + trash); jejich vazby zůstávají
 * v dokumentu jako neaktivní, takže obnovení vrátí rodiče, pořadí i pozice.
 * Trvalé smazání odstraní uzly i všechny jejich (i neaktivní) vazby.
 */
import { newId, nowIso } from './factory';
import { buildHierarchyIndex, owningProject, parentEdges } from './graph';
import { branchNodesToDelete, wouldCreateCycle } from './hierarchy';
import { findDuplicate } from './links';
import type { DocData, MapEdge, MapNode, OpResult } from './types';

export interface TrashBatch {
  batchId: string;
  rootId: string;
  title: string;
  type: MapNode['type'];
  count: number;
  deletedAt: string;
  projectTitle?: string;
}

const label = (n: MapNode | undefined) => (n?.title.trim() ? `„${n.title.trim()}“` : 'uzel bez názvu');

/** Přesune větev do koše. Pravidla pro sdílené uzly platí jako u mazání. */
export function trashBranch(
  data: DocData,
  rootId: string,
  opts: { now?: string; batchId?: string } = {},
): OpResult {
  const root = data.nodes[rootId];
  if (!root || root.deletedAt) return { ok: false, reason: 'Uzel neexistuje.' };
  const now = opts.now ?? nowIso();
  const batchId = opts.batchId ?? newId();
  const idx = buildHierarchyIndex(data);
  const del = branchNodesToDelete(data, rootId);
  const parentIds = parentEdges(data, rootId).map((e) => e.source);
  const project = root.type === 'project' ? undefined : owningProject(data, rootId, idx);
  const nodes = { ...data.nodes };
  for (const id of del) {
    const n = nodes[id]!;
    const isRoot = id === rootId;
    nodes[id] = {
      ...n,
      deletedAt: now,
      trash: isRoot
        ? { batchId, isRoot, parentIds, ...(project ? { projectTitle: project.title } : {}) }
        : { batchId, isRoot },
    };
  }
  return { ok: true, data: { nodes, edges: data.edges } };
}

export function listTrash(data: DocData): TrashBatch[] {
  const batches = new Map<string, TrashBatch>();
  for (const n of Object.values(data.nodes)) {
    if (!n.deletedAt) continue;
    const batchId = n.trash?.batchId ?? n.id;
    let b = batches.get(batchId);
    if (!b) {
      b = { batchId, rootId: n.id, title: n.title, type: n.type, count: 0, deletedAt: n.deletedAt };
      batches.set(batchId, b);
    }
    b.count++;
    if (n.trash?.isRoot || !n.trash) {
      b.rootId = n.id;
      b.title = n.title;
      b.type = n.type;
      b.deletedAt = n.deletedAt;
      b.projectTitle = n.trash?.projectTitle;
    }
  }
  return [...batches.values()].sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0));
}

function batchIds(data: DocData, batchId: string): Set<string> {
  const ids = new Set<string>();
  for (const n of Object.values(data.nodes)) {
    if (n.deletedAt && (n.trash?.batchId ?? n.id) === batchId) ids.add(n.id);
  }
  return ids;
}

export interface RestoreResult {
  data: DocData;
  /** Česká oznámení pro uživatele (ztracené vazby, rodič smazán…). */
  notices: string[];
  rootId: string | null;
}

/**
 * Obnoví položku koše. Vazby obnovených uzlů se znovu aktivují; vazba, která by
 * mezitím vytvořila cyklus, se zahodí a uživatel se o tom dozví.
 */
export function restoreBatch(data: DocData, batchId: string): RestoreResult | { error: string } {
  const ids = batchIds(data, batchId);
  if (!ids.size) return { error: 'Položka v koši neexistuje.' };
  let rootId: string | null = null;
  const nodes = { ...data.nodes };
  for (const id of ids) {
    const n = nodes[id]!;
    if (n.trash?.isRoot || !n.trash) rootId = id;
    const { deletedAt: _d, trash: _t, ...rest } = n;
    nodes[id] = rest;
  }
  const live = (id: string) => !!nodes[id] && !nodes[id]!.deletedAt;

  // Vazby, které se obnovením znovu aktivují – postupně je vracej s kontrolou cyklu.
  const reactivated: MapEdge[] = [];
  const edges: Record<string, MapEdge> = {};
  for (const e of Object.values(data.edges)) {
    const touches = ids.has(e.source) || ids.has(e.target);
    if (touches && live(e.source) && live(e.target)) reactivated.push(e);
    else edges[e.id] = e;
  }
  reactivated.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  const notices: string[] = [];
  let cur: DocData = { nodes, edges };
  for (const e of reactivated) {
    // Mezitím vznikla stejná vazba – obnovená by byla duplicitní.
    if (findDuplicate(cur, e.kind, e.source, e.target, e.id)) continue;
    if (wouldCreateCycle(cur, e.kind, e.source, e.target)) {
      const child = label(nodes[e.target]);
      const parent = label(nodes[e.source]);
      notices.push(
        e.kind === 'hierarchy'
          ? `Uzel ${child} ztratil rodiče ${parent} – vazba by vytvořila cyklus.`
          : `Závislost ${parent} → ${child} nebyla obnovena – úkoly by na sebe čekaly v kruhu.`,
      );
      continue;
    }
    cur = { nodes, edges: { ...cur.edges, [e.id]: e } };
  }

  // Kořen: co se stalo s původními rodiči?
  const root = rootId ? data.nodes[rootId] : undefined;
  if (rootId && root?.trash?.parentIds?.length) {
    const nowParents = new Set(parentEdges(cur, rootId).map((e) => e.source));
    for (const pid of root.trash.parentIds) {
      if (nowParents.has(pid)) continue;
      const p = nodes[pid];
      if (!p) {
        notices.push(`Původní nadřazený uzel uzlu ${label(root)} byl mezitím trvale smazán.`);
      } else if (p.deletedAt) {
        notices.push(`Nadřazený uzel ${label(p)} je v koši – po jeho obnovení se vazba vrátí.`);
      }
    }
    if (nowParents.size === 0 && notices.length) {
      notices.push(`Uzel ${label(root)} zůstal volně na ploše.`);
    }
  }
  return { data: cur, notices, rootId };
}

function purge(data: DocData, ids: Set<string>): DocData {
  const nodes = { ...data.nodes };
  for (const id of ids) delete nodes[id];
  const edges: Record<string, MapEdge> = {};
  for (const e of Object.values(data.edges)) {
    if (!ids.has(e.source) && !ids.has(e.target) && nodes[e.source] && nodes[e.target]) edges[e.id] = e;
  }
  return { nodes, edges };
}

/** Trvale smaže položku koše včetně všech jejích (i neaktivních) vazeb. */
export function purgeBatch(data: DocData, batchId: string): OpResult {
  const ids = batchIds(data, batchId);
  if (!ids.size) return { ok: false, reason: 'Položka v koši neexistuje.' };
  return { ok: true, data: purge(data, ids) };
}

/** Vysype koš: trvale smaže všechny uzly v koši a jejich vazby. */
export function emptyTrash(data: DocData): OpResult {
  const ids = new Set(Object.values(data.nodes).filter((n) => n.deletedAt).map((n) => n.id));
  if (!ids.size) return { ok: true, data };
  return { ok: true, data: purge(data, ids) };
}

export function trashCount(data: DocData): number {
  return listTrash(data).length;
}
