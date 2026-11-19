/**
 * Akce „Uspořádat větev“ (fáze 5). Výpočet je čistá funkce (model/layout.ts);
 * velké větve (nad 300 uzlů) se počítají ve Web Workeru. Přesun se plynule animuje
 * a celé uspořádání je jeden krok Zpět a jedno uložení.
 */
import { branchSize, type LayoutDir } from '../model/layout';
import { setPositions } from '../model/hierarchy';
import { toast, useUiStore } from '../store/uiStore';
import { canvasApi, data, run } from './actions';
import { layoutMany, type LayoutRequest, type LayoutResponse } from './layoutCore';

export const WORKER_THRESHOLD = 300;
const DIR_KEY = 'mapa-layout-dir';

export function lastLayoutDir(): LayoutDir {
  try {
    return localStorage.getItem(DIR_KEY) === 'down' ? 'down' : 'right';
  } catch {
    return 'right';
  }
}

function rememberDir(dir: LayoutDir): void {
  try {
    localStorage.setItem(DIR_KEY, dir);
  } catch {
    /* nevadí */
  }
}

function inWorker(req: LayoutRequest): Promise<LayoutResponse> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(layoutMany(req)); // bez Workeru spočítat v hlavním vlákně
      return;
    }
    worker.onmessage = (e: MessageEvent<LayoutResponse>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(layoutMany(req));
    };
    worker.postMessage(req);
  });
}

let busy = false;

/** Uspořádá větve vybraných uzlů (nebo vybraného uzlu). `dir` = směr, jinak poslední použitý. */
export async function arrangeSelection(dir?: LayoutDir, ids?: string[]): Promise<void> {
  if (busy) return;
  const d = data();
  const ui = useUiStore.getState();
  const roots = (ids ?? (ui.selection.length ? ui.selection : ui.selectedId ? [ui.selectedId] : [])).filter(
    (id) => d?.nodes[id] && !d.nodes[id]!.deletedAt,
  );
  if (!d || !roots.length) {
    toast('Nejdřív vyberte uzel, jehož větev chcete uspořádat.', 'info');
    return;
  }
  const direction = dir ?? lastLayoutDir();
  rememberDir(direction);
  busy = true;
  try {
    const total = roots.reduce((a, id) => a + branchSize(d, id), 0);
    const req: LayoutRequest = { data: { nodes: d.nodes, edges: d.edges }, roots, dir: direction };
    const res = total > WORKER_THRESHOLD ? await inWorker(req) : layoutMany(req);
    const count = Object.keys(res.positions).length;
    if (!count) {
      toast('Není co uspořádat – větev nemá poduzly (nebo je sbalená).', 'info');
      return;
    }
    await canvasApi.animatePositions(res.positions);
    // Data se mezitím mohla změnit – použij aktuální stav, jen s novými pozicemi.
    run((x) => setPositions(x, res.positions));
    const notes = [`Uspořádáno: ${count} ${count === 1 ? 'uzel' : count < 5 ? 'uzly' : 'uzlů'}.`];
    if (res.shifted) notes.push('Větev se posunula, aby nepřekrývala okolní uzly.');
    if (res.locked) notes.push('Zamčené uzly zůstaly na místě.');
    if (res.skippedShared)
      notes.push(`${res.skippedShared} ${res.skippedShared === 1 ? 'sdílený uzel zůstal' : 'sdílené uzly zůstaly'} na místě (má rodiče i mimo větev).`);
    toast(notes.join(' '), 'success');
  } finally {
    busy = false;
  }
}
