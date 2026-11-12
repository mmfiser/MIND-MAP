/**
 * IndexedDB (Dexie).
 *  - `vault`: jediný záznam s celým MapDocument zašifrovaným AES-GCM.
 *  - `settings`: nešifrovaná nastavení (název zařízení, viewport, stav souboru…).
 * Uživatelská data se nikdy neukládají nešifrovaně.
 */
import Dexie, { type Table } from 'dexie';
import type { Envelope } from '../crypto/envelope';

export interface VaultRecord {
  id: 'main';
  envelope: Envelope;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

class MapaDB extends Dexie {
  vault!: Table<VaultRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('mapa-projektu');
    this.version(1).stores({
      vault: 'id',
      settings: 'key',
    });
  }
}

export const db = new MapaDB();

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** Nešifrovaná nastavení a stav synchronizace se souborem. */
export interface Settings {
  deviceName: string;
  gridVisible: boolean;
  sidebarOpen: boolean;
  viewport: Viewport | null;
  /** Revize souboru, ze které vychází pracovní kopie. */
  baseRevision: number;
  /** Pracovní kopie má změny neuložené do souboru. */
  dirty: boolean;
  /** Název souboru bez přípony. */
  fileName: string;
  /** Sůl naposledy otevřeného/uloženého souboru (base64). */
  fileSalt: string | null;
  fileIterations: number | null;
  /** FileSystemFileHandle (jen notebook s File System Access API). */
  fileHandle: FileSystemFileHandle | null;
}

export const DEFAULT_SETTINGS: Settings = {
  deviceName: '',
  gridVisible: true,
  sidebarOpen: true,
  viewport: null,
  baseRevision: 0,
  dirty: false,
  fileName: 'mapa',
  fileSalt: null,
  fileIterations: null,
  fileHandle: null,
};

export async function loadSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) (s as unknown as Record<string, unknown>)[r.key] = r.value;
  }
  return s;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await db.settings.bulkPut(Object.entries(patch).map(([key, value]) => ({ key, value })));
}

export async function readVault(): Promise<VaultRecord | undefined> {
  return db.vault.get('main');
}

export async function hasVault(): Promise<boolean> {
  return (await db.vault.count()) > 0;
}

/** Smaže všechna lokální data (zapomenuté heslo). */
export async function wipeAll(): Promise<void> {
  await db.transaction('rw', db.vault, db.settings, async () => {
    await db.vault.clear();
    await db.settings.clear();
  });
}
