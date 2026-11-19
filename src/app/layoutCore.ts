/** Uspořádání více větví najednou (sdílí hlavní vlákno i Web Worker). */
import { layoutBranch, type LayoutDir } from '../model/layout';
import type { DocData, Position } from '../model/types';

export interface LayoutRequest {
  data: DocData;
  roots: string[];
  dir: LayoutDir;
}

export interface LayoutResponse {
  positions: Record<string, Position>;
  shifted: number;
  skippedShared: number;
  locked: number;
}

export function layoutMany({ data, roots, dir }: LayoutRequest): LayoutResponse {
  let cur = data;
  const positions: Record<string, Position> = {};
  let shifted = 0;
  const skipped = new Set<string>();
  const locked = new Set<string>();
  for (const root of roots) {
    const r = layoutBranch(cur, root, dir);
    if (r.shift) shifted++;
    r.skippedShared.forEach((id) => skipped.add(id));
    r.locked.forEach((id) => locked.add(id));
    if (!Object.keys(r.positions).length) continue;
    Object.assign(positions, r.positions);
    // další větve počítají s už uspořádanými uzly
    const nodes = { ...cur.nodes };
    for (const [id, p] of Object.entries(r.positions)) nodes[id] = { ...nodes[id]!, position: p };
    cur = { nodes, edges: cur.edges };
  }
  return { positions, shifted, skippedShared: skipped.size, locked: locked.size };
}
