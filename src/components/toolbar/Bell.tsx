import { Bell as BellIcon, X } from 'lucide-react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { goToNode } from '../../app/linkActions';
import { bellItems, type BellGroups, type BellItem } from '../../model/bell';
import { formatShort } from '../../model/dates';
import { owningProject } from '../../model/graph';
import type { MapDocument } from '../../model/types';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import { NodeIcon } from '../detail/LinksSection';

/** Položky zvonečku – přepočet při změně dat a o půlnoci (změna „dnes“). */
export function useBell(): BellGroups | null {
  const doc = useDocStore((s) => s.doc);
  const today = useUiStore((s) => s.today);
  return useMemo(() => (doc ? bellItems(doc, today) : null), [doc?.nodes, doc?.edges, today]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Tlačítko se zvonečkem a odznakem počtu (červený = aspoň jedna červená položka). */
export function BellButton({ className }: { className?: string }) {
  const bell = useBell();
  const open = useUiStore((s) => s.bellOpen);
  const total = bell?.total ?? 0;
  const label = total ? `Upozornění (${total})` : 'Upozornění – nic k řešení';
  return (
    <button
      className={`tb-btn bell-btn${open ? ' active' : ''}${className ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
      aria-expanded={open}
      onClick={() => useUiStore.getState().set({ bellOpen: !open })}
    >
      <BellIcon size={19} />
      <span className="tb-label">Upozornění</span>
      {total > 0 && <span className={`bell-badge${bell!.red.length ? ' red' : ''}`}>{total > 99 ? '99+' : total}</span>}
    </button>
  );
}

function Item({ doc, item, onPick }: { doc: MapDocument; item: BellItem; onPick: () => void }) {
  const today = useUiStore((s) => s.today);
  const n = doc.nodes[item.nodeId];
  if (!n) return null;
  const project = n.type === 'project' ? undefined : owningProject(doc, n.id);
  return (
    <button className="bell-item" onClick={onPick}>
      <NodeIcon n={n} />
      <span className="bell-text">
        <span className="name">{n.title.trim() || 'Bez názvu'}</span>
        <span className="sub">
          {project && <span>{project.title.trim() || 'Bez názvu'}</span>}
          {n.dueDate && <span className={`chip due ${item.state}`}>{formatShort(n.dueDate, today)}</span>}
        </span>
        {item.reason && <span className="reason">{item.reason}</span>}
      </span>
    </button>
  );
}

function Group({ title, tone, items, doc, onPick }: { title: string; tone: string; items: BellItem[]; doc: MapDocument; onPick: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <section className={`bell-group ${tone}`}>
      <h3>
        {title} <span className="count">{items.length}</span>
      </h3>
      {items.map((i) => (
        <Item key={i.key} doc={doc} item={i} onPick={() => onPick(i.nodeId)} />
      ))}
    </section>
  );
}

function Panel({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="bell-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bell-panel" role="dialog" aria-label="Upozornění">
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Rozbalovací panel zvonečku (na telefonu spodní panel). */
export function BellPanel() {
  const open = useUiStore((s) => s.bellOpen);
  const doc = useDocStore((s) => s.doc);
  const bell = useBell();
  if (!open || !doc || !bell) return null;
  const close = () => useUiStore.getState().set({ bellOpen: false });
  const pick = (id: string) => {
    close();
    goToNode(id);
  };
  return (
    <Panel onClose={close}>
      <div className="bell-head">
        <h2>Upozornění</h2>
        <button className="icon-btn" onClick={close} aria-label="Zavřít" title="Zavřít">
          <X size={18} />
        </button>
      </div>
      <div className="bell-body">
        {bell.total === 0 && <div className="muted bell-empty">Nic po termínu ani blížícího se. 👍</div>}
        <Group title="Po termínu a dnes" tone="red" items={bell.red} doc={doc} onPick={pick} />
        <Group title="Blíží se" tone="orange" items={bell.orange} doc={doc} onPick={pick} />
        <Group title="Kolize a upozornění" tone="warn" items={bell.conflicts} doc={doc} onPick={pick} />
      </div>
    </Panel>
  );
}
