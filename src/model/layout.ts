/**
 * Automatické uspořádání větve (fáze 5) – čistá funkce nad knihovnou dagre.
 *
 *  - Kořen větve zůstane na místě; rozmístí se jeho potomci do stromu (doprava / dolů).
 *  - Základní rozměry uzlů (×1), ne zvětšené kompenzací zoomu.
 *  - Sdílený uzel se umístí jen tehdy, když jsou všichni jeho rodiče v uspořádávané větvi.
 *  - Sbalená podvětev = jeden uzel (její skryté uzly se nehýbou).
 *  - Zamčený uzel uvnitř větve zůstane přesně na místě; jeho podvětev se uspořádá
 *    zvlášť kolem něj. Zamčené uzly a okolí slouží jako pevné překážky.
 *  - Překrývá-li se nová větev s okolím, posune se celá uspořádaná část (ne okolí).
 */
import dagre from '@dagrejs/dagre';
import { buildHierarchyIndex, descendants, type HierarchyIndex } from './graph';
import type { DocData, Position } from './types';
import { BASE_NODE_SIZE } from './viewport';

export type LayoutDir = 'right' | 'down';

export interface LayoutOptions {
  /** mezera mezi sourozenci */
  nodesep?: number;
  /** mezera mezi úrovněmi */
  ranksep?: number;
  /** minimální mezera k okolním uzlům */
  gap?: number;
  /** přichytávání k mřížce */
  grid?: number;
}

export interface LayoutResult {
  /** nové pozice přesouvaných uzlů */
  positions: Record<string, Position>;
  /** o kolik se uspořádaná část posunula kvůli okolí (null = neposunula) */
  shift: Position | null;
  /** sdílené uzly, které zůstaly na místě (mají rodiče i mimo větev) */
  skippedShared: string[];
  /** zamčené uzly ve větvi (zůstaly na místě) */
  locked: string[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const size = (data: DocData, id: string) => BASE_NODE_SIZE[data.nodes[id]!.type];

/** Uzly uspořádávané větve: kořen + potomci, jejichž všichni rodiče jsou ve větvi. Sbalené uzly se dál neprochází. */
export function branchMembers(data: DocData, rootId: string, idx: HierarchyIndex = buildHierarchyIndex(data)) {
  const members = new Set<string>([rootId]);
  const skipped = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...members]) {
      if (id !== rootId && data.nodes[id]!.collapsed) continue; // sbalená podvětev = jeden uzel
      if (id === rootId && data.nodes[id]!.collapsed) continue;
      for (const e of idx.children.get(id) ?? []) {
        const c = e.target;
        if (members.has(c)) continue;
        const parents = idx.parents.get(c) ?? [];
        if (parents.every((p) => members.has(p.source))) {
          members.add(c);
          skipped.delete(c);
          changed = true;
        } else skipped.add(c);
      }
    }
  }
  return { members, skipped: [...skipped].filter((id) => !members.has(id)) };
}

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

export function layoutBranch(data: DocData, rootId: string, dir: LayoutDir = 'right', opts: LayoutOptions = {}): LayoutResult {
  const { nodesep = 24, ranksep = 70, gap = 16, grid = 10 } = opts;
  const empty: LayoutResult = { positions: {}, shift: null, skippedShared: [], locked: [] };
  const root = data.nodes[rootId];
  if (!root || root.deletedAt || root.collapsed) return empty;
  const idx = buildHierarchyIndex(data);
  const { members, skipped } = branchMembers(data, rootId, idx);
  if (members.size < 2) return { ...empty, skippedShared: skipped };

  // Kotvy: kořen a zamčené uzly ve větvi (zůstávají na místě).
  const locked = [...members].filter((id) => id !== rootId && data.nodes[id]!.positionLocked);
  const anchors = [rootId, ...locked];
  const anchorSet = new Set(anchors);

  // Každá kotva má vlastní komponentu: potomky až po další kotvu.
  const owner = new Map<string, string>();
  const comps = new Map<string, string[]>();
  for (const a of anchors) {
    const comp = [a];
    owner.set(a, a);
    const queue = [a];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i]!;
      if (cur !== a && data.nodes[cur]!.collapsed) continue;
      if (cur === a && cur !== rootId && data.nodes[cur]!.collapsed) continue;
      for (const e of idx.children.get(cur) ?? []) {
        const c = e.target;
        if (!members.has(c) || anchorSet.has(c) || owner.has(c)) continue;
        owner.set(c, a);
        comp.push(c);
        queue.push(c);
      }
    }
    comps.set(a, comp);
  }

  const positions: Record<string, Position> = {};
  const snap = (v: number) => (grid ? Math.round(v / grid) * grid : v);
  for (const [a, comp] of comps) {
    if (comp.length < 2) continue;
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: dir === 'right' ? 'LR' : 'TB', nodesep, ranksep, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const id of comp) {
      const s = size(data, id);
      g.setNode(id, { width: s.w, height: s.h });
    }
    const inComp = new Set(comp);
    for (const id of comp) {
      for (const e of idx.children.get(id) ?? []) if (inComp.has(e.target)) g.setEdge(id, e.target);
    }
    dagre.layout(g);
    const an = g.node(a)!;
    const as = size(data, a);
    // Posun tak, aby kotva zůstala přesně na své pozici.
    const ox = data.nodes[a]!.position.x - (an.x - as.w / 2);
    const oy = data.nodes[a]!.position.y - (an.y - as.h / 2);
    for (const id of comp) {
      if (id === a) continue;
      const n = g.node(id)!;
      const s = size(data, id);
      positions[id] = { x: snap(n.x - s.w / 2 + ox), y: snap(n.y - s.h / 2 + oy) };
    }
  }

  // Překážky: uzly, které se nehýbou (okolí, kotvy), kromě skrytých uzlů sbalených podvětví.
  const movedIds = Object.keys(positions);
  const moved = new Set(movedIds);
  const hiddenUnder = new Set<string>();
  for (const id of members) {
    if (data.nodes[id]!.collapsed) for (const d of descendants(data, id, idx)) if (!members.has(d)) hiddenUnder.add(d);
  }
  const obstacles: Rect[] = [];
  for (const n of Object.values(data.nodes)) {
    if (n.deletedAt || moved.has(n.id) || hiddenUnder.has(n.id)) continue;
    const s = BASE_NODE_SIZE[n.type];
    obstacles.push({ x: n.position.x, y: n.position.y, w: s.w, h: s.h });
  }
  // Kolize uspořádané části s okolím: posun celé části kolmo na směr stromu, dokud nejsou volné.
  let dx = 0;
  let dy = 0;
  for (let iter = 0; iter < 200; iter++) {
    let need = 0;
    for (const id of movedIds) {
      const p = positions[id]!;
      const s = size(data, id);
      const r = { x: p.x + dx, y: p.y + dy, w: s.w, h: s.h };
      for (const o of obstacles) {
        if (!overlaps(r, o, gap)) continue;
        // o kolik posunout, aby byl uzel za překážkou
        need = Math.max(need, dir === 'right' ? o.y + o.h + gap - r.y : o.x + o.w + gap - r.x);
      }
    }
    if (need <= 0) break;
    const step = Math.ceil(need / (grid || 1)) * (grid || 1);
    if (dir === 'right') dy += step;
    else dx += step;
  }
  if (dx || dy) for (const id of movedIds) positions[id] = { x: positions[id]!.x + dx, y: positions[id]!.y + dy };

  return { positions, shift: dx || dy ? { x: dx, y: dy } : null, skippedShared: skipped, locked };
}

/** Počet uzlů, které by uspořádání přesouvalo (pro rozhodnutí, zda počítat ve Web Workeru). */
export function branchSize(data: DocData, rootId: string): number {
  if (!data.nodes[rootId]) return 0;
  return branchMembers(data, rootId).members.size;
}
