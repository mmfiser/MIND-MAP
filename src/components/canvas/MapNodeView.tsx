import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  Ban,
  CalendarCheck,
  CalendarClock,
  Check,
  Link2,
  ListChecks,
  ListTree,
  Lock,
  Milestone,
  Minus,
  StickyNote,
  TriangleAlert,
} from 'lucide-react';
import { memo, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { toggleDone } from '../../app/actions';
import { toggleCollapse } from '../../app/linkActions';
import { toast } from '../../store/uiStore';
import type { DeadlineState } from '../../model/deadline';
import { plural } from '../../model/progress';
import type { NodeType, Priority, Status } from '../../model/types';
import { projectIcon } from '../common/projectIcons';
import { PRIORITY_META, STATUS_META } from '../common/statusMeta';
import { startLinkDrag } from './LinkDrag';

export interface FlowNodeData extends Record<string, unknown> {
  title: string;
  kind: NodeType;
  /** Barva výplně projektu (hex). */
  fill?: string;
  textColor?: string;
  /** Milník: barva projektu, do kterého patří. */
  accent?: string;
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
  /** Důvody ⚠ (termín před začátkem, kolize termínů). */
  conflicts: string[];
  /** Zámek: na čem uzel čeká (jen úkoly a milníky). */
  blocked?: string;
  /** Má poduzly v hierarchii. */
  collapsible: boolean;
  collapsed: boolean;
  /** Počet uzlů skrytých sbalením. */
  hiddenCount: number;
}

export type FlowNode = Node<FlowNodeData, 'mm'>;

const stop = (e: PointerEvent | MouseEvent) => e.stopPropagation();

function InfoBadge({ className, text, children }: { className: string; text: string; children: React.ReactNode }) {
  return (
    <button
      className={`chip ${className} nodrag nopan`}
      title={text}
      aria-label={text}
      onPointerDown={stop}
      onDoubleClick={stop}
      onClick={(e) => {
        e.stopPropagation();
        toast(text, 'info');
      }}
    >
      {children}
    </button>
  );
}

function ConflictBadge({ conflicts }: { conflicts: string[] }) {
  return (
    <InfoBadge className="conflict" text={conflicts.join(' ')}>
      <TriangleAlert size={12} />
      {conflicts.length > 1 && conflicts.length}
    </InfoBadge>
  );
}

function LockBadge({ text }: { text: string }) {
  return (
    <InfoBadge className="locked" text={text}>
      <Lock size={12} />
    </InfoBadge>
  );
}

function DueBadge({ due, state, milestone }: { due: string; state: DeadlineState; milestone?: boolean }) {
  const title = milestone
    ? state === 'past'
      ? 'Datum milníku uplynulo'
      : state === 'today'
        ? 'Milník je dnes'
        : state === 'soon'
          ? 'Milník se blíží'
          : 'Datum milníku'
    : state === 'overdue'
      ? 'Termín uplynul'
      : state === 'today'
        ? 'Termín je dnes'
        : state === 'soon'
          ? 'Termín se blíží'
          : 'Termín';
  return (
    <span className={`chip due ${state}`} title={title}>
      {state === 'past' ? <CalendarCheck size={12} /> : <CalendarClock size={12} />}
      {due}
    </span>
  );
}

function Tags({ data }: { data: FlowNodeData }) {
  return (
    <>
      {data.tags.map((t) => (
        <span className="chip tag" key={t}>
          #{t}
        </span>
      ))}
      {data.moreTags > 0 && <span className="chip tag">+{data.moreTags}</span>}
    </>
  );
}

function TaskChips({ data }: { data: FlowNodeData }) {
  const st = STATUS_META[data.status];
  const showStatus = data.status === 'in_progress' || data.status === 'waiting' || data.status === 'blocked';
  const any =
    showStatus ||
    data.due ||
    data.conflicts.length ||
    data.blocked ||
    data.subtasks ||
    data.checklist ||
    data.tags.length ||
    data.hasNotes ||
    data.priority === 'critical';
  if (!any) return null;
  return (
    <div className="chips">
      {data.priority === 'critical' && <span className="chip prio-critical">Kritická</span>}
      {data.blocked && <LockBadge text={data.blocked} />}
      {showStatus && (
        <span className={`chip status ${st.tone}`}>
          <st.Icon size={12} />
          {st.label}
        </span>
      )}
      {data.due && <DueBadge due={data.due} state={data.dueState} />}
      {data.conflicts.length > 0 && <ConflictBadge conflicts={data.conflicts} />}
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
      <Tags data={data} />
      {data.hasNotes && <StickyNote size={13} className="notes-badge" aria-label="Má poznámky" />}
    </div>
  );
}

/** Konektory pro tažení nové vazby (jen myš – na dotyku tlačítko Propojit). */
function Connectors({ id }: { id: string }) {
  return (
    <>
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <span
          key={side}
          className={`mm-conn ${side} nodrag nopan`}
          title="Táhněte na jiný uzel pro vytvoření vazby"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();
            startLinkDrag({ mode: 'create', sourceId: id }, e.nativeEvent);
          }}
          onClick={stop}
          onDoubleClick={stop}
        />
      ))}
    </>
  );
}

function CollapseButton({ id, data }: { id: string; data: FlowNodeData }) {
  if (!data.collapsible) return null;
  const label = data.collapsed ? `Rozbalit větev (skryto ${data.hiddenCount})` : 'Sbalit větev';
  return (
    <button
      className={`collapse-btn nodrag nopan${data.collapsed ? ' collapsed' : ''}`}
      title={`${label} (mezerník)`}
      aria-label={label}
      aria-expanded={!data.collapsed}
      onPointerDown={stop}
      onDoubleClick={stop}
      onClick={(e) => {
        e.stopPropagation();
        toggleCollapse(id);
      }}
    >
      {data.collapsed ? `+${data.hiddenCount}` : <Minus size={13} strokeWidth={3} />}
    </button>
  );
}

function SharedBadge() {
  return (
    <span className="shared-badge" title="Sdílený uzel (více rodičů)">
      <Link2 size={12} />
    </span>
  );
}

/* Skryté handly zůstávají kvůli React Flow; místo uchycení počítá FloatingEdge. */
const Handles = () => (
  <>
    <Handle type="target" position={Position.Left} id="l" className="mm-handle" isConnectable={false} />
    <Handle type="source" position={Position.Right} id="r" className="mm-handle" isConnectable={false} />
  </>
);

function TaskNode({ id, data, selected }: { id: string; data: FlowNodeData; selected: boolean }) {
  const done = data.status === 'done';
  const cancelled = data.status === 'cancelled';
  const taskIcon = projectIcon(data.icon);
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
      <Handles />
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
        {taskIcon && <taskIcon.Icon size={15} className="task-icon" aria-label={taskIcon.label} />}
        <span className={`title${data.title.trim() ? '' : ' empty'}`}>{data.title.trim() || 'Bez názvu'}</span>
      </div>
      <TaskChips data={data} />
      {data.shared && <SharedBadge />}
      <Connectors id={id} />
      <CollapseButton id={id} data={data} />
    </div>
  );
}

function MilestoneNode({ id, data, selected }: { id: string; data: FlowNodeData; selected: boolean }) {
  const icon = projectIcon(data.icon);
  const style: CSSProperties & Record<string, string | undefined> = {};
  if (data.accent) style['--ms-color'] = data.accent;
  const cls = ['mm-node milestone', data.shared ? 'shared' : '', selected ? 'selected' : '', data.dueState === 'past' ? 'past' : ''].join(' ');
  const chips = data.due || data.blocked || data.conflicts.length || data.tags.length || data.hasNotes;
  return (
    <div className={cls} style={style}>
      <Handles />
      <span className="ms-shape" aria-hidden />
      <div className="ms-body">
        <div className="task-main">
          {icon ? (
            <icon.Icon size={16} className="task-icon" aria-label={icon.label} />
          ) : (
            <Milestone size={16} className="task-icon" aria-label="Milník" />
          )}
          <span className={`title${data.title.trim() ? '' : ' empty'}`}>{data.title.trim() || 'Bez názvu'}</span>
        </div>
        {chips ? (
          <div className="chips">
            {data.blocked && <LockBadge text={data.blocked} />}
            {data.due && <DueBadge due={data.due} state={data.dueState} milestone />}
            {data.conflicts.length > 0 && <ConflictBadge conflicts={data.conflicts} />}
            <Tags data={data} />
            {data.hasNotes && <StickyNote size={13} className="notes-badge" aria-label="Má poznámky" />}
          </div>
        ) : null}
      </div>
      {data.shared && <SharedBadge />}
      <Connectors id={id} />
    </div>
  );
}

function ProjectNode({ id, data, selected }: { id: string; data: FlowNodeData; selected: boolean }) {
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
      <Handles />
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
      {(data.due || data.conflicts.length > 0 || data.priority === 'high' || data.priority === 'critical' || data.tags.length > 0) && (
        <div className="chips">
          {(data.priority === 'high' || data.priority === 'critical') && (
            <span className={`chip prio-${data.priority}`}>{PRIORITY_META[data.priority].label}</span>
          )}
          {data.due && <DueBadge due={data.due} state={data.dueState} />}
          {data.conflicts.length > 0 && <ConflictBadge conflicts={data.conflicts} />}
          <Tags data={data} />
        </div>
      )}
      {data.shared && <SharedBadge />}
      <Connectors id={id} />
      <CollapseButton id={id} data={data} />
    </div>
  );
}

function MapNodeViewImpl({ id, data, selected }: NodeProps<FlowNode>) {
  if (data.kind === 'project') return <ProjectNode id={id} data={data} selected={!!selected} />;
  if (data.kind === 'milestone') return <MilestoneNode id={id} data={data} selected={!!selected} />;
  return <TaskNode id={id} data={data} selected={!!selected} />;
}

export const MapNodeView = memo(MapNodeViewImpl);
