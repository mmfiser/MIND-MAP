import { describe, expect, it } from 'vitest';
import { bellItems } from '../src/model/bell';
import { findDateConflicts } from '../src/model/conflicts';
import { createEdge, createNode } from '../src/model/factory';
import {
  BELL_GROUP_TITLE,
  conflictToast,
  daysOverdue,
  describeConflict,
  dueSuffix,
  hiddenMarksText,
  overdueShort,
  dueBeforeStartText,
  overdueText,
  pluralDays,
  todayText,
} from '../src/model/messages';
import type { DocData, EdgeKind, MapNode } from '../src/model/types';

const today = '2026-11-18';
let seq = 0;
const node = (id: string, title: string, type: MapNode['type'], extra: Partial<MapNode> = {}): MapNode => ({
  ...createNode({ id, type, title, createdAt: `2026-11-01T00:00:${String(seq++ % 60).padStart(2, '0')}.000Z` }),
  ...extra,
});
function doc(nodes: MapNode[], links: [EdgeKind, string, string][]): DocData {
  const d: DocData = { nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges: {} };
  links.forEach(([k, s, t], i) => {
    const e = createEdge(k, s, t, i, `2026-11-02T00:00:0${i}.000Z`, `e${i}`);
    d.edges[e.id] = e;
  });
  return d;
}
/** Text kolize z pohledu uzlu `view` (první kolize daného druhu). */
function text(d: DocData, kind: string, view: string): string {
  const c = findDateConflicts(d).list.find((x) => x.kind === kind)!;
  return describeConflict(d, c, view, today);
}

describe('počet dní po termínu', () => {
  it('české tvary: 1 den, 2–4 dny, 5+ dní', () => {
    expect(pluralDays(1)).toBe('1 den');
    expect(pluralDays(2)).toBe('2 dny');
    expect(pluralDays(4)).toBe('4 dny');
    expect(pluralDays(5)).toBe('5 dní');
    expect(pluralDays(9)).toBe('9 dní');
    expect(pluralDays(21)).toBe('21 dní');
    expect(pluralDays(0)).toBe('0 dní');
  });
  it('kalendářní dny (přes víkend i přes měsíc)', () => {
    expect(daysOverdue('2026-11-09', today)).toBe(9);
    expect(daysOverdue('2026-11-17', today)).toBe(1);
    expect(daysOverdue('2026-10-31', today)).toBe(18);
    expect(daysOverdue(today, today)).toBe(0);
    expect(overdueText({ type: 'task', dueDate: '2026-11-09' }, today)).toBe('9 dní po termínu');
    expect(overdueText({ type: 'task', dueDate: '2026-11-16' }, today)).toBe('2 dny po termínu');
    expect(overdueText({ type: 'project', dueDate: '2026-11-17' }, today)).toBe('1 den po deadlinu');
  });
});

describe('odznak s datem: plný a krátký tvar', () => {
  it('plný tvar (zvoneček, detail) a krátký tvar (uzel)', () => {
    const task = { type: 'task' as const, dueDate: '2026-11-06' };
    expect(dueSuffix(task, 'overdue', today)).toBe('12 dní po termínu');
    expect(dueSuffix(task, 'overdue', today, true)).toBe('−2 d'.replace('2', '12'));
    expect(overdueShort(2)).toBe('−2 d');
    expect(dueSuffix({ type: 'project', dueDate: today }, 'today', today)).toBe('Deadline dnes');
    expect(dueSuffix({ type: 'milestone', dueDate: today }, 'today', today)).toBe('Milník dnes');
    expect(dueSuffix({ type: 'milestone', dueDate: today }, 'today', today, true)).toBeNull(); // na uzlu stačí zvýraznění
    expect(dueSuffix({ type: 'task', dueDate: '2026-11-20' }, 'soon', today)).toBeNull();
  });
});

describe('zvoneček – skupiny a popisky', () => {
  it('názvy skupin a „Milník dnes“', () => {
    expect(Object.values(BELL_GROUP_TITLE)).toEqual(['Po termínu', 'Termín dnes', 'Blíží se', 'Kolize termínů']);
    expect(todayText('milestone')).toBe('Milník dnes');
    expect(todayText('task')).toBe('Termín dnes');
    expect(todayText('project')).toBe('Deadline dnes');
  });
  it('„Po termínu“ a „Termín dnes“ jsou samostatné skupiny', () => {
    const d = doc(
      [node('a', 'A', 'task', { dueDate: '2026-11-09' }), node('m', 'M', 'milestone', { dueDate: today }), node('t', 'T', 'task', { dueDate: today })],
      [],
    );
    const g = bellItems(d, today);
    expect(g.overdue.map((i) => i.nodeId)).toEqual(['a']);
    expect(g.today.map((i) => i.nodeId).sort()).toEqual(['m', 't']);
  });
});

describe('hlášky kolizí', () => {
  it('termín před začátkem: projekt a úkol', () => {
    expect(dueBeforeStartText({ type: 'project', dueDate: '2026-11-09', startDate: '2026-11-15' }, today)).toBe(
      'Deadline (9. 11.) je dříve než datum zahájení (15. 11.).',
    );
    expect(dueBeforeStartText({ type: 'task', dueDate: '2026-11-09', startDate: '2026-11-15' }, today)).toBe(
      'Termín (9. 11.) je dříve než začátek (15. 11.).',
    );
  });

  it('závislost: obě jména a data, i z pohledu blokujícího', () => {
    const d = doc(
      [node('A', 'Projekt A', 'project', { dueDate: '2026-11-09' }), node('B', 'Projekt B', 'project', { dueDate: '2026-11-26' })],
      [['dependency', 'B', 'A']],
    );
    expect(text(d, 'dependency', 'A')).toBe('Čeká na „Projekt B“ s deadlinem 26. 11., ale vlastní deadline je už 9. 11.');
    expect(text(d, 'dependency', 'B')).toBe('Blokuje „Projekt A“, jehož deadline (9. 11.) je dříve než vlastní deadline (26. 11.).');
  });

  it('závislost ve stejný den a s milníkem / úkolem', () => {
    const d = doc(
      [node('M', 'Spuštění', 'milestone', { dueDate: '2026-11-20' }), node('T', 'Školení', 'task', { dueDate: '2026-11-20' })],
      [['dependency', 'M', 'T']],
    );
    expect(text(d, 'dependency', 'T')).toBe('Čeká na „Spuštění“ s datem 20. 11., ale vlastní termín je ve stejný den.');
    expect(text(d, 'dependency', 'M')).toBe('Blokuje „Školení“, jehož termín (20. 11.) je ve stejný den jako vlastní datum.');
  });

  it('datum v jiném roce: věta končí tečkou', () => {
    const d = doc(
      [node('A', 'A', 'task', { dueDate: '2027-01-04' }), node('B', 'B', 'task', { dueDate: '2027-01-08' })],
      [['dependency', 'B', 'A']],
    );
    expect(text(d, 'dependency', 'A')).toBe('Čeká na „B“ s termínem 8. 1. 2027, ale vlastní termín je už 4. 1. 2027.');
  });

  it('hierarchie: vůči nadřazenému úkolu a vůči projektu, z obou stran', () => {
    const d = doc(
      [
        node('H', 'Hardware', 'task', { dueDate: '2026-11-15' }),
        node('S', 'Sklad', 'task', { dueDate: '2026-11-20' }),
        node('P', 'Projekt A', 'project', { dueDate: '2026-11-25' }),
        node('M', 'Předání', 'milestone', { dueDate: '2026-11-27' }),
      ],
      [
        ['hierarchy', 'H', 'S'],
        ['hierarchy', 'P', 'M'],
      ],
    );
    const list = findDateConflicts(d).list;
    const hs = list.find((c) => c.nodeId === 'S')!;
    const pm = list.find((c) => c.nodeId === 'M')!;
    expect(describeConflict(d, hs, 'S', today)).toBe('Termín podúkolu (20. 11.) je později než termín nadřazeného úkolu „Hardware“ (15. 11.).');
    expect(describeConflict(d, hs, 'H', today)).toBe('Podúkol „Sklad“ má termín (20. 11.) později než vlastní termín (15. 11.).');
    expect(describeConflict(d, pm, 'M', today)).toBe('Datum milníku (27. 11.) je později než deadline projektu „Projekt A“ (25. 11.).');
    expect(describeConflict(d, pm, 'P', today)).toBe('Milník „Předání“ má datum (27. 11.) později než vlastní deadline (25. 11.).');
  });

  it('podúkol vůči projektu', () => {
    const d = doc(
      [node('P', 'Projekt A', 'project', { dueDate: '2026-11-15' }), node('T', 'Úkol', 'task', { dueDate: '2026-11-20' })],
      [['hierarchy', 'P', 'T']],
    );
    expect(text(d, 'hierarchy', 'T')).toBe('Termín podúkolu (20. 11.) je později než deadline projektu „Projekt A“ (15. 11.).');
  });

  it('oznámení „Termín koliduje s: …“ obsahuje stejný text', () => {
    const d = doc(
      [node('A', 'Projekt A', 'project', { dueDate: '2026-11-09' }), node('B', 'Projekt B', 'project', { dueDate: '2026-11-26' })],
      [['dependency', 'B', 'A']],
    );
    const list = findDateConflicts(d).list;
    expect(conflictToast(d, list, 'A', today)).toBe(
      'Termín koliduje s: „Projekt B“. Čeká na „Projekt B“ s deadlinem 26. 11., ale vlastní deadline je už 9. 11.',
    );
    expect(conflictToast(d, list, 'A', today, true)).toMatch(/^Termín „Projekt A“ koliduje s: „Projekt B“\. /);
  });
});

describe('odznak skrytých shod', () => {
  it('tooltip s českými tvary čísel', () => {
    expect(hiddenMarksText('search', 1)).toBe('1 shoda hledání ve sbalené větvi – klikněte pro rozbalení');
    expect(hiddenMarksText('search', 3)).toBe('3 shody hledání ve sbalené větvi – klikněte pro rozbalení');
    expect(hiddenMarksText('search', 7)).toBe('7 shod hledání ve sbalené větvi – klikněte pro rozbalení');
    expect(hiddenMarksText('filter', 1)).toBe('1 úkol odpovídající filtru ve sbalené větvi – klikněte pro rozbalení');
    expect(hiddenMarksText('filter', 3)).toBe('3 úkoly odpovídající filtru ve sbalené větvi – klikněte pro rozbalení');
    expect(hiddenMarksText('filter', 12)).toBe('12 úkolů odpovídajících filtru ve sbalené větvi – klikněte pro rozbalení');
  });
});
