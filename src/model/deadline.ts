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
