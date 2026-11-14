/**
 * Kalendářní data jako lokální `YYYY-MM-DD` bez času a časové zóny.
 * Aritmetika běží přes „čísla dnů“ z Date.UTC, takže nevznikají posuny
 * o den kvůli UTC ani letnímu času.
 */

export type Ymd = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function isValidYmd(s: unknown): s is Ymd {
  if (typeof s !== 'string') return false;
  const m = RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const back = new Date(Date.UTC(y, mo - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d;
}

/** Počet dnů od 1. 1. 1970 (celé číslo). */
export function dayNumber(s: Ymd): number {
  const m = RE.exec(s);
  if (!m) throw new Error(`Neplatné datum: ${s}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

export function fromDayNumber(n: number): Ymd {
  const d = new Date(n * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function ymd(year: number, month: number, day: number): Ymd {
  return fromDayNumber(Math.round(Date.UTC(year, month - 1, day) / DAY_MS));
}

export function addDays(s: Ymd, n: number): Ymd {
  return fromDayNumber(dayNumber(s) + n);
}

/** 0 = neděle … 6 = sobota */
export function dayOfWeek(s: Ymd): number {
  return new Date(dayNumber(s) * DAY_MS).getUTCDay();
}

export function yearOf(s: Ymd): number {
  return Number(s.slice(0, 4));
}

/** Dnešní datum v místním čase zařízení. */
export function todayYmd(now: Date = new Date()): Ymd {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Milisekundy do příští místní půlnoci (+ malá rezerva). */
export function msUntilNextMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

const WEEKDAYS_SHORT = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

/** „15. 11.“, s rokem jen když není letošní: „15. 11. 2027“. */
export function formatShort(s: Ymd, today: Ymd): string {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return yearOf(today) === y ? `${d}. ${m}.` : `${d}. ${m}. ${y}`;
}

/** „pá 25. 9.“ (rok jen když není letošní). */
export function formatWithWeekday(s: Ymd, today: Ymd): string {
  return `${WEEKDAYS_SHORT[dayOfWeek(s)]} ${formatShort(s, today)}`;
}
