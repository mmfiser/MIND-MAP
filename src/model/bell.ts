/**
 * Zvoneček (fáze 4) – přehled termínů a upozornění, jen v otevřené aplikaci.
 *
 *  1. red: úkoly, podúkoly a projekty po termínu nebo s termínem dnes, milníky s datem dnes
 *  2. orange: zbývají 1–3 pracovní dny (stejně jako zvýraznění na uzlech)
 *  3. conflicts: kolize termínů (findDateConflicts) a termín před začátkem
 *
 * Bez uzlů Hotovo, Zrušeno, v koši a uplynulých milníků.
 * Řazení ve skupině podle termínu (nejstarší první), při shodě podle priority.
 */
import { describeConflict, findDateConflicts, type DateConflict } from './conflicts';
import type { Ymd } from './dates';
import { deadlineState, type DeadlineState } from './deadline';
import type { DocData, MapNode, Priority } from './types';

export interface BellItem {
  /** stabilní klíč pro React */
  key: string;
  nodeId: string;
  state: DeadlineState;
  /** u kolize krátký důvod */
  reason?: string;
  conflict?: DateConflict;
}

export interface BellGroups {
  red: BellItem[];
  orange: BellItem[];
  conflicts: BellItem[];
  total: number;
}

const PRIO: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function compare(data: DocData) {
  return (a: BellItem, b: BellItem) => {
    const na = data.nodes[a.nodeId]!;
    const nb = data.nodes[b.nodeId]!;
    const da = na.dueDate ?? '9999-99-99';
    const db = nb.dueDate ?? '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    const p = (na.type === 'milestone' ? 2 : PRIO[na.priority]) - (nb.type === 'milestone' ? 2 : PRIO[nb.priority]);
    if (p) return p;
    return na.title.localeCompare(nb.title, 'cs');
  };
}

const live = (n: MapNode) => !n.deletedAt && n.status !== 'done' && n.status !== 'cancelled';

export function bellItems(data: DocData, today: Ymd): BellGroups {
  const red: BellItem[] = [];
  const orange: BellItem[] = [];
  for (const n of Object.values(data.nodes)) {
    if (!live(n) || !n.dueDate) continue;
    const st = deadlineState(n.dueDate, today, n.status, n.type);
    // 'past' = uplynulý milník – do zvonečku nepatří.
    if (st === 'overdue' || st === 'today') red.push({ key: `d:${n.id}`, nodeId: n.id, state: st });
    else if (st === 'soon') orange.push({ key: `d:${n.id}`, nodeId: n.id, state: st });
  }
  const conflicts: BellItem[] = findDateConflicts(data).list.map((c) => ({
    key: `c:${c.kind}:${c.nodeId}:${c.otherId ?? ''}:${c.edgeId ?? ''}`,
    nodeId: c.nodeId,
    state: deadlineState(data.nodes[c.nodeId]!.dueDate, today, data.nodes[c.nodeId]!.status, data.nodes[c.nodeId]!.type),
    reason: describeConflict(data, c, c.nodeId, today),
    conflict: c,
  }));
  const cmp = compare(data);
  red.sort(cmp);
  orange.sort(cmp);
  conflicts.sort(cmp);
  return { red, orange, conflicts, total: red.length + orange.length + conflicts.length };
}
