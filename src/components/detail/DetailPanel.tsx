import { CircleCheck, CornerDownRight, GitFork, ListPlus, MoveRight, RotateCcw, StickyNote, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  addChildTo,
  addSiblingTo,
  deleteWithConfirm,
  setNodeType,
  toggleDone,
  updateNodeFields,
} from '../../app/actions';
import { ChecklistEditor, DateField, IconPicker, PrioritySelect, StatusSelect, TagInput } from './Fields';
import { BlockedHint, ConflictHints, LinksSection } from './LinksSection';
import { useIsMobile } from '../../hooks/useIsMobile';
import { parentEdges } from '../../model/graph';
import { NODE_TYPE_LABELS, PROJECT_PALETTE, colorHex } from '../../model/labels';
import type { MapNode } from '../../model/types';
import { useDocStore } from '../../store/docStore';
import { useUiStore } from '../../store/uiStore';

const dateFmt = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'long', timeStyle: 'short' });

/** Textové pole, které zapisuje do dokumentu průběžně (sloučené do jednoho kroku historie). */
function useBufferedField(node: MapNode, field: 'title' | 'notes') {
  const [value, setValue] = useState(node[field]);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setValue(node[field]);
  }, [node, field]);
  return {
    value,
    onFocus: () => {
      editing.current = true;
    },
    onBlur: () => {
      editing.current = false;
      setValue(useDocStore.getState().doc?.nodes[node.id]?.[field] ?? '');
    },
    onChange: (v: string) => {
      setValue(v);
      updateNodeFields(node.id, { [field]: v }, `${field}:${node.id}`);
    },
  };
}

function DetailContent({ node }: { node: MapNode }) {
  const mobile = useIsMobile();
  const doc = useDocStore((s) => s.doc)!;
  const editTitleRequest = useUiStore((s) => s.editTitleRequest);
  const ui = useUiStore.getState;
  const title = useBufferedField(node, 'title');
  const notes = useBufferedField(node, 'notes');
  const titleRef = useRef<HTMLInputElement>(null);
  const parents = parentEdges(doc, node.id);
  const milestone = node.type === 'milestone';

  useEffect(() => {
    if (!editTitleRequest || Date.now() - editTitleRequest > 1000) return;
    const t = setTimeout(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    }, 60);
    return () => clearTimeout(t);
  }, [editTitleRequest, node.id]);

  return (
    <div className="detail-body">
      <label className="field">
        <span>Název</span>
        <input
          ref={titleRef}
          className="input title-input"
          value={title.value}
          placeholder="Bez názvu"
          onFocus={title.onFocus}
          onBlur={title.onBlur}
          onChange={(e) => title.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
        />
      </label>

      <div className="detail-actions">
        {!milestone && (
          <button className="btn small" onClick={() => addChildTo(node.id)}>
            <CornerDownRight size={16} /> Podúkol
          </button>
        )}
        <button className="btn small" onClick={() => addSiblingTo(node.id)}>
          <ListPlus size={16} /> Sourozenec
        </button>
        {mobile && (
          <button className="btn small" onClick={() => ui().set({ notesFor: node.id })}>
            <StickyNote size={16} /> Poznámky
          </button>
        )}
        <button className="btn small" onClick={() => void deleteWithConfirm(node.id)} title="Smazat">
          <Trash2 size={16} /> Smazat
        </button>
      </div>

      <div className="field">
        <span>Typ uzlu</span>
        <div className="segmented" role="group" aria-label="Typ uzlu">
          {(['project', 'task', 'milestone'] as const).map((t) => (
            <button key={t} className={node.type === t ? 'on' : ''} aria-pressed={node.type === t} onClick={() => setNodeType(node.id, t)}>
              {NODE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {node.type === 'project' && (
        <div className="field">
          <span>Barva projektu</span>
          <div className="palette" role="radiogroup" aria-label="Barva projektu">
            {PROJECT_PALETTE.map((c) => (
              <button
                key={c.key}
                role="radio"
                aria-checked={colorHex(node.color) === c.hex}
                title={c.name}
                aria-label={c.name}
                className={`swatch${colorHex(node.color) === c.hex ? ' active' : ''}`}
                style={{ background: c.hex }}
                onClick={() => updateNodeFields(node.id, { color: c.key })}
              />
            ))}
          </div>
        </div>
      )}

      {!milestone && (
        <>
          <div className="field">
            <span>Stav</span>
            <StatusSelect node={node} />
          </div>

          <div className="field">
            <span>Priorita</span>
            <PrioritySelect node={node} />
          </div>
        </>
      )}

      {milestone ? (
        <div className="date-grid">
          <DateField node={node} field="dueDate" label="Datum milníku" />
        </div>
      ) : (
        <div className="date-grid">
          <DateField node={node} field="startDate" label={node.type === 'project' ? 'Zahájení' : 'Začátek'} />
          <DateField node={node} field="dueDate" label={node.type === 'project' ? 'Deadline' : 'Termín dokončení'} />
        </div>
      )}
      <ConflictHints node={node} />
      <BlockedHint node={node} />
      <div className="meta-row">
        <span>Vytvořeno</span>
        <span>{dateFmt.format(new Date(node.createdAt))}</span>
      </div>

      <LinksSection node={node} />
      <div className="field">
        <div className="detail-actions">
          <button
            className="btn small"
            onClick={() => ui().set({ picker: { mode: 'move', nodeId: node.id, fromParentId: parents[0]?.source ?? null } })}
          >
            <MoveRight size={16} /> Přesunout pod…
          </button>
          <button className="btn small" onClick={() => ui().set({ picker: { mode: 'addParent', nodeId: node.id, fromParentId: null } })}>
            <GitFork size={16} /> Přidat rodiče…
          </button>
        </div>
      </div>

      {node.type === 'project' && <IconPicker node={node} />}

      <TagInput node={node} />

      {node.type !== 'project' && <IconPicker node={node} />}

      {!milestone && <ChecklistEditor node={node} />}

      {!mobile && (
        <label className="field">
          <span>Poznámky</span>
          <textarea
            className="textarea"
            value={notes.value}
            placeholder="Poznámky, popis…"
            onFocus={notes.onFocus}
            onBlur={notes.onBlur}
            onChange={(e) => notes.onChange(e.target.value)}
            rows={8}
          />
        </label>
      )}

      {!milestone && <div className="done-row">
        {node.status === 'done' ? (
          <button className="btn" onClick={() => toggleDone(node.id)}>
            <RotateCcw size={17} /> Znovu otevřít
          </button>
        ) : (
          <button className="btn primary" onClick={() => toggleDone(node.id)}>
            <CircleCheck size={17} /> Hotovo
          </button>
        )}
      </div>}
    </div>
  );
}

export function DetailPanel() {
  const mobile = useIsMobile();
  const selectedId = useUiStore((s) => s.selectedId);
  const open = useUiStore((s) => s.detailOpen);
  const node = useDocStore((s) => (selectedId ? s.doc?.nodes[selectedId] : undefined));
  if (!open || !node) return null;
  const close = () => useUiStore.getState().set({ detailOpen: false });
  return (
    <aside className="detail" aria-label="Detail uzlu">
      {mobile && <div className="grabber" aria-hidden />}
      <div className="detail-head">
        <span className="kind">
          {node.type === 'project' && <span className="tree-dot" style={{ background: colorHex(node.color), margin: 0 }} />}
          {NODE_TYPE_LABELS[node.type]}
        </span>
        <div className="spacer" style={{ flex: 1 }} />
        <button className="icon-btn" onClick={close} title="Zavřít detail" aria-label="Zavřít detail">
          <X size={18} />
        </button>
      </div>
      <DetailContent key={node.id} node={node} />
    </aside>
  );
}
