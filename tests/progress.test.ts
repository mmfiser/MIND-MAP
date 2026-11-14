import { describe, expect, it } from 'vitest';
import { createNode } from '../src/model/factory';
import { addChild, addParent } from '../src/model/hierarchy';
import { checklistProgress, plural, projectProgress, subtaskProgress } from '../src/model/progress';
import type { DocData, MapNode, OpResult, Status } from '../src/model/types';

const unwrap = (r: OpResult): DocData => {
  if (!r.ok) throw new Error(r.reason);
  return r.data;
};
const task = (id: string, status: Status = 'new'): MapNode => ({ ...createNode({ id, type: 'task' }), status });

function base(): DocData {
  return {
    nodes: {
      P: createNode({ id: 'P', type: 'project' }),
      Q: createNode({ id: 'Q', type: 'project' }),
    },
    edges: {},
  };
}

describe('procento projektu', () => {
  it('prázdný projekt = –', () => {
    expect(projectProgress(base(), 'P')).toEqual({ done: 0, open: 0, total: 0, percent: null });
  });

  it('jen zrušené úkoly = –', () => {
    const d = unwrap(addChild(base(), 'P', task('a', 'cancelled')));
    expect(projectProgress(d, 'P').percent).toBeNull();
  });

  it('hotové / všechny bez zrušených a milníků', () => {
    let d = base();
    d = unwrap(addChild(d, 'P', task('a', 'done')));
    d = unwrap(addChild(d, 'P', task('b', 'in_progress')));
    d = unwrap(addChild(d, 'P', task('c', 'cancelled')));
    d = unwrap(addChild(d, 'P', { ...createNode({ id: 'm', type: 'milestone' }), status: 'done' }));
    expect(projectProgress(d, 'P')).toEqual({ done: 1, open: 1, total: 2, percent: 50 });
  });

  it('podúkoly se nepočítají', () => {
    let d = base();
    d = unwrap(addChild(d, 'P', task('a', 'new')));
    d = unwrap(addChild(d, 'a', task('a1', 'done')));
    d = unwrap(addChild(d, 'a', task('a2', 'done')));
    expect(projectProgress(d, 'P')).toEqual({ done: 0, open: 1, total: 1, percent: 0 });
  });

  it('sdílený uzel se započítá do obou projektů', () => {
    let d = base();
    d = unwrap(addChild(d, 'P', task('s', 'done')));
    d = unwrap(addChild(d, 'P', task('p2', 'new')));
    d = unwrap(addParent(d, 's', 'Q'));
    expect(projectProgress(d, 'P').percent).toBe(50);
    expect(projectProgress(d, 'Q').percent).toBe(100);
  });

  it('uzly v koši se nepočítají', () => {
    let d = base();
    d = unwrap(addChild(d, 'P', task('a', 'done')));
    d = unwrap(addChild(d, 'P', task('b', 'new')));
    d = { ...d, nodes: { ...d.nodes, b: { ...d.nodes.b!, deletedAt: '2026-01-01T00:00:00Z' } } };
    expect(projectProgress(d, 'P').percent).toBe(100);
  });
});

describe('podúkoly a checklist', () => {
  it('přímé podúkoly bez zrušených', () => {
    let d = base();
    d = unwrap(addChild(d, 'P', task('a')));
    expect(subtaskProgress(d, 'a')).toBeNull();
    d = unwrap(addChild(d, 'a', task('a1', 'done')));
    d = unwrap(addChild(d, 'a', task('a2', 'new')));
    d = unwrap(addChild(d, 'a', task('a3', 'cancelled')));
    d = unwrap(addChild(d, 'a1', task('a11', 'done')));
    expect(subtaskProgress(d, 'a')).toMatchObject({ done: 1, total: 2 });
  });

  it('checklist', () => {
    const n = task('x');
    expect(checklistProgress(n)).toBeNull();
    n.checklist = [
      { id: '1', text: 'a', done: true },
      { id: '2', text: 'b', done: false },
    ];
    expect(checklistProgress(n)).toEqual({ done: 1, total: 2 });
  });

  it('české tvary', () => {
    expect([0, 1, 2, 4, 5].map((n) => plural(n, 'otevřený', 'otevřené', 'otevřených'))).toEqual([
      'otevřených',
      'otevřený',
      'otevřené',
      'otevřené',
      'otevřených',
    ]);
  });
});
