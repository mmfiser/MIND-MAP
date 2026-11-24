/**
 * Automatické ukládání do IndexedDB: každá změna dokumentu se po krátkém
 * debounce zašifruje a zapíše jako jeden záznam. Zápisy jdou za sebou
 * (nikdy dva souběžně), při skrytí stránky se ukládá okamžitě.
 */
import { useDocStore } from '../store/docStore';
import { toast } from '../store/uiStore';
import { saveSettings } from './db';
import { writeVault } from './vault';
import { debugLog, withTimeout } from '../lib/async';

const DEBOUNCE_MS = 400;
/** Jeden zaseknutý zápis do IndexedDB nesmí zablokovat všechny další. */
export const AUTOSAVE_TIMEOUT_MS = 15_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();
let unsubscribe: (() => void) | null = null;
let pending = false;
let errorShown = false;

function flushNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!pending) return chain;
  pending = false;
  chain = chain.then(async () => {
    const { doc, dirty, baseRevision } = useDocStore.getState();
    if (!doc) return;
    try {
      await withTimeout(
        (async () => {
          await writeVault(doc);
          await saveSettings({ dirty, baseRevision });
        })(),
        AUTOSAVE_TIMEOUT_MS,
        'zápis pracovní kopie',
      );
      errorShown = false;
    } catch (e) {
      debugLog('autosave: chyba', e instanceof Error ? e.name : typeof e);
      console.error(e);
      if (!errorShown) {
        errorShown = true;
        toast('Nepodařilo se uložit data v prohlížeči. Uložte si mapu do souboru.', 'error');
      }
    }
  });
  return chain;
}

function schedule(): void {
  pending = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushNow(), DEBOUNCE_MS);
}

function onHide(): void {
  if (document.visibilityState === 'hidden') void flushNow();
}

export function startAutosave(): void {
  stopAutosave();
  unsubscribe = useDocStore.subscribe((s, prev) => {
    if (s.doc && (s.doc !== prev.doc || s.dirty !== prev.dirty || s.baseRevision !== prev.baseRevision)) {
      schedule();
    }
  });
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
}

export async function stopAutosave(): Promise<void> {
  unsubscribe?.();
  unsubscribe = null;
  document.removeEventListener('visibilitychange', onHide);
  window.removeEventListener('pagehide', onHide);
  await flushNow();
}

/** Okamžitě zapíše čekající změny (např. před zamčením). */
export function flushAutosave(): Promise<void> {
  return flushNow();
}
