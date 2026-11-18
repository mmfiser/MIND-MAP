import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useFilterResult } from '../../app/viewQueries';
import { EMPTY_FILTER, SHOW_LABEL, describeFilter, isFilterActive, type FilterShow, type FilterState } from '../../model/filters';
import { colorHex } from '../../model/labels';
import { usedTags } from '../../model/tags';
import type { Priority } from '../../model/types';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { PRIORITY_META, PRIORITY_ORDER } from '../common/statusMeta';
import { Dialog } from '../dialogs/Dialog';

const SHOWS: FilterShow[] = ['all', 'active', 'overdue', 'done', 'waiting', 'today', 'week'];

/** Počet aktivních kritérií (pro odznak na tlačítku). */
export function filterCount(f: FilterState | null): number {
  if (!isFilterActive(f)) return 0;
  return (f.show !== 'all' ? 1 : 0) + f.projects.length + f.priorities.length + f.tags.length;
}

export function openFilter(): void {
  useUiStore.getState().set({ filterOpen: true });
}

export function clearFilter(): void {
  useUiStore.getState().set({ filter: null });
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Panel voleb filtru – změny platí hned, filtr se neukládá do dokumentu. */
export function FilterDialog() {
  const open = useUiStore((s) => s.filterOpen);
  const filter = useUiStore((s) => s.filter) ?? EMPTY_FILTER;
  const doc = useDocStore((s) => s.doc);
  const res = useFilterResult();
  const projects = useMemo(
    () =>
      doc
        ? Object.values(doc.nodes)
            .filter((n) => n.type === 'project' && !n.deletedAt)
            .sort((a, b) => a.title.localeCompare(b.title, 'cs'))
        : [],
    [doc],
  );
  const tags = useMemo(() => (doc ? usedTags(doc) : []), [doc]);
  if (!open || !doc) return null;
  const close = () => useUiStore.getState().set({ filterOpen: false });
  const set = (patch: Partial<FilterState>) => {
    const next = { ...filter, ...patch };
    useUiStore.getState().set({ filter: isFilterActive(next) ? next : null });
  };
  const count = res ? res.matches.size : null;

  return (
    <Dialog
      title="Filtr"
      onClose={close}
      className="filter-dialog"
      footer={
        <>
          <button className="btn" onClick={() => clearFilter()} disabled={!isFilterActive(filter)}>
            Zrušit filtr
          </button>
          <button className="btn primary" onClick={close} data-autofocus>
            {count === null ? 'Hotovo' : `Zobrazit (${count})`}
          </button>
        </>
      }
    >
      <div className="filter-section">
        <div className="filter-title">Zobrazit</div>
        <div className="chip-group" role="radiogroup" aria-label="Zobrazit">
          {SHOWS.map((s) => (
            <button key={s} role="radio" aria-checked={filter.show === s} className={`toggle-chip${filter.show === s ? ' on' : ''}`} onClick={() => set({ show: s })}>
              {SHOW_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {projects.length > 0 && (
        <div className="filter-section">
          <div className="filter-title">Projekt</div>
          <div className="chip-group" role="group" aria-label="Projekt">
            {projects.map((p) => {
              const on = filter.projects.includes(p.id);
              return (
                <button key={p.id} aria-pressed={on} className={`toggle-chip${on ? ' on' : ''}`} onClick={() => set({ projects: toggle(filter.projects, p.id) })}>
                  <span className="tree-dot" style={{ background: colorHex(p.color), margin: 0 }} />
                  {p.title.trim() || 'Bez názvu'}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="filter-section">
        <div className="filter-title">Priorita</div>
        <div className="chip-group" role="group" aria-label="Priorita">
          {PRIORITY_ORDER.map((p: Priority) => {
            const on = filter.priorities.includes(p);
            return (
              <button key={p} aria-pressed={on} className={`toggle-chip${on ? ' on' : ''}`} onClick={() => set({ priorities: toggle(filter.priorities, p) })}>
                <span className="prio-dot" style={{ background: PRIORITY_META[p].color }} />
                {PRIORITY_META[p].label}
              </button>
            );
          })}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="filter-section">
          <div className="filter-title">Štítek</div>
          <div className="chip-group" role="group" aria-label="Štítek">
            {tags.map((t) => {
              const on = filter.tags.includes(t);
              return (
                <button key={t} aria-pressed={on} className={`toggle-chip${on ? ' on' : ''}`} onClick={() => set({ tags: toggle(filter.tags, t) })}>
                  #{t}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="muted filter-note">Filtr se týká úkolů a podúkolů, milníky se zobrazí v časových volbách. Po obnovení stránky se filtr vypne.</p>
    </Dialog>
  );
}

/** Lišta aktivního filtru nad plochou. */
export function FilterBar() {
  const filter = useUiStore((s) => s.filter);
  const doc = useDocStore((s) => s.doc);
  const res = useFilterResult();
  if (!isFilterActive(filter) || !doc || !res) return null;
  const n = res.matches.size;
  return (
    <div className="filter-bar" role="status">
      <button className="filter-bar-text" onClick={openFilter} title="Upravit filtr">
        <strong>Filtr:</strong> {describeFilter(doc, filter)} · {n} {n === 1 ? 'shoda' : n >= 2 && n <= 4 ? 'shody' : 'shod'}
      </button>
      <button className="btn small" onClick={clearFilter}>
        <X size={16} /> Zrušit filtr
      </button>
    </div>
  );
}
