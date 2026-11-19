import { CircleCheck, CircleDot, Flag, Trash2, X } from 'lucide-react';
import {
  deleteSelectionWithConfirm,
  markSelectionDone,
  selectionSummary,
  setPriorityOfSelection,
  setStatusOfSelection,
  clearSelection,
} from '../../app/bulkActions';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';
import type { MenuEntry } from '../common/Menu';
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER } from '../common/statusMeta';

const I = 17;

const nUzlu = (n: number) => `${n} ${n === 1 ? 'uzel' : n >= 2 && n <= 4 ? 'uzly' : 'uzlů'}`;

/** Text o přeskočených uzlech (projekty a milníky nemají stav ani prioritu úkolu). */
function skipNote(other: number): string | null {
  if (!other) return null;
  return `Stav a priorita se týkají jen úkolů – ${other} ${other === 1 ? 'projekt nebo milník se přeskočí' : 'projekty a milníky se přeskočí'}.`;
}

/** Položky kontextové nabídky nad výběrem více uzlů. */
export function selectionMenuEntries(at: { x: number; y: number }): MenuEntry[] {
  const ui = useUiStore.getState();
  const { total, tasks } = selectionSummary();
  const nodeIds = ui.selection;
  return [
    { title: `Vybráno: ${nUzlu(total)}` },
    { key: 'done', label: 'Označit jako hotové', icon: <CircleCheck size={I} />, disabled: !tasks, onSelect: markSelectionDone },
    {
      key: 'status',
      label: 'Stav…',
      icon: <CircleDot size={I} />,
      disabled: !tasks,
      onSelect: () => ui.set({ subMenu: { ...at, nodeId: nodeIds[0]!, nodeIds, kind: 'status' } }),
    },
    {
      key: 'priority',
      label: 'Priorita…',
      icon: <Flag size={I} />,
      disabled: !tasks,
      onSelect: () => ui.set({ subMenu: { ...at, nodeId: nodeIds[0]!, nodeIds, kind: 'priority' } }),
    },
    'sep',
    { key: 'del', label: `Smazat ${nUzlu(total)}…`, icon: <Trash2 size={I} />, kbd: 'Del', danger: true, onSelect: () => void deleteSelectionWithConfirm() },
    { key: 'clear', label: 'Zrušit výběr', icon: <X size={I} />, kbd: 'Esc', onSelect: clearSelection },
  ];
}

/** Telefon: lišta režimu „Vybrat více“. */
export function MultiSelectBar() {
  const multiMode = useUiStore((s) => s.multiMode);
  const count = useUiStore((s) => s.selection.length);
  if (!multiMode) return null;
  return (
    <div className="link-pick-bar multi-bar" role="status">
      <span>Vybráno: {count} · klepnutím přidáte / odeberete</span>
      <button className="btn small" onClick={() => useUiStore.getState().set({ multiMode: false })}>
        Hotovo
      </button>
    </div>
  );
}

/** Panel detailu při výběru více uzlů: hromadné akce. */
export function MultiSelectPanel() {
  const selection = useUiStore((s) => s.selection);
  const doc = useDocStore((s) => s.doc);
  if (!doc) return null;
  const nodes = selection.map((id) => doc.nodes[id]).filter((n) => n && !n.deletedAt);
  const tasks = nodes.filter((n) => n!.type === 'task');
  const other = nodes.length - tasks.length;
  const note = skipNote(other);
  // Společná hodnota (pro zvýraznění), jinak nic.
  const common = <K extends 'status' | 'priority'>(k: K) => (tasks.length && tasks.every((t) => t![k] === tasks[0]![k]) ? tasks[0]![k] : null);
  const status = common('status');
  const priority = common('priority');
  return (
    <div className="detail-body multi-panel">
      <div className="multi-head">
        <strong>Vybráno: {nUzlu(nodes.length)}</strong>
        <span className="muted">
          {tasks.length} {tasks.length === 1 ? 'úkol' : tasks.length >= 2 && tasks.length <= 4 ? 'úkoly' : 'úkolů'}
          {other ? ` · ${other} ${other === 1 ? 'projekt / milník' : 'projekty / milníky'}` : ''}
        </span>
      </div>
      {note && <div className="muted multi-note">{note}</div>}

      <div className="field">
        <span>Stav</span>
        <div className="option-grid status-grid" role="group" aria-label="Stav vybraných úkolů">
          {STATUS_ORDER.map((st) => {
            const m = STATUS_META[st];
            return (
              <button key={st} className={`opt ${m.tone}${status === st ? ' on' : ''}`} disabled={!tasks.length} onClick={() => setStatusOfSelection(st)}>
                <m.Icon size={16} /> {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <span>Priorita</span>
        <div className="option-grid prio-grid" role="group" aria-label="Priorita vybraných úkolů">
          {PRIORITY_ORDER.map((p) => (
            <button key={p} className={`opt${priority === p ? ' on' : ''}`} disabled={!tasks.length} onClick={() => setPriorityOfSelection(p)}>
              <span className="prio-dot" style={{ background: PRIORITY_META[p].color }} /> {PRIORITY_META[p].label}
            </button>
          ))}
        </div>
      </div>

      <div className="detail-actions">
        <button className="btn primary" disabled={!tasks.length} onClick={markSelectionDone}>
          <CircleCheck size={17} /> Označit jako hotové
        </button>
        <button className="btn" onClick={() => void deleteSelectionWithConfirm()}>
          <Trash2 size={17} /> Smazat {nUzlu(nodes.length)}
        </button>
        <button className="btn" onClick={clearSelection}>
          <X size={17} /> Zrušit výběr
        </button>
      </div>
    </div>
  );
}
