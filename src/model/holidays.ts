/**
 * Státní svátky ČR a pracovní dny – počítá se offline pro libovolný rok.
 */
import { addDays, dayNumber, dayOfWeek, fromDayNumber, yearOf, ymd, type Ymd } from './dates';

/** Velikonoční neděle (gregoriánský kalendář, algoritmus Meeus/Jones/Butcher). */
export function easterSunday(year: number): Ymd {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

const FIXED: [number, number, string][] = [
  [1, 1, 'Den obnovy samostatného českého státu, Nový rok'],
  [5, 1, 'Svátek práce'],
  [5, 8, 'Den vítězství'],
  [7, 5, 'Den slovanských věrozvěstů Cyrila a Metoděje'],
  [7, 6, 'Den upálení mistra Jana Husa'],
  [9, 28, 'Den české státnosti'],
  [10, 28, 'Den vzniku samostatného československého státu'],
  [11, 17, 'Den boje za svobodu a demokracii'],
  [12, 24, 'Štědrý den'],
  [12, 25, '1. svátek vánoční'],
  [12, 26, '2. svátek vánoční'],
];

const cache = new Map<number, Map<Ymd, string>>();

/** Svátky daného roku: datum → název. */
export function czechHolidays(year: number): Map<Ymd, string> {
  let map = cache.get(year);
  if (map) return map;
  map = new Map();
  for (const [m, d, name] of FIXED) map.set(ymd(year, m, d), name);
  const easter = easterSunday(year);
  map.set(addDays(easter, -2), 'Velký pátek');
  map.set(addDays(easter, 1), 'Velikonoční pondělí');
  cache.set(year, map);
  return map;
}

export function holidayName(s: Ymd): string | undefined {
  return czechHolidays(yearOf(s)).get(s);
}

export function isWeekend(s: Ymd): boolean {
  const d = dayOfWeek(s);
  return d === 0 || d === 6;
}

export function isWorkingDay(s: Ymd): boolean {
  return !isWeekend(s) && !holidayName(s);
}

/** Proč den není pracovní (pro oznámení), nebo null. */
export function nonWorkingReason(s: Ymd): string | null {
  const h = holidayName(s);
  if (h) return 'svátek';
  const d = dayOfWeek(s);
  if (d === 6) return 'sobotu';
  if (d === 0) return 'neděli';
  return null;
}

/**
 * Počet pracovních dnů v intervalu (from, to] – bez prvního dne, včetně posledního.
 * Pro to ≤ from vrací 0.
 */
export function workingDaysBetween(from: Ymd, to: Ymd): number {
  const a = dayNumber(from);
  const b = dayNumber(to);
  let n = 0;
  for (let i = a + 1; i <= b; i++) if (isWorkingDay(fromDayNumber(i))) n++;
  return n;
}

/** Poslední pracovní den v daný den nebo před ním. */
export function toLastWorkingDayOnOrBefore(s: Ymd): Ymd {
  let cur = s;
  // Nejdelší řada nepracovních dnů je pár dní (Vánoce + víkend); pojistka 30 dní.
  for (let i = 0; i < 30 && !isWorkingDay(cur); i++) cur = addDays(cur, -1);
  return cur;
}
