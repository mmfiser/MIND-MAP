/**
 * Kolize termínů (fáze 3). Výsledek použije i zvoneček ve fázi 4.
 *
 *  1. dependency – blokovaný uzel má termín dříve nebo ve stejný den jako blokující
 *     (u milníku jeho datum)
 *  2. hierarchy – poduzel má termín později než nadřazený úkol / deadline projektu
 *     (sdílený uzel vůči každému rodiči)
 *  3. dueBeforeStart – termín dříve než začátek (beze změny z fáze 2)
 *
 * Nepočítají se uzly Hotovo, Zrušeno a uzly v koši.
 */
import { dueBeforeStart } from './deadline';
import type { DocData, MapNode } from './types';

export type DateConflictKind = 'dependency' | 'hierarchy' | 'dueBeforeStart';

export interface DateConflict {
  kind: DateConflictKind;
  /** dependency: blokovaný; hierarchy: poduzel; dueBeforeStart: uzel */
  nodeId: string;
  /** dependency: blokující; hierarchy: rodič */
  otherId?: string;
  edgeId?: string;
}

export interface ConflictReport {
  list: DateConflict[];
  /** uzel → kolize, kterých se účastní (z obou stran vazby) */
  byNode: Map<string, DateConflict[]>;
  /** vazby, které se mají zvýraznit oranžově */
  edgeIds: Set<string>;
}

function active(n: MapNode | undefined): n is MapNode {
  return !!n && !n.deletedAt && n.status !== 'done' && n.status !== 'cancelled';
}

export function findDateConflicts(data: DocData): ConflictReport {
  const list: DateConflict[] = [];
  for (const n of Object.values(data.nodes)) {
    if (active(n) && dueBeforeStart(n)) list.push({ kind: 'dueBeforeStart', nodeId: n.id });
  }
  const edges = Object.values(data.edges).sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  for (const e of edges) {
    if (e.kind === 'related') continue;
    const s = data.nodes[e.source];
    const t = data.nodes[e.target];
    if (!active(s) || !active(t) || !s.dueDate || !t.dueDate) continue;
    if (e.kind === 'dependency' && t.dueDate <= s.dueDate) {
      list.push({ kind: 'dependency', nodeId: t.id, otherId: s.id, edgeId: e.id });
    } else if (e.kind === 'hierarchy' && t.dueDate > s.dueDate) {
      list.push({ kind: 'hierarchy', nodeId: t.id, otherId: s.id, edgeId: e.id });
    }
  }
  const byNode = new Map<string, DateConflict[]>();
  const edgeIds = new Set<string>();
  const add = (id: string, c: DateConflict) => {
    let l = byNode.get(id);
    if (!l) byNode.set(id, (l = []));
    l.push(c);
  };
  for (const c of list) {
    add(c.nodeId, c);
    if (c.otherId) add(c.otherId, c);
    if (c.edgeId) edgeIds.add(c.edgeId);
  }
  return { list, byNode, edgeIds };
}

/** Stabilní klíč kolize – pro zjištění, které kolize jsou nové. */
export const conflictKey = (c: DateConflict): string => `${c.kind}:${c.nodeId}:${c.otherId ?? ''}:${c.edgeId ?? ''}`;

const q = (n: MapNode | undefined) => `„${n?.title.trim() || 'bez názvu'}“`;

/** Texty kolizí jsou v messages.ts (jedno místo pro všechny hlášky). */
export { describeConflict } from './messages';

/** Názvy druhých uzlů v kolizích (pro oznámení „Termín koliduje s: …“). */
export function conflictPartners(data: DocData, conflicts: DateConflict[], viewId: string): string[] {
  const names: string[] = [];
  for (const c of conflicts) {
    if (c.kind === 'dueBeforeStart') continue;
    const otherId = c.nodeId === viewId ? c.otherId : c.nodeId;
    const label = q(otherId ? data.nodes[otherId] : undefined);
    if (!names.includes(label)) names.push(label);
  }
  return names;
}

/** Počet uzlů, které mají nějakou kolizi (kontrola po načtení). */
export function countConflictNodes(report: ConflictReport): number {
  return report.byNode.size;
}
