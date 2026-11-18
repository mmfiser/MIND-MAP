/**
 * Filtry (fáze 4). Platí pro úkoly a podúkoly; milníky jen v časových volbách
 * (Na dnešek, Na příštích 7 dní) podle svého data. Projekty filtru neodpovídají,
 * na mapě i v rejstříku se ukážou jako předci shod. Uzly v koši se nepočítají.
 * Všechny volby platí současně (A zároveň).
 */
import { addDays, type Ymd } from './dates';
import { buildHierarchyIndex, type HierarchyIndex } from './graph';
import type { DocData, MapNode, Priority } from './types';

export type FilterShow = 'all' | 'active' | 'overdue' | 'done' | 'waiting' | 'today' | 'week';

export interface FilterState {
  show: FilterShow;
  /** id projektů (prázdné = všechny) */
  projects: string[];
  priorities: Priority[];
  tags: string[];
}

export const EMPTY_FILTER: FilterState = { show: 'all', projects: [], priorities: [], tags: [] };

export const SHOW_LABEL: Record<FilterShow, string> = {
  all: 'Všechny úkoly',
  active: 'Pouze aktivní',
  overdue: 'Po termínu',
  done: 'Dokončené',
  waiting: 'Čekající',
  today: 'Na dnešek',
  week: 'Na příštích 7 dní',
};

export const WEEK_DAYS = 7;

export function isFilterActive(f: FilterState | null | undefined): f is FilterState {
  return !!f && (f.show !== 'all' || f.projects.length > 0 || f.priorities.length > 0 || f.tags.length > 0);
}

const isActive = (n: MapNode) => n.status !== 'done' && n.status !== 'cancelled';

/** Odpovídá uzel volbě „Zobrazit“ (bez projektu, priority a štítku)? */
export function matchesShow(n: MapNode, show: FilterShow, today: Ymd): boolean {
  if (n.type === 'milestone') {
    if (show === 'today') return n.dueDate === today;
    if (show === 'week') return !!n.dueDate && n.dueDate >= today && n.dueDate <= addDays(today, WEEK_DAYS);
    return false;
  }
  switch (show) {
    case 'all':
      return true;
    case 'active':
      return isActive(n);
    case 'overdue':
      return isActive(n) && !!n.dueDate && n.dueDate < today;
    case 'done':
      return n.status === 'done';
    case 'waiting':
      return n.status === 'waiting';
    case 'today':
      return isActive(n) && n.dueDate === today;
    case 'week':
      return isActive(n) && !!n.dueDate && n.dueDate >= today && n.dueDate <= addDays(today, WEEK_DAYS);
  }
}

/** Projekty, do kterých uzel patří (přes kteroukoli cestu – sdílený uzel do všech). */
export function projectsOf(data: DocData, id: string, idx: HierarchyIndex): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (data.nodes[cur]?.type === 'project') out.add(cur);
    for (const e of idx.parents.get(cur) ?? []) {
      if (!seen.has(e.source)) {
        seen.add(e.source);
        stack.push(e.source);
      }
    }
  }
  return out;
}

export interface FilterResult {
  matches: Set<string>;
  /** předci shod (všechny cesty), kromě shod samotných */
  ancestors: Set<string>;
}

export function applyFilter(data: DocData, f: FilterState, today: Ymd, index?: HierarchyIndex): FilterResult {
  const idx = index ?? buildHierarchyIndex(data);
  const tags = new Set(f.tags.map((t) => t.toLocaleLowerCase('cs')));
  const projects = new Set(f.projects);
  const priorities = new Set(f.priorities);
  const matches = new Set<string>();
  for (const n of Object.values(data.nodes)) {
    if (n.deletedAt || n.type === 'project') continue;
    if (!matchesShow(n, f.show, today)) continue;
    // Milník nemá prioritu – s filtrem priority se nezobrazí.
    if (priorities.size && (n.type === 'milestone' || !priorities.has(n.priority))) continue;
    if (tags.size && !n.tags.some((t) => tags.has(t.toLocaleLowerCase('cs')))) continue;
    if (projects.size) {
      const of = projectsOf(data, n.id, idx);
      if (![...of].some((p) => projects.has(p))) continue;
    }
    matches.add(n.id);
  }
  const ancestors = new Set<string>();
  const stack = [...matches];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of idx.parents.get(cur) ?? []) {
      if (matches.has(e.source) || ancestors.has(e.source)) continue;
      ancestors.add(e.source);
      stack.push(e.source);
    }
  }
  return { matches, ancestors };
}

/** Text aktivního filtru pro lištu nad plochou. */
export function describeFilter(data: DocData, f: FilterState): string {
  const parts: string[] = [SHOW_LABEL[f.show]];
  if (f.projects.length) {
    const names = f.projects.map((id) => `„${data.nodes[id]?.title.trim() || 'bez názvu'}“`);
    parts.push(`${f.projects.length === 1 ? 'projekt' : 'projekty'} ${names.join(', ')}`);
  }
  if (f.priorities.length) {
    const L: Record<Priority, string> = { low: 'nízká', medium: 'střední', high: 'vysoká', critical: 'kritická' };
    parts.push(`priorita ${f.priorities.map((p) => L[p]).join(', ')}`);
  }
  if (f.tags.length) parts.push(`štítek ${f.tags.map((t) => `#${t}`).join(', ')}`);
  return parts.join(' · ');
}
