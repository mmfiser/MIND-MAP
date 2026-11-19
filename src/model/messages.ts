/**
 * Texty upozornění na termíny a kolize – na jednom místě pro zvoneček,
 * ikonu ⚠ na uzlu, detail uzlu i oznámení.
 *
 * Slova podle typu uzlu: projekt = „deadline“, úkol = „termín“, milník = „datum“.
 */
import type { DateConflict } from './conflicts';
import { dayNumber, formatShort, type Ymd } from './dates';
import type { DocData, MapNode, NodeType } from './types';

// ---------- slova podle typu uzlu ----------

/** 1. pád: „deadline“ / „termín“ / „datum“ */
export const DUE_WORD: Record<NodeType, string> = { project: 'deadline', task: 'termín', milestone: 'datum' };
/** 7. pád: „s deadlinem“ / „s termínem“ / „s datem“ */
const DUE_WORD_INSTR: Record<NodeType, string> = { project: 'deadlinem', task: 'termínem', milestone: 'datem' };

/** Ukončí větu tečkou, pokud už nekončí (datum „9. 11.“ tečkou končí, „9. 11. 2027“ ne). */
const sentence = (s: string) => (s.endsWith('.') ? s : `${s}.`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const quoted = (n: { title: string } | undefined) => `„${n?.title.trim() || 'bez názvu'}“`;

// ---------- počet dní ----------

/** České tvary: 1 den, 2–4 dny, 0 a 5+ dní. */
export function pluralDays(n: number): string {
  const a = Math.abs(n);
  if (a === 1) return `${n} den`;
  if (a >= 2 && a <= 4) return `${n} dny`;
  return `${n} dní`;
}

/** Kolik kalendářních dní je termín po splatnosti (0 = dnes nebo později). */
export function daysOverdue(due: Ymd, today: Ymd): number {
  return Math.max(0, dayNumber(today) - dayNumber(due));
}

/** „9 dní po termínu“ (u projektu „po deadlinu“). */
export function overdueText(n: Pick<MapNode, 'type' | 'dueDate'>, today: Ymd): string {
  const days = n.dueDate ? daysOverdue(n.dueDate, today) : 0;
  return `${pluralDays(days)} ${n.type === 'project' ? 'po deadlinu' : 'po termínu'}`;
}

/** Krátký tvar na uzel (málo místa): „−2 d“ (typografické minus). */
export function overdueShort(days: number): string {
  return `\u2212${days} d`;
}

/**
 * Text odznaku s datem. Plný tvar (zvoneček, detail): „16. 11. · 2 dny po termínu“,
 * „18. 11. · Milník dnes“. Krátký tvar (uzel): „16. 11. · −2 d“.
 * Vrací jen příponu za datem (bez „ · “), nebo null.
 */
export function dueSuffix(
  n: Pick<MapNode, 'type' | 'dueDate'>,
  state: 'none' | 'soon' | 'today' | 'overdue' | 'past',
  today: Ymd,
  short = false,
): string | null {
  if (!n.dueDate) return null;
  if (state === 'overdue') return short ? overdueShort(daysOverdue(n.dueDate, today)) : overdueText(n, today);
  if (state === 'today' && !short) return todayText(n.type);
  return null;
}

/** „3 vazby“ / „5 vazeb“ (sloučené vazby do sbalené větve). */
export function linksCount(n: number): string {
  return `${n} ${n === 1 ? 'vazba' : n >= 2 && n <= 4 ? 'vazby' : 'vazeb'}`;
}

// ---------- skryté shody ve sbalené větvi ----------

/** Tooltip odznaku: „1 shoda hledání ve sbalené větvi – klikněte pro rozbalení“. */
export function hiddenMarksText(kind: 'search' | 'filter', n: number): string {
  const what =
    kind === 'search'
      ? `${n} ${n === 1 ? 'shoda' : n >= 2 && n <= 4 ? 'shody' : 'shod'} hledání`
      : `${n} ${n === 1 ? 'úkol odpovídající' : n >= 2 && n <= 4 ? 'úkoly odpovídající' : 'úkolů odpovídajících'} filtru`;
  return `${what} ve sbalené větvi – klikněte pro rozbalení`;
}

// ---------- zvoneček ----------

export const BELL_GROUP_TITLE = {
  overdue: 'Po termínu',
  today: 'Termín dnes',
  soon: 'Blíží se',
  conflicts: 'Kolize termínů',
} as const;

/** Popisek u položky „Termín dnes“: „Milník dnes“ / „Deadline dnes“ / „Termín dnes“. */
export function todayText(type: NodeType): string {
  return type === 'milestone' ? 'Milník dnes' : `${cap(DUE_WORD[type])} dnes`;
}

// ---------- kolize termínů ----------

/** Termín před začátkem: „Deadline (9. 11.) je dříve než datum zahájení (15. 11.).“ */
export function dueBeforeStartText(n: Pick<MapNode, 'type' | 'dueDate' | 'startDate'>, today: Ymd): string {
  const due = n.dueDate ? formatShort(n.dueDate, today) : '';
  const start = n.startDate ? formatShort(n.startDate, today) : '';
  return n.type === 'project'
    ? `Deadline (${due}) je dříve než datum zahájení (${start}).`
    : `Termín (${due}) je dříve než začátek (${start}).`;
}

/** Podřízený uzel jako podmět: „Termín podúkolu“ / „Datum milníku“. */
function childSubject(type: NodeType): string {
  return type === 'milestone' ? 'Datum milníku' : 'Termín podúkolu';
}

/** Nadřazený uzel v 2. pádě: „termín nadřazeného úkolu „X““ / „deadline projektu „X““. */
function parentPhrase(p: MapNode | undefined): string {
  return p?.type === 'project' ? `deadline projektu ${quoted(p)}` : `termín nadřazeného úkolu ${quoted(p)}`;
}

/**
 * Česky popsaná kolize z pohledu uzlu `viewId` – vždy s názvem druhého uzlu
 * a oběma daty.
 */
export function describeConflict(data: DocData, c: DateConflict, viewId: string, today: Ymd): string {
  const me = data.nodes[c.nodeId];
  const other = c.otherId ? data.nodes[c.otherId] : undefined;
  if (c.kind === 'dueBeforeStart' || !me || !other) return me ? dueBeforeStartText(me, today) : '';
  const d = (n: MapNode) => (n.dueDate ? formatShort(n.dueDate, today) : '');
  const sameDay = me.dueDate === other.dueDate;

  if (c.kind === 'dependency') {
    // me = blokovaný, other = blokující
    if (viewId === c.nodeId) {
      return sameDay
        ? `Čeká na ${quoted(other)} s ${DUE_WORD_INSTR[other.type]} ${d(other)}, ale vlastní ${DUE_WORD[me.type]} je ve stejný den.`
        : sentence(`Čeká na ${quoted(other)} s ${DUE_WORD_INSTR[other.type]} ${d(other)}, ale vlastní ${DUE_WORD[me.type]} je už ${d(me)}`);
    }
    return sameDay
      ? `Blokuje ${quoted(me)}, jehož ${DUE_WORD[me.type]} (${d(me)}) je ve stejný den jako vlastní ${DUE_WORD[other.type]}.`
      : `Blokuje ${quoted(me)}, jehož ${DUE_WORD[me.type]} (${d(me)}) je dříve než vlastní ${DUE_WORD[other.type]} (${d(other)}).`;
  }

  // hierarchy: me = poduzel, other = rodič
  if (viewId === c.nodeId) {
    return `${childSubject(me.type)} (${d(me)}) je později než ${parentPhrase(other)} (${d(other)}).`;
  }
  const childName = me.type === 'milestone' ? `Milník ${quoted(me)} má datum` : `Podúkol ${quoted(me)} má termín`;
  return `${childName} (${d(me)}) později než vlastní ${DUE_WORD[other.type]} (${d(other)}).`;
}

/** Oznámení po změně termínu nebo vazby: „Termín koliduje s: „A“. <popis>“ */
export function conflictToast(data: DocData, conflicts: DateConflict[], viewId: string, today: Ymd, withName = false): string {
  const partners: string[] = [];
  for (const c of conflicts) {
    const otherId = c.nodeId === viewId ? c.otherId : c.nodeId;
    const name = quoted(otherId ? data.nodes[otherId] : undefined);
    if (!partners.includes(name)) partners.push(name);
  }
  const head = withName ? `Termín ${quoted(data.nodes[viewId])} koliduje s: ` : 'Termín koliduje s: ';
  const texts = conflicts.map((c) => describeConflict(data, c, viewId, today));
  return `${head}${partners.join(', ')}. ${texts.join(' ')}`;
}
