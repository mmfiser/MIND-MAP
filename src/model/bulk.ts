/**
 * Hromadné operace nad výběrem více uzlů. Čisté funkce, vrací nová data.
 */
import { newId, nowIso } from './factory';
import { descendants } from './graph';
import { setPositions } from './hierarchy';
import { trashBranch } from './trash';
import type { DocData, OpResult, Position, Priority, Status } from './types';

/**
 * Posune uzly o (dx, dy). Zamčené uzly (positionLocked, fáze 5) zůstanou na místě.
 * `snap` – zaokrouhlení výsledné pozice na mřížku (0 = bez přichytávání).
 */
export function moveNodes(data: DocData, ids: Iterable<string>, dx: number, dy: number, snap = 0): DocData {
  if (!dx && !dy) return data;
  const r = (v: number) => (snap ? Math.round(v / snap) * snap : v);
  const positions: Record<string, Position> = {};
  for (const id of ids) {
    const n = data.nodes[id];
    if (!n || n.deletedAt || n.positionLocked) continue;
    positions[id] = { x: r(n.position.x + dx), y: r(n.position.y + dy) };
  }
  return setPositions(data, positions);
}

/** Uzly výběru, které nejsou potomkem jiného vybraného uzlu (kořeny pro mazání). */
export function selectionRoots(data: DocData, ids: string[]): string[] {
  const set = new Set(ids.filter((id) => data.nodes[id] && !data.nodes[id]!.deletedAt));
  const covered = new Set<string>();
  for (const id of set) for (const d of descendants(data, id)) if (set.has(d)) covered.add(d);
  return [...set].filter((id) => !covered.has(id));
}

/**
 * Smaže výběr do koše jako JEDNU položku koše (jeden batchId). Pravidla pro
 * sdílené uzly platí jako u jednoho uzlu: sdílený uzel s rodičem mimo výběr zůstane.
 */
export function trashMany(data: DocData, ids: string[], opts: { now?: string; batchId?: string } = {}): OpResult {
  const roots = selectionRoots(data, ids);
  if (!roots.length) return { ok: false, reason: 'Nic k smazání.' };
  const now = opts.now ?? nowIso();
  const batchId = opts.batchId ?? newId();
  let cur = data;
  for (const id of roots) {
    if (cur.nodes[id]?.deletedAt) continue; // už smazaný v rámci jiné větve
    const r = trashBranch(cur, id, { now, batchId });
    if (!r.ok) return r;
    cur = r.data;
  }
  return { ok: true, data: cur };
}

export interface BulkResult {
  data: DocData;
  /** kolik uzlů se změnilo */
  changed: number;
  /** kolik vybraných uzlů se akce netýká (projekty a milníky) */
  skipped: number;
}

/** Hromadná změna pole úkolů (projekty a milníky se přeskočí a spočítají). */
function updateTasks<K extends 'status' | 'priority'>(data: DocData, ids: string[], field: K, value: K extends 'status' ? Status : Priority): BulkResult {
  let nodes: DocData['nodes'] | null = null;
  let changed = 0;
  let skipped = 0;
  const ts = nowIso();
  for (const id of new Set(ids)) {
    const n = data.nodes[id];
    if (!n || n.deletedAt) continue;
    if (n.type !== 'task') {
      skipped++;
      continue;
    }
    if (n[field] === value) continue;
    nodes ??= { ...data.nodes };
    nodes[id] = { ...n, [field]: value, updatedAt: ts };
    changed++;
  }
  return { data: nodes ? { nodes, edges: data.edges } : data, changed, skipped };
}

export function setStatusMany(data: DocData, ids: string[], status: Status): BulkResult {
  return updateTasks(data, ids, 'status', status);
}

export function setPriorityMany(data: DocData, ids: string[], priority: Priority): BulkResult {
  return updateTasks(data, ids, 'priority', priority);
}
