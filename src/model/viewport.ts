/**
 * Výpočty pohledu na plochu (vystředění, „Zoom 80 %“, úvodní zobrazení).
 *
 * Ohraničení se vždy počítá ze ZÁKLADNÍCH rozměrů uzlů (faktor ×1, bez kompenzace
 * zoomu a bez ohledu na úroveň detailu) a ze všech uzlů mimo koš – ne jen z právě
 * vykreslených. Výsledek tak nezávisí na tom, z jakého přiblížení uživatel klikne.
 */
import type { DocData, NodeType, Position } from './types';

/** Základní rozměry uzlů na ploše (zoom 1, bez zvětšení). */
export const BASE_NODE_SIZE: Record<NodeType, { w: number; h: number }> = {
  project: { w: 260, h: 110 },
  task: { w: 190, h: 64 },
  milestone: { w: 200, h: 48 },
};

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

/** Ohraničení všech uzlů mimo koš (null = prázdná mapa). */
export function nodesBounds(data: DocData): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of Object.values(data.nodes)) {
    if (n.deletedAt) continue;
    const s = BASE_NODE_SIZE[n.type];
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + s.w);
    maxY = Math.max(maxY, n.position.y + s.h);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Střed uzlu podle základních rozměrů. */
export function nodeCenter(n: { type: NodeType; position: Position }): Position {
  const s = BASE_NODE_SIZE[n.type];
  return { x: n.position.x + s.w / 2, y: n.position.y + s.h / 2 };
}

/** Pohled se zadaným zoomem, který má bod `center` uprostřed plochy o rozměrech view. */
export function centerViewport(center: Position, zoom: number, viewW: number, viewH: number): ViewportState {
  return { x: viewW / 2 - center.x * zoom, y: viewH / 2 - center.y * zoom, zoom };
}

export const ZOOM_PRESET = 0.8;

/** „Zoom 80 %“: zoom přesně 0,8, vystředěno na střed ohraničení všech uzlů. */
export function zoomPresetViewport(data: DocData, viewW: number, viewH: number, zoom = ZOOM_PRESET): ViewportState {
  const b = nodesBounds(data);
  const c = b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : { x: 0, y: 0 };
  return centerViewport(c, zoom, viewW, viewH);
}

/** Úvodní zobrazení: celá mapa na plochu (s okrajem), zoom v mezích. */
export function fitViewport(
  data: DocData,
  viewW: number,
  viewH: number,
  opts: { padding?: number; minZoom?: number; maxZoom?: number } = {},
): ViewportState {
  const { padding = 0.2, minZoom = 0.1, maxZoom = 1.2 } = opts;
  const b = nodesBounds(data);
  if (!b) return { x: viewW / 2, y: viewH / 2, zoom: 1 };
  const zx = viewW / (b.width * (1 + padding));
  const zy = viewH / (b.height * (1 + padding));
  const zoom = Math.max(minZoom, Math.min(maxZoom, zx, zy));
  return centerViewport({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, zoom, viewW, viewH);
}
