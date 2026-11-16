/**
 * Blokující závislosti (fáze 3). Jen informativní – stav uzlu se nemění.
 *  - úkol / projekt blokuje, dokud není Hotovo ani Zrušeno
 *  - milník blokuje, dokud jeho datum nenastalo (v den milníku už ne; bez data neblokuje)
 */
import type { Ymd } from './dates';
import type { DocData, MapNode } from './types';

export function isBlocking(n: MapNode | undefined, today: Ymd): boolean {
  if (!n || n.deletedAt) return false;
  if (n.type === 'milestone') return !!n.dueDate && today < n.dueDate;
  return n.status !== 'done' && n.status !== 'cancelled';
}

/** Uzly, na které uzel `id` čeká (aktivní blokující závislosti), seřazené podle názvu. */
export function activeBlockers(data: DocData, id: string, today: Ymd): MapNode[] {
  const out: MapNode[] = [];
  for (const e of Object.values(data.edges)) {
    if (e.kind !== 'dependency' || e.target !== id) continue;
    const src = data.nodes[e.source];
    if (isBlocking(src, today)) out.push(src!);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, 'cs'));
}

/** Mapa uzel → blokující uzly pro celý dokument (jeden průchod vazbami). */
export function blockersIndex(data: DocData, today: Ymd): Map<string, MapNode[]> {
  const map = new Map<string, MapNode[]>();
  for (const e of Object.values(data.edges)) {
    if (e.kind !== 'dependency') continue;
    const t = data.nodes[e.target];
    if (!t || t.deletedAt) continue;
    const src = data.nodes[e.source];
    if (!isBlocking(src, today)) continue;
    let l = map.get(e.target);
    if (!l) map.set(e.target, (l = []));
    l.push(src!);
  }
  for (const l of map.values()) l.sort((a, b) => a.title.localeCompare(b.title, 'cs'));
  return map;
}

/** „A“, „B“ a 2 další */
export function listNames(nodes: { title: string }[], max = 3): string {
  const names = nodes.slice(0, max).map((n) => `„${n.title.trim() || 'bez názvu'}“`);
  const more = nodes.length - max;
  return more > 0 ? `${names.join(', ')} a ${more} ${more === 1 ? 'další' : 'dalších'}` : names.join(', ');
}
