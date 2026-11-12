import { describe, expect, it } from 'vitest';
import { createEdge, createNode } from '../src/model/factory';
import { buildHierarchyIndex, owningProject, parentEdges, rootNodes } from '../src/model/graph';
import {
  addChild,
  addParent,
  addSibling,
  branchNodesToDelete,
  deleteBranch,
  detachFromParent,
  moveBranch,
  translateBranch,
  wouldCreateCycle,
} from '../src/model/hierarchy';
import type { DocData, MapNode, OpResult } from '../src/model/types';

function unwrap(r: OpResult): DocData {
  if (!r.ok) throw new Error(r.reason);
  return r.data;
}

let t = 0;
const ts = () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString();

function node(id: string, type: MapNode['type'] = 'task', title = id): MapNode {
  return createNode({ id, type, title, createdAt: ts() });
}

/**
 * Testovací graf:
 *   A (projekt) ─ A1 ─ A11
 *               └ A2
 *   B (projekt) ─ B1
 */
function sample(): DocData {
  let d: DocData = { nodes: {}, edges: {} };
  for (const n of [node('A', 'project'), node('B', 'project')]) d.nodes[n.id] = n;
  d = unwrap(addChild(d, 'A', node('A1')));
  d = unwrap(addChild(d, 'A1', node('A11')));
  d = unwrap(addChild(d, 'A', node('A2')));
  d = unwrap(addChild(d, 'B', node('B1')));
  return d;
}

const parentsOf = (d: DocData, id: string) => parentEdges(d, id).map((e) => e.source);

describe('kontrola cyklů', () => {
  it('odhalí cyklus přes více úrovní', () => {
    const d = sample();
    expect(wouldCreateCycle(d, 'hierarchy', 'A11', 'A')).toBe(true);
    expect(wouldCreateCycle(d, 'hierarchy', 'A1', 'A1')).toBe(true);
    expect(wouldCreateCycle(d, 'hierarchy', 'B1', 'A1')).toBe(false);
  });

  it('cyklus u related je povolený, u dependency ne', () => {
    let d = sample();
    const e1 = createEdge('dependency', 'A1', 'B1');
    d = { ...d, edges: { ...d.edges, [e1.id]: e1 } };
    expect(wouldCreateCycle(d, 'dependency', 'B1', 'A1')).toBe(true);
    expect(wouldCreateCycle(d, 'related', 'B1', 'A1')).toBe(false);
    // hierarchie a závislosti se nemíchají
    expect(wouldCreateCycle(d, 'hierarchy', 'B1', 'A1')).toBe(false);
  });

  it('addParent odmítne cyklus s českým vysvětlením', () => {
    const d = sample();
    const r = addParent(d, 'A', 'A11');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cyklus/);
    const self = addParent(d, 'A1', 'A1');
    expect(self.ok).toBe(false);
  });
});

describe('přidání a odpojení rodiče', () => {
  it('vytvoří sdílený uzel se dvěma rodiči', () => {
    const d = unwrap(addParent(sample(), 'A11', 'B1'));
    expect(parentsOf(d, 'A11')).toEqual(['A1', 'B1']);
  });

  it('odmítne duplicitní vazbu', () => {
    const r = addParent(sample(), 'A11', 'A1');
    expect(r.ok).toBe(false);
  });

  it('odpojení od jednoho rodiče ponechá ostatní', () => {
    let d = unwrap(addParent(sample(), 'A11', 'B1'));
    d = unwrap(detachFromParent(d, 'A11', 'A1'));
    expect(parentsOf(d, 'A11')).toEqual(['B1']);
  });

  it('po odpojení od posledního rodiče je uzel volný (kořen) a zůstane i jeho větev', () => {
    const d = unwrap(detachFromParent(sample(), 'A1', 'A'));
    expect(d.nodes.A1).toBeDefined();
    expect(parentsOf(d, 'A1')).toEqual([]);
    expect(parentsOf(d, 'A11')).toEqual(['A1']);
    expect(rootNodes(d).map((n) => n.id)).toContain('A1');
  });

  it('odpojení od nerodiče selže', () => {
    expect(detachFromParent(sample(), 'A11', 'B').ok).toBe(false);
  });
});

describe('sourozenci', () => {
  it('vloží sourozence hned za uzel', () => {
    const d = unwrap(addSibling(sample(), 'A1', node('X')));
    const order = buildHierarchyIndex(d)
      .children.get('A')!
      .map((e) => e.target);
    expect(order).toEqual(['A1', 'X', 'A2']);
  });

  it('sourozenec volného uzlu je volný uzel', () => {
    const d = unwrap(addSibling(sample(), 'A', node('P', 'project')));
    expect(parentsOf(d, 'P')).toEqual([]);
  });
});

describe('přesun větve', () => {
  it('přesune uzel i s potomky pod jiného rodiče', () => {
    const d = unwrap(moveBranch(sample(), 'A1', 'A', 'B1'));
    expect(parentsOf(d, 'A1')).toEqual(['B1']);
    expect(parentsOf(d, 'A11')).toEqual(['A1']);
  });

  it('odmítne přesun pod vlastního potomka', () => {
    const r = moveBranch(sample(), 'A', null, 'A11');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cyklus/);
  });

  it('u sdíleného uzlu přesune jen vazbu od zvoleného rodiče', () => {
    let d = unwrap(addParent(sample(), 'A11', 'B1'));
    d = unwrap(moveBranch(d, 'A11', 'A1', 'A2'));
    expect(parentsOf(d, 'A11').sort()).toEqual(['A2', 'B1']);
  });

  it('přesun pod rodiče, který už uzel má, jen odpojí původní vazbu', () => {
    let d = unwrap(addParent(sample(), 'A11', 'B1'));
    d = unwrap(moveBranch(d, 'A11', 'A1', 'B1'));
    expect(parentsOf(d, 'A11')).toEqual(['B1']);
  });

  it('přesun, který by byl cyklem jen přes odebíranou vazbu, je povolen', () => {
    // A1 → A11 ; přesun A11 z A1 pod A2 nevadí
    const d = unwrap(moveBranch(sample(), 'A11', 'A1', 'A2'));
    expect(parentsOf(d, 'A11')).toEqual(['A2']);
  });

  it('translateBranch posune celou větev, sdílené potomky s rodičem mimo větev ne', () => {
    let d = unwrap(addParent(sample(), 'A11', 'B1'));
    d = unwrap(addChild(d, 'A1', node('A12')));
    const before = { a1: d.nodes.A1!.position, a11: d.nodes.A11!.position, a12: d.nodes.A12!.position };
    d = translateBranch(d, 'A1', 100, 50);
    expect(d.nodes.A1!.position).toEqual({ x: before.a1.x + 100, y: before.a1.y + 50 });
    expect(d.nodes.A12!.position).toEqual({ x: before.a12.x + 100, y: before.a12.y + 50 });
    expect(d.nodes.A11!.position).toEqual(before.a11);
  });
});

describe('smazání větve', () => {
  it('smaže uzel, potomky a všechny jejich vazby', () => {
    const d = unwrap(deleteBranch(sample(), 'A1'));
    expect(d.nodes.A1).toBeUndefined();
    expect(d.nodes.A11).toBeUndefined();
    expect(d.nodes.A2).toBeDefined();
    for (const e of Object.values(d.edges)) {
      expect(['A1', 'A11']).not.toContain(e.source);
      expect(['A1', 'A11']).not.toContain(e.target);
    }
  });

  it('sdílený potomek s rodičem mimo větev přežije', () => {
    let d = unwrap(addParent(sample(), 'A11', 'B1'));
    expect([...branchNodesToDelete(d, 'A')].sort()).toEqual(['A', 'A1', 'A2']);
    d = unwrap(deleteBranch(d, 'A'));
    expect(d.nodes.A11).toBeDefined();
    expect(parentsOf(d, 'A11')).toEqual(['B1']);
  });

  it('sdílený potomek se smaže, když jsou oba rodiče ve větvi', () => {
    let d = unwrap(addParent(sample(), 'A11', 'A2'));
    d = unwrap(deleteBranch(d, 'A'));
    expect(d.nodes.A11).toBeUndefined();
  });
});

describe('projekt rodiče (barva spojnice)', () => {
  it('najde nejbližší projekt; u sdíleného uzlu podle nejstarší vazby', () => {
    let d = sample();
    expect(owningProject(d, 'A11')?.id).toBe('A');
    d = unwrap(addParent(d, 'A11', 'B1'));
    expect(owningProject(d, 'A11')?.id).toBe('A');
    d = unwrap(detachFromParent(d, 'A11', 'A1'));
    d = unwrap(addParent(d, 'A11', 'A1')); // teď je vazba od A1 novější
    expect(owningProject(d, 'A11')?.id).toBe('B');
  });
});
