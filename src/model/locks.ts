/**
 * Zamykání pozic (fáze 5). Zamčený uzel (`positionLocked`) nejde přesunout tažením,
 * šipkami, hromadným přesunem ani automatickým uspořádáním. Globální zámek
 * (volba v prohlížeči) zakáže přesouvání všech uzlů.
 */
import type { DocData, MapNode } from './types';

/** Smí se uzel přesouvat? */
export function canMove(n: Pick<MapNode, 'positionLocked' | 'deletedAt'> | undefined, globalLock: boolean): boolean {
  return !!n && !n.deletedAt && !globalLock && !n.positionLocked;
}

/**
 * Zamkne / odemkne pozici uzlů (stav pohledu – nemění updatedAt).
 * Vrací stejná data, pokud se nic nezměnilo.
 */
export function setLocked(data: DocData, ids: Iterable<string>, locked: boolean): DocData {
  let nodes: DocData['nodes'] | null = null;
  for (const id of ids) {
    const n = data.nodes[id];
    if (!n || n.deletedAt || !!n.positionLocked === locked) continue;
    nodes ??= { ...data.nodes };
    const next = { ...n };
    if (locked) next.positionLocked = true;
    else delete next.positionLocked;
    nodes[id] = next;
  }
  return nodes ? { nodes, edges: data.edges } : data;
}

/** Jsou všechny uzly zamčené? (pro popisek „Zamknout“ / „Odemknout“) */
export function allLocked(data: DocData, ids: string[]): boolean {
  const live = ids.filter((id) => data.nodes[id] && !data.nodes[id]!.deletedAt);
  return live.length > 0 && live.every((id) => data.nodes[id]!.positionLocked);
}
