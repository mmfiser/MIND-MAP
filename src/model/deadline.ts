/**
 * Zvýraznění termínu (deadline projektu i termín úkolu).
 *
 *  - Hotovo / Zrušeno nebo bez termínu → bez zvýraznění
 *  - termín uplynul → overdue (červená, bez pulzování)
 *  - dnes je termín → today (červená + jemné pulzování)
 *  - do termínu zbývá 1–3 pracovní dny v intervalu (dnes, termín] → soon (oranžová)
 */
import { isValidYmd, type Ymd } from './dates';
import { workingDaysBetween } from './holidays';
import type { Status } from './types';

export type DeadlineState = 'none' | 'soon' | 'today' | 'overdue';

export const SOON_WORKING_DAYS = 3;

export function deadlineState(due: Ymd | undefined, today: Ymd, status: Status): DeadlineState {
  if (!due || !isValidYmd(due) || status === 'done' || status === 'cancelled') return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  const wd = workingDaysBetween(today, due);
  return wd >= 1 && wd <= SOON_WORKING_DAYS ? 'soon' : 'none';
}

/**
 * Termín dokončení / deadline je dříve než začátek / zahájení.
 * Je to povolené, aplikace jen upozorní. Stejné datum je v pořádku.
 */
export function dueBeforeStart(n: { startDate?: Ymd; dueDate?: Ymd }): boolean {
  return !!n.startDate && !!n.dueDate && isValidYmd(n.startDate) && isValidYmd(n.dueDate) && n.dueDate < n.startDate;
}

/** Počet živých uzlů s termínem dříve než začátkem (kontrola při načtení dokumentu). */
export function countDueBeforeStart(nodes: Record<string, { startDate?: Ymd; dueDate?: Ymd; deletedAt?: string }>): number {
  let n = 0;
  for (const node of Object.values(nodes)) if (!node.deletedAt && dueBeforeStart(node)) n++;
  return n;
}
