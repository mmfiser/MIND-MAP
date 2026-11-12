import type { NodeType, Priority, Status } from './types';

export const STATUS_LABELS: Record<Status, string> = {
  new: 'Nový',
  in_progress: 'Probíhá',
  waiting: 'Čeká',
  blocked: 'Blokováno',
  done: 'Hotovo',
  cancelled: 'Zrušeno',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Nízká',
  medium: 'Střední',
  high: 'Vysoká',
  critical: 'Kritická',
};

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  project: 'Projekt',
  task: 'Úkol',
  milestone: 'Milník',
};

export interface PaletteColor {
  key: string;
  name: string;
  hex: string;
}

/** Paleta 20 barev projektů – středně syté odstíny čitelné ve světlém i tmavém režimu. */
export const PROJECT_PALETTE: PaletteColor[] = [
  { key: 'red', name: 'Červená', hex: '#e5484d' },
  { key: 'crimson', name: 'Karmínová', hex: '#d6336c' },
  { key: 'pink', name: 'Růžová', hex: '#e85d9e' },
  { key: 'plum', name: 'Švestková', hex: '#ae4ec4' },
  { key: 'purple', name: 'Fialová', hex: '#8e4ec6' },
  { key: 'violet', name: 'Levandulová', hex: '#6e56cf' },
  { key: 'indigo', name: 'Indigo', hex: '#4f5bd5' },
  { key: 'blue', name: 'Modrá', hex: '#0b75d9' },
  { key: 'sky', name: 'Nebeská', hex: '#1e9ad6' },
  { key: 'cyan', name: 'Azurová', hex: '#0797b9' },
  { key: 'teal', name: 'Petrolejová', hex: '#12a594' },
  { key: 'jade', name: 'Nefritová', hex: '#29a383' },
  { key: 'green', name: 'Zelená', hex: '#30a46c' },
  { key: 'grass', name: 'Travní', hex: '#46a758' },
  { key: 'lime', name: 'Limetková', hex: '#7cab1f' },
  { key: 'amber', name: 'Jantarová', hex: '#e2a336' },
  { key: 'orange', name: 'Oranžová', hex: '#f76b15' },
  { key: 'tomato', name: 'Rajčatová', hex: '#e54d2e' },
  { key: 'brown', name: 'Hnědá', hex: '#a07553' },
  { key: 'slate', name: 'Břidlicová', hex: '#64748b' },
];

export const DEFAULT_PROJECT_COLOR = 'blue';

const PALETTE_MAP = new Map(PROJECT_PALETTE.map((c) => [c.key, c]));

/** Hex barvy podle klíče; neznámý klíč nebo přímo zadaný hex se vrátí rozumně. */
export function colorHex(key: string | undefined): string {
  if (!key) return PALETTE_MAP.get(DEFAULT_PROJECT_COLOR)!.hex;
  const c = PALETTE_MAP.get(key);
  if (c) return c.hex;
  if (/^#[0-9a-f]{6}$/i.test(key)) return key;
  return PALETTE_MAP.get(DEFAULT_PROJECT_COLOR)!.hex;
}

/** Barva textu (bílá/tmavá) s dostatečným kontrastem na dané barvě pozadí. */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // kontrast vůči bílé vs. vůči téměř černé
  const whiteContrast = 1.05 / (L + 0.05);
  const darkContrast = (L + 0.05) / 0.06;
  return whiteContrast >= darkContrast * 0.85 ? '#ffffff' : '#111318';
}
