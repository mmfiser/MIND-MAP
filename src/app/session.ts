/**
 * Životní cyklus aplikace: první spuštění, odemknutí, zamčení, nastavení.
 */
import { lockSession } from '../crypto/keySession';
import { notifyDateConflicts, notifyMigrationReport } from './dateCheck';
import { DecryptError, EnvelopeFormatError } from '../crypto/envelope';
import { createEmptyDocument } from '../model/factory';
import { MigrationError } from '../model/migrations';
import type { MapDocument } from '../model/types';
import { DEFAULT_SETTINGS, hasVault, loadSettings, saveSettings, wipeAll, type Settings } from '../storage/db';
import { startAutosave, stopAutosave } from '../storage/persist';
import { closeVault, createVault, unlockVault } from '../storage/vault';
import { useDocStore } from '../store/docStore';
import { useUiStore, type PersistStatus } from '../store/uiStore';

let settings: Settings = { ...DEFAULT_SETTINGS };

export function getSettings(): Settings {
  return settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...patch };
  try {
    await saveSettings(patch);
  } catch (e) {
    console.error('Nastavení se nepodařilo uložit', e);
  }
}

/** Načte nastavení a zjistí, zda jde o první spuštění. */
export async function boot(): Promise<void> {
  const ui = useUiStore.getState();
  try {
    settings = await loadSettings();
    const exists = await hasVault();
    ui.set({
      phase: exists ? 'locked' : 'setup',
      gridVisible: settings.gridVisible,
      sidebarOpen: settings.sidebarOpen && !window.matchMedia('(max-width: 767px)').matches,
      fileName: settings.fileName,
    });
  } catch (e) {
    console.error(e);
    ui.set({ phase: 'setup' });
    ui.toast('Úložiště prohlížeče (IndexedDB) není dostupné. Data se neuloží.', 'error');
  }
  void checkPersistence();
}

/** Požádá prohlížeč o trvalé úložiště (data nesmaže při nedostatku místa). */
export async function checkPersistence(request = true): Promise<PersistStatus> {
  let status: PersistStatus = 'unsupported';
  try {
    if (navigator.storage?.persisted) {
      let granted = await navigator.storage.persisted();
      if (!granted && request && navigator.storage.persist) granted = await navigator.storage.persist();
      status = granted ? 'granted' : 'denied';
    }
  } catch {
    status = 'unsupported';
  }
  useUiStore.getState().set({ persistStatus: status });
  return status;
}

function enterReady(doc: MapDocument): void {
  const ds = useDocStore.getState();
  ds.setDeviceName(settings.deviceName);
  ds.load(doc, { dirty: settings.dirty, baseRevision: settings.baseRevision, resetHistory: true });
  startAutosave();
  useUiStore.getState().set({ phase: 'ready', selectedId: null, detailOpen: false });
  notifyMigrationReport(doc);
  notifyDateConflicts(doc);
}

/** První spuštění: název zařízení + nové heslo. */
export async function setupNew(deviceName: string, password: string): Promise<void> {
  await updateSettings({ ...DEFAULT_SETTINGS, deviceName, gridVisible: settings.gridVisible });
  const doc = createEmptyDocument(deviceName);
  await createVault(password, doc);
  enterReady(doc);
}

/** Odemknutí. Vrací českou chybovou hlášku, nebo null při úspěchu. */
export async function unlock(password: string): Promise<string | null> {
  try {
    const doc = await unlockVault(password);
    settings = await loadSettings(); // dirty/baseRevision mohl mezitím zapsat autosave
    enterReady(doc);
    return null;
  } catch (e) {
    lockSession();
    if (e instanceof DecryptError) return 'Nesprávné heslo.';
    if (e instanceof EnvelopeFormatError || e instanceof MigrationError) return e.message;
    console.error(e);
    return 'Data v prohlížeči se nepodařilo načíst.';
  }
}

export async function lock(): Promise<void> {
  await stopAutosave();
  lockSession();
  closeVault();
  useDocStore.getState().unload();
  useUiStore.getState().set({
    phase: 'locked',
    selectedId: null,
    detailOpen: false,
    notesFor: null,
    contextMenu: null,
    picker: null,
    settingsOpen: false,
  });
}

/** Zapomenuté heslo: smaže lokální data a vrátí se k prvnímu spuštění. */
export async function wipeLocalData(): Promise<void> {
  await stopAutosave();
  lockSession();
  closeVault();
  useDocStore.getState().unload();
  await wipeAll();
  settings = { ...DEFAULT_SETTINGS };
  useUiStore.getState().set({ phase: 'setup' });
}

export async function setDeviceName(name: string): Promise<void> {
  await updateSettings({ deviceName: name });
  useDocStore.getState().setDeviceName(name);
}
