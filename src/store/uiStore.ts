/** Stav rozhraní – mimo historii Zpět/Znovu. */
import { create } from 'zustand';
import { todayYmd } from '../model/dates';
import type { FilterState } from '../model/filters';
import type { LodLevel } from '../model/lod';
import { NO_SCALE, type NodeScale } from '../model/nodeScale';

export type Phase = 'loading' | 'setup' | 'locked' | 'ready';
export type Theme = 'light' | 'dark';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
  /** Volitelné tlačítko v oznámení (např. „Odemknout“). */
  action?: { label: string; run: () => void };
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
  /** Hlavní vybraný uzel (detail, akce s jedním uzlem) = poslední přidaný do výběru. */
  selectedId: string | null;
  /** Všechny vybrané uzly (výběr více uzlů: Ctrl+klik, Shift+tažení, Ctrl+A). */
  selection: string[];
  /** Telefon: režim „Vybrat více“ – klepnutí přidá / odebere uzel z výběru. */
  multiMode: boolean;
  /** Fáze 5: dialogy Nápověda a O aplikaci. */
  helpOpen: boolean;
  aboutOpen: boolean;
  welcomeOpen: boolean;
  /** Fáze 5: globální zámek pozic (pamatuje se; výchozí na dotyku zapnuto). */
  globalLock: boolean;
  /** Fáze 5: minimapa (výchozí na notebooku zapnutá), kruhový ovladač (na dotyku zapnutý, vpravo). */
  showMinimap: boolean;
  showJoystick: boolean;
  joystickSide: 'left' | 'right';
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
  focusRequest: { id: string; nonce: number; zoom?: number } | null;
  fitRequest: number;
  /** Požadavek „Zoom 80 %“ (zpracuje plocha). */
  zoomPresetRequest: number;
  /** Požadavek na označení pole názvu v detailu (po vytvoření uzlu). */
  editTitleRequest: number;
  /** Nová verze aplikace je připravená – stačí obnovit stránku. */
  updateReady: boolean;
  /** Dnešní datum YYYY-MM-DD (místní čas) – přepočítává se o půlnoci. */
  today: string;
  /** Otevřený panel Koš. */
  trashOpen: boolean;
  /** Druhá úroveň kontextové nabídky (Stav… / Priorita…). */
  subMenu: { x: number; y: number; nodeId: string; kind: 'status' | 'priority'; /** hromadně nad výběrem */ nodeIds?: string[] } | null;
  /** Fáze 3: vazby. */
  selectedEdge: string | null;
  edgeMenu: EdgeMenuState | null;
  linkPick: LinkPick | null;
  linkTypeMenu: LinkTypeMenuState | null;
  /** Zvýraznit vazby vybraného uzlu a ztlumit ostatní (pamatuje se). */
  highlightLinks: boolean;
  /** Fáze 4: automatický detail podle zoomu (pamatuje se) a aktuální úroveň. */
  autoDetail: boolean;
  lodLevel: LodLevel;
  /** Kompenzace zoomu: zvětšovat uzly při oddálení (pamatuje se) a aktuální faktory. */
  scaleNodes: boolean;
  nodeScale: NodeScale;
  /** Vyhledávání: dotaz (po debounce), otevřené pole na telefonu, kliknutý výsledek. */
  searchQuery: string;
  searchOpen: boolean;
  searchPick: string | null;
  /** Aktivní filtr (neukládá se) a otevřený panel. */
  filter: FilterState | null;
  filterOpen: boolean;
  bellOpen: boolean;

  set(patch: Partial<UiState>): void;
  select(id: string | null, openDetail?: boolean): void;
  /** Přidá uzel do výběru, nebo ho z výběru odebere. */
  toggleSelect(id: string): void;
  /** Nastaví výběr více uzlů najednou. */
  selectMany(ids: string[], openDetail?: boolean): void;
  toast(text: string, kind?: Toast['kind'], action?: Toast['action']): void;
  dismissToast(id: number): void;
  /** Vystředí uzel; `zoom` = přiblížit aspoň na tuto hodnotu (jinak výchozí). */
  focusNode(id: string, zoom?: number): void;
  fitAll(): void;
  zoomPreset(): void;
}

let toastSeq = 1;

/** Dotykové zařízení (telefon, tablet) – pro výchozí stavy voleb. */
export function isCoarse(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

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
  selection: [],
  multiMode: false,
  helpOpen: false,
  aboutOpen: false,
  welcomeOpen: false,
  globalLock: readFlag('mapa-global-lock', isCoarse()),
  showMinimap: readFlag('mapa-minimap', !isCoarse()),
  showJoystick: readFlag('mapa-joystick', isCoarse()),
  joystickSide: readFlag('mapa-joystick-left', false) ? 'left' : 'right',
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
  zoomPresetRequest: 0,
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
  autoDetail: readFlag('mapa-auto-detail', true),
  lodLevel: 'full',
  scaleNodes: readFlag('mapa-scale-nodes', true),
  nodeScale: NO_SCALE,
  searchQuery: '',
  searchOpen: false,
  searchPick: null,
  filter: null,
  filterOpen: false,
  bellOpen: false,

  set(patch) {
    // Kdo nastaví jen selectedId (např. zrušení výběru), nastaví tím i celý výběr.
    if ('selectedId' in patch && !('selection' in patch)) patch = { ...patch, selection: patch.selectedId ? [patch.selectedId] : [] };
    set(patch);
  },
  select(id, openDetail = true) {
    set((s) => ({ selectedId: id, selection: id ? [id] : [], selectedEdge: null, detailOpen: id ? openDetail || s.detailOpen : false }));
  },
  toggleSelect(id) {
    set((s) => {
      const has = s.selection.includes(id);
      const selection = has ? s.selection.filter((x) => x !== id) : [...s.selection, id];
      const selectedId = selection.length ? selection[selection.length - 1]! : null;
      return { selection, selectedId, selectedEdge: null, detailOpen: selection.length ? s.detailOpen || true : false };
    });
  },
  selectMany(ids, openDetail = true) {
    const selection = [...new Set(ids)];
    set((s) => ({
      selection,
      selectedId: selection.length ? selection[selection.length - 1]! : null,
      selectedEdge: null,
      detailOpen: selection.length ? openDetail || s.detailOpen : false,
    }));
  },
  toast(text, kind = 'info', action) {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind, action }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' || action ? 6000 : 3500);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  focusNode(id, zoom) {
    set({ focusRequest: { id, nonce: Date.now(), zoom } });
  },
  fitAll() {
    set((s) => ({ fitRequest: s.fitRequest + 1 }));
  },
  zoomPreset() {
    set((s) => ({ zoomPresetRequest: s.zoomPresetRequest + 1 }));
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

export const toast = (text: string, kind?: Toast['kind'], action?: Toast['action']) => useUiStore.getState().toast(text, kind, action);
