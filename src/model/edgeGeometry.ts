/**
 * Geometrie „plovoucích“ vazeb – čisté funkce bez Reactu.
 *
 * Vazba vychází ze středu té hrany zdrojového uzlu, která je nejblíž cílovému
 * uzlu, a vstupuje do cíle středem hrany nejbližší zdroji. Křivka je kubický
 * bezier s kontrolními body kolmými na zvolené hrany (čára vychází z uzlu „ven“).
 *
 * Použije se pro všechny druhy vazeb (hierarchie, závislosti, souvislosti).
 */

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** Obdélník uzlu v souřadnicích plochy (x, y = levý horní roh). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface EdgeGeometry {
  sourceSide: Side;
  targetSide: Side;
  source: Point;
  target: Point;
  /** kontrolní body bezieru */
  c1: Point;
  c2: Point;
  /** SVG path („M … C …“) */
  path: string;
  /** střed křivky (t = 0,5) – pro popisky a ikony ve fázi 3 */
  mid: Point;
}

const NORMALS: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export function center(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/**
 * Hrana obdélníku `from`, která míří k bodu `toward`.
 * Porovnává se |dx|/šířka s |dy|/výška – tedy vektor normalizovaný poměrem
 * stran obdélníku. Tím je strana určena úhlopříčkami obdélníku (ne 45°),
 * takže široký uzel nepřepne na horní/dolní hranu příliš brzy.
 * Při shodě (přesně na úhlopříčce nebo shodné středy) vyhrává vodorovná strana.
 */
export function closestSide(from: Rect, toward: Point): Side {
  const c = center(from);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const w = Math.max(from.width, 1e-6);
  const h = Math.max(from.height, 1e-6);
  if (Math.abs(dx) / w >= Math.abs(dy) / h) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** Střed dané hrany obdélníku. */
export function sideAnchor(r: Rect, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: r.x + r.width / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.width / 2, y: r.y + r.height };
    case 'left':
      return { x: r.x, y: r.y + r.height / 2 };
    case 'right':
      return { x: r.x + r.width, y: r.y + r.height / 2 };
  }
}

/**
 * Délka ramene kontrolního bodu (stejná logika jako bezier v React Flow):
 * když cíl leží „před“ hranou, polovina vzdálenosti ve směru normály;
 * když leží „za“ ní, menší oblouk, aby čára přesto vyšla ven.
 */
function controlOffset(distanceAlongNormal: number, curvature: number): number {
  if (distanceAlongNormal >= 0) return Math.max(0.5 * distanceAlongNormal, 12);
  return curvature * 25 * Math.sqrt(-distanceAlongNormal);
}

function controlPoint(anchor: Point, side: Side, other: Point, curvature: number): Point {
  const n = NORMALS[side];
  const along = (other.x - anchor.x) * n.x + (other.y - anchor.y) * n.y;
  const off = controlOffset(along, curvature);
  return { x: anchor.x + n.x * off, y: anchor.y + n.y * off };
}

function bezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Kompletní geometrie vazby mezi dvěma obdélníky.
 * `bend` – kolmé odsazení středu křivky (px, kladné = vlevo ve směru source → target);
 * používá se pro souběžné vazby mezi stejnou dvojicí uzlů.
 */
export function floatingEdgeGeometry(source: Rect, target: Rect, curvature = 0.25, bend = 0): EdgeGeometry {
  const sc = center(source);
  const tc = center(target);
  const sourceSide = closestSide(source, tc);
  const targetSide = closestSide(target, sc);
  const s = sideAnchor(source, sourceSide);
  const t = sideAnchor(target, targetSide);
  let c1 = controlPoint(s, sourceSide, t, curvature);
  let c2 = controlPoint(t, targetSide, s, curvature);
  if (bend) {
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    // Levá normála; u kubického bezieru se střed posune o 3/4 posunu kontrolních bodů.
    const k = bend / 0.75;
    const nx = (dy / len) * k;
    const ny = (-dx / len) * k;
    c1 = { x: c1.x + nx, y: c1.y + ny };
    c2 = { x: c2.x + nx, y: c2.y + ny };
  }
  const path = `M${r2(s.x)},${r2(s.y)} C${r2(c1.x)},${r2(c1.y)} ${r2(c2.x)},${r2(c2.y)} ${r2(t.x)},${r2(t.y)}`;
  return { sourceSide, targetSide, source: s, target: t, c1, c2, path, mid: bezierPoint(s, c1, c2, t, 0.5) };
}
