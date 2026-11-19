/**
 * Akce nad výběrem více uzlů (Ctrl+klik, Shift+tažení, Ctrl+A, „Vybrat více“ na telefonu).
 * Logiku dělají čisté funkce v model/bulk.ts; každá akce je jeden krok Zpět/Znovu.
 */
import * as B from '../model/bulk';
import { branchNodesToDelete } from '../model/hierarchy';
import { STATUS_LABELS, PRIORITY_LABELS } from '../model/labels';
import type { Priority, Status } from '../model/types';
import { confirmDialog, toast, useUiStore } from '../store/uiStore';
import { GRID, canvasApi, data, deleteWithConfirm, run } from './actions';

/** Živé vybrané uzly (bez smazaných). */
export function selectedIds(): string[] {
  const d = data();
  if (!d) return [];
  return useUiStore.getState().selection.filter((id) => d.nodes[id] && !d.nodes[id]!.deletedAt);
}

export const isMulti = () => selectedIds().length > 1;

/** Ctrl+A: všechny právě viditelné uzly. */
export function selectAllVisible(): void {
  const ids = canvasApi.visibleIds();
  if (ids.length) useUiStore.getState().selectMany(ids, false);
}

export function clearSelection(): void {
  useUiStore.getState().select(null);
}

/** Šipky: posun výběru o krok mřížky (Shift = 5 kroků). Opakované stisky = jeden krok Zpět. */
export function moveSelection(dx: number, dy: number): void {
  const ids = selectedIds();
  if (!ids.length) return;
  run((x) => B.moveNodes(x, ids, dx, dy, GRID), { coalesceKey: `arrows:${ids.join(',')}` });
}

export const ARROW_STEP = GRID;
export const ARROW_STEP_LARGE = GRID * 5;

const nUzlu = (n: number) => `${n} ${n === 1 ? 'uzel' : n >= 2 && n <= 4 ? 'uzly' : 'uzlů'}`;
const nUkolu = (n: number) => `${n} ${n === 1 ? 'úkol' : n >= 2 && n <= 4 ? 'úkoly' : 'úkolů'}`;

/** Delete nad výběrem: jedna položka koše, jeden krok Zpět. */
export async function deleteSelectionWithConfirm(): Promise<void> {
  const ids = selectedIds();
  if (ids.length <= 1) {
    await deleteWithConfirm(ids[0] ?? useUiStore.getState().selectedId);
    return;
  }
  const d = data();
  if (!d) return;
  const all = new Set<string>();
  for (const root of B.selectionRoots(d, ids)) for (const id of branchNodesToDelete(d, root)) all.add(id);
  const extra = all.size - ids.length;
  const msg =
    `Do koše se ${ids.length >= 2 && ids.length <= 4 ? 'přesunou' : 'přesune'} ${nUzlu(ids.length)}` +
    (extra > 0 ? ` a ${extra} ${extra === 1 ? 'podřízený uzel' : extra < 5 ? 'podřízené uzly' : 'podřízených uzlů'}` : '') +
    '. V koši budou jako jedna položka. Sdílené uzly, které mají rodiče i jinde, zůstanou. Smazání jde vrátit tlačítkem Zpět.';
  const ok = await confirmDialog(`Smazat ${nUzlu(ids.length)}?`, msg, 'Přesunout do koše', true);
  if (!ok) return;
  if (run((x) => B.trashMany(x, ids))) {
    clearSelection();
    toast(`${nUzlu(ids.length)} v koši.`, 'success');
  }
}

function report(r: B.BulkResult | null, what: string): void {
  if (!r) return;
  const parts: string[] = [];
  parts.push(r.changed ? `${what}: ${nUkolu(r.changed)}.` : 'Beze změny.');
  if (r.skipped) parts.push(`Projekty a milníky (${r.skipped}) se přeskočily.`);
  toast(parts.join(' '), r.changed ? 'success' : 'info');
}

export function setStatusOfSelection(status: Status): void {
  const ids = selectedIds();
  let res: B.BulkResult | null = null;
  run((x) => {
    res = B.setStatusMany(x, ids, status);
    return res.data;
  });
  report(res, `Stav „${STATUS_LABELS[status]}“`);
}

export function setPriorityOfSelection(priority: Priority): void {
  const ids = selectedIds();
  let res: B.BulkResult | null = null;
  run((x) => {
    res = B.setPriorityMany(x, ids, priority);
    return res.data;
  });
  report(res, `Priorita „${PRIORITY_LABELS[priority]}“`);
}

export function markSelectionDone(): void {
  setStatusOfSelection('done');
}

/** Rozdělení výběru podle typu (pro panel a nabídku). */
export function selectionSummary(): { total: number; tasks: number; other: number } {
  const d = data();
  const ids = selectedIds();
  const tasks = d ? ids.filter((id) => d.nodes[id]!.type === 'task').length : 0;
  return { total: ids.length, tasks, other: ids.length - tasks };
}
