/**
 * Aktualizace aplikace. Service worker (skipWaiting + clientsClaim) převezme
 * stránku hned po stažení nové verze – pak vyvoláme `controllerchange`.
 *  - Na zamykací/úvodní obrazovce se stránka rovnou obnoví (nic se neztratí).
 *  - Při práci se zobrazí lišta „Je k dispozici nová verze“ s tlačítkem Obnovit,
 *    které nejdřív dokončí uložení do IndexedDB.
 */
import { flushAutosave } from '../storage/persist';
import { useUiStore } from '../store/uiStore';

let reloading = false;

export async function reloadToUpdate(): Promise<void> {
  if (reloading) return;
  reloading = true;
  try {
    await flushAutosave();
  } finally {
    window.location.reload();
  }
}

export function watchForUpdates(): void {
  if (!('serviceWorker' in navigator)) return;
  // Při úplně první instalaci SW nejde o aktualizaci – stránka už je aktuální.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    const ui = useUiStore.getState();
    if (ui.phase !== 'ready') void reloadToUpdate();
    else ui.set({ updateReady: true });
  });
  // Kontrola nové verze i během dlouhého sezení (např. otevřená karta přes noc).
  const check = () => {
    void navigator.serviceWorker.getRegistration().then((r) => r?.update().catch(() => undefined));
  };
  setInterval(check, 60 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}
