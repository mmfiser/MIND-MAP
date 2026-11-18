/**
 * Vyhledávání (fáze 4): názvy, štítky, poznámky a položky checklistu
 * bez ohledu na velikost písmen a diakritiku. Uzly v koši se nehledají.
 */
import { findFolded, foldText } from './text';
import type { DocData, MapNode } from './types';

export type SearchField = 'title' | 'tag' | 'notes' | 'checklist';

export const FIELD_LABEL: Record<SearchField, string> = {
  title: 'v názvu',
  tag: 've štítku',
  notes: 'v poznámce',
  checklist: 'v checklistu',
};

export interface SearchResult {
  id: string;
  field: SearchField;
  /** Text, ve kterém je shoda (název, štítek nebo výřez poznámky / checklistu). */
  text: string;
  /** Pozice shody v `text`: [začátek, konec). */
  range: [number, number];
}

export const MAX_RESULTS = 50;
const SNIPPET = 60;
const FIELD_ORDER: Record<SearchField, number> = { title: 0, tag: 1, notes: 2, checklist: 3 };

/** Výřez kolem shody (poznámky bývají dlouhé). `text` už má sloučené mezery. */
function snippet(text: string, range: [number, number]): { text: string; range: [number, number] } {
  const len = range[1] - range[0];
  const start = Math.max(0, range[0] - Math.max(0, Math.floor((SNIPPET - len) / 2)));
  const end = Math.min(text.length, start + Math.max(SNIPPET, len));
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const s = range[0] - start + prefix.length;
  return { text: prefix + text.slice(start, end) + suffix, range: [s, s + len] };
}

const flat = (t: string) => t.replace(/\s+/g, ' ').trim();

function matchNode(n: MapNode, q: string): SearchResult | null {
  const title = n.title.trim() || 'Bez názvu';
  const t = findFolded(title, q);
  if (t) return { id: n.id, field: 'title', text: title, range: t };
  for (const tag of n.tags) {
    const r = findFolded(tag, q);
    if (r) return { id: n.id, field: 'tag', text: tag, range: r };
  }
  const notes = flat(n.notes);
  const nr = findFolded(notes, q);
  if (nr) return { id: n.id, field: 'notes', ...snippet(notes, nr) };
  for (const c of n.checklist) {
    const text = flat(c.text);
    const r = findFolded(text, q);
    if (r) return { id: n.id, field: 'checklist', ...snippet(text, r) };
  }
  return null;
}

/**
 * Výsledky hledání: shoda v názvu před shodou ve štítku, poznámce a checklistu,
 * v rámci skupiny podle názvu. Vrací nejvýš `limit` výsledků a celkový počet.
 */
export function searchNodes(data: DocData, query: string, limit = MAX_RESULTS): { results: SearchResult[]; total: number } {
  const q = foldText(query);
  if (!q) return { results: [], total: 0 };
  const all: SearchResult[] = [];
  for (const n of Object.values(data.nodes)) {
    if (n.deletedAt) continue;
    const r = matchNode(n, q);
    if (r) all.push(r);
  }
  all.sort((a, b) => {
    const f = FIELD_ORDER[a.field] - FIELD_ORDER[b.field];
    if (f) return f;
    // shoda na začátku názvu dřív
    if (a.field === 'title' && a.range[0] !== b.range[0] && (a.range[0] === 0 || b.range[0] === 0)) return a.range[0] === 0 ? -1 : 1;
    return (data.nodes[a.id]!.title || '').localeCompare(data.nodes[b.id]!.title || '', 'cs');
  });
  return { results: all.slice(0, limit), total: all.length };
}
