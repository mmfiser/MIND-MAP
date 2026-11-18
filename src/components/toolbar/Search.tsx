import { ArrowLeft, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { goToNode } from '../../app/linkActions';
import { searchResult } from '../../app/viewQueries';
import { formatShort } from '../../model/dates';
import { deadlineState } from '../../model/deadline';
import { owningProject } from '../../model/graph';
import { FIELD_LABEL, type SearchResult } from '../../model/search';
import type { MapDocument } from '../../model/types';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { STATUS_META } from '../common/statusMeta';
import { NodeIcon } from '../detail/LinksSection';

const DEBOUNCE_MS = 150;

let inputEl: HTMLInputElement | null = null;

/** Ctrl+F / „/“: otevře a označí pole hledání (na telefonu nejdřív otevře řádek hledání). */
export function focusSearch(): void {
  const ui = useUiStore.getState();
  if (!ui.searchOpen) ui.set({ searchOpen: true });
  setTimeout(() => {
    inputEl?.focus();
    inputEl?.select();
  }, 0);
}

function Highlight({ text, range }: { text: string; range?: [number, number] }) {
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <mark>{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

function ResultRow({ doc, r, active, onPick }: { doc: MapDocument; r: SearchResult; active: boolean; onPick: () => void }) {
  const today = useUiStore((s) => s.today);
  const n = doc.nodes[r.id];
  if (!n) return null;
  const project = n.type === 'project' ? undefined : owningProject(doc, n.id);
  const state = deadlineState(n.dueDate, today, n.status, n.type);
  const title = n.title.trim() || 'Bez názvu';
  return (
    <button
      role="option"
      aria-selected={active}
      className={`search-row${active ? ' active' : ''}`}
      onPointerDown={(e) => e.preventDefault()} // nepřebírat fokus z pole
      onClick={onPick}
    >
      <NodeIcon n={n} />
      <span className="search-text">
        <span className="name">
          <Highlight text={title} range={r.field === 'title' ? r.range : undefined} />
        </span>
        <span className="sub">
          {project && <span>{project.title.trim() || 'Bez názvu'}</span>}
          <span>{n.type === 'milestone' ? 'Milník' : STATUS_META[n.status].label}</span>
          {n.dueDate && <span className={`chip due ${state}`}>{formatShort(n.dueDate, today)}</span>}
        </span>
        {r.field !== 'title' && (
          <span className="where">
            {FIELD_LABEL[r.field]}: <Highlight text={r.field === 'tag' ? `#${r.text}` : r.text} range={r.field === 'tag' ? [r.range[0] + 1, r.range[1] + 1] : r.range} />
          </span>
        )}
      </span>
    </button>
  );
}

/** Pole hledání s výsledky. Na telefonu přes celou šířku lišty (`mobile`). */
export function SearchBox({ mobile }: { mobile: boolean }) {
  const doc = useDocStore((s) => s.doc);
  const query = useUiStore((s) => s.searchQuery);
  const [text, setText] = useState(query);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputEl = ref.current;
    return () => {
      if (inputEl === ref.current) inputEl = null;
    };
  }, []);

  // Debounce: výsledky (a označení na mapě) se přepočítají až po krátké pauze v psaní.
  useEffect(() => {
    const t = setTimeout(() => {
      if (useUiStore.getState().searchQuery !== text) useUiStore.getState().set({ searchQuery: text, searchPick: null });
      setActive(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const { results, total } = searchResult(doc, query);

  useEffect(() => {
    listRef.current?.querySelector('.search-row.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (r: SearchResult | undefined) => {
    if (!r) return;
    setOpen(false);
    ref.current?.blur();
    const ui = useUiStore.getState();
    ui.set({ searchPick: r.id, ...(mobile ? { searchOpen: false } : {}) });
    goToNode(r.id);
  };

  const clear = () => {
    setText('');
    useUiStore.getState().set({ searchQuery: '', searchPick: null });
  };

  const close = () => {
    clear();
    setOpen(false);
    ref.current?.blur();
    if (mobile) useUiStore.getState().set({ searchOpen: false });
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const showList = open && text.trim().length > 0;
  return (
    <div className={`search${mobile ? ' mobile' : ''}`} role="search">
      {mobile ? (
        <button className="tb-btn" aria-label="Zavřít hledání" title="Zavřít hledání" onClick={close}>
          <ArrowLeft size={19} />
        </button>
      ) : (
        <SearchIcon size={16} className="search-icon" aria-hidden />
      )}
      <input
        ref={ref}
        className="search-input"
        type="search"
        value={text}
        placeholder={mobile ? 'Hledat v mapě…' : 'Hledat (Ctrl+F)'}
        aria-label="Hledat v názvech, poznámkách, checklistu a štítcích"
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-results"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {text && (
        <button className="search-clear" aria-label="Vymazat hledání" title="Vymazat" onPointerDown={(e) => e.preventDefault()} onClick={clear}>
          <X size={16} />
        </button>
      )}
      {showList && doc && (
        <div className="search-results" id="search-results" role="listbox" ref={listRef}>
          {query.trim() !== text.trim() ? (
            <div className="search-empty">Hledám…</div>
          ) : results.length === 0 ? (
            <div className="search-empty">Nic nenalezeno.</div>
          ) : (
            <>
              {results.map((r, i) => (
                <ResultRow key={r.id} doc={doc} r={r} active={i === active} onPick={() => pick(r)} />
              ))}
              {total > results.length && (
                <div className="search-empty">
                  Zobrazeno {results.length} z {total} výsledků – upřesněte hledání.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
