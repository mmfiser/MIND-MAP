import { GripVertical, Plus, Search, Trash2, X } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { deadlineState } from '../../model/deadline';
import { dueSuffix } from '../../model/messages';
import { formatShort } from '../../model/dates';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  addChecklistItem,
  addTagTo,
  moveChecklistItem,
  removeChecklistItem,
  removeTagFrom,
  setDateOf,
  setIconOf,
  setPriorityOf,
  setStatusOf,
  toggleChecklistItem,
  updateChecklistText,
} from '../../app/actions';
import { usePointerSort } from '../../hooks/usePointerSort';
import { suggestTags, usedTags } from '../../model/tags';
import type { MapNode } from '../../model/types';
import { useDocStore } from '../../store/docStore';
import { filterIconGroups, projectIcon } from '../common/projectIcons';
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from '../common/statusMeta';

export function StatusSelect({ node }: { node: MapNode }) {
  return (
    <div className="option-grid status-grid" role="radiogroup" aria-label="Stav">
      {STATUS_ORDER.map((s) => {
        const m = STATUS_META[s];
        const on = node.status === s;
        return (
          <button key={s} role="radio" aria-checked={on} className={`opt ${m.tone}${on ? ' on' : ''}`} onClick={() => setStatusOf(node.id, s)}>
            <m.Icon size={16} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export function PrioritySelect({ node }: { node: MapNode }) {
  return (
    <div className="option-grid prio-grid" role="radiogroup" aria-label="Priorita">
      {PRIORITY_ORDER.map((p) => {
        const on = node.priority === p;
        return (
          <button key={p} role="radio" aria-checked={on} className={`opt${on ? ' on' : ''}`} onClick={() => setPriorityOf(node.id, p)}>
            <span className="prio-dot" style={{ background: PRIORITY_META[p].color }} />
            {PRIORITY_META[p].label}
          </button>
        );
      })}
    </div>
  );
}

export function DateField({ node, field, label }: { node: MapNode; field: 'startDate' | 'dueDate'; label: string }) {
  const value = node[field] ?? '';
  return (
    <label className="field">
      <span>{label}</span>
      <div className="date-row">
        <input
          className="input"
          type="date"
          value={value}
          min="1900-01-01"
          max="2199-12-31"
          onChange={(e) => {
            const v = e.target.value;
            if (!v) setDateOf(node.id, field, null);
            else if (Number(v.slice(0, 4)) >= 1900) setDateOf(node.id, field, v);
          }}
        />
        {value && (
          <button className="icon-btn" title="Smazat datum" aria-label={`Smazat: ${label}`} onClick={() => setDateOf(node.id, field, null)}>
            <X size={18} />
          </button>
        )}
      </div>
    </label>
  );
}

/** Stav termínu v detailu – plný tvar: „16. 11. · 2 dny po termínu“, „18. 11. · Milník dnes“. */
export function DueStatus({ node }: { node: MapNode }) {
  const today = useUiStore((s) => s.today);
  if (!node.dueDate) return null;
  const state = deadlineState(node.dueDate, today, node.status, node.type);
  const suffix = dueSuffix(node, state, today);
  if (!suffix) return null;
  return (
    <div className="due-status">
      <span className={`chip due ${state}`}>
        {formatShort(node.dueDate, today)} · {suffix}
      </span>
    </div>
  );
}

export function IconPicker({ node }: { node: MapNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = projectIcon(node.icon);
  const groups = useMemo(() => filterIconGroups(query), [query]);
  return (
    <div className="field">
      <span>{node.type === 'project' ? 'Ikona projektu' : node.type === 'milestone' ? 'Ikona milníku' : 'Ikona úkolu'}</span>
      <div className="icon-current">
        <button
          className="btn small"
          onClick={() => {
            setOpen((o) => !o);
            setQuery('');
          }}
          aria-expanded={open}
        >
          {current ? <current.Icon size={18} /> : null}
          {current ? current.label : 'Vybrat ikonu'}
        </button>
        {current && (
          <button className="btn small ghost" onClick={() => setIconOf(node.id, null)}>
            Odebrat ikonu
          </button>
        )}
      </div>
      {open && (
        <div className="icon-picker">
          <div className="icon-search">
            <Search size={16} aria-hidden />
            <input
              className="input"
              type="search"
              value={query}
              placeholder="Hledat ikonu (např. vysilac, myš)…"
              aria-label="Hledat ikonu"
              onChange={(e) => setQuery(e.target.value)}
              autoFocus={!window.matchMedia('(pointer: coarse)').matches}
            />
          </div>
          {groups.length === 0 && <div className="muted">Žádná ikona neodpovídá hledání.</div>}
          {groups.map((g) => (
            <div key={g.name}>
              <div className="icon-group-name">{g.name}</div>
              <div className="icon-grid">
                {g.icons.map((i) => (
                  <button
                    key={i.key}
                    className={`icon-opt${node.icon === i.key ? ' on' : ''}`}
                    title={i.label}
                    aria-pressed={node.icon === i.key}
                    onClick={() => {
                      setIconOf(node.id, i.key);
                      setOpen(false);
                    }}
                  >
                    <i.Icon size={20} />
                    <span>{i.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TagInput({ node }: { node: MapNode }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const doc = useDocStore((s) => s.doc);
  const all = useMemo(() => (doc ? usedTags(doc) : []), [doc]);
  const suggestions = focused ? suggestTags(all, text, node.tags) : [];

  const add = (t: string) => {
    addTagTo(node.id, t);
    setText('');
    setActive(-1);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const pick = active >= 0 ? suggestions[active] : undefined;
      if (pick) add(pick);
      else if (text.trim()) add(text);
    } else if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === 'Backspace' && !text && node.tags.length) {
      removeTagFrom(node.id, node.tags[node.tags.length - 1]!);
    } else if (e.key === 'Escape') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="field">
      <span>Štítky</span>
      <div className="tag-box">
        {node.tags.map((t) => (
          <span className="tag-pill" key={t}>
            #{t}
            <button aria-label={`Odebrat štítek ${t}`} title="Odebrat" onClick={() => removeTagFrom(node.id, t)}>
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          value={text}
          placeholder={node.tags.length ? 'Další štítek…' : 'Přidat štítek…'}
          enterKeyHint="done"
          onChange={(e) => {
            setText(e.target.value);
            setActive(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={onKey}
          aria-label="Nový štítek"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="tag-suggest" role="listbox">
          {suggestions.map((s, i) => (
            <button
              key={s}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => add(s)}
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChecklistEditor({ node }: { node: MapNode }) {
  const [newText, setNewText] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { sort, startSort } = usePointerSort((from, to) => moveChecklistItem(node.id, from, to));
  const done = node.checklist.filter((c) => c.done).length;

  useEffect(() => {
    if (!focusId) return;
    listRef.current?.querySelector<HTMLInputElement>(`[data-item-id="${focusId}"]`)?.focus();
    setFocusId(null);
  }, [focusId, node.checklist]);

  // Náhled pořadí během tažení.
  const items = node.checklist.map((c, i) => ({ c, i }));
  if (sort && sort.from !== sort.over) {
    const [moved] = items.splice(sort.from, 1);
    if (moved) items.splice(sort.over, 0, moved);
  }

  const onItemKey = (e: KeyboardEvent<HTMLInputElement>, index: number, id: string, text: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setFocusId(addChecklistItem(node.id, '', index));
    } else if (e.key === 'Backspace' && !text) {
      e.preventDefault();
      const prev = node.checklist[index - 1];
      removeChecklistItem(node.id, id);
      if (prev) setFocusId(prev.id);
    }
  };

  return (
    <div className="field">
      <span>
        Checklist {node.checklist.length > 0 && <em className="count-inline">{done}/{node.checklist.length}</em>}
      </span>
      <div className="checklist" ref={listRef} data-sort-list>
        {items.map(({ c, i }, pos) => (
          <div key={c.id} className={`check-row${sort?.from === i ? ' dragging' : ''}`} data-sort-index={pos}>
            <span className="check-grip" title="Přetáhněte pro změnu pořadí" onPointerDown={(e) => startSort(e, i)}>
              <GripVertical size={16} />
            </span>
            <input
              type="checkbox"
              className="check-box"
              checked={c.done}
              onChange={() => toggleChecklistItem(node.id, c.id)}
              aria-label={c.done ? 'Označit jako nesplněné' : 'Označit jako splněné'}
            />
            <input
              className={`check-text${c.done ? ' done' : ''}`}
              value={c.text}
              data-item-id={c.id}
              placeholder="Položka"
              enterKeyHint="next"
              onChange={(e) => updateChecklistText(node.id, c.id, e.target.value)}
              onKeyDown={(e) => onItemKey(e, i, c.id, c.text)}
            />
            <button className="icon-btn" aria-label="Smazat položku" title="Smazat položku" onClick={() => removeChecklistItem(node.id, c.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="check-row add">
          <span className="check-grip placeholder">
            <Plus size={16} />
          </span>
          <input
            className="check-text"
            value={newText}
            placeholder="Přidat položku…"
            enterKeyHint="enter"
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newText.trim()) {
                e.preventDefault();
                addChecklistItem(node.id, newText.trim());
                setNewText('');
              }
            }}
            aria-label="Nová položka checklistu"
          />
        </div>
      </div>
    </div>
  );
}
