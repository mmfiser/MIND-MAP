import { describe, expect, it } from 'vitest';
import { createNode } from '../src/model/factory';
import { buildHierarchyIndex, parentEdges, rootNodes } from '../src/model/graph';
import { addChild, addParent, moveBranch } from '../src/model/hierarchy';
import { emptyTrash, listTrash, purgeBatch, restoreBatch, trashBranch } from '../src/model/trash';
import type { DocData, MapNode, OpResult } from '../src/model/types';

const unwrap = (r: OpResult): DocData => {
  if (!r.ok) throw new Error(r.reason);
  return r.data;
};
function restored(d: DocData, batchId: string) {
  const r = restoreBatch(d, batchId);
  if ('error' in r) throw new Error(r.error);
  return r;
}
const node = (id: string, type: MapNode['type'] = 'task') => createNode({ id, type, title: id });
const parentsOf = (d: DocData, id: string) => parentEdges(d, id).map((e) => e.source).sort();
const live = (d: DocData) => Object.values(d.nodes).filter((n) => !n.deletedAt).map((n) => n.id).sort();

/** A(projekt) ─ A1 ─ A11 ; A ─ A2 ; B(projekt) ─ B1 */
function sample(): DocData {
  let d: DocData = { nodes: { A: node('A', 'project'), B: node('B', 'project') }, edges: {} };
  d = unwrap(addChild(d, 'A', node('A1')));
  d = unwrap(addChild(d, 'A1', node('A11')));
  d = unwrap(addChild(d, 'A', node('A2')));
  d = unwrap(addChild(d, 'B', node('B1')));
  d.nodes.A1!.position = { x: 123, y: 45 };
  return d;
}

describe('koš – smazání a obnovení větve', () => {
  it('smazání označí větev, vazby zůstanou neaktivní; uzly zmizí z indexu', () => {
    const d = unwrap(trashBranch(sample(), 'A1', { batchId: 'b1' }));
    expect(d.nodes.A1!.deletedAt).toBeTruthy();
    expect(d.nodes.A11!.trash).toEqual({ batchId: 'b1', isRoot: false });
    expect(d.nodes.A1!.trash).toMatchObject({ batchId: 'b1', isRoot: true, parentIds: ['A'], projectTitle: 'A' });
    expect(Object.keys(d.edges)).toHaveLength(4);
    expect(buildHierarchyIndex(d).children.get('A')!.map((e) => e.target)).toEqual(['A2']);
    expect(live(d)).toEqual(['A', 'A2', 'B', 'B1']);
    expect(listTrash(d)).toMatchObject([{ batchId: 'b1', rootId: 'A1', count: 2, projectTitle: 'A' }]);
  });

  it('obnovení vrátí rodiče, pořadí i pozici', () => {
    const before = sample();
    const order = buildHierarchyIndex(before).children.get('A')!.map((e) => e.target);
    const d = restored(unwrap(trashBranch(before, 'A1', { batchId: 'b1' })), 'b1');
    expect(d.notices).toEqual([]);
    expect(d.data.nodes.A1!.deletedAt).toBeUndefined();
    expect(d.data.nodes.A1!.trash).toBeUndefined();
    expect(d.data.nodes.A1!.position).toEqual({ x: 123, y: 45 });
    expect(buildHierarchyIndex(d.data).children.get('A')!.map((e) => e.target)).toEqual(order);
    expect(parentsOf(d.data, 'A11')).toEqual(['A1']);
  });

  it('sdílený uzel s rodičem mimo větev přežije a vazba se po obnovení vrátí', () => {
    let d = unwrap(addParent(sample(), 'A11', 'B1'));
    d = unwrap(trashBranch(d, 'A', { batchId: 'b' }));
    expect(d.nodes.A11!.deletedAt).toBeUndefined();
    expect(parentsOf(d, 'A11')).toEqual(['B1']);
    const r = restored(d, 'b');
    expect(parentsOf(r.data, 'A11')).toEqual(['A1', 'B1']);
  });

  it('obnovení po trvalém smazání rodiče: uzel zůstane volný a aplikace to oznámí', () => {
    let d = unwrap(trashBranch(sample(), 'A11', { batchId: 'child' }));
    d = unwrap(trashBranch(d, 'A1', { batchId: 'parent' }));
    d = unwrap(purgeBatch(d, 'parent'));
    const r = restored(d, 'child');
    expect(parentsOf(r.data, 'A11')).toEqual([]);
    expect(rootNodes(r.data).map((n) => n.id)).toContain('A11');
    expect(r.notices.join(' ')).toMatch(/trvale smazán/);
    expect(r.notices.join(' ')).toMatch(/volně na ploše/);
  });

  it('rodič je stále v koši: oznámí, že se vazba vrátí po jeho obnovení', () => {
    let d = unwrap(trashBranch(sample(), 'A11', { batchId: 'child' }));
    d = unwrap(trashBranch(d, 'A1', { batchId: 'parent' }));
    const r = restored(d, 'child');
    expect(r.notices.join(' ')).toMatch(/je v koši/);
    const r2 = restored(r.data, 'parent');
    expect(parentsOf(r2.data, 'A11')).toEqual(['A1']);
  });

  it('vazba, která by po obnovení vytvořila cyklus, se zahodí s oznámením', () => {
    // A11 je sdílený (rodiče A1 a B1). Smaž A1 → A11 přežije pod B1.
    let d = unwrap(addParent(sample(), 'A11', 'B1'));
    d = unwrap(trashBranch(d, 'A1', { batchId: 'b' }));
    // Mezitím přesuň A pod A11 (A1 je v koši, takže to teď cyklus není).
    d = unwrap(moveBranch(d, 'A', null, 'A11'));
    const r = restored(d, 'b');
    // A → A1 → A11 → A by byl cyklus: vazba A1 → A11 se nevrátí.
    expect(parentsOf(r.data, 'A11')).toEqual(['B1']);
    expect(parentsOf(r.data, 'A1')).toEqual(['A']);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toMatch(/„A11“ ztratil rodiče „A1“/);
  });
});

describe('koš – trvalé smazání', () => {
  it('purgeBatch odstraní uzly i jejich neaktivní vazby (žádné osiřelé vazby)', () => {
    let d = unwrap(addParent(sample(), 'A11', 'B1'));
    d = unwrap(trashBranch(d, 'A1', { batchId: 'b' }));
    d = unwrap(purgeBatch(d, 'b'));
    expect(d.nodes.A1).toBeUndefined();
    expect(d.nodes.A11).toBeDefined(); // sdílený přežil
    for (const e of Object.values(d.edges)) {
      expect(d.nodes[e.source]).toBeDefined();
      expect(d.nodes[e.target]).toBeDefined();
      expect(e.source).not.toBe('A1');
      expect(e.target).not.toBe('A1');
    }
    expect(parentsOf(d, 'A11')).toEqual(['B1']);
  });

  it('emptyTrash vysype vše a nenechá osiřelé vazby', () => {
    let d = unwrap(trashBranch(sample(), 'A', { batchId: 'a' }));
    d = unwrap(trashBranch(d, 'B1', { batchId: 'b' }));
    d = unwrap(emptyTrash(d));
    expect(Object.keys(d.nodes)).toEqual(['B']);
    expect(Object.keys(d.edges)).toEqual([]);
    expect(listTrash(d)).toEqual([]);
  });
});
