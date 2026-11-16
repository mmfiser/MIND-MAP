import { describe, expect, it } from 'vitest';
import { activeBlockers, blockersIndex, isBlocking } from '../src/model/blocking';
import { conflictPartners, describeConflict, findDateConflicts } from '../src/model/conflicts';
import { deadlineState } from '../src/model/deadline';
import { floatingEdgeGeometry } from '../src/model/edgeGeometry';
import { createEdge, createNode } from '../src/model/factory';
import { buildHierarchyIndex } from '../src/model/graph';
import { addChild, moveBranch } from '../src/model/hierarchy';
import {
  addLink,
  changeLinkKind,
  nodeLinks,
  reconnectLink,
  removeLink,
  reverseDependency,
  validateLink,
} from '../src/model/links';
import { migrateDocument } from '../src/model/migrations';
import { projectProgress } from '../src/model/progress';
import { emptyTrash, purgeBatch, restoreBatch, trashBranch } from '../src/model/trash';
import type { DocData, EdgeKind, MapNode, OpResult } from '../src/model/types';
import { SCHEMA_VERSION } from '../src/model/types';
import {
  collapseAllToProjects,
  collapsedAncestors,
  computeVisibility,
  expandAll,
  routeEdges,
  setCollapsed,
} from '../src/model/visibility';

const unwrap = (r: OpResult): DocData => {
  if (!r.ok) throw new Error(r.reason);
  return r.data;
};
let seq = 0;
const node = (id: string, type: MapNode['type'] = 'task', extra: Partial<MapNode> = {}): MapNode => ({
  ...createNode({ id, type, title: id, createdAt: `2026-11-01T00:00:${String(seq++ % 60).padStart(2, '0')}.000Z` }),
  ...extra,
});
let eseq = 0;
function link(d: DocData, kind: EdgeKind, s: string, t: string): DocData {
  const e = createEdge(kind, s, t, 0, `2026-11-02T00:${String(Math.floor(eseq / 60) % 60).padStart(2, '0')}:${String(eseq % 60).padStart(2, '0')}.000Z`, `e${eseq++}`);
  return { nodes: d.nodes, edges: { ...d.edges, [e.id]: e } };
}
function doc(nodes: MapNode[]): DocData {
  return { nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges: {} };
}

describe('vazby – vytváření a pravidla', () => {
  const base = () => doc([node('A'), node('B'), node('C'), node('M', 'milestone')]);

  it('zakáže vazbu na sebe a duplicitu (souvislost i v opačném směru)', () => {
    let d = base();
    expect(validateLink(d, 'dependency', 'A', 'A')).toMatch(/sám se sebou/);
    d = unwrap(addLink(d, 'related', 'A', 'B'));
    expect(validateLink(d, 'related', 'B', 'A')).toMatch(/už existuje/);
    d = unwrap(addLink(d, 'dependency', 'A', 'B'));
    expect(validateLink(d, 'dependency', 'A', 'B')).toMatch(/už blokuje/);
    // hierarchie i závislost mezi stejnou dvojicí jsou povolené
    expect(validateLink(d, 'hierarchy', 'A', 'B')).toBeNull();
  });

  it('cyklus závislostí odmítne s názvy uzlů v cestě', () => {
    let d = base();
    d = unwrap(addLink(d, 'dependency', 'A', 'B'));
    d = unwrap(addLink(d, 'dependency', 'B', 'C'));
    const r = addLink(d, 'dependency', 'C', 'A');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('Vazbu nelze vytvořit: úkoly by na sebe čekaly v kruhu („C“ → „A“ → „B“ → „C“).');
    // souvislost cykly povoluje
    expect(addLink(d, 'related', 'C', 'A').ok).toBe(true);
  });

  it('cyklus v hierarchii odmítne s cestou', () => {
    let d = base();
    d = unwrap(addLink(d, 'hierarchy', 'A', 'B'));
    d = unwrap(addLink(d, 'hierarchy', 'B', 'C'));
    const r = addLink(d, 'hierarchy', 'C', 'A');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cyklus v hierarchii \(„C“ → „A“ → „B“ → „C“\)/);
  });

  it('podúkol smí blokovat svého rodiče (hierarchie a závislosti se hlídají zvlášť)', () => {
    let d = base();
    d = unwrap(addLink(d, 'hierarchy', 'A', 'B'));
    expect(addLink(d, 'dependency', 'B', 'A').ok).toBe(true);
  });

  it('otočení, změna druhu, odstranění a přepojení', () => {
    let d = base();
    d = unwrap(addLink(d, 'dependency', 'A', 'B'));
    const id = Object.keys(d.edges)[0]!;
    d = unwrap(reverseDependency(d, id));
    expect(d.edges[id]).toMatchObject({ source: 'B', target: 'A', kind: 'dependency' });
    d = unwrap(changeLinkKind(d, id, 'related'));
    expect(d.edges[id]!.kind).toBe('related');
    d = unwrap(changeLinkKind(d, id, 'dependency', true));
    expect(d.edges[id]).toMatchObject({ source: 'A', target: 'B', kind: 'dependency' });
    d = unwrap(reconnectLink(d, id, 'target', 'C'));
    expect(d.edges[id]).toMatchObject({ source: 'A', target: 'C' });
    expect(reconnectLink(d, id, 'source', 'C').ok).toBe(false); // sám na sebe
    const before = Object.keys(d.nodes).length;
    d = unwrap(removeLink(d, id));
    expect(Object.keys(d.edges)).toHaveLength(0);
    expect(Object.keys(d.nodes)).toHaveLength(before); // uzly zůstanou
  });

  it('přepojení se stejnou kontrolou cyklů (hierarchie)', () => {
    let d = base();
    d = unwrap(addLink(d, 'hierarchy', 'A', 'B'));
    d = unwrap(addLink(d, 'hierarchy', 'B', 'C'));
    const ab = Object.values(d.edges).find((e) => e.source === 'A')!;
    // A → B přepojit na C → B: C je potomek B → cyklus
    expect(reconnectLink(d, ab.id, 'source', 'C').ok).toBe(false);
  });

  it('nodeLinks rozdělí vazby podle významu', () => {
    let d = base();
    d = unwrap(addLink(d, 'hierarchy', 'A', 'B'));
    d = unwrap(addLink(d, 'dependency', 'B', 'C'));
    d = unwrap(addLink(d, 'dependency', 'M', 'B'));
    d = unwrap(addLink(d, 'related', 'C', 'B'));
    const l = nodeLinks(d, 'B');
    expect(l.parents.map((e) => e.source)).toEqual(['A']);
    expect(l.blocks.map((e) => e.target)).toEqual(['C']);
    expect(l.blockedBy.map((e) => e.source)).toEqual(['M']);
    expect(l.related).toHaveLength(1);
  });
});

describe('milníky', () => {
  it('nemůže mít poduzly (přidání, přesun ani vazba hierarchie)', () => {
    let d = doc([node('P', 'project'), node('M', 'milestone'), node('T')]);
    expect(addChild(d, 'M', node('X')).ok).toBe(false);
    expect(addLink(d, 'hierarchy', 'M', 'T').ok).toBe(false);
    d = unwrap(addChild(d, 'P', node('U')));
    const r = moveBranch(d, 'U', 'P', 'M');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Milník nemůže mít poduzly/);
    // milník jako poduzel projektu je v pořádku
    expect(addLink(d, 'hierarchy', 'P', 'M').ok).toBe(true);
  });

  it('nezapočítává se do procent projektu', () => {
    let d = doc([node('P', 'project')]);
    d = unwrap(addChild(d, 'P', node('T', 'task', { status: 'done' })));
    d = unwrap(addChild(d, 'P', node('M', 'milestone')));
    expect(projectProgress(d, 'P')).toMatchObject({ done: 1, total: 1, percent: 100 });
  });

  it('stav data: blíží se / dnes / uplynulý (nikdy červeně)', () => {
    const today = '2026-11-16'; // pondělí
    expect(deadlineState('2026-11-13', today, 'new', 'milestone')).toBe('past');
    expect(deadlineState('2026-11-13', today, 'new', 'task')).toBe('overdue');
    expect(deadlineState('2026-11-16', today, 'new', 'milestone')).toBe('today');
    expect(deadlineState('2026-11-18', today, 'new', 'milestone')).toBe('soon');
  });
});

describe('blokující závislosti', () => {
  const today = '2026-11-16';
  it('blokuje nedokončený uzel; Hotovo a Zrušeno ne', () => {
    let d = doc([node('A'), node('B', 'task', { status: 'done' }), node('C', 'task', { status: 'cancelled' }), node('T')]);
    d = link(d, 'dependency', 'A', 'T');
    d = link(d, 'dependency', 'B', 'T');
    d = link(d, 'dependency', 'C', 'T');
    expect(activeBlockers(d, 'T', today).map((n) => n.id)).toEqual(['A']);
    expect(blockersIndex(d, today).get('T')!.map((n) => n.id)).toEqual(['A']);
  });
  it('milník blokuje do svého data; v den milníku a bez data už ne', () => {
    expect(isBlocking(node('M', 'milestone', { dueDate: '2026-11-17' }), today)).toBe(true);
    expect(isBlocking(node('M', 'milestone', { dueDate: '2026-11-16' }), today)).toBe(false);
    expect(isBlocking(node('M', 'milestone'), today)).toBe(false);
  });
  it('uzel v koši neblokuje', () => {
    expect(isBlocking(node('A', 'task', { deletedAt: '2026-11-15T00:00:00Z' }), today)).toBe(false);
  });
});

describe('kolize termínů', () => {
  const today = '2026-11-16';
  it('závislost: blokovaný má termín dříve nebo ve stejný den', () => {
    let d = doc([node('A', 'task', { dueDate: '2026-11-20' }), node('B', 'task', { dueDate: '2026-11-20' }), node('C', 'task', { dueDate: '2026-11-23' })]);
    d = link(d, 'dependency', 'A', 'B'); // stejný den → kolize
    d = link(d, 'dependency', 'A', 'C'); // později → OK
    const r = findDateConflicts(d);
    expect(r.list).toEqual([{ kind: 'dependency', nodeId: 'B', otherId: 'A', edgeId: expect.any(String) }]);
    expect(r.byNode.has('A')).toBe(true);
    expect(r.byNode.has('C')).toBe(false);
    expect(r.edgeIds.size).toBe(1);
    expect(describeConflict(d, r.list[0]!, 'B', today)).toMatch(/Čeká na „A“/);
    expect(conflictPartners(d, r.byNode.get('B')!, 'B')).toEqual(['„A“']);
  });

  it('hierarchie: poduzel později než rodič, u sdíleného vůči každému rodiči', () => {
    let d = doc([
      node('P', 'project', { dueDate: '2026-11-30' }),
      node('T', 'task', { dueDate: '2026-11-20' }),
      node('S', 'task', { dueDate: '2026-11-25' }),
    ]);
    d = link(d, 'hierarchy', 'P', 'T');
    d = link(d, 'hierarchy', 'T', 'S'); // S později než T → kolize
    d = link(d, 'hierarchy', 'P', 'S'); // S dříve než P → OK
    const r = findDateConflicts(d);
    expect(r.list.map((c) => [c.kind, c.nodeId, c.otherId])).toEqual([['hierarchy', 'S', 'T']]);
  });

  it('milník v hierarchii i jako blokující uzel', () => {
    let d = doc([
      node('P', 'project', { dueDate: '2026-11-20' }),
      node('M', 'milestone', { dueDate: '2026-11-25' }),
      node('T', 'task', { dueDate: '2026-11-24' }),
    ]);
    d = link(d, 'hierarchy', 'P', 'M'); // milník po deadlinu projektu
    d = link(d, 'dependency', 'M', 'T'); // úkol před milníkem, na který čeká
    const kinds = findDateConflicts(d).list.map((c) => `${c.kind}:${c.nodeId}`);
    expect(kinds).toEqual(['hierarchy:M', 'dependency:T']);
  });

  it('nepočítá Hotovo, Zrušeno, koš a uzly bez termínu; zahrnuje termín před začátkem', () => {
    let d = doc([
      node('A', 'task', { dueDate: '2026-11-20' }),
      node('B', 'task', { dueDate: '2026-11-19', status: 'done' }),
      node('C', 'task', { dueDate: '2026-11-19', deletedAt: '2026-11-15T00:00:00Z' }),
      node('D', 'task'),
      node('E', 'task', { startDate: '2026-11-20', dueDate: '2026-11-19' }),
    ]);
    d = link(d, 'dependency', 'A', 'B');
    d = link(d, 'dependency', 'A', 'C');
    d = link(d, 'dependency', 'A', 'D');
    expect(findDateConflicts(d).list).toEqual([{ kind: 'dueBeforeStart', nodeId: 'E' }]);
  });
});

describe('sbalování a přesměrování vazeb', () => {
  /**
   * P1 ─ T1 ─ T11 ─ T111
   *         └ S (sdílený)
   * P2 ─ S
   * X (volný úkol)
   */
  function sample(): DocData {
    let d = doc([node('P1', 'project'), node('P2', 'project'), node('T1'), node('T11'), node('T111'), node('S'), node('X')]);
    d = link(d, 'hierarchy', 'P1', 'T1');
    d = link(d, 'hierarchy', 'T1', 'T11');
    d = link(d, 'hierarchy', 'T11', 'T111');
    d = link(d, 'hierarchy', 'T1', 'S');
    d = link(d, 'hierarchy', 'P2', 'S');
    return d;
  }

  it('sbalený uzel skryje potomky a ukáže jejich počet', () => {
    const d = setCollapsed(sample(), ['T1'], true);
    const v = computeVisibility(d);
    expect([...v.visible].sort()).toEqual(['P1', 'P2', 'S', 'T1', 'X']);
    expect(v.hiddenCount.get('T1')).toBe(2); // T11, T111 (S je vidět přes P2)
  });

  it('sdílený uzel zmizí, až když jsou sbalení oba rodiče', () => {
    const d = setCollapsed(sample(), ['T1', 'P2'], true);
    const v = computeVisibility(d);
    expect(v.visible.has('S')).toBe(false);
    expect(v.hiddenCount.get('P2')).toBe(1);
    expect(v.hiddenCount.get('T1')).toBe(3);
  });

  it('vazba do skryté větve vede do nejbližšího viditelného předka, sloučené mají počet', () => {
    let d = sample();
    d = link(d, 'dependency', 'X', 'T11');
    d = link(d, 'dependency', 'X', 'T111');
    d = link(d, 'related', 'T111', 'T11'); // oba konce ve stejném uzlu → nevykreslí se
    d = setCollapsed(d, ['T1'], true);
    const routed = routeEdges(d, computeVisibility(d));
    const dep = routed.filter((r) => r.kind === 'dependency');
    expect(dep).toHaveLength(1);
    expect(dep[0]).toMatchObject({ source: 'X', target: 'T1', redirected: true });
    expect(dep[0]!.edgeIds).toHaveLength(2);
    expect(routed.some((r) => r.kind === 'related')).toBe(false);
    // hierarchie uvnitř sbalené větve se nevykresluje, viditelná zůstává
    const h = routed.filter((r) => r.kind === 'hierarchy').map((r) => `${r.source}>${r.target}`).sort();
    expect(h).toEqual(['P1>T1', 'P2>S', 'T1>S']);
  });

  it('skrytý sdílený uzel: hierarchická vazba vede do větve svého rodiče', () => {
    let d = sample();
    d = link(d, 'dependency', 'X', 'S');
    d = setCollapsed(d, ['P1', 'P2'], true);
    const routed = routeEdges(d, computeVisibility(d));
    // vazba X → S jde do předka po nejstarší rodičovské vazbě (T1 → P1)
    expect(routed.find((r) => r.kind === 'dependency')).toMatchObject({ source: 'X', target: 'P1' });
    expect(routed.filter((r) => r.kind === 'hierarchy')).toHaveLength(0);
  });

  it('souběžné vazby mezi dvojicí dostanou odsazení na obě strany', () => {
    let d = doc([node('A'), node('B')]);
    d = link(d, 'hierarchy', 'A', 'B');
    d = link(d, 'dependency', 'A', 'B');
    const routed = routeEdges(d, computeVisibility(d));
    expect(routed.map((r) => r.bend)).toEqual([-11, 11]);
    const g0 = floatingEdgeGeometry({ x: 0, y: 0, width: 100, height: 40 }, { x: 300, y: 0, width: 100, height: 40 });
    const g1 = floatingEdgeGeometry({ x: 0, y: 0, width: 100, height: 40 }, { x: 300, y: 0, width: 100, height: 40 }, 0.25, 11);
    expect(Math.abs(g1.mid.y - g0.mid.y)).toBeCloseTo(11, 5);
  });

  it('rozbalení předků skrytého uzlu, sbalit vše na projekty a rozbalit vše', () => {
    let d = setCollapsed(sample(), ['T1', 'T11'], true);
    expect(collapsedAncestors(d, 'T111').sort()).toEqual(['T1', 'T11']);
    d = expandAll(d);
    expect(Object.values(d.nodes).some((n) => n.collapsed)).toBe(false);
    d = collapseAllToProjects(d);
    expect(Object.values(d.nodes).filter((n) => n.collapsed).map((n) => n.id).sort()).toEqual(['P1', 'P2']);
  });

  it('1 000 uzlů se spočítá rychle', () => {
    const nodes: MapNode[] = [];
    const edges: DocData['edges'] = {};
    for (let p = 0; p < 20; p++) {
      nodes.push(node(`p${p}`, 'project', { collapsed: p % 2 === 0 }));
      for (let t = 0; t < 49; t++) {
        const id = `p${p}t${t}`;
        nodes.push(node(id));
        const parent = t < 7 ? `p${p}` : `p${p}t${t % 7}`;
        edges[`h${id}`] = createEdge('hierarchy', parent, id, t, '2026-11-01T00:00:00.000Z', `h${id}`);
        if (t > 0) edges[`d${id}`] = createEdge('dependency', `p${p}t${t - 1}`, id, 0, '2026-11-01T00:00:00.000Z', `d${id}`);
      }
    }
    const d: DocData = { nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges };
    const t0 = performance.now();
    const idx = buildHierarchyIndex(d);
    const v = computeVisibility(d, idx);
    const routed = routeEdges(d, v);
    findDateConflicts(d);
    const ms = performance.now() - t0;
    expect(nodes).toHaveLength(1000);
    expect(v.visible.size).toBe(10 + 10 * 50);
    expect(routed.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(150);
  });
});

describe('koš a vazby', () => {
  it('závislosti a souvislosti jdou do koše neaktivní, obnovení je vrátí, trvalé smazání je odstraní', () => {
    let d = doc([node('A'), node('B'), node('C')]);
    d = link(d, 'dependency', 'A', 'B');
    d = link(d, 'related', 'B', 'C');
    d = unwrap(trashBranch(d, 'B', { batchId: 'b1' }));
    expect(nodeLinks(d, 'A').blocks).toHaveLength(0); // neaktivní
    expect(Object.keys(d.edges)).toHaveLength(2);
    const r = restoreBatch(d, 'b1');
    if ('error' in r) throw new Error(r.error);
    expect(nodeLinks(r.data, 'B').blockedBy).toHaveLength(1);
    expect(nodeLinks(r.data, 'B').related).toHaveLength(1);
    const purged = unwrap(purgeBatch(d, 'b1'));
    expect(Object.keys(purged.edges)).toHaveLength(0);
    expect(Object.keys(unwrap(emptyTrash(d)).edges)).toHaveLength(0);
  });

  it('závislost, která by po obnovení vytvořila cyklus, se zahodí s oznámením', () => {
    let d = doc([node('A'), node('B')]);
    d = link(d, 'dependency', 'A', 'B');
    d = unwrap(trashBranch(d, 'B', { batchId: 'b1' }));
    d = unwrap({ ok: true, data: { nodes: { ...d.nodes, B: { ...d.nodes.B!, deletedAt: undefined, trash: undefined } }, edges: {} } });
    // B žije bez vazby, vytvoříme B → A, pak B smažeme a obnovíme starou A → B
    d = unwrap(addLink(d, 'dependency', 'B', 'A'));
    d = link(d, 'dependency', 'A', 'B');
    const withOld = unwrap(trashBranch(d, 'A', { batchId: 'b2' }));
    const r = restoreBatch(withOld, 'b2');
    if ('error' in r) throw new Error(r.error);
    expect(r.notices.join(' ')).toMatch(/čekaly v kruhu/);
  });
});

describe('migrace na schéma 3', () => {
  const v2 = {
    meta: { schemaVersion: 2, docId: 'doc-2', revision: 7, updatedAt: '2026-11-15T10:00:00.000Z', deviceName: 'Notebook' },
    nodes: {
      p: { id: 'p', type: 'project', title: 'P', notes: '', color: 'red', status: 'in_progress', priority: 'high',
        createdAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-10T10:00:00.000Z', tags: ['a'], checklist: [],
        position: { x: 0, y: 0 }, collapsed: false, icon: 'server', dueDate: '2026-11-30' },
      t: { id: 't', type: 'task', title: 'T', notes: 'n', status: 'done', priority: 'low',
        createdAt: '2026-11-10T10:01:00.000Z', updatedAt: '2026-11-10T10:01:00.000Z', tags: [],
        checklist: [{ id: 'c', text: 'x', done: true }], position: { x: 300, y: 0 }, collapsed: false,
        startDate: '2026-11-11', dueDate: '2026-11-20', icon: 'laptop' },
      d: { id: 'd', type: 'task', title: 'D', notes: '', status: 'new', priority: 'medium',
        createdAt: '2026-11-10T10:02:00.000Z', updatedAt: '2026-11-10T10:02:00.000Z', tags: [], checklist: [],
        position: { x: 300, y: 100 }, collapsed: false, deletedAt: '2026-11-14T10:00:00.000Z',
        trash: { batchId: 'b', isRoot: true, parentIds: ['p'], projectTitle: 'P' } },
    },
    edges: {
      e1: { id: 'e1', kind: 'hierarchy', source: 'p', target: 't', order: 0, createdAt: '2026-11-10T10:01:00.001Z' },
      e2: { id: 'e2', kind: 'hierarchy', source: 'p', target: 'd', order: 1, createdAt: '2026-11-10T10:02:00.001Z' },
      e3: { id: 'e3', kind: 'hierarchy', source: 'p', target: 't', order: 2, createdAt: '2026-11-10T10:03:00.001Z' }, // duplicita
    },
  };

  it('soubor z fáze 2 se načte beze ztráty dat', () => {
    const doc3 = migrateDocument(JSON.parse(JSON.stringify(v2)));
    expect(doc3.meta).toMatchObject({ schemaVersion: SCHEMA_VERSION, docId: 'doc-2', revision: 7 });
    expect(SCHEMA_VERSION).toBe(3);
    expect(doc3.nodes.t).toMatchObject({ status: 'done', icon: 'laptop', startDate: '2026-11-11', notes: 'n' });
    expect(doc3.nodes.t!.checklist).toHaveLength(1);
    expect(doc3.nodes.d!.trash).toMatchObject({ batchId: 'b', parentIds: ['p'] });
    expect(Object.keys(doc3.edges).sort()).toEqual(['e1', 'e2']); // starší z duplicit zůstane
  });

  it('milník: bez stavu a checklistu, poduzly milníku se změní na souvislost; cyklus závislostí se zahodí', () => {
    const raw = JSON.parse(JSON.stringify(v2));
    raw.meta.schemaVersion = 3;
    raw.nodes.t.type = 'milestone';
    raw.edges.e4 = { id: 'e4', kind: 'hierarchy', source: 't', target: 'p', order: 0, createdAt: '2026-11-10T11:00:00.000Z' };
    raw.edges.e5 = { id: 'e5', kind: 'dependency', source: 'p', target: 'd', order: 0, createdAt: '2026-11-10T11:01:00.000Z' };
    raw.edges.e6 = { id: 'e6', kind: 'dependency', source: 'd', target: 'p', order: 0, createdAt: '2026-11-10T11:02:00.000Z' };
    const doc3 = migrateDocument(raw);
    expect(doc3.nodes.t).toMatchObject({ type: 'milestone', status: 'new', checklist: [] });
    expect(doc3.nodes.t!.startDate).toBeUndefined();
    expect(doc3.edges.e4!.kind).toBe('related');
    expect(doc3.edges.e5).toBeDefined();
    expect(doc3.edges.e6).toBeUndefined();
  });

  it('novější soubor odmítne s návodem', () => {
    expect(() => migrateDocument({ meta: { schemaVersion: SCHEMA_VERSION + 1 } })).toThrow(
      'Soubor je z novější verze aplikace. Otevřete aplikaci s připojením k internetu, aby se aktualizovala, a zkuste to znovu.',
    );
  });
});
