/**
 * Aktualizace aplikace. Service worker (skipWaiting + clientsClaim) převezme
 * stránku hned po stažení nové verze – pak vyvoláme `controllerchange`.
 *  - Na zamykací/úvodní obrazovce se stránka rovnou obnoví (nic se neztratí).
 *  - Při práci se zobrazí lišta „Je k dispozici nová verze“ s tlačítkem Obnovit,
 *    které nejdřív dokončí uložení do IndexedDB.
 */
import { flushAutosave } from '../storage/persist';
import { toast, useUiStore } from '../store/uiStore';

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

/**
 * Ruční kontrola aktualizace (např. po pokusu otevřít soubor z novější verze):
 * stáhne novou verzi service workeru a stránku obnoví (pracovní kopie se předtím uloží).
 */
export async function checkForUpdateNow(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    toast('Obnovte stránku s připojením k internetu.', 'info');
    return;
  }
  if (!navigator.onLine) {
    toast('Nejste připojeni k internetu. Připojte se a zkuste to znovu.', 'error');
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    void reloadToUpdate();
    return;
  }
  toast('Kontroluji aktualizaci…', 'info');
  try {
    await reg.update();
  } catch {
    toast('Aktualizaci se nepodařilo zkontrolovat. Zkontrolujte připojení k internetu.', 'error');
    return;
  }
  if (!reg.installing && !reg.waiting) {
    toast('Novější verze aplikace zatím není k dispozici.', 'info');
    return;
  }
  // Nová verze se instaluje – po převzetí stránky (controllerchange) se obnoví.
  toast('Stahuji novou verzi, stránka se za chvíli obnoví…', 'info');
  const done = () => void reloadToUpdate();
  navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
  setTimeout(done, 15000);
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
