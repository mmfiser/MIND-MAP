/**
 * Úroveň detailu podle zoomu (fáze 4). Jen zobrazení – nemění `collapsed` ani pozice.
 *
 *  - overview: jen kořeny (projekty a uzly bez rodiče)
 *  - medium:   kořeny + jejich přímé poduzly
 *  - full:     vše
 *
 * Mezi úrovněmi je hystereze, aby uzly na hranici neblikaly.
 */
import { buildHierarchyIndex, type HierarchyIndex } from './graph';
import type { DocData } from './types';

export type LodLevel = 'overview' | 'medium' | 'full';

/** Prahy zoomu mezi úrovněmi a šířka hystereze (doladěno podle vzhledu). */
export const LOD_THRESHOLDS = { medium: 0.35, full: 0.6 } as const;
export const LOD_HYSTERESIS = 0.03;

export const LOD_LABEL: Record<LodLevel, string> = {
  overview: 'Přehled',
  medium: 'Projekty a úkoly',
  full: 'Vše',
};

/** Nejhlubší viditelná úroveň hierarchie (0 = kořeny). */
export const LOD_MAX_DEPTH: Record<LodLevel, number> = { overview: 0, medium: 1, full: Infinity };

const ORDER: LodLevel[] = ['overview', 'medium', 'full'];

function rawLevel(zoom: number): LodLevel {
  if (zoom < LOD_THRESHOLDS.medium) return 'overview';
  if (zoom < LOD_THRESHOLDS.full) return 'medium';
  return 'full';
}

/**
 * Úroveň pro daný zoom. S předchozí úrovní se přepne až po překročení prahu
 * o `LOD_HYSTERESIS` (nahoru i dolů).
 */
export function lodLevel(zoom: number, prev?: LodLevel): LodLevel {
  const raw = rawLevel(zoom);
  if (!prev || raw === prev) return raw;
  const h = LOD_HYSTERESIS;
  const up = ORDER.indexOf(raw) > ORDER.indexOf(prev);
  // Skok o víc úrovní (rychlý zoom) se nebrzdí.
  if (Math.abs(ORDER.indexOf(raw) - ORDER.indexOf(prev)) > 1) return raw;
  const threshold = up ? (raw === 'medium' ? LOD_THRESHOLDS.medium : LOD_THRESHOLDS.full) : prev === 'medium' ? LOD_THRESHOLDS.medium : LOD_THRESHOLDS.full;
  if (up ? zoom >= threshold + h : zoom < threshold - h) return raw;
  return prev;
}

/** Nejmenší zoom, při kterém je uzel v dané hloubce vidět (s rezervou nad hysterezí). */
export function minZoomForDepth(depth: number): number {
  if (depth <= 0) return 0;
  if (depth === 1) return LOD_THRESHOLDS.medium + LOD_HYSTERESIS + 0.02;
  return LOD_THRESHOLDS.full + LOD_HYSTERESIS + 0.02;
}

/** Nejmenší hloubka uzlu od kořene (bez ohledu na sbalení). */
export function nodeDepth(data: DocData, id: string, index?: HierarchyIndex): number {
  const idx = index ?? buildHierarchyIndex(data);
  const depth = new Map<string, number>([[id, 0]]);
  // Hledání do šířky nahoru – první kořen = nejkratší cesta.
  const queue = [id];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    const parents = idx.parents.get(cur) ?? [];
    if (!parents.length) return depth.get(cur)!;
    for (const e of parents) {
      if (depth.has(e.source)) continue;
      depth.set(e.source, depth.get(cur)! + 1);
      queue.push(e.source);
    }
  }
  return 0;
}
