import { describe, expect, it } from 'vitest';
import { createEdge, createNode } from '../src/model/factory';
import { layoutBranch } from '../src/model/layout';
import { allLocked, canMove, setLocked } from '../src/model/locks';
import { moveNodes } from '../src/model/bulk';
import type { DocData, MapNode } from '../src/model/types';
import { BASE_NODE_SIZE } from '../src/model/viewport';

let seq = 0;
const node = (id: string, type: MapNode['type'] = 'task', extra: Partial<MapNode> = {}): MapNode => ({
  ...createNode({ id, type, title: id, createdAt: `2026-11-01T00:00:${String(seq++ % 60).padStart(2, '0')}.000Z` }),
  position: { x: (seq * 37) % 500, y: (seq * 53) % 400 }, // „neuspořádané“ pozice
  ...extra,
});
function doc(nodes: MapNode[], links: [string, string][]): DocData {
  const d: DocData = { nodes: Object.fromEntries(nodes.map((n) => [n.id, n])), edges: {} };
  links.forEach(([s, t], i) => {
    const e = createEdge('hierarchy', s, t, i, `2026-11-02T00:00:${String(i).padStart(2, '0')}.000Z`, `e${i}`);
    d.edges[e.id] = e;
  });
  return d;
}
type R = { x: number; y: number; w: number; h: number; id: string };
function rects(d: DocData, positions: Record<string, { x: number; y: number }>): R[] {
  return Object.values(d.nodes)
    .filter((n) => !n.deletedAt)
    .map((n) => {
      const p = positions[n.id] ?? n.position;
      const s = BASE_NODE_SIZE[n.type];
      return { id: n.id, x: p.x, y: p.y, w: s.w, h: s.h };
    });
}
function overlapsAmong(list: R[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) out.push(`${a.id}/${b.id}`);
    }
  return out;
}

/** P ─ A ─ A1, A2 ; P ─ B ─ B1 ; P ─ C */
function tree(extra: Partial<Record<string, Partial<MapNode>>> = {}): DocData {
  const ids = ['A', 'A1', 'A2', 'B', 'B1', 'C'];
  return doc(
    [node('P', 'project', { position: { x: 0, y: 0 }, ...extra.P }), ...ids.map((id) => node(id, 'task', extra[id] ?? {}))],
    [
      ['P', 'A'],
      ['A', 'A1'],
      ['A', 'A2'],
      ['P', 'B'],
      ['B', 'B1'],
      ['P', 'C'],
    ],
  );
}

describe('uspořádání větve', () => {
  it('doprava: kořen zůstane, potomci vpravo po úrovních, žádné překryvy', () => {
    const d = tree();
    const r = layoutBranch(d, 'P', 'right');
    expect(r.positions.P).toBeUndefined(); // kořen se nehýbe
    expect(Object.keys(r.positions).sort()).toEqual(['A', 'A1', 'A2', 'B', 'B1', 'C']);
    const pw = BASE_NODE_SIZE.project.w;
    for (const id of ['A', 'B', 'C']) expect(r.positions[id]!.x).toBeGreaterThanOrEqual(pw);
    for (const id of ['A1', 'A2', 'B1']) expect(r.positions[id]!.x).toBeGreaterThan(r.positions.A!.x);
    expect(overlapsAmong(rects(d, r.positions))).toEqual([]);
  });

  it('dolů: potomci pod kořenem', () => {
    const d = tree();
    const r = layoutBranch(d, 'P', 'down');
    for (const id of ['A', 'B', 'C']) expect(r.positions[id]!.y).toBeGreaterThanOrEqual(BASE_NODE_SIZE.project.h);
    for (const id of ['A1', 'A2']) expect(r.positions[id]!.y).toBeGreaterThan(r.positions.A!.y);
    expect(overlapsAmong(rects(d, r.positions))).toEqual([]);
  });

  it('zamčený uzel zůstane na místě a jeho podvětev se uspořádá kolem něj', () => {
    const d = tree({ A: { positionLocked: true, position: { x: 900, y: 600 } } });
    const r = layoutBranch(d, 'P', 'right');
    expect(r.positions.A).toBeUndefined();
    expect(r.locked).toEqual(['A']);
    // děti A vpravo od A (kolem jeho skutečné pozice)
    expect(r.positions.A1!.x).toBeGreaterThan(900);
    expect(overlapsAmong(rects(d, r.positions))).toEqual([]);
  });

  it('sdílený uzel s rodičem mimo větev zůstane na místě; se všemi rodiči ve větvi se umístí jednou', () => {
    let d = tree();
    d.nodes.Q = node('Q', 'project', { position: { x: 3000, y: 3000 } });
    d.nodes.S = node('S', 'task', { position: { x: 2000, y: 2000 } });
    d.nodes.T = node('T', 'task', { position: { x: 2500, y: 2500 } });
    d.edges.s1 = createEdge('hierarchy', 'A', 'S', 9, '2026-11-03T00:00:00.000Z', 's1');
    d.edges.s2 = createEdge('hierarchy', 'Q', 'S', 0, '2026-11-03T00:00:01.000Z', 's2'); // rodič mimo větev
    d.edges.t1 = createEdge('hierarchy', 'A', 'T', 9, '2026-11-03T00:00:02.000Z', 't1');
    d.edges.t2 = createEdge('hierarchy', 'B', 'T', 9, '2026-11-03T00:00:03.000Z', 't2'); // oba rodiče ve větvi
    const r = layoutBranch(d, 'P', 'right');
    expect(r.positions.S).toBeUndefined();
    expect(r.skippedShared).toEqual(['S']);
    expect(r.positions.T).toBeDefined();
    d = { ...d };
  });

  it('sbalená podvětev = jeden uzel; skryté uzly se nehýbou', () => {
    const d = tree({ A: { collapsed: true } });
    const before = { A1: d.nodes.A1!.position, A2: d.nodes.A2!.position };
    const r = layoutBranch(d, 'P', 'right');
    expect(r.positions.A).toBeDefined();
    expect(r.positions.A1).toBeUndefined();
    expect(r.positions.A2).toBeUndefined();
    expect(d.nodes.A1!.position).toEqual(before.A1);
  });

  it('překrytí s okolím: posune se celá uspořádaná část, okolí zůstane', () => {
    const d = tree();
    d.nodes.X = node('X', 'project', { position: { x: 300, y: -150 } }); // v cestě budoucím potomkům
    d.nodes.X.position = { x: 330, y: -100 };
    const plain = layoutBranch(tree(), 'P', 'right');
    const r = layoutBranch(d, 'P', 'right');
    expect(r.positions.X).toBeUndefined();
    expect(r.shift).not.toBeNull();
    expect(r.shift!.x).toBe(0);
    expect(r.positions.A!.y - plain.positions.A!.y).toBe(r.shift!.y);
    expect(overlapsAmong(rects(d, r.positions))).toEqual([]);
  });

  it('sbalený kořen nebo kořen bez dětí: nic se nepřesouvá', () => {
    expect(layoutBranch(tree({ P: { collapsed: true } }), 'P').positions).toEqual({});
    expect(layoutBranch(tree(), 'C').positions).toEqual({});
  });
});

describe('zámky pozic', () => {
  it('canMove: zamčený uzel ani globální zámek', () => {
    expect(canMove({ positionLocked: true }, false)).toBe(false);
    expect(canMove({}, true)).toBe(false);
    expect(canMove({}, false)).toBe(true);
  });
  it('zamknout / odemknout, hromadný přesun přeskočí zamčené', () => {
    let d = tree();
    d = setLocked(d, ['A', 'B'], true);
    expect(allLocked(d, ['A', 'B'])).toBe(true);
    const moved = moveNodes(d, ['A', 'B', 'C'], 10, 0);
    expect(moved.nodes.A!.position).toEqual(d.nodes.A!.position);
    expect(moved.nodes.C!.position.x).toBe(d.nodes.C!.position.x + 10);
    d = setLocked(d, ['A'], false);
    expect(d.nodes.A!.positionLocked).toBeUndefined();
    expect(setLocked(d, ['A'], false)).toBe(d); // beze změny
  });
});
