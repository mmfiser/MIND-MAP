import { describe, expect, it } from 'vitest';
import { bellItems } from '../src/model/bell';
import { createEdge, createNode } from '../src/model/factory';
import { EMPTY_FILTER, applyFilter, describeFilter, isFilterActive, type FilterState } from '../src/model/filters';
import { buildHierarchyIndex } from '../src/model/graph';
import { LOD_MAX_DEPTH, lodLevel, minZoomForDepth, nodeDepth } from '../src/model/lod';
import { searchNodes } from '../src/model/search';
import { findFolded, foldWithMap } from '../src/model/text';
import type { DocData, EdgeKind, MapNode } from '../src/model/types';
import { computeVisibility, routeEdges, setCollapsed } from '../src/model/visibility';

let seq = 0;
const node = (id: string, type: MapNode['type'] = 'task', extra: Partial<MapNode> = {}): MapNode => ({
  ...createNode({ id, type, title: id, createdAt: `2026-11-01T00:${String(Math.floor(seq / 60) % 60).padStart(2, '0')}:${String(seq++ % 60).padStart(2, '0')}.000Z` }),
  ...extra,
});
let eseq = 0;
function link(d: DocData, kind: EdgeKind, s: string, t: string): DocData {
  const e = createEdge(kind, s, t, eseq, `2026-11-02T00:00:${String(eseq % 60).padStart(2, '0')}.000Z`, `e${eseq++}`);
  return { nodes: d.nodes, edges: { ...d.edges, [e.id]: e } };
}
const doc = (nodes: MapNode[]): DocData => ({ nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges: {} });

/**
 * P1 ─ T1 ─ T11 ─ T111
 *    │    └ S (sdílený, i pod P2)
 *    └ M (milník)
 * P2 ─ S ; P2 ─ T2
 * X (volný úkol) ─ X1
 */
function sample(): DocData {
  let d = doc([
    node('P1', 'project'),
    node('P2', 'project'),
    node('T1'),
    node('T11'),
    node('T111'),
    node('S'),
    node('M', 'milestone'),
    node('T2'),
    node('X'),
    node('X1'),
  ]);
  for (const [s, t] of [
    ['P1', 'T1'],
    ['T1', 'T11'],
    ['T11', 'T111'],
    ['T1', 'S'],
    ['P1', 'M'],
    ['P2', 'S'],
    ['P2', 'T2'],
    ['X', 'X1'],
  ] as const)
    d = link(d, 'hierarchy', s, t);
  return d;
}
const vis = (d: DocData, opts = {}) => [...computeVisibility(d, undefined, opts).visible].sort();

describe('úroveň detailu podle zoomu', () => {
  it('prahy a hystereze', () => {
    expect(lodLevel(0.2)).toBe('overview');
    expect(lodLevel(0.4)).toBe('medium');
    expect(lodLevel(0.8)).toBe('full');
    // přesně na hranici neblikat: z přehledu nahoru až nad 0,38
    expect(lodLevel(0.36, 'overview')).toBe('overview');
    expect(lodLevel(0.39, 'overview')).toBe('medium');
    // z plného detailu dolů až pod 0,57
    expect(lodLevel(0.58, 'full')).toBe('full');
    expect(lodLevel(0.56, 'full')).toBe('medium');
    // rychlý skok přes dvě úrovně se nebrzdí
    expect(lodLevel(0.9, 'overview')).toBe('full');
  });

  it('přehled = kořeny, střední = + přímé poduzly, plný = vše', () => {
    const d = sample();
    expect(vis(d, { maxDepth: LOD_MAX_DEPTH.overview })).toEqual(['P1', 'P2', 'X']);
    expect(vis(d, { maxDepth: LOD_MAX_DEPTH.medium })).toEqual(['M', 'P1', 'P2', 'S', 'T1', 'T2', 'X', 'X1']);
    expect(vis(d, { maxDepth: LOD_MAX_DEPTH.full })).toHaveLength(10);
  });

  it('„+N“ u uzlů omezených úrovní detailu', () => {
    const v = computeVisibility(sample(), undefined, { maxDepth: 0 });
    expect(v.hiddenCount.get('P1')).toBe(5); // T1, T11, T111, S, M
    expect(v.hiddenCount.get('P2')).toBe(2); // S, T2 (S už je započtený u P1 jinou cestou – počítá se u každého)
    expect(v.lodLimited.has('P1')).toBe(true);
  });

  it('ruční sbalení má přednost i při plném detailu', () => {
    const d = setCollapsed(sample(), ['T1'], true);
    expect(vis(d)).not.toContain('T11');
    expect(vis(d)).toContain('S'); // sdílený – vidět přes P2
    expect(computeVisibility(d).lodLimited.size).toBe(0);
  });

  it('výjimka (vybraný uzel / shoda filtru) se zobrazí i s cestou', () => {
    const d = sample();
    expect(vis(d, { maxDepth: 0, keep: ['T111'] })).toEqual(['P1', 'P2', 'T1', 'T11', 'T111', 'X']);
  });

  it('výjimka v ručně sbalené větvi zůstane skrytá, sbalený uzel dostane počet shod', () => {
    const d = setCollapsed(sample(), ['T11'], true);
    const v = computeVisibility(d, undefined, { maxDepth: 0, keep: ['T111'], marks: ['T111'] });
    expect(v.visible.has('T111')).toBe(false);
    // cesta ke sbalenému předkovi se ukáže? ne – výjimka vede přes sbalený uzel, takže se nezobrazí nic
    expect(v.visible.has('T1')).toBe(false);
    expect(v.hiddenMarks.get('P1')).toBe(1);
    // při plném detailu je počet u ručně sbaleného uzlu
    const full = computeVisibility(d, undefined, { marks: ['T111'] });
    expect(full.hiddenMarks.get('T11')).toBe(1);
  });

  it('sdílený uzel jako výjimka jde přes rozbalenou větev', () => {
    const d = setCollapsed(sample(), ['T1'], true);
    const v = computeVisibility(d, undefined, { maxDepth: 0, keep: ['S'] });
    expect(v.visible.has('S')).toBe(true);
    expect(v.visible.has('T1')).toBe(false); // cesta přes P2
  });

  it('vazby do skrytých uzlů se přesměrují stejně jako u ručního sbalení', () => {
    let d = sample();
    d = link(d, 'dependency', 'T111', 'T2');
    d = link(d, 'dependency', 'T11', 'T2');
    const routed = routeEdges(d, computeVisibility(d, undefined, { maxDepth: 0 }));
    const dep = routed.filter((r) => r.kind === 'dependency');
    expect(dep).toHaveLength(1);
    expect(dep[0]).toMatchObject({ source: 'P1', target: 'P2', redirected: true });
    expect(dep[0]!.edgeIds).toHaveLength(2);
  });

  it('hloubka uzlu a potřebný zoom pro vystředění', () => {
    const d = sample();
    expect(nodeDepth(d, 'P1')).toBe(0);
    expect(nodeDepth(d, 'S')).toBe(1); // přes P2 je blíž
    expect(nodeDepth(d, 'T111')).toBe(3);
    expect(lodLevel(minZoomForDepth(1), 'overview')).toBe('medium');
    expect(lodLevel(minZoomForDepth(3), 'medium')).toBe('full');
  });

  it('1 000 uzlů se přepočítá rychle', () => {
    const nodes: MapNode[] = [];
    const edges: DocData['edges'] = {};
    for (let p = 0; p < 25; p++) {
      nodes.push(node(`p${p}`, 'project'));
      for (let t = 0; t < 39; t++) {
        const id = `p${p}t${t}`;
        nodes.push(node(id));
        const parent = t < 6 ? `p${p}` : `p${p}t${t % 6}`;
        edges[`h${id}`] = createEdge('hierarchy', parent, id, t, '2026-11-01T00:00:00.000Z', `h${id}`);
      }
    }
    const d: DocData = { nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges };
    const idx = buildHierarchyIndex(d);
    const t0 = performance.now();
    for (const depth of [0, 1, Infinity]) routeEdges(d, computeVisibility(d, idx, { maxDepth: depth, keep: ['p3t20'], marks: ['p4t30'] }));
    expect(nodes).toHaveLength(1000);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('vyhledávání', () => {
  function sdoc(): DocData {
    const d = doc([
      node('a', 'project', { title: 'Železniční přejezd' }),
      node('b', 'task', { title: 'Objednat kabely', notes: 'Zavolat dodavateli\na ověřit   cenu přejezdového zabezpečení.' }),
      node('c', 'task', { title: 'Revize', tags: ['přejezd'] }),
      node('d', 'task', { title: 'Školení', checklist: [{ id: 'x', text: 'Prezentace o přejezdech', done: false }] }),
      node('e', 'task', { title: 'Přejezd v koši', deletedAt: '2026-11-17T00:00:00Z' }),
      node('f', 'milestone', { title: 'Spuštění přejezdu' }),
    ]);
    return d;
  }

  it('bez diakritiky a velikosti písmen, ve všech polích, koš se nehledá', () => {
    const { results, total } = searchNodes(sdoc(), 'PREJEZD');
    expect(total).toBe(5);
    expect(results.map((r) => `${r.id}:${r.field}`)).toEqual(['f:title', 'a:title', 'c:tag', 'b:notes', 'd:checklist']);
  });

  it('pozice shody pro zvýraznění v originálním textu', () => {
    const r = searchNodes(sdoc(), 'prejezd').results[0]!;
    expect(r.text.slice(r.range[0], r.range[1])).toBe('přejezd');
    const n = searchNodes(sdoc(), 'overit').results[0]!;
    expect(n.field).toBe('notes');
    expect(n.text.slice(n.range[0], n.range[1])).toBe('ověřit');
    expect(n.text).not.toMatch(/\n|  /);
  });

  it('mapa pozic složeného textu', () => {
    expect(foldWithMap('Žluť').folded).toBe('zlut');
    expect(findFolded('Velký Špičák', 'spic')).toEqual([6, 10]);
    expect(findFolded('abc', '')).toBeNull();
  });

  it('nejvýš 50 výsledků, prázdný dotaz nic', () => {
    const nodes = Array.from({ length: 70 }, (_, i) => node(`n${i}`, 'task', { title: `Úkol ${i}` }));
    const r = searchNodes(doc(nodes), 'ukol');
    expect(r.results).toHaveLength(50);
    expect(r.total).toBe(70);
    expect(searchNodes(doc(nodes), '  ').total).toBe(0);
  });
});

describe('filtry', () => {
  const today = '2026-11-18'; // středa
  function fdoc(): DocData {
    let d = doc([
      node('P1', 'project', { title: 'Síť' }),
      node('P2', 'project', { title: 'Školení' }),
      node('over', 'task', { dueDate: '2026-11-17', priority: 'high', tags: ['HW'] }),
      node('today', 'task', { dueDate: today }),
      node('week', 'task', { dueDate: '2026-11-25' }), // dnes + 7
      node('later', 'task', { dueDate: '2026-11-26' }), // dnes + 8
      node('done', 'task', { dueDate: '2026-11-10', status: 'done' }),
      node('wait', 'task', { status: 'waiting' }),
      node('shared', 'task', { priority: 'critical' }),
      node('ms', 'milestone', { dueDate: '2026-11-20' }),
      node('msPast', 'milestone', { dueDate: '2026-11-16' }),
      node('trash', 'task', { dueDate: today, deletedAt: '2026-11-17T00:00:00Z' }),
    ]);
    for (const [s, t] of [
      ['P1', 'over'],
      ['P1', 'today'],
      ['over', 'week'],
      ['P1', 'later'],
      ['P2', 'done'],
      ['P2', 'wait'],
      ['P1', 'shared'],
      ['P2', 'shared'],
      ['P1', 'ms'],
      ['P2', 'msPast'],
      ['P1', 'trash'],
    ] as const)
      d = link(d, 'hierarchy', s, t);
    return d;
  }
  const run = (f: Partial<FilterState>) => [...applyFilter(fdoc(), { ...EMPTY_FILTER, ...f }, today).matches].sort();

  it('volby Zobrazit včetně hranic dnů a milníků', () => {
    expect(run({ show: 'overdue' })).toEqual(['over']);
    expect(run({ show: 'today' })).toEqual(['today']); // koš ne
    expect(run({ show: 'week' })).toEqual(['ms', 'today', 'week']); // dnes až dnes + 7, milník podle data
    expect(run({ show: 'done' })).toEqual(['done']);
    expect(run({ show: 'waiting' })).toEqual(['wait']);
    expect(run({ show: 'active' })).not.toContain('done');
    expect(run({ show: 'active' })).not.toContain('ms'); // milníky jen v časových volbách
    expect(run({ show: 'all' })).toHaveLength(7);
  });

  it('přes víkend: příštích 7 kalendářních dní (ne pracovních)', () => {
    const d = doc([node('sun', 'task', { dueDate: '2026-11-22' }), node('nextWed', 'task', { dueDate: '2026-11-25' })]);
    expect([...applyFilter(d, { ...EMPTY_FILTER, show: 'week' }, today).matches].sort()).toEqual(['nextWed', 'sun']);
  });

  it('projekt: sdílený uzel patří do obou, podúkol přes rodiče', () => {
    expect(run({ projects: ['P2'] })).toEqual(['done', 'shared', 'wait']);
    expect(run({ projects: ['P1'] })).toEqual(['later', 'over', 'shared', 'today', 'week']);
  });

  it('kombinace volb platí současně; předci shod', () => {
    expect(run({ show: 'active', priorities: ['high', 'critical'] })).toEqual(['over', 'shared']);
    expect(run({ tags: ['hw'] })).toEqual(['over']);
    const r = applyFilter(fdoc(), { ...EMPTY_FILTER, show: 'week', projects: ['P1'] }, today);
    expect([...r.matches].sort()).toEqual(['ms', 'today', 'week']);
    expect([...r.ancestors].sort()).toEqual(['P1', 'over']);
  });

  it('aktivní filtr a jeho popis', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, tags: ['x'] })).toBe(true);
    expect(describeFilter(fdoc(), { show: 'week', projects: ['P1'], priorities: ['high'], tags: ['HW'] })).toBe(
      'Na příštích 7 dní · projekt „Síť“ · priorita vysoká · štítek #HW',
    );
  });
});

describe('zvoneček', () => {
  const today = '2026-11-18'; // středa
  it('skupiny, řazení a vyloučení', () => {
    let d = doc([
      node('P', 'project', { dueDate: '2026-11-16' }), // projekt po termínu
      node('a', 'task', { dueDate: today, priority: 'low' }),
      node('b', 'task', { dueDate: today, priority: 'critical' }),
      node('c', 'task', { dueDate: '2026-11-20' }), // pá – 2 pracovní dny
      node('d', 'task', { dueDate: '2026-11-30' }), // daleko
      node('e', 'task', { dueDate: '2026-11-10', status: 'done' }),
      node('f', 'task', { dueDate: '2026-11-10', deletedAt: '2026-11-11T00:00:00Z' }),
      node('mToday', 'milestone', { dueDate: today }),
      node('mPast', 'milestone', { dueDate: '2026-11-17' }),
      node('mSoon', 'milestone', { dueDate: '2026-11-19' }),
      node('x', 'task', { startDate: '2026-11-30', dueDate: '2026-11-27' }),
    ]);
    d = link(d, 'hierarchy', 'P', 'd'); // d (30. 11.) později než deadline projektu → kolize
    const g = bellItems(d, today);
    expect(g.red.map((i) => i.nodeId)).toEqual(['P', 'b', 'mToday', 'a']) // milník jako střední priorita;
    expect(g.orange.map((i) => i.nodeId)).toEqual(['mSoon', 'c']);
    expect(g.conflicts.map((i) => `${i.conflict!.kind}:${i.nodeId}`)).toEqual(['dueBeforeStart:x', 'hierarchy:d']);
    expect(g.conflicts[1]!.reason).toMatch(/později než deadline projektu/);
    expect(g.total).toBe(8);
  });

  it('o půlnoci se přepočítá (jiný „dnes“)', () => {
    const d = doc([node('a', 'task', { dueDate: '2026-11-19' })]);
    expect(bellItems(d, '2026-11-18').orange).toHaveLength(1);
    expect(bellItems(d, '2026-11-19').red.map((i) => i.state)).toEqual(['today']);
    expect(bellItems(d, '2026-11-20').red.map((i) => i.state)).toEqual(['overdue']);
  });
});
