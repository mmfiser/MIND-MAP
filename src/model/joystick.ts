/**
 * Kruhový ovladač posunu (fáze 5, telefon) – čisté výpočty.
 *  - klepnutí na šipku: posun o třetinu obrazovky
 *  - tažení palce od středu: plynulý posun všemi směry (i diagonálně),
 *    rychlost podle vzdálenosti od středu, s mrtvou zónou uprostřed
 */

export type ArrowDir = 'up' | 'down' | 'left' | 'right';

export const JOYSTICK = {
  /** poloměr, do kterého lze palcem táhnout (px) */
  radius: 46,
  /** mrtvá zóna uprostřed (px) */
  deadzone: 8,
  /** největší rychlost posunu (px obrazovky za sekundu) */
  maxSpeed: 1100,
  /** posun, od kterého se dotyk bere jako tažení, ne klepnutí (px) */
  dragThreshold: 8,
} as const;

/** Omezení výchylky palce na kruh. */
export function clampToRadius(dx: number, dy: number, radius: number = JOYSTICK.radius): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  if (d <= radius || d === 0) return { x: dx, y: dy };
  return { x: (dx / d) * radius, y: (dy / d) * radius };
}

/**
 * Rychlost posunu výřezu (px/s) pro výchylku palce. Směr = směr výchylky
 * (palec doprava → výřez se posouvá doprava). Náběh je pozvolný (mocnina 1,6),
 * aby šlo jemně dolaďovat.
 */
export function joystickVelocity(dx: number, dy: number): { vx: number; vy: number } {
  const { x, y } = clampToRadius(dx, dy);
  const d = Math.hypot(x, y);
  if (d < JOYSTICK.deadzone) return { vx: 0, vy: 0 };
  const t = Math.min(1, (d - JOYSTICK.deadzone) / (JOYSTICK.radius - JOYSTICK.deadzone));
  const speed = JOYSTICK.maxSpeed * Math.pow(t, 1.6);
  return { vx: (x / d) * speed, vy: (y / d) * speed };
}

const DIRS: Record<ArrowDir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/** Posun výřezu po klepnutí na šipku: třetina šířky / výšky obrazovky (px obrazovky). */
export function arrowStep(dir: ArrowDir, viewW: number, viewH: number): { dx: number; dy: number } {
  const [x, y] = DIRS[dir];
  return { dx: (x * viewW) / 3, dy: (y * viewH) / 3 };
}
