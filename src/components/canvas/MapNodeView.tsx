import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  Ban,
  CalendarCheck,
  CalendarClock,
  Check,
  Filter,
  Search,
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
import { goToNode, toggleCollapse, zoomIntoNode } from '../../app/linkActions';
import type { LodLevel } from '../../model/lod';
import { toast } from '../../store/uiStore';
import type { DeadlineState } from '../../model/deadline';
import { plural } from '../../model/progress';
import { hiddenMarksText, overdueShort, pluralDays } from '../../model/messages';
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
  /** Počet kalendářních dní po termínu (jen ve stavu overdue). */
  overdueDays?: number;
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
  /** Počet uzlů skrytých sbalením nebo úrovní detailu. */
  hiddenCount: number;
  /** Poduzly skrývá jen úroveň detailu podle zoomu (ne ruční sbalení). */
  lodLimited: boolean;
  /** Skryté shody filtru / hledání pod tímto uzlem (id, první = cíl kliknutí). */
  filterMarks: string[];
  searchMarks: string[];
  /** Úroveň detailu – při nižší se vykresluje méně textu. */
  detail: LodLevel;
  /** Projekt: počet aktivních úkolů po termínu (souhrn v přehledu). */
  overdue?: number;
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

function DueBadge({ due, state, milestone, overdueDays }: { due: string; state: DeadlineState; milestone?: boolean; overdueDays?: number }) {
  if (state === 'overdue' && overdueDays) {
    // Málo místa: krátký tvar „16. 11. · −2 d“, plný text v tooltipu a po klepnutí.
    const full = `Termín ${due} – ${pluralDays(overdueDays)} po termínu`;
    return (
      <InfoBadge className={`due ${state}`} text={full}>
        <CalendarClock size={12} />
        {due} · {overdueShort(overdueDays)}
      </InfoBadge>
    );
  }
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

/** Nižší úroveň detailu: jen termín, zámek a ⚠. */
function SimpleChips({ data }: { data: FlowNodeData }) {
  if (!data.due && !data.blocked && !data.conflicts.length) return null;
  return (
    <div className="chips">
      {data.blocked && <LockBadge text={data.blocked} />}
      {data.due && <DueBadge due={data.due} state={data.dueState} milestone={data.kind === 'milestone'} overdueDays={data.overdueDays} />}
      {data.conflicts.length > 0 && <ConflictBadge conflicts={data.conflicts} />}
    </div>
  );
}

function TaskChips({ data }: { data: FlowNodeData }) {
  if (data.detail !== 'full') return <SimpleChips data={data} />;
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
      {data.due && <DueBadge due={data.due} state={data.dueState} overdueDays={data.overdueDays} />}
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

/**
 * Skryté shody hledání (lupa) / filtru (trychtýř) ve sbalené větvi.
 * Klik rozbalí ručně sbalené předky první shody a vystředí ji.
 */
function MarksBadges({ data }: { data: FlowNodeData }) {
  const badges = (
    [
      ['search', data.searchMarks, Search],
      ['filter', data.filterMarks, Filter],
    ] as const
  ).filter(([, ids]) => ids.length > 0);
  if (!badges.length) return null;
  return (
    <span className="marks-badges">
      {badges.map(([kind, ids, Icon]) => {
        const text = hiddenMarksText(kind, ids.length);
        return (
          <button
            key={kind}
            className={`marks-badge ${kind} nodrag nopan`}
            title={text}
            aria-label={text}
            onPointerDown={stop}
            onDoubleClick={stop}
            onClick={(e) => {
              e.stopPropagation();
              goToNode(ids[0]!);
            }}
          >
            <Icon size={13} strokeWidth={2.5} aria-hidden />
            {ids.length}
          </button>
        );
      })}
    </span>
  );
}

function CollapseButton({ id, data }: { id: string; data: FlowNodeData }) {
  if (!data.collapsible) return null;
  if (!data.collapsed && data.lodLimited) {
    // Poduzly skrývá jen oddálení – klepnutí přiblíží na úroveň, kde jsou vidět.
    const label = `Skryto oddálením: ${data.hiddenCount} – klepnutím přiblížíte`;
    return (
      <button
        className="collapse-btn lod nodrag nopan"
        title={label}
        aria-label={label}
        onPointerDown={stop}
        onDoubleClick={stop}
        onClick={(e) => {
          e.stopPropagation();
          zoomIntoNode(id);
        }}
      >
        +{data.hiddenCount}
      </button>
    );
  }
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
      <MarksBadges data={data} />
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
  const full = data.detail === 'full';
  const chips = data.due || data.blocked || data.conflicts.length || (full && (data.tags.length || data.hasNotes));
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
            {full && <Tags data={data} />}
            {full && data.hasNotes && <StickyNote size={13} className="notes-badge" aria-label="Má poznámky" />}
          </div>
        ) : null}
      </div>
      {data.shared && <SharedBadge />}
      <MarksBadges data={data} />
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
  const cls = [
    'mm-node project',
    data.shared ? 'shared' : '',
    selected ? 'selected' : '',
    finished ? 'finished' : '',
    data.detail === 'overview' ? 'lod-overview' : '',
  ].join(' ');
  const full = data.detail === 'full';
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
      {(data.due || data.conflicts.length > 0 || data.overdue || (full && (data.priority === 'high' || data.priority === 'critical' || data.tags.length > 0))) && (
        <div className="chips">
          {full && (data.priority === 'high' || data.priority === 'critical') && (
            <span className={`chip prio-${data.priority}`}>{PRIORITY_META[data.priority].label}</span>
          )}
          {data.due && <DueBadge due={data.due} state={data.dueState} overdueDays={data.overdueDays} />}
          {data.overdue ? (
            <InfoBadge className="overdue-count" text={`${data.overdue} ${data.overdue === 1 ? 'úkol je' : data.overdue < 5 ? 'úkoly jsou' : 'úkolů je'} po termínu`}>
              <TriangleAlert size={12} />
              {data.overdue}
            </InfoBadge>
          ) : null}
          {data.conflicts.length > 0 && <ConflictBadge conflicts={data.conflicts} />}
          {full && <Tags data={data} />}
        </div>
      )}
      {data.shared && <SharedBadge />}
      <MarksBadges data={data} />
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
