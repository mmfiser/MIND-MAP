/**
 * Minimapa (fáze 5) – čisté výpočty: měřítko, převod souřadnic, výřez.
 * Pracuje se základními rozměry uzlů (×1) a se všemi uzly mimo koš, takže
 * v minimapě jsou vždy vidět všechny projekty bez ohledu na úroveň detailu.
 */
import { nodesBounds, type Bounds } from './viewport';
import type { DocData } from './types';

export interface MinimapFrame {
  /** oblast plochy zobrazená v minimapě */
  bounds: Bounds;
  /** px minimapy na jednotku plochy */
  scale: number;
  /** posun, aby byla mapa v minimapě vystředěná */
  offsetX: number;
  offsetY: number;
}

/** Rámec minimapy pro dokument a rozměry minimapy (s okrajem). */
export function minimapFrame(data: DocData, width: number, height: number, padding = 0.08): MinimapFrame | null {
  const b = nodesBounds(data);
  if (!b) return null;
  const w = Math.max(b.width, 1);
  const h = Math.max(b.height, 1);
  const pad = Math.max(w, h) * padding;
  const bounds = { x: b.x - pad, y: b.y - pad, width: w + 2 * pad, height: h + 2 * pad };
  const scale = Math.min(width / bounds.width, height / bounds.height);
  return {
    bounds,
    scale,
    offsetX: (width - bounds.width * scale) / 2,
    offsetY: (height - bounds.height * scale) / 2,
  };
}

/** Bod plochy → bod minimapy. */
export function toMinimap(f: MinimapFrame, x: number, y: number): { x: number; y: number } {
  return { x: f.offsetX + (x - f.bounds.x) * f.scale, y: f.offsetY + (y - f.bounds.y) * f.scale };
}

/** Bod minimapy → bod plochy (klik / tažení v minimapě). */
export function fromMinimap(f: MinimapFrame, mx: number, my: number): { x: number; y: number } {
  return { x: f.bounds.x + (mx - f.offsetX) / f.scale, y: f.bounds.y + (my - f.offsetY) / f.scale };
}

/** Výřez plochy (transformace React Flow + rozměr plochy) v souřadnicích plochy. */
export function viewportRect(tx: number, ty: number, zoom: number, viewW: number, viewH: number): Bounds {
  return { x: -tx / zoom, y: -ty / zoom, width: viewW / zoom, height: viewH / zoom };
}
