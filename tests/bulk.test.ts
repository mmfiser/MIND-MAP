import { describe, expect, it } from 'vitest';
import { moveNodes, selectionRoots, setPriorityMany, setStatusMany, trashMany } from '../src/model/bulk';
import { createNode } from '../src/model/factory';
import { parentEdges } from '../src/model/graph';
import { addChild, addParent } from '../src/model/hierarchy';
import { listTrash, restoreBatch } from '../src/model/trash';
import type { DocData, MapNode, OpResult } from '../src/model/types';

const unwrap = (r: OpResult): DocData => {
  if (!r.ok) throw new Error(r.reason);
  return r.data;
};
let seq = 0;
const node = (id: string, type: MapNode['type'] = 'task', extra: Partial<MapNode> = {}): MapNode => ({
  ...createNode({ id, type, title: id, createdAt: `2026-11-01T00:00:${String(seq++ % 60).padStart(2, '0')}.000Z` }),
  ...extra,
});

/** P ─ A ─ A1 ; P ─ B ; P ─ M (milník) ; Q (projekt) ─ S (sdílený, i pod A) */
function sample(): DocData {
  let d: DocData = { nodes: { P: node('P', 'project'), Q: node('Q', 'project') }, edges: {} };
  d = unwrap(addChild(d, 'P', node('A', 'task', { position: { x: 100, y: 100 } })));
  d = unwrap(addChild(d, 'A', node('A1', 'task', { position: { x: 300, y: 100 } })));
  d = unwrap(addChild(d, 'P', node('B', 'task', { position: { x: 100, y: 200 }, positionLocked: true })));
  d = unwrap(addChild(d, 'P', node('M', 'milestone')));
  d = unwrap(addChild(d, 'Q', node('S')));
  d = unwrap(addParent(d, 'S', 'A'));
  return d;
}

describe('hromadný přesun', () => {
  it('posune vybrané se zachováním vzájemných pozic; zamčené zůstanou', () => {
    const d = moveNodes(sample(), ['A', 'A1', 'B'], 40, -20);
    expect(d.nodes.A!.position).toEqual({ x: 140, y: 80 });
    expect(d.nodes.A1!.position).toEqual({ x: 340, y: 80 });
    expect(d.nodes.A1!.position.x - d.nodes.A!.position.x).toBe(200);
    expect(d.nodes.B!.position).toEqual({ x: 100, y: 200 }); // zamčený (fáze 5)
  });
  it('přichytávání k mřížce a nulový posun beze změny', () => {
    const d0 = sample();
    expect(moveNodes(d0, ['A'], 0, 0)).toBe(d0);
    const d = moveNodes(d0, ['A'], 13, 7, 10);
    expect(d.nodes.A!.position).toEqual({ x: 110, y: 110 });
  });
});

describe('hromadné smazání a obnovení z koše', () => {
  it('kořeny výběru: potomek vybraného uzlu se nemaže zvlášť', () => {
    expect(selectionRoots(sample(), ['A', 'A1', 'B']).sort()).toEqual(['A', 'B']);
  });

  it('jedna položka koše, sdílený uzel s rodičem mimo výběr zůstane', () => {
    const d = unwrap(trashMany(sample(), ['A', 'B', 'M'], { batchId: 'b1' }));
    const deleted = Object.values(d.nodes).filter((n) => n.deletedAt).map((n) => n.id).sort();
    expect(deleted).toEqual(['A', 'A1', 'B', 'M']);
    expect(d.nodes.S!.deletedAt).toBeUndefined(); // má rodiče Q
    const trash = listTrash(d);
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ batchId: 'b1', roots: 3, count: 4 });
    expect(trash[0]!.title).toBe('3 uzly: „A“, „B“, „M“');
  });

  it('sdílený uzel se smaže, když jsou ve výběru oba jeho rodiče', () => {
    const d = unwrap(trashMany(sample(), ['A', 'Q'], { batchId: 'b2' }));
    expect(d.nodes.S!.deletedAt).toBeDefined();
  });

  it('obnovení vrátí všechny uzly i vazby k rodičům', () => {
    const d0 = sample();
    const d = unwrap(trashMany(d0, ['A', 'B'], { batchId: 'b1' }));
    const r = restoreBatch(d, 'b1');
    if ('error' in r) throw new Error(r.error);
    expect(Object.values(r.data.nodes).some((n) => n.deletedAt)).toBe(false);
    expect(parentEdges(r.data, 'A').map((e) => e.source)).toEqual(['P']);
    expect(parentEdges(r.data, 'B').map((e) => e.source)).toEqual(['P']);
    expect(parentEdges(r.data, 'A1').map((e) => e.source)).toEqual(['A']);
    expect(r.notices).toEqual([]);
  });
});

describe('hromadná změna stavu a priority', () => {
  it('jen úkoly; projekty a milníky se přeskočí a spočítají', () => {
    const r = setStatusMany(sample(), ['A', 'A1', 'P', 'M'], 'done');
    expect(r.changed).toBe(2);
    expect(r.skipped).toBe(2);
    expect(r.data.nodes.A!.status).toBe('done');
    expect(r.data.nodes.P!.status).toBe('new');
    expect(r.data.nodes.M!.status).toBe('new');
  });
  it('priorita; beze změny vrací stejná data', () => {
    const d0 = sample();
    const r = setPriorityMany(d0, ['A', 'B', 'Q'], 'high');
    expect(r).toMatchObject({ changed: 2, skipped: 1 });
    expect(r.data.nodes.B!.priority).toBe('high');
    const same = setPriorityMany(r.data, ['A', 'B'], 'high');
    expect(same.data).toBe(r.data);
    expect(same.changed).toBe(0);
  });
});
