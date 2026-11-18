/** Porovnávání textu bez ohledu na diakritiku a velikost písmen. */

export function foldText(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * Složený text (bez diakritiky, malými písmeny) + mapa pozic zpět do originálu.
 * `map[i]` = index znaku originálu, ze kterého vznikl i-tý znak složeného textu.
 */
export function foldWithMap(s: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of s) {
    const f = ch.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    for (let k = 0; k < f.length; k++) map.push(i);
    folded += f;
    i += ch.length;
  }
  map.push(i);
  return { folded, map };
}

/** Pozice shody dotazu (už složeného) v originálním textu: [začátek, konec) nebo null. */
export function findFolded(text: string, foldedQuery: string): [number, number] | null {
  if (!foldedQuery) return null;
  const { folded, map } = foldWithMap(text);
  const at = folded.indexOf(foldedQuery);
  if (at < 0) return null;
  return [map[at]!, map[at + foldedQuery.length]!];
}
