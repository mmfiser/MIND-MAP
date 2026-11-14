import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Ban, CalendarClock, Check, Link2, ListChecks, ListTree, StickyNote } from 'lucide-react';
import { memo, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { toggleDone } from '../../app/actions';
import type { DeadlineState } from '../../model/deadline';
import { plural } from '../../model/progress';
import type { NodeType, Priority, Status } from '../../model/types';
import { projectIcon } from '../common/projectIcons';
import { PRIORITY_META, STATUS_META } from '../common/statusMeta';

export interface FlowNodeData extends Record<string, unknown> {
  title: string;
  kind: NodeType;
  /** Barva výplně projektu (hex). */
  fill?: string;
  textColor?: string;
  shared: boolean;
  borderColor?: string;
  hasNotes: boolean;
  status: Status;
  priority: Priority;
  icon?: string;
  /** Termín / deadline v českém formátu + stav zvýraznění. */
  due?: string;
  dueState: DeadlineState;
  /** Projekt: procento (null = „–“), počty. */
  progress?: { percent: number | null; open: number; done: number };
  /** Úkol: přímé podúkoly. */
  subtasks?: { done: number; total: number };
  checklist?: { done: number; total: number };
  tags: string[];
  moreTags: number;
}

export type FlowNode = Node<FlowNodeData, 'mm'>;

const stop = (e: PointerEvent | MouseEvent) => e.stopPropagation();

function DueBadge({ due, state }: { due: string; state: DeadlineState }) {
  const title =
    state === 'overdue' ? 'Termín uplynul' : state === 'today' ? 'Termín je dnes' : state === 'soon' ? 'Termín se blíží' : 'Termín';
  return (
    <span className={`chip due ${state}`} title={title}>
      <CalendarClock size={12} />
      {due}
    </span>
  );
}

function Chips({ data }: { data: FlowNodeData }) {
  const st = STATUS_META[data.status];
  const showStatus = data.status === 'in_progress' || data.status === 'waiting' || data.status === 'blocked';
  const any =
    showStatus || data.due || data.subtasks || data.checklist || data.tags.length || data.hasNotes || data.priority === 'critical';
  if (!any) return null;
  return (
    <div className="chips">
      {data.priority === 'critical' && <span className="chip prio-critical">Kritická</span>}
      {showStatus && (
        <span className={`chip status ${st.tone}`}>
          <st.Icon size={12} />
          {st.label}
        </span>
      )}
      {data.due && <DueBadge due={data.due} state={data.dueState} />}
      {data.subtasks && (
        <span className="chip" title="Hotové přímé podúkoly">
          <ListTree size={12} />
          {data.subtasks.done}/{data.subtasks.total}
        </span>
      )}
      {data.checklist && (
        <span className="chip" title="Checklist">
          <ListChecks size={12} />
          {data.checklist.done}/{data.checklist.total}
        </span>
      )}
      {data.tags.map((t) => (
        <span className="chip tag" key={t}>
          #{t}
        </span>
      ))}
      {data.moreTags > 0 && <span className="chip tag">+{data.moreTags}</span>}
      {data.hasNotes && <StickyNote size={13} className="notes-badge" aria-label="Má poznámky" />}
    </div>
  );
}

function TaskNode({ id, data, selected }: { id: string; data: FlowNodeData; selected: boolean }) {
  const done = data.status === 'done';
  const cancelled = data.status === 'cancelled';
  const style: CSSProperties & Record<string, string | undefined> = { '--prio': PRIORITY_META[data.priority].color };
  if (data.borderColor) style['--node-border'] = data.borderColor;
  const cls = [
    'mm-node task',
    `prio-${data.priority}`,
    data.shared ? 'shared' : '',
    selected ? 'selected' : '',
    done || cancelled ? 'finished' : '',
  ].join(' ');
  return (
    <div className={cls} style={style}>
      <Handle type="target" position={Position.Left} id="l" className="mm-handle" isConnectable={false} />
      <span className="prio-stripe" title={`Priorita: ${PRIORITY_META[data.priority].label}`} />
      <div className="task-main">
        <button
          className={`node-check nodrag nopan${done ? ' checked' : ''}${cancelled ? ' cancelled' : ''}`}
          role="checkbox"
          aria-checked={done}
          aria-label={done ? 'Znovu otevřít' : 'Označit jako hotové'}
          title={cancelled ? 'Zrušeno – klepnutím označíte jako hotové' : done ? 'Znovu otevřít' : 'Hotovo'}
          onPointerDown={stop}
          onDoubleClick={stop}
          onClick={(e) => {
            e.stopPropagation();
            toggleDone(id);
          }}
        >
          {done && <Check size={14} strokeWidth={3} />}
          {cancelled && <Ban size={14} strokeWidth={2.5} />}
        </button>
        <span className={`title${data.title.trim() ? '' : ' empty'}`}>{data.title.trim() || 'Bez názvu'}</span>
      </div>
      <Chips data={data} />
      {data.shared && (
        <span className="shared-badge" title="Sdílený uzel (více rodičů)">
          <Link2 size={12} />
        </span>
      )}
      <Handle type="source" position={Position.Right} id="r" className="mm-handle" isConnectable={false} />
    </div>
  );
}

function ProjectNode({ data, selected }: { data: FlowNodeData; selected: boolean }) {
  const style: CSSProperties & Record<string, string | undefined> = {
    background: data.fill,
    color: data.textColor,
  };
  if (data.borderColor) style['--node-border'] = data.borderColor;
  const finished = data.status === 'done' || data.status === 'cancelled';
  const cls = ['mm-node project', data.shared ? 'shared' : '', selected ? 'selected' : '', finished ? 'finished' : ''].join(' ');
  const icon = projectIcon(data.icon);
  const p = data.progress;
  const st = STATUS_META[data.status];
  return (
    <div className={cls} style={style}>
      <Handle type="target" position={Position.Left} id="l" className="mm-handle" isConnectable={false} />
      <div className="project-head">
        {icon && <icon.Icon size={20} className="project-icon" aria-label={icon.label} />}
        <span className={`title${data.title.trim() ? '' : ' empty'}`}>{data.title.trim() || 'Bez názvu'}</span>
        {data.status !== 'new' && (
          <span className="project-status" title={st.label}>
            <st.Icon size={16} />
          </span>
        )}
      </div>
      {p && (
        <div className="project-progress">
          <div className="bar" aria-hidden>
            <span style={{ width: `${p.percent ?? 0}%` }} />
          </div>
          <div className="nums">
            <strong>{p.percent === null ? '–' : `${p.percent} %`}</strong>
            <span>
              {p.open + p.done === 0
                ? 'žádné úkoly'
                : `${p.open} ${plural(p.open, 'otevřený', 'otevřené', 'otevřených')} · ${p.done} ${plural(p.done, 'hotový', 'hotové', 'hotových')}`}
            </span>
          </div>
        </div>
      )}
      {(data.due || data.priority === 'high' || data.priority === 'critical' || data.tags.length > 0) && (
        <div className="chips">
          {(data.priority === 'high' || data.priority === 'critical') && (
            <span className={`chip prio-${data.priority}`}>{PRIORITY_META[data.priority].label}</span>
          )}
          {data.due && <DueBadge due={data.due} state={data.dueState} />}
          {data.tags.map((t) => (
            <span className="chip tag" key={t}>
              #{t}
            </span>
          ))}
          {data.moreTags > 0 && <span className="chip tag">+{data.moreTags}</span>}
        </div>
      )}
      {data.shared && (
        <span className="shared-badge" title="Sdílený uzel (více rodičů)">
          <Link2 size={12} />
        </span>
      )}
      <Handle type="source" position={Position.Right} id="r" className="mm-handle" isConnectable={false} />
    </div>
  );
}

function MapNodeViewImpl({ id, data, selected }: NodeProps<FlowNode>) {
  return data.kind === 'project' ? (
    <ProjectNode data={data} selected={!!selected} />
  ) : (
    <TaskNode id={id} data={data} selected={!!selected} />
  );
}

export const MapNodeView = memo(MapNodeViewImpl);
