/** Stav rozhraní – mimo historii Zpět/Znovu. */
import { create } from 'zustand';
import { todayYmd } from '../model/dates';

export type Phase = 'loading' | 'setup' | 'locked' | 'ready';
export type Theme = 'light' | 'dark';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface ContextMenuState {
  x: number;
  y: number;
  /** null = menu prázdné plochy */
  nodeId: string | null;
  /** pozice na ploše (pro „Nový projekt zde“) */
  flowPos?: { x: number; y: number };
}

export type PickerMode = 'move' | 'addParent';
export interface PickerState {
  mode: PickerMode;
  nodeId: string;
  /** U přesunu: od kterého rodiče se uzel odpojí (null = žádný). */
  fromParentId: string | null;
}

export interface ChoiceOption<T extends string = string> {
  value: T;
  label: string;
  variant?: 'primary' | 'danger' | 'default';
}

export interface ChoiceDialog {
  title: string;
  message?: string;
  /** Strukturovaný obsah (např. porovnání verzí). */
  details?: { label: string; rows: [string, string][] }[];
  options: ChoiceOption[];
  resolve: (value: string | null) => void;
}

export interface PasswordDialog {
  title: string;
  message?: string;
  confirmLabel: string;
  error?: string;
  resolve: (value: string | null) => void;
}

/** Výběr cílového uzlu klepnutím (tlačítko Propojit / Změnit cíl / Změnit zdroj). */
export type LinkPick =
  | { mode: 'create'; sourceId: string }
  | { mode: 'reconnect'; edgeId: string; end: 'source' | 'target' };

/** Nabídka vybrané vazby (čára na ploše). */
export interface EdgeMenuState {
  x: number;
  y: number;
  /** id vykreslené čáry (u sloučených `m:…`) */
  routedId: string;
  /** skutečné vazby, které čára představuje */
  edgeIds: string[];
}

/** Nabídka typu nové vazby (po tažení z konektoru nebo klepnutí na cíl). */
export interface LinkTypeMenuState {
  x: number;
  y: number;
  source: string;
  target: string;
}

export type PersistStatus = 'unknown' | 'granted' | 'denied' | 'unsupported';

interface UiState {
  phase: Phase;
  theme: Theme;
  selectedId: string | null;
  detailOpen: boolean;
  sidebarOpen: boolean;
  gridVisible: boolean;
  notesFor: string | null;
  contextMenu: ContextMenuState | null;
  picker: PickerState | null;
  settingsOpen: boolean;
  choice: ChoiceDialog | null;
  password: PasswordDialog | null;
  busy: string | null;
  toasts: Toast[];
  persistStatus: PersistStatus;
  fileName: string;
  /** Požadavek na vystředění uzlu (zpracuje plocha). */
  focusRequest: { id: string; nonce: number } | null;
  fitRequest: number;
  /** Požadavek na označení pole názvu v detailu (po vytvoření uzlu). */
  editTitleRequest: number;
  /** Nová verze aplikace je připravená – stačí obnovit stránku. */
  updateReady: boolean;
  /** Dnešní datum YYYY-MM-DD (místní čas) – přepočítává se o půlnoci. */
  today: string;
  /** Otevřený panel Koš. */
  trashOpen: boolean;
  /** Druhá úroveň kontextové nabídky (Stav… / Priorita…). */
  subMenu: { x: number; y: number; nodeId: string; kind: 'status' | 'priority' } | null;
  /** Fáze 3: vazby. */
  selectedEdge: string | null;
  edgeMenu: EdgeMenuState | null;
  linkPick: LinkPick | null;
  linkTypeMenu: LinkTypeMenuState | null;
  /** Zvýraznit vazby vybraného uzlu a ztlumit ostatní (pamatuje se). */
  highlightLinks: boolean;

  set(patch: Partial<UiState>): void;
  select(id: string | null, openDetail?: boolean): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
  focusNode(id: string): void;
  fitAll(): void;
}

let toastSeq = 1;

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* localStorage nedostupný */
  }
  return fallback;
}

export function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* nevadí */
  }
}

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem('mapa-theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* localStorage nedostupný */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useUiStore = create<UiState>()((set) => ({
  phase: 'loading',
  theme: initialTheme(),
  selectedId: null,
  detailOpen: false,
  sidebarOpen: true,
  gridVisible: true,
  notesFor: null,
  contextMenu: null,
  picker: null,
  settingsOpen: false,
  choice: null,
  password: null,
  busy: null,
  toasts: [],
  persistStatus: 'unknown',
  fileName: 'mapa',
  focusRequest: null,
  fitRequest: 0,
  editTitleRequest: 0,
  updateReady: false,
  today: todayYmd(),
  trashOpen: false,
  subMenu: null,
  selectedEdge: null,
  edgeMenu: null,
  linkPick: null,
  linkTypeMenu: null,
  highlightLinks: readFlag('mapa-highlight-links', true),

  set(patch) {
    set(patch);
  },
  select(id, openDetail = true) {
    set((s) => ({ selectedId: id, selectedEdge: null, detailOpen: id ? openDetail || s.detailOpen : false }));
  },
  toast(text, kind = 'info') {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6000 : 3500);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  focusNode(id) {
    set({ focusRequest: { id, nonce: Date.now() } });
  },
  fitAll() {
    set((s) => ({ fitRequest: s.fitRequest + 1 }));
  },
}));

/** Dialog s výběrem z možností – vrací hodnotu zvolené možnosti, nebo null (zrušeno). */
export function choose<T extends string>(d: Omit<ChoiceDialog, 'resolve' | 'options'> & { options: ChoiceOption<T>[] }): Promise<T | null> {
  return new Promise((resolve) => {
    useUiStore.getState().set({
      choice: { ...d, resolve: (v) => resolve(v as T | null) },
    });
  });
}

export async function confirmDialog(
  title: string,
  message: string,
  confirmLabel = 'Potvrdit',
  danger = false,
): Promise<boolean> {
  const r = await choose({
    title,
    message,
    options: [
      { value: 'cancel', label: 'Zrušit' },
      { value: 'ok', label: confirmLabel, variant: danger ? 'danger' : 'primary' },
    ],
  });
  return r === 'ok';
}

export function askPassword(d: Omit<PasswordDialog, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    useUiStore.getState().set({ password: { ...d, resolve } });
  });
}

export const toast = (text: string, kind?: Toast['kind']) => useUiStore.getState().toast(text, kind);
