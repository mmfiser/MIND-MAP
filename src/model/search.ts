/**
 * Vyhledávání (fáze 4): názvy, štítky, poznámky a položky checklistu
 * bez ohledu na velikost písmen a diakritiku. Uzly v koši se nehledají.
 */
import { foldText, foldWithMap } from './text';
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

/** Text převedený na tvar bez diakritiky + mapa pozic zpět do originálu. */
interface FoldedText {
  text: string;
  folded: string;
  map: number[];
}
interface FoldedNode {
  title: FoldedText;
  tags: FoldedText[];
  notes: FoldedText;
  checklist: FoldedText[];
}
const fold = (text: string): FoldedText => ({ text, ...foldWithMap(text) });

/**
 * Mezipaměť převedených textů: počítá se jednou pro každý (nezměněný) uzel,
 * ne při každém dotazu. Klíčem je objekt uzlu – při změně uzlu vznikne nový.
 */
const cache = new WeakMap<MapNode, FoldedNode>();
function folded(n: MapNode): FoldedNode {
  let f = cache.get(n);
  if (!f) {
    f = {
      title: fold(n.title.trim() || 'Bez názvu'),
      tags: n.tags.map(fold),
      notes: fold(flat(n.notes)),
      checklist: n.checklist.map((c) => fold(flat(c.text))),
    };
    cache.set(n, f);
  }
  return f;
}

function find(f: FoldedText, q: string): [number, number] | null {
  const at = f.folded.indexOf(q);
  return at < 0 ? null : [f.map[at]!, f.map[at + q.length]!];
}

function matchNode(n: MapNode, q: string): SearchResult | null {
  const f = folded(n);
  const t = find(f.title, q);
  if (t) return { id: n.id, field: 'title', text: f.title.text, range: t };
  for (const tag of f.tags) {
    const r = find(tag, q);
    if (r) return { id: n.id, field: 'tag', text: tag.text, range: r };
  }
  const nr = find(f.notes, q);
  if (nr) return { id: n.id, field: 'notes', ...snippet(f.notes.text, nr) };
  for (const c of f.checklist) {
    const r = find(c, q);
    if (r) return { id: n.id, field: 'checklist', ...snippet(c.text, r) };
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
