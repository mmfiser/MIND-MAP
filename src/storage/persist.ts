/**
 * Automatické ukládání do IndexedDB: každá změna dokumentu se po krátkém
 * debounce zašifruje a zapíše jako jeden záznam. Zápisy jdou za sebou
 * (nikdy dva souběžně), při skrytí stránky se ukládá okamžitě.
 */
import { useDocStore } from '../store/docStore';
import { toast } from '../store/uiStore';
import { saveSettings } from './db';
import { writeVault } from './vault';

const DEBOUNCE_MS = 400;

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
      await writeVault(doc);
      await saveSettings({ dirty, baseRevision });
      errorShown = false;
    } catch (e) {
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
