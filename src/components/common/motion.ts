/**
 * Jednotné délky animací (fáze 5): krátké, 120–200 ms, se zpomalujícím průběhem.
 * Při `prefers-reduced-motion` se animace vypínají (délka 0).
 */
export const MOTION = {
  /** drobné změny (zvýraznění, opacita) */
  fast: 120,
  /** prolnutí uzlů (sbalení, úroveň detailu), zvětšení uzlů */
  base: 160,
  /** přesuny (uspořádání větve, posun a zoom plochy) */
  move: 200,
} as const;

export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Délka animace s ohledem na `prefers-reduced-motion`. */
export const motion = (ms: number): number => (reducedMotion() ? 0 : ms);
