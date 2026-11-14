/**
 * Procenta a počty dokončení.
 *  - Projekt: jen úkoly (typ task) přímo pod projektem; zrušené a milníky se
 *    nepočítají; sdílený uzel se započítá do každého projektu, kde je přímým úkolem.
 *  - Úkol: přímé podúkoly (typ task) bez zrušených.
 *  - Checklist: nezávislý na stavu i procentech.
 */
import { buildHierarchyIndex, type HierarchyIndex } from './graph';
import type { DocData, MapNode } from './types';

export interface Progress {
  done: number;
  open: number;
  total: number;
  /** 0–100, nebo null když není co počítat („–“) */
  percent: number | null;
}

function countDirectTasks(data: DocData, parentId: string, idx: HierarchyIndex): Progress {
  let done = 0;
  let total = 0;
  for (const e of idx.children.get(parentId) ?? []) {
    const n = data.nodes[e.target];
    if (!n || n.deletedAt || n.type !== 'task' || n.status === 'cancelled') continue;
    total++;
    if (n.status === 'done') done++;
  }
  return { done, open: total - done, total, percent: total ? Math.round((done / total) * 100) : null };
}

export function projectProgress(data: DocData, projectId: string, index?: HierarchyIndex): Progress {
  return countDirectTasks(data, projectId, index ?? buildHierarchyIndex(data));
}

/** Podúkoly úkolu; null když úkol žádné (započítatelné) podúkoly nemá. */
export function subtaskProgress(data: DocData, nodeId: string, index?: HierarchyIndex): Progress | null {
  const p = countDirectTasks(data, nodeId, index ?? buildHierarchyIndex(data));
  return p.total ? p : null;
}

export function checklistProgress(node: MapNode): { done: number; total: number } | null {
  if (!node.checklist.length) return null;
  return { done: node.checklist.filter((c) => c.done).length, total: node.checklist.length };
}

/** České tvary: 1 otevřený, 2–4 otevřené, 0 a 5+ otevřených. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
