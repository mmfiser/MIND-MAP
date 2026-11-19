/**
 * Zamykání pozic (fáze 5): globální zámek (volba v prohlížeči) a zámek jednotlivých
 * uzlů (`positionLocked` v dokumentu, jeden krok Zpět).
 */
import { allLocked, setLocked } from '../model/locks';
import { toast, useUiStore, writeFlag } from '../store/uiStore';
import { data, run } from './actions';

export function setGlobalLock(on: boolean): void {
  useUiStore.getState().set({ globalLock: on });
  writeFlag('mapa-global-lock', on);
}

export function toggleGlobalLock(): void {
  const on = !useUiStore.getState().globalLock;
  setGlobalLock(on);
  toast(on ? 'Pozice uzlů jsou zamčené – uzly nejde přesouvat.' : 'Pozice uzlů jsou odemčené.', 'info');
}

/** Uzly, kterých se akce týká: výběr, jinak vybraný uzel. */
function targetIds(ids?: string[]): string[] {
  const ui = useUiStore.getState();
  return ids ?? (ui.selection.length ? ui.selection : ui.selectedId ? [ui.selectedId] : []);
}

/** Zamkne / odemkne pozici (když jsou všechny zamčené, odemkne). */
export function toggleNodeLock(ids?: string[]): void {
  const d = data();
  const t = targetIds(ids);
  if (!d || !t.length) {
    toast('Nejdřív vyberte uzel.', 'info');
    return;
  }
  const lock = !allLocked(d, t);
  if (run((x) => setLocked(x, t, lock))) {
    const n = t.length;
    const state = lock ? 'zamčen' : 'odemčen';
    toast(n === 1 ? `Pozice uzlu je ${state}á.` : `Pozice ${n} uzlů jsou ${state}é.`, 'success');
  }
}

let globalNoticeShown = false;
let lastNodeNotice = 0;

/**
 * Pokus o přesun zamčeného uzlu. Při globálním zámku jen jednou za sezení
 * (s tlačítkem „Odemknout“), u zamčeného uzlu nejvýš jednou za pár sekund.
 */
export function notifyLocked(kind: 'global' | 'node'): void {
  if (kind === 'global') {
    if (globalNoticeShown) return;
    globalNoticeShown = true;
    toast('Pozice jsou zamčené – uzly nejde přesouvat.', 'info', { label: 'Odemknout', run: () => setGlobalLock(false) });
    return;
  }
  const now = Date.now();
  if (now - lastNodeNotice < 4000) return;
  lastNodeNotice = now;
  toast('Pozice je zamčená. Odemknete ji v nabídce uzlu (klávesa P).', 'info');
}
