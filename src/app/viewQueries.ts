/**
 * Sdílené výsledky filtru a hledání pro plochu, rejstřík a lišty.
 * Výpočet se uloží pro poslední vstup, takže ho komponenty nepočítají každá zvlášť.
 */
import { applyFilter, isFilterActive, type FilterResult, type FilterState } from '../model/filters';
import { searchNodes, type SearchResult } from '../model/search';
import type { DocData } from '../model/types';
import { useDocStore } from '../store/docStore';
import { useUiStore } from '../store/uiStore';

let fCache: { nodes: unknown; edges: unknown; filter: FilterState; today: string; res: FilterResult } | null = null;

export function filterResult(doc: DocData | null, filter: FilterState | null, today: string): FilterResult | null {
  if (!doc || !isFilterActive(filter)) return null;
  if (fCache && fCache.nodes === doc.nodes && fCache.edges === doc.edges && fCache.filter === filter && fCache.today === today) {
    return fCache.res;
  }
  const res = applyFilter(doc, filter, today);
  fCache = { nodes: doc.nodes, edges: doc.edges, filter, today, res };
  return res;
}

export function useFilterResult(): FilterResult | null {
  const doc = useDocStore((s) => s.doc);
  const filter = useUiStore((s) => s.filter);
  const today = useUiStore((s) => s.today);
  return filterResult(doc, filter, today);
}

let sCache: { nodes: unknown; query: string; res: { results: SearchResult[]; total: number } } | null = null;

export function searchResult(doc: DocData | null, query: string): { results: SearchResult[]; total: number } {
  if (!doc || !query.trim()) return { results: [], total: 0 };
  if (sCache && sCache.nodes === doc.nodes && sCache.query === query) return sCache.res;
  const res = searchNodes(doc, query);
  sCache = { nodes: doc.nodes, query, res };
  return res;
}
