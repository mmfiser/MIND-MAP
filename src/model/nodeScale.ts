/**
 * Kompenzace zoomu (čitelnost při oddálení). Uzly viditelné v aktuální úrovni
 * detailu se při oddálení zvětšují kolem svého středu, aby texty a ikony měly
 * na obrazovce čitelnou velikost. Pozice v datech se nemění.
 *
 * Faktor = potřebné zvětšení, aby text / ikona měly cílovou velikost na
 * obrazovce, omezené stropem podle úrovně. Kvantuje se po 0,1 (nahoru), takže
 * se přepočítává jen při změně kroku, ne při každém pohybu kolečka.
 */
import type { LodLevel } from './lod';

/** Cílová velikost na obrazovce (px). */
export const READABLE_PX = { projectTitle: 14, taskTitle: 12, icon: 16 } as const;

/** Velikost písma / ikon v uzlu při zoomu 1 (CSS v app.css a phase4.css). */
export const BASE_PX = {
  /** úroveň Přehled má zvětšený název a ikonu projektu */
  overviewProject: { title: 40, icon: 40 },
  project: { title: 17, icon: 20 },
  task: { title: 14, icon: 15 },
} as const;

/** Stropy zvětšení podle úrovně: projekty / úkoly a milníky. */
export const SCALE_CAPS: Record<LodLevel, { project: number; node: number }> = {
  overview: { project: 3, node: 1.6 },
  medium: { project: 2, node: 1.6 },
  full: { project: 1, node: 1 },
};

export const SCALE_STEP = 0.1;

export interface NodeScale {
  project: number;
  /** úkoly a milníky */
  node: number;
}

export const NO_SCALE: NodeScale = { project: 1, node: 1 };

/** Zaokrouhlení nahoru na krok 0,1 (čitelnost je minimum, ne maximum). */
export function quantize(f: number): number {
  return Math.round(Math.ceil(f / SCALE_STEP - 1e-9) * SCALE_STEP * 10) / 10;
}

const need = (target: number, base: number, zoom: number) => target / (base * zoom);

/**
 * Faktory zvětšení pro daný zoom a úroveň.
 *  - `overviewText`: v Přehledu je zapnuté zvětšené písmo projektu (automatický detail)
 *  - `projectCap`: dodatečný strop pro projekty (proti překrývání v Přehledu)
 */
export function nodeScaleFactors(
  zoom: number,
  level: LodLevel,
  opts: { overviewText?: boolean; projectCap?: number; nodeCap?: number } = {},
): NodeScale {
  const caps = SCALE_CAPS[level];
  if (level === 'full' || zoom <= 0) return NO_SCALE;
  const pb = level === 'overview' && opts.overviewText ? BASE_PX.overviewProject : BASE_PX.project;
  const project = Math.max(need(READABLE_PX.projectTitle, pb.title, zoom), need(READABLE_PX.icon, pb.icon, zoom));
  const node = Math.max(need(READABLE_PX.taskTitle, BASE_PX.task.title, zoom), need(READABLE_PX.icon, BASE_PX.task.icon, zoom));
  const projectCap = Math.min(caps.project, opts.projectCap ?? Infinity);
  return {
    project: Math.max(1, Math.min(projectCap, quantize(project))),
    node: Math.max(1, Math.min(caps.node, opts.nodeCap ?? Infinity, quantize(node))),
  };
}

export interface CenterRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/**
 * Největší zvětšení (kolem středů), při kterém se uzly nepřekrývají, zaokrouhlené
 * dolů na krok 0,1. Dvojice, které se překrývají už bez zvětšení, se ignorují
 * (zvětšení je nezhorší pod 1). `gap` = minimální mezera v souřadnicích plochy.
 */
export function overlapCap(rects: CenterRect[], gap = 12): number {
  let cap = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i]!;
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j]!;
      const dx = Math.abs(a.cx - b.cx);
      const dy = Math.abs(a.cy - b.cy);
      const hw = (a.w + b.w) / 2;
      const hh = (a.h + b.h) / 2;
      // Nepřekrývají se, pokud se oddělí aspoň v jedné ose: f ≤ (vzdálenost − mezera) / polovina součtu.
      const f = Math.max((dx - gap) / hw, (dy - gap) / hh);
      if (f >= 1) cap = Math.min(cap, f);
    }
  }
  return cap === Infinity ? Infinity : Math.round(Math.floor(cap / SCALE_STEP + 1e-9) * SCALE_STEP * 10) / 10;
}

export interface KindRect extends CenterRect {
  kind: 'project' | 'node';
}

const floorStep = (f: number) => Math.round(Math.floor(f / SCALE_STEP + 1e-9) * SCALE_STEP * 10) / 10;

/**
 * Projde dvojice, které by se mohly dotknout (seřazeno podle x, jen do vzdálenosti
 * `reach`) – průměrně O(n), ne O(n²).
 */
function nearPairs(rects: KindRect[], reach: number, cb: (a: KindRect, b: KindRect) => void): void {
  const sorted = [...rects].sort((a, b) => a.cx - b.cx);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.cx - a.cx > reach) break;
      cb(a, b);
    }
  }
}

/** Největší f pro dvojici (a ×fa, b ×fb pevné), aby se oddělily aspoň v jedné ose; < 1 = nejde. */
function pairCap(grow: KindRect, fixed: KindRect, fixedF: number, gap: number, both: boolean): number {
  const dx = Math.abs(grow.cx - fixed.cx) - gap;
  const dy = Math.abs(grow.cy - fixed.cy) - gap;
  if (both) {
    // obě strany rostou stejně
    return Math.max(dx / ((grow.w + fixed.w) / 2), dy / ((grow.h + fixed.h) / 2));
  }
  return Math.max((2 * dx - fixed.w * fixedF) / grow.w, (2 * dy - fixed.h * fixedF) / grow.h);
}

/**
 * Stropy proti překrývání pro aktuálně viditelné uzly (pozice se nikdy neposouvají):
 *  - `node`: úkoly a milníky rostou stejně (proti sobě i proti nezvětšeným projektům)
 *  - `projectFor(fn)`: strop projektů, když úkoly mají faktor fn
 * Dvojice, které se překrývají už bez zvětšení, se ignorují.
 */
export function overlapCaps(rects: KindRect[], gap: number, maxFactor = 3): { node: number; projectFor: (fn: number) => number } {
  const maxW = rects.reduce((m, r) => Math.max(m, r.w), 0);
  const reach = maxW * maxFactor + gap;
  let node = Infinity;
  const projectPairs: [KindRect, KindRect][] = [];
  nearPairs(rects, reach, (a, b) => {
    if (a.kind === 'node' && b.kind === 'node') {
      const f = pairCap(a, b, 1, gap, true);
      if (f >= 1) node = Math.min(node, f);
    } else if (a.kind === 'node' || b.kind === 'node') {
      const t = a.kind === 'node' ? a : b;
      const p = a.kind === 'node' ? b : a;
      const f = pairCap(t, p, 1, gap, false);
      if (f >= 1) node = Math.min(node, f);
      projectPairs.push([p, t]);
    } else {
      projectPairs.push([a, b]);
    }
  });
  const memo = new Map<number, number>();
  const projectFor = (fn: number) => {
    const known = memo.get(fn);
    if (known !== undefined) return known;
    let cap = Infinity;
    for (const [p, o] of projectPairs) {
      const f = o.kind === 'project' ? pairCap(p, o, 1, gap, true) : pairCap(p, o, fn, gap, false);
      if (f >= 1) cap = Math.min(cap, f);
    }
    const out = cap === Infinity ? Infinity : floorStep(cap);
    memo.set(fn, out);
    return out;
  };
  return { node: node === Infinity ? Infinity : floorStep(node), projectFor };
}

/** Obdélník uzlu zvětšený kolem středu (pro plovoucí vazby). */
export function scaleRect(r: { x: number; y: number; width: number; height: number }, f: number) {
  if (f === 1) return r;
  const w = r.width * f;
  const h = r.height * f;
  return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, width: w, height: h };
}
