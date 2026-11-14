/** Štítky – volný text; připraveno pro vyhledávání a filtry (fáze 4). */
import type { DocData } from './types';

export const MAX_TAG_LENGTH = 40;

/** Ořízne mezery, sloučí vícenásobné mezery a odstraní úvodní „#“. Prázdný → null. */
export function normalizeTag(raw: string): string | null {
  const t = raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
  return t || null;
}

/** Všechny použité štítky (bez ohledu na velikost písmen), seřazené podle četnosti. */
export function usedTags(data: DocData): string[] {
  const counts = new Map<string, { tag: string; n: number }>();
  for (const node of Object.values(data.nodes)) {
    if (node.deletedAt) continue;
    for (const t of node.tags) {
      const k = t.toLocaleLowerCase('cs');
      const c = counts.get(k);
      if (c) c.n++;
      else counts.set(k, { tag: t, n: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'cs')).map((c) => c.tag);
}

/** Návrhy pro našeptávání: použité štítky obsahující dotaz, bez již přiřazených. */
export function suggestTags(all: string[], query: string, exclude: string[], limit = 8): string[] {
  const q = query.trim().replace(/^#+/, '').toLocaleLowerCase('cs');
  const ex = new Set(exclude.map((t) => t.toLocaleLowerCase('cs')));
  return all
    .filter((t) => !ex.has(t.toLocaleLowerCase('cs')) && (!q || t.toLocaleLowerCase('cs').includes(q)))
    .slice(0, limit);
}
